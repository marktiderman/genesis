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

void path;
