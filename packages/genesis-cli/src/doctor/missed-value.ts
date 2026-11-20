/**
 * `missed-value`: what Genesis offers this app that it isn't getting. Every block of every Genesis
 * package (installed, and the CLI's catalog for packages the app doesn't have) for the app's
 * platforms is one of:
 *
 * - used: in genesis.lock.json, or a file imports one of its `detect.imports` from its packages;
 * - switched off: used, but a `detect.off` pattern matches (Growth90's channel switch was on only
 *   in development, where it can't work), reported at the line with what it costs;
 * - missed: its package isn't installed, or it declares `detect` and nothing imports it;
 * - unknown: installed, with no `detect` to tell (not reported).
 *
 * Plus the release lane's PR previews for a native app (`.eas/workflows/pr-preview.yml`, written by
 * `genesis add template release`): without it, no pull request can be tried on a phone.
 *
 * An app that doesn't want one says so, with a reason, in genesis.config.json:
 * `"doctor": { "declined": { "<block id>": "why" } }`; a declined id that matches nothing is
 * reported so the list stays true. Findings are `info` (raise with `doctor.rules`), and the report
 * always ends with the count, so missed value is never only in `--verbose`.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { allBlocks, catalogBlocks } from "../blocks/discover.js";
import { readLock } from "../blocks/lock.js";
import type { BlockManifest } from "../blocks/manifest.js";
import type { DoctorContext } from "./types.js";

export const MISSED_VALUE_RULE = "missed-value";

export type MissedReason = "missed" | "off";

export interface MissedValue {
  id: string;
  name: string;
  summary: string;
  package: string;
  reason: MissedReason;
  /** What to do: the block's steps, or `genesis add block <id>`. */
  how: string;
}

type AppPlatform = "web" | "native";

/** The platforms this app builds for, from its package.json. */
export function appPlatforms(root: string): Set<AppPlatform> {
  const out = new Set<AppPlatform>();
  try {
    const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps["expo"] || deps["react-native"]) out.add("native");
    if (deps["react-dom"] || deps["next"] || deps["vite"] || deps["@tanstack/react-start"]) out.add("web");
  } catch {
    // no package.json: nothing to say
  }
  return out;
}

const importsFrom = (code: string, pkg: string) => code.includes(`"${pkg}`) || code.includes(`'${pkg}`);

/** Whether the app uses `block`, and where it switched it off. */
export function classify(
  block: Pick<BlockManifest, "id" | "packages" | "detect">,
  ctx: Pick<DoctorContext, "files">,
  locked: ReadonlySet<string>,
  installed: boolean,
): { state: "used" | "missed" | "unknown"; off: { file: string; line: number; message: string }[] } {
  const off: { file: string; line: number; message: string }[] = [];
  const files = ctx.files.filter((f) => block.packages.some((p) => importsFrom(f.code, p)));
  const names = block.detect?.imports ?? [];
  const used = locked.has(block.id) || (names.length > 0 && files.some((f) => names.some((n) => new RegExp(`\\b${n}\\b`).test(f.code))));
  if (used) {
    for (const o of block.detect?.off ?? []) {
      const re = new RegExp(o.pattern, "m");
      for (const f of ctx.files) {
        const m = re.exec(f.code);
        if (m) off.push({ file: f.path, line: f.code.slice(0, m.index).split("\n").length, message: o.message });
      }
    }
    return { state: "used", off };
  }
  if (!installed) return { state: "missed", off };
  return { state: block.detect ? "missed" : "unknown", off };
}

export function missedValueCheck(deps: { blocks?: (root: string) => Promise<{ manifest: BlockManifest; from: string }[]>; catalog?: () => BlockManifest[] } = {}) {
  return async (ctx: DoctorContext): Promise<void> => {
    const platforms = appPlatforms(ctx.root);
    if (!platforms.size) return;
    const declined = ctx.config.declined ?? {};
    const seen = new Set<string>();
    const lock = readLock(ctx.root);
    const locked = new Set(Object.keys(lock.blocks));
    const found = await (deps.blocks ?? ((root) => allBlocks(root)))(ctx.root);
    // An installed package older than this CLI may not say how to detect its blocks: this CLI's
    // catalog does, so an app is told what it misses before it upgrades (that's when it matters).
    const known = new Map((deps.catalog ?? (() => catalogBlocks()))().map((m) => [m.id, m.detect]));
    for (const { manifest: found1, from } of found) {
      const block = found1.detect || !known.get(found1.id) ? found1 : { ...found1, detect: known.get(found1.id)! };
      if (seen.has(block.id)) continue;
      seen.add(block.id);
      if (block.platforms && !block.platforms.some((p) => platforms.has(p as AppPlatform))) continue;
      if (!block.feature) continue;
      const { state, off } = classify(block, ctx, locked, from !== "catalog");
      const label = `${block.feature.name} (${block.id}, ${block.package})`;
      for (const o of off) {
        if (declined[block.id]) continue;
        ctx.report({ rule: MISSED_VALUE_RULE, level: "info", file: o.file, line: o.line, subject: block.id, message: `${label} is adopted but switched off here: ${o.message}` });
      }
      if (state !== "missed" || declined[block.id]) continue;
      const how = block.steps.length ? block.steps.join(" ") : `genesis add block ${block.id}`;
      ctx.report({
        rule: MISSED_VALUE_RULE,
        level: "info",
        file: from === "catalog" ? "package.json" : "genesis.config.json",
        subject: block.id,
        message: `${label} is available and unused: ${block.feature.summary} To adopt: ${how} Not wanted? Add it to doctor.declined with the reason`,
      });
    }
    if (platforms.has("native") && !declined["pr-previews"]) {
      const repo = repoRoot(ctx.root);
      const lane = [ctx.root, repo].some((dir) => existsSync(path.join(dir, ".eas", "workflows", "pr-preview.yml")));
      if (!lane) {
        ctx.report({
          rule: MISSED_VALUE_RULE,
          level: "info",
          file: ".eas/workflows",
          subject: "pr-previews",
          message:
            "PR previews (the release lane's pr-preview.yml) are missing: no pull request can be tried on a phone. Run genesis add template release (docs/NATIVE-RELEASE.md, \"Adopting the lane\"; an app with its own OTA workflow keeps it and adds only the preview). Not wanted? Add pr-previews to doctor.declined with the reason",
        });
      }
    }
    for (const id of Object.keys(declined)) {
      if (id !== "pr-previews" && !seen.has(id)) {
        ctx.report({ rule: MISSED_VALUE_RULE, level: "info", file: "genesis.config.json", subject: id, message: `doctor.declined names ${id}, which no Genesis package offers any more; remove it` });
      }
    }
  };
}

function repoRoot(root: string): string {
  let dir = root;
  for (let i = 0; i < 6; i++) {
    if (existsSync(path.join(dir, ".git"))) return dir;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return root;
}
