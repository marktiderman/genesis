/**
 * `genesis setup` without a browser. With `--yes` (`genesis setup --yes`, or `genesis init --yes`
 * in an existing app) it
 *
 * 1. sets the preset (`--preset`) and turns starter switches off (`--without`), each as a fix plan;
 * 2. applies every automatic fix the doctor's findings name, through the fix engine (except the
 *    ones that act outside the repository: the upgrade opens a pull request, so it is listed);
 * 3. prints the guided fixes as the dormant checklist: `genesis setup --step <id>` for each setup
 *    step not done, `genesis fix <id>` for the rest. A dormant feature fails nothing.
 *
 * Exit 0, or 1 when a fix it applied failed or didn't verify.
 *
 * Without `--yes` (no terminal, so no wizard) it applies nothing, as `genesis fix` without `--yes`:
 * it prints each plan and its hash, and the checklist, and exits 1 when there was anything to
 * apply, so a script that left the flag out never passes by accident. `--preset` and `--without`
 * never imply `--yes`.
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
import { runnerFor } from "./steps/index.js";

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
  /** Apply the plans (`--yes`). Default false: print them and apply nothing. */
  apply?: boolean;
  out: (line: string) => void;
  err: (line: string) => void;
  deps?: {
    doctor?: (options: { root: string; configPath?: string; network: boolean }) => Promise<{ findings: Finding[] }>;
    fixes?: BuiltinDeps;
    /** Fixes added after the registry's (a test's stand-in for a package fix). */
    extraFixes?: Fix[];
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
      const parsed = JSON.parse(text) as unknown;
      // Never replace a config the CLI can't read (an array, null…): the person corrects it first.
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`${CONFIG_FILE} isn't a JSON object; correct it, then set the preset`);
      const json = parsed as Record<string, unknown>;
      if ((json.preset ?? "max") === preset) return { summary: `the preset is already ${preset}` };
      const next: Record<string, unknown> = preset === "max" ? Object.fromEntries(Object.entries(json).filter(([k]) => k !== "preset")) : { preset, ...Object.fromEntries(Object.entries(json).filter(([k]) => k !== "preset")) };
      const indent = /^[ \t]+(?=")/m.exec(text)?.[0] ?? "  ";
      return { summary: `sets the preset to ${preset} in ${CONFIG_FILE}`, files: [plannedFile(ctx.root, CONFIG_FILE, `${JSON.stringify(next, null, indent)}\n`, "every key without its own value takes this preset's default")] };
    },
    verify: (ctx) => ((readGenesisConfig(ctx.root)?.preset ?? "max") === preset ? { ok: true } : { ok: false, message: `the preset isn't ${preset}` }),
  };
}

/** The starter's sign-in switches: at least one stays on (as genesis init --without checks). */
const SIGN_INS = ["emailSignIn", "appleSignIn", "googleSignIn"] as const;

/** Turn starter.config.ts switches off (an app made from the RN starter). */
export function withoutFix(without: readonly string[]): Fix {
  return {
    id: "starter.without",
    kind: "auto",
    rules: ["init"],
    title: `turn ${without.join(", ")} off in ${STARTER_CONFIG}`,
    plan(ctx): FixPlanDraft {
      const file = path.join(ctx.root, STARTER_CONFIG);
      // An explicit request that can't be met fails the run, never passes as "nothing to do".
      if (!fs.existsSync(file)) throw new Error(`${STARTER_CONFIG} isn't here: --without applies to an app made from the RN starter`);
      const text = fs.readFileSync(file, "utf8");
      const switches = parseStarterFeatures(text) ?? {};
      const unknown = without.filter((w) => !(w in switches));
      if (unknown.length) throw new Error(`${unknown.join(", ")} ${unknown.length === 1 ? "isn't a switch" : "aren't switches"} in ${STARTER_CONFIG} (the switches: ${Object.keys(switches).join(", ")})`);
      const after = { ...switches, ...Object.fromEntries(without.map((w) => [w, false])) };
      const signIns = SIGN_INS.filter((k) => k in switches);
      if (signIns.length && signIns.every((k) => !after[k])) throw new Error(`--without would turn off ${signIns.join(", ")}, every way to sign in, so nobody could sign in`);
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
  let pending = 0;

  const applyOne = async (fix: Fix, findings: Finding[]) => {
    try {
      const plan = await planFix(fix, ctx(findings));
      if (!plan.files.length && !plan.commands.length) {
        out(`= ${fix.id}: ${plan.summary}`);
        return;
      }
      if (plan.secrets.length) {
        out(`- ${fix.id}: needs ${plan.secrets.join(", ")}; run genesis fix ${fix.id} at a terminal (or genesis setup)`);
        // Work left that this run can't do: without --yes it counts as unapplied.
        if (!options.apply) pending++;
        return;
      }
      if (!options.apply) {
        pending++;
        out(`· ${fix.id} (not applied): ${plan.summary}  plan ${plan.hash.slice(0, 12)}`);
        for (const f of plan.files) out(`    ${f.beforeHash === null ? "create" : "write "} ${f.path}`);
        for (const c of plan.commands) out(`    run    ${[c.tool, ...c.args].join(" ")}`);
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

  let findings: Finding[] = [];
  try {
    findings = await doctor();
  } catch (e) {
    err(`✗ the doctor couldn't run: ${(e as Error).message}`);
    return 1;
  }
  if (!options.step) {
    const { fixes: registered } = await allFixes(discoverPackages(root), deps.fixes ?? {});
    const fixes = [...registered, ...(deps.extraFixes ?? [])];
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
  // A step's settings can be set while its secret is missing: the doctor's secret-missing keeps it open.
  const missing = new Set(findings.filter((f) => f.rule === "secret-missing" && f.level !== "info" && f.subject).map((f) => f.subject!));
  const secretGap = (s: (typeof steps)[number]) => s.secrets.filter((x) => missing.has(x.name)).map((x) => x.name);
  const open = steps.filter((s) => (!s.done || secretGap(s).length > 0) && (!options.step || s.id === options.step));
  if (options.step && !open.length) {
    const step = steps.find((s) => s.id === options.step);
    const runner = runnerFor(options.step);
    if (step) {
      const unverified = step.secrets.map((x) => x.name);
      out(
        unverified.length
          ? `✔ ${options.step}: its settings are set. ${unverified.join(", ")} ${unverified.length === 1 ? "isn't" : "aren't"} verified here: genesis doctor (online) checks ${unverified.length === 1 ? "it" : "them"}${runner ? `, and genesis setup --step ${options.step} at a terminal runs the step's live check` : ""}.`
          : `✔ ${options.step}: its settings are set.`,
      );
    } else if (runner) {
      // A guided step needs a person: its values and secrets are typed in at a terminal.
      out(`${runner.step.title} (${runner.step.id}): run genesis setup --step ${runner.step.id} at a terminal.`);
      runner.step.instructions.forEach((line, i) => out(`  ${i + 1}. ${line}`));
      for (const link of runner.step.links) out(`  ${link.label}: ${link.url}`);
    } else {
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
      for (const sec of s.secrets) out(`    secret ${sec.name} (${sec.store})${missing.has(sec.name) ? ": missing" : ""}`);
    }
  }
  if (!options.apply && pending) {
    out("");
    err(`✗ Nothing was applied: ${pending} plan${pending === 1 ? "" : "s"} above. Run it again with --yes to apply ${pending === 1 ? "it" : "them"}, or at a terminal for the wizard.`);
    return 1;
  }
  return code;
}
