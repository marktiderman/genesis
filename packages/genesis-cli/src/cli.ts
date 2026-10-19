/**
 * Genesis CLI — `genesis init <consumer>` and friends.
 *
 * Wraps the pure scaffolder with a real `node:fs` filesystem +
 * `commander` argument parser. The command itself is intentionally
 * thin so the scaffolder logic stays unit-testable in isolation.
 *
 * Usage:
 *   npx @marktiderman/genesis-cli init <consumer-name> [--target <dir>] [--emit-conflicts]
 */
import { Command } from "commander";
import { runScaffold, type FileSystem } from "./scaffolder.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const program = new Command();

program
  .name("genesis")
  .description("Genesis CLI — scaffolders + workspace tooling")
  .version("0.1.0");

program
  .command("init")
  .description("Scaffold a new Genesis consumer (brand package + tailwind + tokens)")
  .argument("<consumer>", "Consumer slug (lowercase, e.g., 'acme')")
  .option("-t, --target <dir>", "Target directory (default: cwd)", process.cwd())
  .option(
    "--genesis-version <v>",
    "Pin @marktiderman/genesis-* version (default: 'workspace:^' for monorepo)",
  )
  .option(
    "--emit-conflicts",
    "Emit `.genesis-next` siblings for files that already exist (so you can diff)",
    false,
  )
  .action(async (consumer: string, opts: {
    target: string;
    genesisVersion?: string;
    emitConflicts?: boolean;
  }) => {
    const fsImpl = createNodeFs();
    const result = await runScaffold(
      {
        consumerName: consumer,
        targetDir: opts.target,
        genesisVersion: opts.genesisVersion,
        emitConflicts: opts.emitConflicts ?? false,
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
    console.log(`  2. pnpm install`);
    console.log(`  3. Read docs/prds/PRD-07-genesis-consumption-architecture/standards/usage-doctrine.md`);
  });

program
  .command("introspect")
  .description("Write a checked-in contract (resources.genesis.ts) from the Postgres catalog or a PostgREST/Supabase OpenAPI spec")
  .option("--database-env <name>", "Environment variable holding the Postgres URL", "DATABASE_URL")
  .option("--openapi <file-or-url>", "Read a PostgREST OpenAPI document (a Supabase project's /rest/v1/) instead of Postgres")
  .option("--header <header...>", "HTTP header for --openapi URLs, e.g. 'apikey: …' (repeatable)")
  .option("-s, --schema <schemas>", "Comma-separated schemas", "public")
  .option("-o, --out <file>", "Where to write the contract", "resources.genesis.ts")
  .option("--check", "Write nothing; exit 1 if the contract on disk is out of date (for CI)", false)
  .action(async (opts: { databaseEnv: string; openapi?: string; header?: string[]; schema: string; out: string; check: boolean }) => {
    const schemas = opts.schema.split(",").map((s) => s.trim()).filter(Boolean);
    const { introspectOpenApi, introspectPostgres, emitContracts } = await import("./introspect/index.js");
    let tables;
    let source: string;
    if (opts.openapi) {
      const doc = await readOpenApi(opts.openapi, opts.header ?? []);
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
      source = `Postgres (${schemas.join(", ")})`;
    }
    const content = emitContracts(tables, { source });
    const target = path.resolve(opts.out);
    if (opts.check) {
      const current = await fs.readFile(target, "utf-8").catch(() => null);
      if (current !== content) {
        console.error(`✗ ${opts.out} is out of date. Run \`genesis introspect\` and commit the result.`);
        process.exit(1);
      }
      console.log(`✔ ${opts.out} is up to date (${tables.length} tables).`);
      return;
    }
    await fs.writeFile(target, content, "utf-8");
    console.log(`✔ Wrote ${opts.out}: ${tables.length} tables.`);
  });

const studio = program.command("studio").description("The Genesis Data Studio");

studio
  .command("init")
  .description("Turn the Data Studio on in this app: a server for every table, a page, and one migration to review")
  .option("-d, --dir <dir>", "The app's folder", process.cwd())
  .option("--host <host>", "next or supabase-function (default: detected)")
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
    if (opts.host && opts.host !== "next" && opts.host !== "supabase-function") {
      throw new Error("--host must be next or supabase-function.");
    }
    const plan = planStudioInit(
      {
        packageJson,
        exists: (p) => existsSync(path.join(root, p)),
        read: (p) => (existsSync(path.join(root, p)) ? readSync(path.join(root, p), "utf-8") : null),
        timestamp: new Date().toISOString().replace(/\D/g, "").slice(0, 14),
        list: (p) => {
          try {
            return readdirSync(path.join(root, p));
          } catch {
            return [];
          }
        },
      },
      { host: opts.host as "next" | "supabase-function" | undefined, route: opts.route, loginRole: opts.loginRole },
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
    const pm = existsSync(path.join(root, "pnpm-lock.yaml")) ? "pnpm add" : existsSync(path.join(root, "yarn.lock")) ? "yarn add" : existsSync(path.join(root, "bun.lockb")) ? "bun add" : "npm install";
    console.log("");
    console.log(`✔ The Data Studio is set up for ${plan.host === "next" ? "Next.js" : "a Supabase Edge Function"}. To finish:`);
    console.log(`  1. ${pm} ${plan.install.join(" ")}`);
    plan.steps.forEach((step, i) => console.log(`  ${i + 2}. ${step}`));
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
