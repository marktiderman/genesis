/**
 * `genesis init` from the wizard: a new app as a fix plan. The plan is exactly what
 * `genesis init <slug> --template native` writes (the same planner, `initNative`, in capture
 * mode), with the chosen preset in genesis.config.json, so the person reads every file and the
 * plan's hash before anything is written, and the fix engine writes them.
 *
 * The plan's root is the folder the wizard runs in; the app goes in `<slug>/` beneath it (or the
 * folder `genesis init --target` named, when that is empty).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { SETTINGS_PRESETS, type SettingsPreset } from "@marktiderman/genesis-config/settings";
import { parseStarterFeatures, STARTER_CONFIG } from "../blocks/starter-features.js";
import { starterDir } from "../blocks/templates.js";
import type { Fix, FixPlanDraft } from "../fix/types.js";

export const INIT_FIX_ID = "init.app";

/** What the wizard's App, Preset and Packages screens chose. */
export interface InitChoices {
  /** The app's slug: package name, Expo slug, default scheme. */
  slug: string;
  displayName?: string;
  bundleId?: string;
  scheme?: string;
  /** The folder the app goes in, relative to the wizard's root. Default: the slug. */
  folder?: string;
  /** starter.config.ts switches to turn off. */
  without?: string[];
  /** Default max (R2: zero config); another preset is written to genesis.config.json. */
  preset?: SettingsPreset;
}

export class InitChoiceError extends Error {
  override name = "InitChoiceError";
}

/** Path segments of letters, digits, `_`, `-` and inner dots; no segment starts with a dot (no `.`, `..`, `.git`). */
const FOLDER = /^[A-Za-z0-9_-][A-Za-z0-9._-]*(?:\/[A-Za-z0-9_-][A-Za-z0-9._-]*)*$/;
/** The same checks initNative makes, made here first so a bad choice never reaches the disk. */
const SLUG = /^[a-z][a-z0-9-]{1,40}$/;
const BUNDLE = /^[a-zA-Z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9]*)+$/;
const SCHEME = /^[a-z][a-z0-9+.-]*$/;

/** The choices, checked: a known preset, switches as names, and a folder inside the root. Throws InitChoiceError. */
export function checkInitChoices(raw: unknown): InitChoices {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new InitChoiceError("the app's choices must be an object");
  const c = raw as Record<string, unknown>;
  const str = (k: string, max = 120) => {
    const v = c[k];
    if (v === undefined || v === "") return undefined;
    if (typeof v !== "string" || v.length > max) throw new InitChoiceError(`${k} must be text of at most ${max} characters`);
    return v;
  };
  const slug = str("slug", 41);
  if (!slug) throw new InitChoiceError("the app needs a slug");
  if (!SLUG.test(slug)) throw new InitChoiceError(`"${slug}" isn't an app slug: lowercase letters, digits and -, starting with a letter`);
  const folder = str("folder", 200);
  if (folder !== undefined && !FOLDER.test(folder)) throw new InitChoiceError("the folder must be a path inside this folder, with no segment starting with a dot");
  const preset = str("preset", 20);
  if (preset !== undefined && !(SETTINGS_PRESETS as readonly string[]).includes(preset)) throw new InitChoiceError(`preset must be ${SETTINGS_PRESETS.join(", ")}`);
  const without = c.without;
  if (without !== undefined && (!Array.isArray(without) || without.length > 50 || without.some((w) => typeof w !== "string" || !/^[a-zA-Z][a-zA-Z0-9]*$/.test(w)))) throw new InitChoiceError("without must list feature switch names");
  const displayName = str("displayName");
  if (displayName !== undefined && /["\\\n\r]/.test(displayName)) throw new InitChoiceError("the name can't contain quotes, backslashes or new lines");
  const bundleId = str("bundleId");
  if (bundleId !== undefined && !BUNDLE.test(bundleId)) throw new InitChoiceError(`"${bundleId}" isn't a bundle id like com.example.app`);
  const scheme = str("scheme", 60);
  if (scheme !== undefined && !SCHEME.test(scheme)) throw new InitChoiceError(`"${scheme}" isn't a URL scheme`);
  return {
    slug,
    ...(displayName ? { displayName } : {}),
    ...(bundleId ? { bundleId } : {}),
    ...(scheme ? { scheme } : {}),
    ...(folder ? { folder } : {}),
    ...(without?.length ? { without: [...new Set(without as string[])].sort() } : {}),
    ...(preset ? { preset: preset as SettingsPreset } : {}),
  };
}

/** The starter's feature switches and their defaults: the Packages screen's toggles. */
export function starterSwitches(): Record<string, boolean> {
  try {
    return parseStarterFeatures(readFileSync(path.join(starterDir(), STARTER_CONFIG), "utf8")) ?? {};
  } catch {
    return {};
  }
}

/** genesis.config.json with `preset` set (max is the default, so it is written only for another). */
export function withPreset(text: string, preset: SettingsPreset | undefined): string {
  if (!preset || preset === "max") return text;
  const json = JSON.parse(text) as Record<string, unknown>;
  const indent = /^[ \t]+(?=")/m.exec(text)?.[0] ?? "  ";
  return `${JSON.stringify({ preset, ...json }, null, indent)}${text.endsWith("\n") ? "\n" : ""}`;
}

/** The init fix for these choices. Planning writes nothing; the engine writes every file (each new: never over one). */
export function initAppFix(choices: InitChoices): Fix {
  return {
    id: INIT_FIX_ID,
    kind: "auto",
    rules: ["init"],
    title: `make the app ${choices.slug} (genesis init ${choices.slug} --template native)`,
    async plan(ctx): Promise<FixPlanDraft> {
      const folder = choices.folder ?? choices.slug;
      const target = path.join(ctx.root, folder);
      if (existsSync(target) && readdirSync(target).length) throw new InitChoiceError(`${folder}/ isn't empty; choose another folder`);
      const { initNative, releasePinFor } = await import("../blocks/init-native.js");
      const { catalogBlocks } = await import("../blocks/discover.js");
      const capture = new Map<string, string>();
      const result = initNative({
        name: choices.slug,
        target,
        blocks: catalogBlocks(),
        pin: releasePinFor(target),
        capture,
        ...(choices.displayName ? { displayName: choices.displayName } : {}),
        ...(choices.bundleId ? { bundleId: choices.bundleId } : {}),
        ...(choices.scheme ? { scheme: choices.scheme } : {}),
        ...(choices.without?.length ? { without: choices.without } : {}),
      });
      const config = capture.get("genesis.config.json");
      if (config && choices.preset) capture.set("genesis.config.json", withPreset(config, choices.preset));
      const files = [...capture].map(([rel, content]) => ({ path: `${folder}/${rel}`, beforeHash: null, content, why: rel === "genesis.lock.json" ? "the files Genesis owns, the blocks and the renames" : "from the Genesis RN starter" }));
      return {
        summary: `creates ${folder}/ (${files.length} files): ${choices.slug} on the ${choices.preset ?? "max"} preset${result.leftOut.length ? `, without ${result.leftOut.join(", ")}` : ""}`,
        files,
        manual: [`cd ${folder} && pnpm install (or your package manager)`, ...result.steps].map((s, i) => `${i + 1}. ${s}`).join("\n"),
      };
    },
    verify(ctx) {
      const folder = choices.folder ?? choices.slug;
      const ok = existsSync(path.join(ctx.root, folder, "genesis.lock.json"));
      return ok ? { ok: true, message: `${folder}/ is ready: the wizard opens it next` } : { ok: false, message: `${folder}/genesis.lock.json wasn't written` };
    },
  };
}
