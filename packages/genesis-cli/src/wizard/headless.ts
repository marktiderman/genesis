/**
 * `genesis setup --yes` (and `genesis init --yes` in an existing app): the wizard without a
 * browser, for CI and for no terminal. It
 *
 * 1. sets the preset (`--preset`) and turns starter switches off (`--without`), each as a fix plan;
 * 2. applies every automatic fix the doctor's findings name, through the fix engine (except the
 *    ones that act outside the repository: the upgrade opens a pull request, so it is listed);
 * 3. prints the guided fixes as the dormant checklist: `genesis setup --step <id>` for each setup
 *    step not done, `genesis fix <id>` for the rest. A dormant feature fails nothing.
 *
 * Exit 0, or 1 when a fix it applied failed or didn't verify.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { SETTINGS_PRESETS, type SettingsPreset } from "@marktiderman/genesis-config/settings";
import { setStarterFeatures, parseStarterFeatures, STARTER_CONFIG } from "../blocks/starter-features.js";
import { readGenesisConfig } from "../doctor/config.js";
import { discoverPackages } from "../doctor/package-rules.js";
import type { Finding } from "../doctor/types.js";
import { applyPlan, planFix, plannedFile } from "../fix/engine.js";
import { allFixes, type BuiltinDeps } from "../fix/registry.js";
import type { Fix, FixContext, FixPlanDraft } from "../fix/types.js";
import type { ToolRunner } from "../exec/run.js";
import { CONFIG_FILE } from "../mcp/settings.js";
import { setupSteps } from "./steps.js";

/** Automatic fixes headless setup lists instead of applying: they act outside the repository. */
export const HEADLESS_SKIP: ReadonlySet<string> = new Set(["upgrade.release"]);

export interface HeadlessOptions {
  root: string;
  configPath?: string;
  preset?: string;
  without?: string[];
  /** Only this step's checklist. */
  step?: string;
  network?: boolean;
  out: (line: string) => void;
  err: (line: string) => void;
  deps?: {
    doctor?: (options: { root: string; configPath?: string; network: boolean }) => Promise<{ findings: Finding[] }>;
    fixes?: BuiltinDeps;
    run?: ToolRunner;
  };
}

/** Set `preset` in genesis.config.json (max, the default, is written as no key at all). */
export function presetFix(preset: SettingsPreset): Fix {
  return {
    id: "settings.preset",
    kind: "auto",
    rules: ["invalid-setting"],
    title: `use the ${preset} preset`,
    plan(ctx): FixPlanDraft {
      const file = path.join(ctx.root, CONFIG_FILE);
      const text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "{}\n";
      const json = JSON.parse(text) as Record<string, unknown>;
      if ((json.preset ?? "max") === preset) return { summary: `the preset is already ${preset}` };
      const next: Record<string, unknown> = preset === "max" ? Object.fromEntries(Object.entries(json).filter(([k]) => k !== "preset")) : { preset, ...Object.fromEntries(Object.entries(json).filter(([k]) => k !== "preset")) };
      const indent = /^[ \t]+(?=")/m.exec(text)?.[0] ?? "  ";
      return { summary: `sets the preset to ${preset} in ${CONFIG_FILE}`, files: [plannedFile(ctx.root, CONFIG_FILE, `${JSON.stringify(next, null, indent)}\n`, "every key without its own value takes this preset's default")] };
    },
    verify: (ctx) => ((readGenesisConfig(ctx.root)?.preset ?? "max") === preset ? { ok: true } : { ok: false, message: `the preset isn't ${preset}` }),
  };
}

/** Turn starter.config.ts switches off (an app made from the RN starter). */
export function withoutFix(without: readonly string[]): Fix {
  return {
    id: "starter.without",
    kind: "auto",
    rules: ["init"],
    title: `turn ${without.join(", ")} off in ${STARTER_CONFIG}`,
    plan(ctx): FixPlanDraft {
      const file = path.join(ctx.root, STARTER_CONFIG);
      if (!fs.existsSync(file)) return { summary: `${STARTER_CONFIG} isn't here: --without applies to an app made from the RN starter`, manual: "Turn the features off in your own app's config." };
      const text = fs.readFileSync(file, "utf8");
      const switches = parseStarterFeatures(text) ?? {};
      const unknown = without.filter((w) => !(w in switches));
      if (unknown.length) return { summary: `${unknown.join(", ")} ${unknown.length === 1 ? "isn't a switch" : "aren't switches"} in ${STARTER_CONFIG}`, manual: `The switches: ${Object.keys(switches).join(", ")}.` };
      const next = setStarterFeatures(text, Object.fromEntries(without.map((w) => [w, false])));
      return next === text ? { summary: `${without.join(", ")} already off` } : { summary: `turns ${without.join(", ")} off in ${STARTER_CONFIG}`, files: [plannedFile(ctx.root, STARTER_CONFIG, next, "feature switches the setup turned off")] };
    },
  };
}

export async function runSetupHeadless(options: HeadlessOptions): Promise<number> {
  const { root, out, err } = options;
  const network = options.network ?? false;
  const deps = options.deps ?? {};
  const doctor = async () => {
    if (deps.doctor) return (await deps.doctor({ root, ...(options.configPath ? { configPath: options.configPath } : {}), network })).findings;
    const { runDoctor } = await import("../doctor/index.js");
    return (await runDoctor({ root, ...(options.configPath ? { configPath: options.configPath } : {}), network })).findings;
  };
  const ctx = (findings: Finding[]): FixContext => ({ root, findings, network, log: (m) => out(`  ${m}`), recheck: async (rules) => (await doctor()).filter((f) => rules.includes(f.rule)) });
  let code = 0;

  const applyOne = async (fix: Fix, findings: Finding[]) => {
    try {
      const plan = await planFix(fix, ctx(findings));
      if (!plan.files.length && !plan.commands.length) {
        out(`= ${fix.id}: ${plan.summary}`);
        return;
      }
      if (plan.secrets.length) {
        out(`- ${fix.id}: needs ${plan.secrets.join(", ")}; run genesis fix ${fix.id} at a terminal (or genesis setup)`);
        return;
      }
      const result = await applyPlan(fix, plan, ctx(findings), { expect: plan.hash, ...(deps.run ? { run: deps.run } : {}) });
      out(`${result.verify.ok ? "✔" : "✗"} ${fix.id}: ${plan.summary}${result.verify.ok ? "" : ` (not verified: ${result.verify.message ?? "findings remain"})`}`);
      if (!result.verify.ok) code = 1;
    } catch (e) {
      err(`✗ ${fix.id}: ${(e as Error).message}`);
      code = 1;
    }
  };

  if (options.preset !== undefined) {
    if (!(SETTINGS_PRESETS as readonly string[]).includes(options.preset)) {
      err(`✗ --preset must be ${SETTINGS_PRESETS.join(", ")}`);
      return 1;
    }
    await applyOne(presetFix(options.preset as SettingsPreset), []);
  }
  if (options.without?.length) await applyOne(withoutFix(options.without), []);

  if (!options.step) {
    const findings = await doctor();
    const { fixes } = await allFixes(discoverPackages(root), deps.fixes ?? {});
    const byId = new Map(fixes.map((f) => [f.id, f]));
    const groups = new Map<string, Finding[]>();
    for (const f of findings) if (f.fix) groups.set(f.fix.id, [...(groups.get(f.fix.id) ?? []), f]);
    const later: string[] = [];
    for (const [id, list] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
      const fix = byId.get(id);
      if (!fix || fix.kind === "manual") continue;
      if (fix.kind === "auto" && !HEADLESS_SKIP.has(id)) await applyOne(fix, list);
      else if (id !== "settings.setup") later.push(`- genesis fix ${id}: ${fix.title} (${list.length} finding${list.length === 1 ? "" : "s"})`);
    }
    if (later.length) {
      out("");
      out("To do yourself:");
      later.forEach((l) => out(l));
    }
  }

  let steps: ReturnType<typeof setupSteps> = [];
  try {
    steps = setupSteps(root);
  } catch (e) {
    err(`! the setup steps couldn't be read: ${(e as Error).message}`);
  }
  const open = steps.filter((s) => !s.done && (!options.step || s.id === options.step));
  if (options.step && !open.length) {
    if (steps.some((s) => s.id === options.step)) out(`✔ ${options.step} is set up.`);
    else {
      err(`✗ No setup step ${options.step}${steps.length ? ` (the steps: ${steps.map((s) => s.id).join(", ")})` : ""}.`);
      code = 1;
    }
  }
  if (open.length) {
    out("");
    out("Dormant until set up (each stays off; nothing fails):");
    for (const s of open) {
      out(`- ${s.command}`);
      for (const k of s.keys) out(`    settings.${k.key}${k.set ? " ✔" : ""}${k.summary ? `: ${k.summary}` : ""}`);
      for (const sec of s.secrets) out(`    secret ${sec.name} (${sec.store})`);
    }
  }
  return code;
}
