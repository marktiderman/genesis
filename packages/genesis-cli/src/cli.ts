/**
 * Genesis CLI — `genesis init <consumer>` and friends.
 *
 * Wraps the pure scaffolder with a real `node:fs` filesystem +
 * `commander` argument parser. The command itself is intentionally
 * thin so the scaffolder logic stays unit-testable in isolation.
 *
 * Usage:
 *   npx @marktiderman/genesis-cli init <consumer-name> [--target <dir>] [--emit-conflicts]
 *   npx @marktiderman/genesis-cli doctor [--strict] [--json] [--build] [--config <path>] [--base <ref>]
 *   npx @marktiderman/genesis-cli primitives [--json]
 *   npx @marktiderman/genesis-cli agents [--check]
 *   npx @marktiderman/genesis-cli features build|check|find [--registry <file>] [--flags-file <file>]
 *   npx @marktiderman/genesis-cli init <app> --template native [--bundle-id <id>] [--scheme <s>]
 *   npx @marktiderman/genesis-cli add <block> [--dry-run] [--yes] [--no-install]
 *   npx @marktiderman/genesis-cli migrate [--dry-run] [--forward]
 *   npx @marktiderman/genesis-cli upgrade [--version <v>] [--dry-run] [--pr]
 */
import { Command } from "commander";
import { runScaffold, type FileSystem } from "./scaffolder.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { readFileSync } from "node:fs";
import type { FindOptions } from "@marktiderman/genesis-features";

/** The installed CLI's version, from its own package.json (dist/ sits beside it). */
function cliVersion(): string {
  try {
    return (JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string }).version;
  } catch {
    return "unknown";
  }
}

const program = new Command();

program
  .name("genesis")
  .description("Genesis CLI — scaffolders + workspace tooling")
  .version(cliVersion());

program
  .command("init")
  .description("Scaffold a new Genesis consumer (brand package + tailwind + tokens), or with --template native a new Expo app from the Genesis RN starter")
  .argument("<consumer>", "Consumer slug (lowercase, e.g., 'acme')")
  .option("-t, --target <dir>", "Target directory (default: cwd; with --template, ./<consumer>)")
  .option(
    "--genesis-version <v>",
    "Pin @marktiderman/genesis-* version (default: 'workspace:^' for monorepo)",
  )
  .option("--native", "An Expo app: add NativeWind's preset and scan genesis-ui-native", false)
  .option("--template <name>", "Make a whole app from a template: native (the Genesis RN starter)")
  .option("--display-name <name>", "--template: the app's name on the home screen (default: from the slug)")
  .option("--bundle-id <id>", "--template: iOS bundle id and Android package (default com.example.<slug>)")
  .option("--scheme <scheme>", "--template: the URL scheme (default: the slug)")
  .option(
    "--emit-conflicts",
    "Emit `.genesis-next` siblings for files that already exist (so you can diff)",
    false,
  )
  .action(async (consumer: string, opts: {
    target?: string;
    genesisVersion?: string;
    emitConflicts?: boolean;
    native?: boolean;
    template?: string;
    displayName?: string;
    bundleId?: string;
    scheme?: string;
  }) => {
    if (opts.template !== undefined) {
      if (opts.template !== "native") throw new Error(`--template must be native, not "${opts.template}".`);
      const { runInitNative } = await import("./blocks/init-native.js");
      const result = await runInitNative({
        name: consumer,
        target: path.resolve(opts.target ?? consumer),
        ...(opts.displayName ? { displayName: opts.displayName } : {}),
        ...(opts.bundleId ? { bundleId: opts.bundleId } : {}),
        ...(opts.scheme ? { scheme: opts.scheme } : {}),
      });
      console.log(`✔ Wrote ${result.files.length} files to ${result.target}`);
      if (result.blocks.length) console.log(`  blocks: ${result.blocks.join(", ")}`);
      console.log(`  Genesis packages: ${Object.entries(result.dependencies).map(([n, v]) => `${n}@${v}`).join(", ")}`);
      console.log("");
      console.log("Next steps:");
      [`cd ${path.relative(process.cwd(), result.target) || "."} && pnpm install (or your package manager)`, ...result.steps].forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
      return;
    }
    opts.target ??= process.cwd();
    const fsImpl = createNodeFs();
    const result = await runScaffold(
      {
        consumerName: consumer,
        targetDir: opts.target!,
        genesisVersion: opts.genesisVersion,
        emitConflicts: opts.emitConflicts ?? false,
        native: opts.native ?? false,
        logger: {
          info: (msg) => console.log(msg),
          warn: (msg) => console.warn(msg),
          error: (msg) => console.error(msg),
        },
      },
      fsImpl,
    );

    console.log("");
    console.log(`✔ Wrote ${result.written.length} files`);
    if (result.skipped.length > 0) {
      console.log(`= Skipped ${result.skipped.length} (already present)`);
    }
    if (result.conflicts.length > 0) {
      console.log(
        `! ${result.conflicts.length} files written as .genesis-next siblings (diff before adopting)`,
      );
    }
    console.log("");
    console.log("Next steps:");
    console.log(`  1. Edit packages/${consumer}-brand/src/brand.ts with your colors`);
    console.log(`  2. Install dependencies with your package manager`);
    console.log(`  3. Run genesis doctor, and read https://github.com/marktiderman/genesis/blob/main/docs/FRAMEWORK.md`);
  });

program
  .command("introspect")
  .description("Write a checked-in contract (resources.genesis.ts) from the Postgres catalog or a PostgREST/Supabase OpenAPI spec")
  .option("--database-env <name>", "Environment variable holding the Postgres URL", "DATABASE_URL")
  .option("--openapi <file-or-url>", "Read a PostgREST OpenAPI document (a Supabase project's /rest/v1/) instead of Postgres")
  .option("--header <header...>", "HTTP header for --openapi URLs, for values that aren't secret (repeatable)")
  .option("--apikey-env <name>", "Environment variable holding the API key for --openapi URLs (sent as apikey and Bearer)")
  .option("-s, --schema <schemas>", "Comma-separated schemas", "public")
  .option("-o, --out <file>", "Where to write the contract", "resources.genesis.ts")
  .option("--check", "Write nothing; exit 1 if the contract on disk is out of date (for CI)", false)
  .action(async (opts: { databaseEnv: string; openapi?: string; header?: string[]; apikeyEnv?: string; schema: string; out: string; check: boolean }) => {
    const schemas = opts.schema.split(",").map((s) => s.trim()).filter(Boolean);
    const { introspectOpenApi, introspectPostgres, emitContracts } = await import("./introspect/index.js");
    let tables;
    let source: string;
    if (opts.openapi) {
      if (schemas.length !== 1) throw new Error("--openapi reads one schema at a time; pass a single --schema.");
      // A key comes from the environment, like the database URL, so it stays
      // out of shell history and process listings.
      const headers = [...(opts.header ?? [])];
      if (opts.apikeyEnv) {
        const key = process.env[opts.apikeyEnv];
        if (!key) throw new Error(`Set ${opts.apikeyEnv} to the API key.`);
        headers.push(`apikey: ${key}`, `Authorization: Bearer ${key}`);
      }
      const doc = await readOpenApi(opts.openapi, headers);
      tables = introspectOpenApi(doc, schemas[0]);
      source = `OpenAPI ${redactUrl(opts.openapi)}`;
    } else {
      // The URL comes from the environment, never the command line, so it
      // stays out of shell history and process listings.
      const url = process.env[opts.databaseEnv];
      if (!url) throw new Error(`Set ${opts.databaseEnv} to the database URL, or pass --openapi.`);
      const { default: postgres } = await import("postgres");
      const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
      try {
        tables = await introspectPostgres(sql, schemas);
      } finally {
        await sql.end();
      }
      source = (await import("./doctor/contracts.js")).postgresSource(schemas);
    }
    const content = emitContracts(tables, { source });
    const target = path.resolve(opts.out);
    if (opts.check) {
      const current = await fs.readFile(target, "utf-8").catch(() => null);
      // A checkout with Windows line endings holds the same contract.
      if (current?.replace(/\r\n/g, "\n") !== content) {
        console.error(`✗ ${opts.out} is out of date. Run \`genesis introspect\` and commit the result.`);
        process.exit(1);
      }
      console.log(`✔ ${opts.out} is up to date (${tables.length} tables).`);
      return;
    }
    await fs.writeFile(target, content, "utf-8");
    console.log(`✔ Wrote ${opts.out}: ${tables.length} tables.`);
  });

program
  .command("doctor")
  .description("Check this app against the installed Genesis: components, tokens, imports, colors, plus the app's own rules")
  .option("--strict", "Fail on warnings too", false)
  .option("--json", "Print the report as JSON", false)
  .option("--build", "Also run the app's typecheck and build (doctor.build, or its typecheck/build scripts)", false)
  .option("-c, --config <path>", "Config file (default: genesis.config.json, then package.json \"genesis\")")
  .option("-d, --dir <dir>", "The app's folder", process.cwd())
  .option("--print-genesis", "Print the components, tokens and raw tags read from Genesis, and exit", false)
  .option("--base <ref>", "The git ref change checks compare against (the packages pack's change gate, and the ratchet: newOnly rules report unchanged files as info), e.g. origin/main")
  .action(async (opts: { strict: boolean; json: boolean; build: boolean; config?: string; dir: string; printGenesis: boolean; base?: string }) => {
    const doctor = await import("./doctor/index.js");
    const root = path.resolve(opts.dir);
    try {
      if (opts.printGenesis) {
        const { config } = doctor.loadConfig(root, opts.config);
        console.log(JSON.stringify(doctor.genesisSummary(doctor.loadGenesis(root, config)), null, 2));
        return;
      }
      const result = await doctor.runDoctor({ root, configPath: opts.config, strict: opts.strict, build: opts.build, quietBuild: opts.json, ...(opts.base ? { base: opts.base } : {}) });
      console.log(opts.json ? JSON.stringify(doctor.toJson(result), null, 2) : doctor.formatReport(result));
      process.exitCode = result.ok ? 0 : 1;
    } catch (err) {
      // Exit 2: the doctor could not run (bad config, Genesis not installed), as opposed to finding problems.
      // GenesisConfigError covers DoctorConfigError and the shared blocks (a bad `links`, a non-object file).
      if (!(err instanceof doctor.GenesisConfigError)) throw err;
      if (opts.json) console.log(JSON.stringify({ ok: false, error: err.message }, null, 2));
      else console.error(`✗ ${err.message}`);
      process.exitCode = 2;
    }
  });

program
  .command("primitives")
  .description("Print the Genesis primitives catalog: for each need, what to use, its import and docs, from every installed Genesis package's declarations")
  .option("--json", "Print the catalog as JSON", false)
  .option("-d, --dir <dir>", "The app's folder", process.cwd())
  .action(async (opts: { json: boolean; dir: string }) => {
    const doctor = await import("./doctor/index.js");
    const packages = doctor.discoverPackages(path.resolve(opts.dir));
    const rows = doctor.primitivesCatalog(packages);
    // A package whose declaration doesn't validate is missing from the catalog: say so and exit 1, in both formats.
    const broken = packages.filter((p) => p.error);
    if (opts.json) {
      console.log(JSON.stringify({ primitives: rows, ...doctor.primitivesSummary(packages), errors: broken.map((p) => p.error) }, null, 2));
    } else {
      console.log(doctor.formatPrimitives(rows));
    }
    for (const p of broken) console.error(`! ${p.error}`);
    for (const note of packages.flatMap((p) => p.ignored ?? [])) console.error(`! ${note}`);
    if (broken.length) process.exitCode = 1;
  });

program
  .command("agents")
  .description(`Write the agent guide from the installed Genesis packages: .claude/skills/genesis/SKILL.md and a marked block in AGENTS.md`)
  .option("--check", "Write nothing; exit 1 if either is missing or out of date (for CI)", false)
  .option("--rules", "Check the repo against the agent rules of engagement a script can check (docs/agents/RULES.md); exit 1 on a break", false)
  .option("--batch <pattern>", "With --rules: the branch pattern staging batches use in workflow filters", "staging/**")
  .option("-d, --dir <dir>", "The app's folder", process.cwd())
  .action(async (opts: { check: boolean; rules: boolean; batch: string; dir: string }) => {
    const root = path.resolve(opts.dir);
    if (opts.rules && opts.check) return program.error("--rules checks the repo, --check the agent guide: run them one at a time");
    if (opts.rules) {
      const { checkAgentRules } = await import("./agent-rules.js");
      const problems = checkAgentRules(root, { batch: opts.batch });
      for (const p of problems) console.error(`✗ ${p.rule}: ${p.message}`);
      if (problems.length) process.exitCode = 1;
      else console.log("✔ The repo keeps the checkable rules of engagement (first-version, batch-ci).");
      return;
    }
    const doctor = await import("./doctor/index.js");
    const packages = doctor.discoverPackages(root);
    // The guide would leave out a package whose declaration doesn't validate: fix it first, in both modes.
    const broken = packages.filter((p) => p.error);
    if (broken.length) {
      for (const p of broken) console.error(`✗ ${p.error}`);
      console.error("✗ The agent guide can't include these packages; fix their declarations (or upgrade @marktiderman/genesis-cli) first.");
      process.exitCode = 1;
      return;
    }
    if (opts.check) {
      const state = doctor.agentGuideState(root, packages);
      const bad = Object.entries(state).filter(([, v]) => v !== "ok");
      if (bad.length) {
        console.error(`✗ The agent guide is ${bad.map(([k, v]) => `${k === "skill" ? doctor.SKILL_PATH : "AGENTS.md"} ${v}`).join(", ")}. Run \`genesis agents\` and commit the result.`);
        process.exitCode = 1;
        return;
      }
      console.log("✔ The agent guide matches the installed Genesis packages.");
      return;
    }
    const changed = doctor.writeAgentGuide(root, packages);
    console.log(changed.length ? `✔ Wrote ${changed.join(", ")}` : "= The agent guide is up to date.");
  });

const features = program
  .command("features")
  .description("The feature registry: one typed features.ts, everything else generated from it. Settings: genesis.config.json \"features\" (or package.json \"genesisFeatures\")");

function featureOptions(command: Command) {
  return command
    .option("-d, --dir <dir>", "The repo root", process.cwd())
    .option("-r, --registry <file>", "The registry (default: src/features.ts, then features.ts)")
    .option("--flags-file <file>", "A flags file exporting `flags` (default: the registry's own `flags` export)")
    .option("--agents <file>", "The AGENTS.md that holds the pointer block (default AGENTS.md)")
    .option("--json <file>", "The JSON copy, also the record of every id (default features.json)")
    .option("--command <text>", "How people run this CLI here, named in generated files (default `genesis features`)");
}

type FeatureCliOptions = { dir: string; registry?: string; flagsFile?: string; agents?: string; json?: string; command?: string };

featureOptions(features.command("build").description("Write the AGENTS.md block, features.json, flags.json, the skill and the marketing block")).action(
  async (opts: FeatureCliOptions) => {
    const { runFeaturesBuild } = await import("./features.js");
    const changed = await runFeaturesBuild(opts);
    console.log(changed.length ? changed.map((f) => `~ ${f}`).join("\n") : "✔ Generated feature files are up to date.");
  },
);

featureOptions(features.command("check").description("Errors fail (stale output, missing code paths, flag rules, removed ids, bad tags); warnings don't"))
  .option("--labels <list>", "The PR's labels, comma-separated, to check feature:<id> labels")
  .option("--prs", "Also read merged PRs labelled feature:<id> with gh, to warn about planned features that shipped", false)
  .option("--summary", "Print a short summary and always exit 0 (for a SessionStart hook)", false)
  .action(async (opts: FeatureCliOptions & { labels?: string; prs: boolean; summary: boolean }) => {
    const { runFeaturesCheck } = await import("./features.js");
    const { summary, labels, ...rest } = opts;
    const result = await runFeaturesCheck({ ...rest, labels: labels?.split(",").map((l) => l.trim()).filter(Boolean) });
    if (summary) {
      console.log(result.summary);
      return;
    }
    for (const warning of result.warnings) console.warn(`! ${warning}`);
    for (const error of result.errors) console.error(`✗ ${error}`);
    if (result.ok) console.log(`✔ The feature registry and the repo agree${result.warnings.length ? ` (${result.warnings.length} warning${result.warnings.length === 1 ? "" : "s"})` : ""}.`);
    process.exitCode = result.ok ? 0 : 1;
  });

featureOptions(
  features
    .command("find")
    .description("Search features before building: reuse one, extend one, or add an idea first")
    .argument("[term]", "What to look for (id, alias, name, keyword, summary, import, slot or code path)", "")
    .option("--platform <platform>", "Only features on web, native, server or cli")
    .option("--kind <kind>", "Only token, element, pattern, layout, hook, provider, block, service or tool")
    .option("--layer <layer>", "Only features whose package is foundation, module or tooling (a kind here is deprecated: use --kind)")
    .option("--status <status>", "Only idea, planned, building, beta, live, deprecated or retired"),
).action(async (term: string, opts: FeatureCliOptions & { platform?: string; kind?: string; layer?: string; status?: string }) => {
  const { findFilters, runFeaturesFind, formatFeature } = await import("./features.js");
  const { platform, kind, layer, status, ...rest } = opts;
  let filters: FindOptions;
  try {
    const parsed = findFilters({ platform, kind, layer, status });
    if (parsed.warning) console.warn(`! ${parsed.warning}`);
    filters = parsed.filters;
  } catch (error) {
    return program.error((error as Error).message);
  }
  if (!term && !filters.platform && !filters.kind && !filters.packageLayer && !filters.status) program.error("Give a term, or --platform, --kind, --layer or --status");
  const hits = await runFeaturesFind(rest, term, filters);
  const what = term ? `"${term}"` : "those filters";
  console.log(hits.length ? hits.map(formatFeature).join("\n\n") : `No feature matches ${what}. If this is new work, add it to the registry first (an idea is enough).`);
});

const studio = program.command("studio").description("The Genesis Data Studio");

studio
  .command("init")
  .description("Turn the Data Studio on in this app: a server for every table, a page, and one migration to review")
  .option("-d, --dir <dir>", "The app's folder", process.cwd())
  .option("--host <host>", "next, tanstack-start or supabase-function (default: detected)")
  .option("--route <path>", "Where the page lives", "/admin/data")
  .option("--login-role <name>", "The studio's database login", "genesis_studio_login")
  .option("--force", "Overwrite files that already exist", false)
  .action(async (opts: { dir: string; host?: string; route: string; loginRole: string; force: boolean }) => {
    const { planStudioInit } = await import("./studio/init.js");
    const root = path.resolve(opts.dir);
    const packageJson = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf-8").catch(() => "{}"));
    const existsSync = (await import("node:fs")).existsSync;
    const readSync = (await import("node:fs")).readFileSync;
    const readdirSync = (await import("node:fs")).readdirSync;
    if (opts.host && !["next", "tanstack-start", "supabase-function"].includes(opts.host)) {
      throw new Error("--host must be next, tanstack-start or supabase-function.");
    }
    const plan = planStudioInit(
      {
        packageJson,
        exists: (p) => existsSync(path.join(root, p)),
        read: (p) => (existsSync(path.join(root, p)) ? readSync(path.join(root, p), "utf-8") : null),
        timestamp: new Date().toISOString().replace(/\D/g, "").slice(0, 14),
        listDeep: (p) => {
          const out: string[] = [];
          const walk = (rel: string) => {
            for (const entry of readdirSync(path.join(root, rel), { withFileTypes: true })) {
              const child = `${rel}/${entry.name}`;
              if (entry.isDirectory()) walk(child);
              else out.push(child);
            }
          };
          try {
            walk(p);
          } catch {
            // No such folder.
          }
          return out;
        },
        list: (p) => {
          try {
            return readdirSync(path.join(root, p));
          } catch {
            return [];
          }
        },
      },
      { host: opts.host as "next" | "tanstack-start" | "supabase-function" | undefined, route: opts.route, loginRole: opts.loginRole },
    );
    for (const file of plan.files) {
      const target = path.join(root, file.path);
      await fs.mkdir(path.dirname(target), { recursive: true });
      if (file.edit) {
        await fs.writeFile(target, file.content, "utf-8");
        console.log(`~ ${file.path} (${file.edit})`);
        continue;
      }
      if (file.append) {
        await fs.appendFile(target, file.content, "utf-8");
        console.log(`+ ${file.path} (appended)`);
        continue;
      }
      if (existsSync(target) && !opts.force) {
        console.log(`= ${file.path} exists; left as it is (--force to replace)`);
        continue;
      }
      await fs.writeFile(target, file.content, "utf-8");
      console.log(`+ ${file.path}`);
    }
    const pm = existsSync(path.join(root, "pnpm-lock.yaml")) ? "pnpm add" : existsSync(path.join(root, "yarn.lock")) ? "yarn add" : existsSync(path.join(root, "bun.lock")) || existsSync(path.join(root, "bun.lockb")) ? "bun add" : "npm install";
    console.log("");
    console.log(`✔ The Data Studio is set up for ${{ next: "Next.js", "tanstack-start": "TanStack Start", "supabase-function": "a Supabase Edge Function" }[plan.host]}. To finish:`);
    // Quote a range with spaces or `<`/`>` so the line pastes into a shell as is.
    console.log(`  1. ${pm} ${plan.install.map((p) => (/[\s<>|]/.test(p) ? `"${p}"` : p)).join(" ")}`);
    plan.steps.forEach((step, i) => console.log(`  ${i + 2}. ${step}`));
  });

async function confirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const { createInterface } = await import("node:readline/promises");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return /^y(es)?$/i.test((await rl.question(`${question} [y/N] `)).trim());
  } finally {
    rl.close();
  }
}

const logger = { info: (m: string) => console.log(m), warn: (m: string) => console.warn(`! ${m}`) };

program
  .command("add")
  .description("Add a block (a feature an app adds whole) from the Genesis package that declares it: install, migrations, functions, skills, routes, registry entry")
  .argument("[block]", "The block's id, e.g. tenant-features")
  .option("-d, --dir <dir>", "The app's folder", process.cwd())
  .option("--package <name>", "The package that declares it, when two do")
  .option("--list", "List the blocks this app can add, and exit", false)
  .option("--dry-run", "Print the plan; write and install nothing", false)
  .option("-y, --yes", "Don't ask before writing", false)
  .option("--no-install", "Don't install packages (print the command instead)")
  .option("--no-features-build", "Don't run features build after")
  .action(async (block: string | undefined, opts: { dir: string; package?: string; list: boolean; dryRun: boolean; yes: boolean; install: boolean; featuresBuild: boolean }) => {
    const root = path.resolve(opts.dir);
    if (opts.list || !block) {
      const { allBlocks } = await import("./blocks/discover.js");
      const { readLock } = await import("./blocks/lock.js");
      const warnings: string[] = [];
      const added = readLock(root).blocks;
      const all = await allBlocks(root, warnings);
      for (const w of warnings) logger.warn(w);
      console.log(all.length ? all.map(({ manifest: m, from }) => `${added[m.id] ? "✔" : " "} ${m.id.padEnd(18)} ${m.package}${m.version ? `@${m.version}` : ""}${from === "catalog" ? " (not installed)" : ""}${m.feature ? `: ${m.feature.summary}` : ""}`).join("\n") : "No Genesis package declares a block.");
      if (!block && !opts.list) process.exitCode = 1;
      return;
    }
    const { runAdd } = await import("./blocks/add.js");
    const report = await runAdd({ root, block, ...(opts.package ? { package: opts.package } : {}), dryRun: opts.dryRun, yes: opts.yes, install: opts.install, featuresBuild: opts.featuresBuild, log: logger, confirm });
    for (const w of report.warnings) logger.warn(w);
    for (const k of report.kept) logger.warn(`${k.path}: ${k.why}`);
    console.log("");
    if (opts.dryRun) console.log(`Dry run: nothing written${report.install ? " or installed" : ""}.`);
    else if (!report.created.length && !report.edited.length) console.log(`✔ ${report.block.id} is already in this app: nothing to copy or change.`);
    else console.log(`✔ Added ${report.block.id}: ${report.created.length} files created${report.edited.length ? `, ${report.edited.length} edited (${report.edited.join(", ")})` : ""}.`);
    if (report.steps.length) {
      console.log("");
      console.log("To finish:");
      report.steps.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
    }
  });

program
  .command("migrate")
  .description("Copy new package migrations of the app's blocks in as new timestamped files; report edited or changed ones (never rewritten)")
  .option("-d, --dir <dir>", "The app's folder", process.cwd())
  .option("--block <id...>", "Also check these blocks (beyond genesis.lock.json's)")
  .option("--dry-run", "Report only", false)
  .option("--forward", "Write a forward migration stub for each edited or changed migration", false)
  .action(async (opts: { dir: string; block?: string[]; dryRun: boolean; forward: boolean }) => {
    const { runMigrate } = await import("./blocks/migrate.js");
    const { formatMigrationRows } = await import("./blocks/migrations.js");
    const report = await runMigrate({ root: path.resolve(opts.dir), ...(opts.block ? { blocks: opts.block } : {}), dryRun: opts.dryRun, forward: opts.forward });
    for (const w of report.warnings) logger.warn(w);
    console.log(formatMigrationRows(report.plan.rows));
    for (const c of report.plan.creates) if (c.kind !== "migration") console.log(`+ ${c.path} (${c.kind === "test" ? "pgTAP test" : "forward migration: fill it in"})`);
    console.log("");
    const count = report.plan.creates.length;
    console.log(opts.dryRun ? `Dry run: ${count} file${count === 1 ? "" : "s"} would be created.` : `✔ ${report.written.length} file${report.written.length === 1 ? "" : "s"} created. Nothing existing was changed.`);
    if (report.attention) {
      console.log(opts.forward ? "Fill in the forward migrations, review them, then apply them." : "Some migrations need you (above): an applied migration is never rewritten. Run genesis migrate --forward to add a forward migration for each.");
      process.exitCode = 1;
    }
  });

program
  .command("upgrade")
  .description("Move every @marktiderman/genesis* dependency to one Genesis release, refresh the files Genesis owns, run codemods and the doctor")
  .option("-d, --dir <dir>", "The app's folder", process.cwd())
  .option("--version <v>", "The @marktiderman/genesis release: an exact version or a dist-tag", "latest")
  .option("--manifest <file>", "Read the release from this versions.json instead of npm")
  .option("--dry-run", "Report the bump, and owned files compared with the packages installed now; change nothing", false)
  .option("--no-install", "Don't reinstall after the bump")
  .option("--no-doctor", "Don't run genesis doctor after")
  .option("--keep-mine", "Never merge an owned file you changed; write the new text to .genesis-next", false)
  .option("--pr", "Commit to a genesis-upgrade/<version> branch, push it and open a pull request", false)
  .action(async (opts: { dir: string; version: string; manifest?: string; dryRun: boolean; install: boolean; doctor: boolean; keepMine: boolean; pr: boolean }) => {
    const { runUpgrade } = await import("./upgrade/index.js");
    const report = await runUpgrade({
      root: path.resolve(opts.dir),
      version: opts.version,
      ...(opts.manifest ? { manifest: opts.manifest } : {}),
      dryRun: opts.dryRun,
      install: opts.install,
      doctor: opts.doctor,
      keepMine: opts.keepMine,
      pr: opts.pr,
      log: (m) => console.log(m),
    });
    console.log("");
    console.log(report.summary);
    if (opts.dryRun) console.log("\nDry run: nothing written, installed or pushed.");
    if (report.pr) console.log(`\n✔ ${report.pr}`);
    if (report.doctor === "failed") process.exitCode = 1;
  });

program
  .command("codemod [id]")
  .description("Run one of Genesis's codemods by hand (genesis upgrade runs them for you); without an id, list them")
  .option("-d, --dir <dir>", "The app's folder", process.cwd())
  .option("--dry-run", "List the files it would change; change nothing", false)
  .action(async (id: string | undefined, opts: { dir: string; dryRun: boolean }) => {
    const { CODEMODS, codemodById } = await import("./upgrade/codemods.js");
    if (!id) {
      for (const mod of CODEMODS) console.log(`${mod.id}  (${mod.package} ${mod.version})\n  ${mod.description}`);
      return;
    }
    const mod = codemodById(id);
    if (!mod) throw new Error(`No codemod "${id}". Run genesis codemod to list them.`);
    const changed = await mod.run({ root: path.resolve(opts.dir), dryRun: opts.dryRun, log: (m) => console.log(m) });
    console.log(changed.length ? `${opts.dryRun ? "Would change" : "✔ Changed"} ${changed.length} file${changed.length === 1 ? "" : "s"}:\n${changed.map((f) => `  ${f}`).join("\n")}` : "Nothing to change.");
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`✗ ${message}`);
  process.exit(1);
});

function createNodeFs(): FileSystem {
  return {
    async exists(p: string): Promise<boolean> {
      try {
        await fs.access(p);
        return true;
      } catch (err) {
        // Only swallow ENOENT (file genuinely doesn't exist). Permission
        // / I/O errors should bubble so the user sees them — silently
        // treating them as "not exists" causes the scaffolder to overwrite
        // a file the user wasn't allowed to read.
        const e = err as NodeJS.ErrnoException;
        if (e.code === "ENOENT") return false;
        throw err;
      }
    },
    async readFile(p: string): Promise<string> {
      return fs.readFile(p, "utf-8");
    },
    async writeFile(p: string, content: string): Promise<void> {
      await fs.writeFile(p, content, "utf-8");
    },
    async mkdirp(dir: string): Promise<void> {
      await fs.mkdir(dir, { recursive: true });
    },
  };
}

async function readOpenApi(location: string, headers: string[]) {
  if (/^https?:\/\//.test(location)) {
    const init: Record<string, string> = {};
    for (const h of headers) {
      const at = h.indexOf(":");
      if (at < 1) throw new Error(`--header must be "Name: value".`);
      init[h.slice(0, at).trim()] = h.slice(at + 1).trim();
    }
    const response = await fetch(location, { headers: { accept: "application/openapi+json, application/json", ...init } });
    if (!response.ok) throw new Error(`Fetching the OpenAPI document failed: HTTP ${response.status}.`);
    return response.json();
  }
  return JSON.parse(await fs.readFile(location, "utf-8"));
}

/** A URL without credentials or query (where API keys tend to be). */
function redactUrl(location: string): string {
  try {
    const url = new URL(location);
    return `${url.origin}${url.pathname}`;
  } catch {
    return path.basename(location);
  }
}
