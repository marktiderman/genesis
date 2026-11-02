// @feat:cli-doctor @feat:cli-upgrade
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { BUILTIN_RULES, runDoctor, type Finding } from "../src/doctor/index.js";
import { sha256 } from "../src/blocks/files.js";
import { writeLock, type GenesisLock } from "../src/blocks/lock.js";
import { cleanupApps, makeApp } from "./doctor-helpers.js";

afterAll(cleanupApps);

const WORKFLOW = "name: e2e\n";
const FUNCTION = "Deno.serve(() => new Response('ok'));\n";

/** An app owning a template and a block's Edge Function file, both as written. */
function app(lock: (l: GenesisLock) => void = () => {}, extra: Record<string, string> = {}) {
  const root = makeApp(null, { ".eas/workflows/e2e.yml": WORKFLOW, "supabase/functions/genesis-push-send/index.ts": FUNCTION, ...extra });
  const l: GenesisLock = {
    version: 1,
    blocks: { push: { package: "@marktiderman/genesis-native" } },
    files: {
      ".eas/workflows/e2e.yml": { source: "@marktiderman/genesis-cli:templates/eas/workflows/e2e.yml", sha256: sha256(WORKFLOW) },
      "supabase/functions/genesis-push-send/index.ts": { source: "@marktiderman/genesis-supabase:functions/genesis-push-send/index.ts", sha256: sha256(FUNCTION) },
    },
  };
  lock(l);
  writeLock(root, l);
  return root;
}

const lockFindings = async (root: string) => (await runDoctor({ root, config: {} })).findings.filter((f) => f.rule === "lock-files");
const brief = (findings: Finding[]) => findings.map((f) => `${f.level} ${f.file}`);

describe("lock-files", () => {
  it("is a built-in rule", () => {
    expect(BUILTIN_RULES).toContain("lock-files");
  });

  it("passes a lock whose files are all on disk as written", async () => {
    expect(await lockFindings(app())).toEqual([]);
  });

  it("warns on a locked file missing on disk, and says how to mark a deletion on purpose", async () => {
    const root = app();
    rmSync(path.join(root, ".eas/workflows/e2e.yml"));
    const findings = await lockFindings(root);
    expect(brief(findings)).toEqual(["warn .eas/workflows/e2e.yml"]);
    expect(findings[0]!.message).toContain("genesis upgrade won't bring it back");
    expect(findings[0]!.message).toContain('add "deleted": true to its entry in genesis.lock.json');
    const strict = await runDoctor({ root, config: {}, strict: true });
    expect(strict.ok).toBe(false);
  });

  it("warns on a locked file that can't be read (a folder now), with the read error", async () => {
    const root = app();
    rmSync(path.join(root, ".eas/workflows/e2e.yml"));
    mkdirSync(path.join(root, ".eas/workflows/e2e.yml"));
    const findings = await lockFindings(root);
    expect(brief(findings)).toEqual(["warn .eas/workflows/e2e.yml"]);
    expect(findings[0]!.message).toContain("can't be read (");
    expect(findings[0]!.message).toContain("genesis upgrade can't refresh it");
  });

  it("is quiet about a file marked deleted, and says so if it comes back", async () => {
    const root = app((l) => void (l.files[".eas/workflows/e2e.yml"]!.deleted = true));
    expect(brief(await lockFindings(root))).toEqual(["info .eas/workflows/e2e.yml"]);
    rmSync(path.join(root, ".eas/workflows/e2e.yml"));
    expect(await lockFindings(root)).toEqual([]);
  });

  it("reports an edited file as info (upgrade three-way merges it), and one waiting on .genesis-next", async () => {
    const root = app((l) => void (l.files["supabase/functions/genesis-push-send/index.ts"]!.pending = "abc"));
    writeFileSync(path.join(root, ".eas/workflows/e2e.yml"), "name: my e2e\n");
    writeFileSync(path.join(root, "supabase/functions/genesis-push-send/index.ts"), "// mine\n");
    const findings = await lockFindings(root);
    expect(brief(findings)).toEqual(["info .eas/workflows/e2e.yml", "info supabase/functions/genesis-push-send/index.ts"]);
    expect(findings[0]!.message).toContain("three-way merges the next version into your edits");
    expect(findings[1]!.message).toContain("supabase/functions/genesis-push-send/index.ts.genesis-next");
  });

  it("leaves out a block whose starter.config.ts switch is off: one info for the block, none for its missing files", async () => {
    const root = app(() => {}, { "starter.config.ts": "export default defineStarter({\n  features: {\n    push: false,\n  },\n});\n" });
    rmSync(path.join(root, "supabase/functions/genesis-push-send/index.ts"));
    const findings = await lockFindings(root);
    expect(brief(findings)).toEqual(["info genesis.lock.json"]);
    expect(findings[0]!.message).toContain("features.push is off in starter.config.ts");
    // Switched on, the missing file is a warning again.
    writeFileSync(path.join(root, "starter.config.ts"), "export default defineStarter({\n  features: {\n    push: true,\n  },\n});\n");
    expect(brief(await lockFindings(root))).toEqual(["warn supabase/functions/genesis-push-send/index.ts"]);
  });

  it("has nothing to say without a lock", async () => {
    expect(await lockFindings(makeApp(null))).toEqual([]);
  });
});
