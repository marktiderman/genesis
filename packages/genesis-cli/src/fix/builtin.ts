/**
 * Genesis's own fixes. Each wraps code that already exists (a codemod, `genesis agents`,
 * `genesis introspect`, `genesis migrate`, `genesis upgrade`), so a fix and the command it stands
 * for never disagree. Heavy modules are imported when a fix plans, not when the doctor attaches
 * fixes to its findings.
 */
import { readFileSync } from "node:fs";
import * as path from "node:path";
import type { Finding } from "../doctor/types.js";
import type { Codemod } from "../upgrade/codemods.js";
import type { UpgradeOptions, UpgradeReport } from "../upgrade/index.js";
import type { MigrateOptions, MigrateReport } from "../blocks/migrate.js";
import type { ContractReader } from "../doctor/contracts.js";
import { detectPackageManager, installCommand, shellLine } from "../blocks/pm.js";
import { plannedFile } from "./engine.js";
import type { Fix, FixContext, FixPlanDraft } from "./types.js";

/** Seams for tests: the in-process commands and readers the fixes call. */
export interface BuiltinDeps {
  runUpgrade?: (options: UpgradeOptions) => Promise<UpgradeReport>;
  runMigrate?: (options: MigrateOptions) => Promise<MigrateReport>;
  readContract?: ContractReader;
  /** The environment the contract fix reads its database URL from. Default process.env. */
  env?: Readonly<Record<string, string | undefined>>;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A fix that runs a codemod in capture mode to plan, so the plan's files are exactly what `genesis codemod <id>` would write. */
function codemodFix(options: { id: string; title: string; rules: string[]; codemod: () => Promise<Codemod>; appliesTo?: Fix["appliesTo"] }): Fix {
  return {
    id: options.id,
    kind: "auto",
    rules: options.rules,
    title: options.title,
    ...(options.appliesTo ? { appliesTo: options.appliesTo } : {}),
    async plan(ctx) {
      const mod = await options.codemod();
      const capture = new Map<string, string>();
      const notes: string[] = [];
      await mod.run({ root: ctx.root, dryRun: true, capture, log: (m) => notes.push(m.trim()) });
      const files = [...capture].map(([rel, content]) => plannedFile(ctx.root, rel, content, mod.description));
      const after = installAfter(ctx.root)(files.map((f) => f.path));
      const manual = [...notes, ...(after ? [after] : [])].join("\n");
      return {
        summary: files.length ? `genesis codemod ${mod.id}: changes ${plural(files.length, "file")}` : `genesis codemod ${mod.id}: nothing to change automatically`,
        files,
        ...(manual ? { manual } : {}),
      };
    },
  };
}

/** What a codemod that edited package.json leaves: the install, which a fix never runs for you. */
const installAfter = (root: string) => (files: string[]) =>
  files.some((f) => f === "package.json" || f.endsWith("/package.json")) ? `Then install (package.json changed): ${shellLine(installCommand(detectPackageManager(root)))}` : null;

const scopeNames = codemodFix({
  id: "codemod.scope-names",
  title: "rename the removed practice scope names (genesis codemod genesis-core-2-scope-names)",
  rules: ["removed-scope-name"],
  codemod: async () => (await import("../upgrade/codemods.js")).scopeNeutralNames,
});

const featuresRenamed = codemodFix({
  id: "codemod.features-renamed",
  title: "move imports of genesis-features to genesis-config (genesis codemod genesis-features-renamed-genesis-config)",
  rules: ["deprecated-import"],
  // Only the renamed package: a deprecated export has no codemod (its finding says what replaces it).
  appliesTo: (f) => (f.subject ?? "").startsWith("@marktiderman/genesis-features"),
  codemod: async () => (await import("../upgrade/rename-features.js")).featuresRenamedConfig,
});

const eslintConfig = codemodFix({
  id: "codemod.eslint-config",
  title: "load Genesis's lint rules in the app's eslint config (genesis codemod genesis-cli-eslint-config)",
  rules: ["genesis-eslint-config"],
  // "listed but not installed" needs an install, which is the person's (nothing to write).
  appliesTo: (f) => !/isn't installed/.test(f.message),
  codemod: async () => (await import("../upgrade/codemods.js")).genesisEslintConfig,
});

const agentGuide: Fix = {
  id: "agents.guide",
  kind: "auto",
  rules: ["agent-guide-stale"],
  title: "regenerate the agent guide (genesis agents)",
  // The hooks have their own fix; a broken block, a blocked CLAUDE.md and the infos are a person's.
  appliesTo: (f) => f.level === "warn" && !f.file.endsWith("settings.json") && !/broken|can't be read/.test(f.message),
  async plan(ctx) {
    const { agentGuideEdits, discoverPackages } = await import("../doctor/index.js");
    const edits = agentGuideEdits(ctx.root, discoverPackages(ctx.root));
    return {
      summary: edits.length ? `genesis agents: writes ${edits.map((e) => e.path).join(", ")}` : "genesis agents: the guide is up to date",
      files: edits.map((e) => plannedFile(ctx.root, e.path, e.content, "the agent guide generated from the installed Genesis packages")),
    };
  },
};

const agentHooks: Fix = {
  id: "agents.hooks",
  kind: "auto",
  rules: ["agent-guide-stale"],
  title: "update the Genesis agent hook (genesis agents --hooks)",
  appliesTo: (f) => f.file.endsWith(".claude/settings.json"),
  async plan(ctx) {
    const { agentHooksEdit, SETTINGS_PATH } = await import("../doctor/agent-hooks.js");
    const content = agentHooksEdit(ctx.root);
    return {
      summary: content === null ? "genesis agents --hooks: the hooks are current" : `genesis agents --hooks: rewrites ${SETTINGS_PATH}`,
      files: content === null ? [] : [plannedFile(ctx.root, SETTINGS_PATH, content, "Genesis's SubagentStart hook and deny rules for secret files, the app's own entries kept")],
    };
  },
};

function contractsFix(deps: BuiltinDeps): Fix {
  return {
    id: "contracts.introspect",
    kind: "auto",
    rules: ["contracts-stale"],
    title: "regenerate the contract from the database (genesis introspect)",
    // "not checked" infos and an unreachable database aren't something introspect can fix from here.
    appliesTo: (f) => f.level === "error",
    async plan(ctx) {
      const { loadConfig } = await import("../doctor/config.js");
      const { DEFAULT_CONTRACT_OUT, DEFAULT_DATABASE_ENV, contractSource, postgresContract, sourceSchemas } = await import("../doctor/contracts.js");
      const settings = loadConfig(ctx.root).config.contracts;
      if (!settings) return { summary: "doctor.contracts isn't set: nothing to regenerate", manual: "Set doctor.contracts in genesis.config.json to check and regenerate the contract." };
      const out = settings.out ?? DEFAULT_CONTRACT_OUT;
      const env = settings.databaseEnv ?? DEFAULT_DATABASE_ENV;
      const url = (deps.env ?? process.env)[env];
      if (!url) return { summary: `${env} isn't set: the contract can't be read from the database`, manual: `Set ${env} to the database URL, then run genesis fix contracts.introspect again.` };
      let current: string | null = null;
      try {
        current = readFileSync(path.join(ctx.root, out), "utf8");
      } catch {
        current = null;
      }
      const schemas = settings.schemas?.length ? settings.schemas : (sourceSchemas(current === null ? null : contractSource(current)) ?? ["public"]);
      const { content } = await (deps.readContract ?? postgresContract)(url, schemas);
      return {
        summary: `genesis introspect: ${current === null ? "writes" : "rewrites"} ${out} from ${schemas.join(", ")}`,
        files: [plannedFile(ctx.root, out, content, `the contract genesis introspect writes from the database (${schemas.join(", ")})`)],
        manual: "Commit the regenerated contract.",
      };
    },
  };
}

/** The rows a dry `genesis migrate` reports, keyed by what matters (not the timestamped file names, which change every second). */
async function migrateRows(ctx: FixContext, deps: BuiltinDeps) {
  const runMigrate = deps.runMigrate ?? (await import("../blocks/migrate.js")).runMigrate;
  const report = await runMigrate({ root: ctx.root, dryRun: true });
  return report.plan.rows;
}

function migrateCopyFix(deps: BuiltinDeps): Fix {
  return {
    id: "migrate.copy",
    kind: "auto",
    rules: ["migration-pending"],
    title: "copy the blocks' new package migrations in (genesis migrate)",
    async plan(ctx) {
      const rows = (await migrateRows(ctx, deps)).filter((r) => r.state === "new");
      const list = rows.map((r) => `${r.package} ${r.file}`).sort();
      return {
        summary: list.length ? `genesis migrate: copies ${plural(list.length, "migration")} in (${list.join("; ")})` : "genesis migrate: nothing new to copy",
        commands: list.length ? [{ tool: "genesis", args: ["migrate"], why: `copies ${list.join(", ")} in as new timestamped files; never rewrites an existing one` }] : [],
      };
    },
    async apply(_plan, ctx) {
      const runMigrate = deps.runMigrate ?? (await import("../blocks/migrate.js")).runMigrate;
      const report = await runMigrate({ root: ctx.root });
      return [`Created ${report.written.join(", ") || "nothing"}`, ...report.warnings];
    },
  };
}

function migrateForwardFix(deps: BuiltinDeps): Fix {
  return {
    id: "migrate.forward",
    kind: "guided",
    rules: ["migration-drift"],
    title: "write forward migrations for edited or changed copies (genesis migrate --forward), then fill them in",
    async plan(ctx) {
      // Without --forward: a row a forward migration already carries says so (`forward`).
      const rows = (await migrateRows(ctx, deps)).filter((r) => r.state === "edited" || r.state === "changed-upstream" || r.state === "differs");
      const list = rows.filter((r) => !r.forward).map((r) => `${r.copy ?? r.file} (${r.state})`).sort();
      return {
        summary: list.length ? `genesis migrate --forward: a forward migration stub for ${list.join("; ")}` : "no copy needs a forward migration",
        commands: list.length ? [{ tool: "genesis", args: ["migrate", "--forward"], why: "writes one forward migration stub per edited or changed copy; never rewrites an applied migration" }] : [],
        ...(list.length ? { manual: "Fill in each forward migration (the change the copy carries), review it, then apply it to the database." } : {}),
      };
    },
    async apply(_plan, ctx) {
      const runMigrate = deps.runMigrate ?? (await import("../blocks/migrate.js")).runMigrate;
      const report = await runMigrate({ root: ctx.root, forward: true });
      return [`Created ${report.written.join(", ") || "nothing"}`, ...report.warnings];
    },
    // Done when every drifting copy has its forward migration (the doctor stops reporting it).
  };
}

/** The release an upgrade fix moves to: the latest for genesis-behind, else the installed umbrella's (re-aligning skew and overlays). */
async function upgradeTarget(ctx: FixContext): Promise<string> {
  if (ctx.findings.some((f) => f.rule === "genesis-behind")) return "latest";
  const { readReleaseManifest } = await import("../doctor/versions.js");
  return readReleaseManifest(ctx.root)?.version ?? "latest";
}

function upgradeFix(deps: BuiltinDeps): Fix {
  const run = async (options: UpgradeOptions) => (deps.runUpgrade ?? (await import("../upgrade/index.js")).runUpgrade)(options);
  let opened: string | null = null;
  return {
    id: "upgrade.release",
    kind: "auto",
    rules: ["genesis-behind", "overlay-behind", "version-skew"],
    title: "upgrade Genesis in a pull request (genesis upgrade --pr; never merged)",
    async plan(ctx): Promise<FixPlanDraft> {
      if (ctx.network === false && !deps.runUpgrade) return { summary: "the upgrade reads the release from npm: run it without --offline", manual: "Run genesis fix upgrade.release without --offline." };
      const target = await upgradeTarget(ctx);
      const report = await run({ root: ctx.root, version: target, dryRun: true, install: false, doctor: false, agents: false, featuresBuild: false, log: () => {} });
      const moves = report.changes.map((c) => `${c.name} ${c.from} → ${c.to}`).sort();
      const codemods = report.codemods.map((c) => c.id).sort();
      return {
        summary: `genesis upgrade to ${report.version}: ${moves.length ? plural(moves.length, "package") + " move" : "no package moves"}${codemods.length ? `; codemods ${codemods.join(", ")}` : ""}`,
        commands: [{ tool: "genesis", args: ["upgrade", "--version", report.version, "--pr"], why: `moves every Genesis package to ${report.version} on a branch and opens a pull request (${moves.join(", ") || "files only"}); the pull request is never merged for you` }],
        ...(report.breaks.length ? { manual: `Read the changelog for ${report.breaks.map((b) => `${b.name} ${b.from} → ${b.to}`).join(", ")}: a major move no codemod covers. Review and merge the pull request yourself.` } : { manual: "Review and merge the pull request yourself." }),
      };
    },
    async apply(plan, ctx) {
      const args = plan.commands[0]?.args ?? [];
      const version = args[args.indexOf("--version") + 1];
      if (!version) return ["Nothing to upgrade."];
      const report = await run({ root: ctx.root, version, pr: true, ...(ctx.log ? { log: ctx.log } : {}) });
      opened = report.pr ?? null;
      return [report.pr ? `Pull request: ${report.pr} (not merged)` : "No pull request was opened (nothing changed, or --pr needs a git repository and gh).", report.summary];
    },
    // The upgrade lands when the pull request merges, so the doctor here still sees the old release.
    verify: () => (opened ? { ok: true, message: `the upgrade is in ${opened}; the findings clear once it's merged and installed` } : { ok: false, message: "no pull request was opened" }),
  };
}

const removeUnknownSettings: Fix = {
  id: "settings.remove-unknown",
  kind: "auto",
  rules: ["invalid-setting"],
  title: "remove settings no installed package declares from genesis.config.json",
  appliesTo: (f) => f.file === "genesis.config.json" && /no installed Genesis package declares this setting/.test(f.message),
  async plan(ctx) {
    const { unknownSettingKeys } = await import("../doctor/settings.js");
    const wanted = new Set(ctx.findings.map((f) => f.subject).filter((s): s is string => !!s));
    const keys = unknownSettingKeys(ctx.root).filter((k) => !wanted.size || wanted.has(k));
    if (!keys.length) return { summary: "no unknown settings to remove" };
    const file = "genesis.config.json";
    const raw = readFileSync(path.join(ctx.root, file), "utf8");
    const json = JSON.parse(raw) as { settings?: Record<string, unknown> };
    for (const k of keys) delete json.settings![k];
    if (json.settings && !Object.keys(json.settings).length) delete json.settings;
    const indent = /^[ \t]+(?=")/m.exec(raw)?.[0] ?? "  ";
    const content = `${JSON.stringify(json, null, indent)}${raw.endsWith("\n") ? "\n" : ""}`;
    return {
      summary: `removes ${keys.map((k) => `settings.${k}`).join(", ")} from ${file}`,
      files: [plannedFile(ctx.root, file, content, "no installed Genesis package declares these settings, so they never took effect (a typo, or a package that isn't installed)")],
      manual: `If a key was a typo, set the intended one (genesis catalog lists what the installed packages declare).`,
    };
  },
};

const reviewSettings: Fix = {
  id: "settings.review",
  kind: "guided",
  rules: ["invalid-setting"],
  title: "correct the setting's value in genesis.config.json",
  async plan(ctx) {
    const lines = ctx.findings.map((f: Finding) => `- ${f.file}${f.subject ? ` (${f.subject})` : ""}: ${f.message}`);
    return {
      summary: `${plural(ctx.findings.length, "setting")} to correct by hand`,
      manual: `Each needs a value only you can choose:\n${lines.join("\n")}`,
    };
  },
};

/** Every built-in fix, in the order the engine tries them for a rule. */
export function builtinFixes(deps: BuiltinDeps = {}): Fix[] {
  return [scopeNames, featuresRenamed, eslintConfig, agentGuide, agentHooks, contractsFix(deps), migrateCopyFix(deps), migrateForwardFix(deps), upgradeFix(deps), removeUnknownSettings, reviewSettings];
}
