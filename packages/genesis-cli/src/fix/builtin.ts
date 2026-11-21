/**
 * Genesis's own fixes. Each wraps code that already exists (a codemod, `genesis agents`,
 * `genesis introspect`, `genesis migrate`, `genesis upgrade`), so a fix and the command it stands
 * for never disagree. Heavy modules are imported when a fix plans, not when the doctor attaches
 * fixes to its findings.
 */
import { readFileSync } from "node:fs";
import * as path from "node:path";
import type { Codemod } from "../upgrade/codemods.js";
import type { UpgradeOptions, UpgradeReport } from "../upgrade/index.js";
import type { MigrateOptions, MigrateReport } from "../blocks/migrate.js";
import type { ContractReader } from "../doctor/contracts.js";
import type { Finding } from "../doctor/types.js";
import { detectPackageManager, installCommand, shellLine } from "../blocks/pm.js";
import { isLockedSetting, unknownSettingKeys } from "../doctor/settings.js";
import { runTool, type ToolRunner } from "../exec/run.js";
import { plannedFile } from "./engine.js";
import type { Fix, FixContext, FixPlanDraft } from "./types.js";

/** Seams for tests: the in-process commands and readers the fixes call. */
export interface BuiltinDeps {
  runUpgrade?: (options: UpgradeOptions) => Promise<UpgradeReport>;
  runMigrate?: (options: MigrateOptions) => Promise<MigrateReport>;
  readContract?: ContractReader;
  /** Runs allowlisted tools (git, for the upgrade's clean-tree check). Default src/exec/run.ts. */
  run?: ToolRunner;
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
      return { ran: ["genesis migrate"], notes: [`Created ${report.written.join(", ") || "nothing"}`, ...report.warnings] };
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
      return { ran: ["genesis migrate --forward"], notes: [`Created ${report.written.join(", ") || "nothing"}`, ...report.warnings] };
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
      // --pr commits on a new branch: it refuses a dirty tree, so say so now rather than fail on apply.
      let status: { code: number | null; stdout: string };
      try {
        status = await (deps.run ?? runTool)("git", ["status", "--porcelain"], { cwd: ctx.root, timeoutMs: 30_000 });
      } catch (err) {
        status = { code: null, stdout: (err as Error).message };
      }
      if (status.code !== 0) return { summary: "the upgrade opens a pull request, which needs a git repository", manual: "Run it in the app's git repository (with gh signed in), or run genesis upgrade without --pr." };
      if (status.stdout.trim()) {
        // Porcelain lines are "XY path": the status columns may start with a space.
        const lines = status.stdout.split("\n").filter((l) => l.trim());
        const files = lines.slice(0, 10).map((l) => l.slice(3));
        return { summary: "the working tree has uncommitted changes: the upgrade's pull request needs a clean one", manual: `Commit or stash your changes first (${files.join(", ")}${lines.length > 10 ? ", …" : ""}), then run genesis fix upgrade.release again.` };
      }
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
      if (!version) return { ran: [], notes: ["Nothing to upgrade."] };
      const report = await run({ root: ctx.root, version, pr: true, ...(ctx.log ? { log: ctx.log } : {}) });
      opened = report.pr ?? null;
      return { ran: [`genesis upgrade --version ${version} --pr`], notes: [report.pr ? `Pull request: ${report.pr} (not merged)` : "No pull request was opened (nothing changed, or --pr needs a git repository and gh).", report.summary] };
    },
    // The upgrade lands when the pull request merges, so the doctor here still sees the old release.
    verify: () => (opened ? { ok: true, message: `the upgrade is in ${opened}; the findings clear once it's merged and installed` } : { ok: false, message: "no pull request was opened" }),
  };
}

const CONFIG_FILE = "genesis.config.json";
const UNKNOWN_SETTING = /no installed Genesis package declares this setting/;

/** genesis.config.json with its `settings` changed, keeping its indent and final newline. */
function rewriteSettings(root: string, change: (settings: Record<string, unknown>) => void): string {
  const raw = readFileSync(path.join(root, CONFIG_FILE), "utf8");
  const json = JSON.parse(raw) as { settings?: Record<string, unknown> };
  const settings = { ...(json.settings ?? {}) };
  change(settings);
  if (Object.keys(settings).length) json.settings = settings;
  else delete json.settings;
  const indent = /^[ \t]+(?=")/m.exec(raw)?.[0] ?? "  ";
  return `${JSON.stringify(json, null, indent)}${raw.endsWith("\n") ? "\n" : ""}`;
}

/** The finding subjects a fix was asked for (all of them when it was planned without findings). */
const wantedKeys = (ctx: FixContext) => new Set(ctx.findings.map((f) => f.subject).filter((s): s is string => !!s));

const removeUnknownSettings: Fix = {
  id: "settings.remove-unknown",
  kind: "auto",
  rules: ["invalid-setting"],
  title: "remove settings no installed package declares from genesis.config.json",
  // Only a key that is surely unknown (the catalogue read completely) and isn't locked; the rest
  // fall to settings.review, a person's call. A locked key is never removed automatically.
  appliesTo: (f, ctx) =>
    f.file === CONFIG_FILE &&
    UNKNOWN_SETTING.test(f.message) &&
    !/; not certain: /.test(f.message) &&
    !!f.subject &&
    !isLockedSetting(ctx.root, f.subject),
  async plan(ctx) {
    const wanted = wantedKeys(ctx);
    const found = unknownSettingKeys(ctx.root);
    if (!found.complete) return { summary: "the settings catalogue isn't complete, so no setting is removed", manual: `Not certain any setting is unknown: ${found.reason}. Fix that, then run genesis doctor again.` };
    const locked = found.keys.filter((k) => isLockedSetting(ctx.root, k));
    const keys = found.keys.filter((k) => (!wanted.size || wanted.has(k)) && !locked.includes(k));
    if (!keys.length) return { summary: "no unknown settings to remove", ...(locked.length ? { manual: `Locked, so left for you: ${locked.map((k) => `settings.${k}`).join(", ")}.` } : {}) };
    return {
      summary: `removes ${keys.map((k) => `settings.${k}`).join(", ")} from ${CONFIG_FILE}`,
      files: [plannedFile(ctx.root, CONFIG_FILE, rewriteSettings(ctx.root, (s) => keys.forEach((k) => delete s[k])), "no installed Genesis package declares these settings, so they never took effect (a typo, or a package that isn't installed)")],
      manual: `If a key was a typo, set the intended one (genesis catalog lists what the installed packages declare).`,
    };
  },
};

const adoptMissed: Fix = {
  id: "missed-value.adopt",
  kind: "guided",
  rules: ["missed-value"],
  title: "adopt what Genesis offers that the app doesn't use (each finding says how), or decline it in doctor.declined with the reason",
  async plan(ctx) {
    const missed = ctx.findings.filter((f) => f.rule === "missed-value");
    if (!missed.length) return { summary: "nothing Genesis offers is missed" };
    const ids = [...new Set(missed.map((f) => f.subject ?? f.file))];
    const lane = ids.includes("pr-previews");
    return {
      summary: `missed: ${ids.join(", ")}`,
      commands: lane ? [{ tool: "genesis", args: ["add", "template", "previews"], why: "pull request previews on their own channel, and their teardown" }] : [],
      manual: "Follow each finding's steps in a pull request, or add the id to genesis.config.json doctor.declined with why the app doesn't want it.",
    };
  },
};

const resetBadSettings: Fix = {
  id: "settings.reset",
  kind: "guided",
  rules: ["invalid-setting"],
  title: "take a value that doesn't fit out of genesis.config.json (the key goes back to its default), or set one that fits",
  // A value that doesn't fit its key (reported as `settings.<key>…`); an unknown key is remove-unknown's or review's.
  appliesTo: (f) => f.file === CONFIG_FILE && f.level === "error" && f.message.startsWith("settings.") && !UNKNOWN_SETTING.test(f.message),
  async plan(ctx) {
    const { badSettingValues } = await import("../doctor/settings.js");
    const wanted = wantedKeys(ctx);
    const bad = badSettingValues(ctx.root).filter((b) => !wanted.size || wanted.has(b.key));
    if (!bad.length) return { summary: "no setting in genesis.config.json has a value that doesn't fit" };
    const keys = [...new Set(bad.map((b) => b.key))];
    return {
      summary: `removes ${keys.map((k) => `settings.${k}`).join(", ")} from ${CONFIG_FILE}, so ${keys.length === 1 ? "it takes its" : "they take their"} default (a lock on ${keys.length === 1 ? "it" : "them"} goes too)`,
      files: [plannedFile(ctx.root, CONFIG_FILE, rewriteSettings(ctx.root, (s) => keys.forEach((k) => delete s[k])), "a value that doesn't fit its key is skipped at runtime anyway; without it the key resolves from the layers below")],
      manual: `Or, instead, set a value that fits:\n${bad.map((b) => `- settings.${b.message}`).join("\n")}`,
    };
  },
};

/** Every other invalid-setting finding in genesis.config.json (an unknown key that isn't certain or is locked, a legacy key): a person's call. */
const reviewSettings: Fix = {
  id: "settings.review",
  kind: "manual",
  rules: ["invalid-setting"],
  title: "correct the setting in genesis.config.json yourself",
  // A database row is a platform admin's (the Settings screen), and a package's declaration its own: no fix here.
  appliesTo: (f) => f.file === CONFIG_FILE,
  async plan(ctx) {
    const lines = ctx.findings.map((f: Finding) => `- ${f.file}${f.subject ? ` (${f.subject})` : ""}: ${f.message}`);
    return {
      summary: `${plural(ctx.findings.length, "setting")} to correct by hand`,
      manual: `Each needs a value only you can choose:\n${lines.join("\n")}`,
    };
  },
};

const settingRequires: Fix = {
  id: "settings.requires",
  kind: "guided",
  rules: ["setting-requires"],
  title: "turn on the settings a setting requires (or turn that setting off yourself)",
  // genesis.config.json only: a database row is a platform admin's, changed on the Settings screen.
  appliesTo: (f) => f.file === CONFIG_FILE,
  async plan(ctx) {
    const { resolveFileSettings } = await import("../doctor/settings.js");
    const r = resolveFileSettings(ctx.root);
    if (!r) return { summary: "the settings catalogue can't be read: genesis doctor says why" };
    const wanted = wantedKeys(ctx);
    const gaps = r.resolved.problems.filter((p) => p.kind === "requires" && (!wanted.size || wanted.has(p.key)));
    const turnOn = new Set<string>();
    const byHand: string[] = [];
    for (const gap of gaps) {
      for (const req of r.catalogue.keys[gap.key]?.requires ?? []) {
        const value = r.resolved.values[req];
        if (value !== false && value !== null && value !== undefined) continue;
        const def = r.catalogue.keys[req];
        const lockedInFile = r.resolved.sources[req]?.lockedBy === "file";
        if (def?.type === "boolean" && !lockedInFile) turnOn.add(req);
        else byHand.push(`- ${req}${lockedInFile ? " is locked off in genesis.config.json" : " needs a value only you can choose"} (${gap.key} requires it)`);
      }
    }
    const on = [...turnOn].sort();
    const alternatives = `Or turn ${gaps.map((g) => g.key).join(", ")} off instead (false in ${CONFIG_FILE}).`;
    return {
      summary: on.length ? `turns on ${on.map((k) => `settings.${k}`).join(", ")} in ${CONFIG_FILE}` : `${plural(gaps.length, "setting")} need${gaps.length === 1 ? "s" : ""} a key only you can set`,
      files: on.length ? [plannedFile(ctx.root, CONFIG_FILE, rewriteSettings(ctx.root, (s) => on.forEach((k) => (s[k] = true))), `${gaps.map((g) => g.key).join(", ")} require${gaps.length === 1 ? "s" : ""} ${on.join(", ")}`)] : [],
      manual: [...byHand, alternatives].join("\n"),
    };
  },
};

/** No platform admin in genesis-supabase's default list: the person names one by email. */
const firstAdmin: Fix = {
  id: "settings.first-admin",
  kind: "guided",
  rules: ["platform-admin-missing"],
  title: "add the first platform admin by email",
  appliesTo: (f) => f.level === "warn",
  plan() {
    return {
      summary: "add the first platform admin: only you know who it is",
      manual: [
        "With your email in place of you@example.com (the person must have signed up and confirmed that email), run in the Supabase SQL editor, or with supabase db query --linked. It adds nobody when no confirmed person, or more than one, has that email:",
        "  do $$ begin",
        "    if (select count(*) from auth.users where lower(email) = lower('you@example.com') and email_confirmed_at is not null) <> 1 then",
        "      raise exception 'no single confirmed person has that email: nobody was added';",
        "    end if;",
        "    insert into public.genesis_platform_admins (person)",
        "    select id from auth.users where lower(email) = lower('you@example.com') and email_confirmed_at is not null",
        "    on conflict do nothing;",
        "  end $$;",
        "Or give the app its own hook: create function private.genesis_platform_admin(person uuid) returns boolean (genesis-supabase README, Settings); the list is then unused.",
      ].join("\n"),
    };
  },
};

const settingSetup: Fix = {
  id: "settings.setup",
  kind: "guided",
  rules: ["setup-incomplete"],
  title: "set up a feature that needs an outside service (its guided step)",
  async plan(ctx) {
    const { resolveFileSettings } = await import("../doctor/settings.js");
    const r = resolveFileSettings(ctx.root);
    const keys = [...wantedKeys(ctx)].sort();
    const lines = keys.map((key) => {
      const def = r?.catalogue.keys[key];
      const by = `set settings.${key} in ${CONFIG_FILE}${def?.secret ? ` and its secret ${def.secret.name} (genesis fix secrets.set, once the doctor reports it missing)` : ""}`;
      return def?.setup ? `- ${key}: genesis setup --step ${def.setup} (or ${by})` : `- ${key}: ${by}`;
    });
    return {
      summary: keys.length ? `${plural(keys.length, "feature")} to set up: each stays off until it is` : "nothing to set up",
      ...(lines.length ? { manual: lines.join("\n") } : {}),
    };
  },
};

function setSecrets(): Fix {
  return {
    id: "secrets.set",
    kind: "guided",
    rules: ["secret-missing"],
    title: "set the missing secrets through your signed-in supabase and gh (the value is asked for, held in memory, and sent on stdin only)",
    appliesTo: (f) => f.level !== "info" && !!f.subject,
    async plan(ctx) {
      const { setterFor, storeOptions, targetOfLabel } = await import("../exec/secret-stores.js");
      const options = storeOptions(ctx.root);
      const commands: NonNullable<FixPlanDraft["commands"]> = [];
      const manual: string[] = [];
      const seen = new Set<string>();
      for (const f of [...ctx.findings].sort((a, b) => `${a.file}:${a.subject}`.localeCompare(`${b.file}:${b.subject}`))) {
        const target = targetOfLabel(f.file);
        if (!target || !f.subject || seen.has(`${target}:${f.subject}`)) continue;
        seen.add(`${target}:${f.subject}`);
        const setter = setterFor(f.subject, target, options);
        if ("command" in setter) commands.push(setter.command);
        else manual.push(setter.manual);
      }
      return {
        summary: commands.length || manual.length ? `sets ${plural(seen.size, "secret")} by name (${[...seen].join(", ")}); values are asked for at the terminal and never shown or stored` : "no missing secret to set",
        commands,
        ...(manual.length ? { manual: manual.join("\n") } : {}),
      };
    },
  };
}

/** Every built-in fix, in the order the engine tries them for a rule. */
export function builtinFixes(deps: BuiltinDeps = {}): Fix[] {
  return [scopeNames, featuresRenamed, eslintConfig, agentGuide, agentHooks, contractsFix(deps), migrateCopyFix(deps), migrateForwardFix(deps), upgradeFix(deps), removeUnknownSettings, resetBadSettings, adoptMissed, reviewSettings, settingRequires, settingSetup, firstAdmin, setSecrets()];
}
