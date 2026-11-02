// @feat:cli-upgrade
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { sha256 } from "../src/blocks/files.js";
import { readLock, writeLock } from "../src/blocks/lock.js";
import { mergeThreeWay } from "../src/blocks/owned.js";
import { bumpPackageJson, compareVersions, lockedGenesisVersions, normaliseReleaseAgeExcludes, pnpmReadsExactExcludes, releaseAgeExcludeProblems, tidyLocked } from "../src/upgrade/bump-core.mjs";
import { codemodsFor, uncoveredBreaks, type Codemod } from "../src/upgrade/codemods.js";
import { pnpmWorkspaceFileFor, releaseAgeError, runUpgrade, type ReleaseLookup } from "../src/upgrade/index.js";
import { fakePackage, makeApp, PACKAGES, read, snapshot, writeTree } from "./blocks-helpers.js";

const lookup = (packages: Record<string, string>, latest: Record<string, string> = {}): ReleaseLookup => ({
  release: () => ({ version: "2.0.0", packages }),
  latest: (name) => latest[name] ?? null,
});

const TEMPLATE_V1 = "name: e2e\nsteps:\n  - one\n  - two\n";
const TEMPLATE_V2 = "name: e2e\nsteps:\n  - one\n  - two\n  - three\n";

/** An app on genesis-fixture 1.0.0, owning one file whose source the "installed" package ships. */
function app(owned: string, packageText: string) {
  const root = makeApp({
    "package.json": JSON.stringify({ name: "fixture-app", dependencies: { "@marktiderman/genesis-fixture": "^1.0.0", "@marktiderman/genesis-ui": "workspace:^", react: "19.3.0" } }, null, 2) + "\n",
    "supabase/functions/fixture-send/index.ts": owned,
  });
  fakePackage(root, "@marktiderman/genesis-fixture", {}, { "functions/fixture-send/index.ts": packageText });
  writeLock(root, { version: 1, blocks: {}, files: { "supabase/functions/fixture-send/index.ts": { source: "@marktiderman/genesis-fixture:functions/fixture-send/index.ts", sha256: sha256(TEMPLATE_V1) } } });
  return root;
}

const upgrade = (root: string, extra: Partial<Parameters<typeof runUpgrade>[0]> = {}) =>
  runUpgrade({ root, lookup: lookup({ "@marktiderman/genesis-fixture": "1.2.0" }), install: false, doctor: false, ...extra });

describe("the bump (shared with the genesis-upgrade workflow)", () => {
  it("moves plain versions up, keeps the prefix, leaves workspace: and downgrades alone", () => {
    const text = JSON.stringify({ dependencies: { "@marktiderman/genesis-ui": "^2.0.0", "@marktiderman/genesis-core": "workspace:^", "@marktiderman/genesis-forms": "3.0.0", "left-pad": "1.0.0" } }, null, 2);
    const result = bumpPackageJson("package.json", text, (n) => ({ "@marktiderman/genesis-ui": "2.1.0", "@marktiderman/genesis-forms": "2.9.0" })[n] ?? null);
    expect(result.changes).toEqual([{ file: "package.json", name: "@marktiderman/genesis-ui", from: "^2.0.0", to: "^2.1.0" }]);
    expect(result.skipped.map((s) => s.why)).toEqual(["not a plain version", "newer than 2.9.0"]);
    expect(JSON.parse(result.text!).dependencies["left-pad"]).toBe("1.0.0");
    expect(compareVersions("1.0.0", "1.0.0-rc.1")).toBeGreaterThan(0);
  });
});

describe("genesis upgrade", () => {
  it("--dry-run reports the bump and writes nothing", async () => {
    const root = app(TEMPLATE_V1, TEMPLATE_V2);
    const before = snapshot(root);
    const report = await upgrade(root, { dryRun: true });
    expect(report.changes).toEqual([{ file: "package.json", name: "@marktiderman/genesis-fixture", from: "^1.0.0", to: "^1.2.0" }]);
    expect(report.refreshed[0]).toMatchObject({ outcome: "updated" });
    expect(snapshot(root)).toEqual(before);
  });

  it("bumps every Genesis package and takes a new owned file the app didn't change", async () => {
    const root = app(TEMPLATE_V1, TEMPLATE_V2);
    const report = await upgrade(root);
    expect(JSON.parse(read(root, "package.json")).dependencies["@marktiderman/genesis-fixture"]).toBe("^1.2.0");
    expect(read(root, "supabase/functions/fixture-send/index.ts")).toBe(TEMPLATE_V2);
    expect(readLock(root).files["supabase/functions/fixture-send/index.ts"]!.sha256).toBe(sha256(TEMPLATE_V2));
    expect(report.summary).toContain("@marktiderman/genesis@2.0.0");
  });

  it("merges the app's edits with the new version three ways, or keeps the app's file with --keep-mine", async () => {
    const mine = "name: my e2e\nsteps:\n  - one\n  - two\n";
    const merged3 = "name: my e2e\nsteps:\n  - one\n  - two\n  - three\n";
    expect(mergeThreeWay(mine, TEMPLATE_V1, TEMPLATE_V2)).toEqual({ text: merged3, clean: true });
    // Installed before the upgrade: V1 (the base). The install brings V2.
    const install = (root: string) => void fakePackage(root, "@marktiderman/genesis-fixture", { version: "1.2.0" }, { "functions/fixture-send/index.ts": TEMPLATE_V2 });
    const root = app(mine, TEMPLATE_V1);
    const report = await upgrade(root, { install });
    expect(report.refreshed[0]).toMatchObject({ outcome: "merged" });
    expect(read(root, "supabase/functions/fixture-send/index.ts")).toBe(merged3);

    const conflicted = app("name: e2e\nsteps:\n  - one\n  - mine\n", TEMPLATE_V1);
    const conflict = await upgrade(conflicted, { install: (r) => void fakePackage(r, "@marktiderman/genesis-fixture", {}, { "functions/fixture-send/index.ts": "name: e2e\nsteps:\n  - one\n  - theirs\n" }) });
    expect(conflict.refreshed[0]).toMatchObject({ outcome: "conflict" });
    expect(read(conflicted, "supabase/functions/fixture-send/index.ts")).toBe("name: e2e\nsteps:\n  - one\n  - mine\n");
    expect(read(conflicted, "supabase/functions/fixture-send/index.ts.genesis-next")).toContain("<<<<<<< yours");

    const keep = app(mine, TEMPLATE_V1);
    const kept = await upgrade(keep, { install, keepMine: true });
    expect(read(keep, "supabase/functions/fixture-send/index.ts")).toBe(mine);
    expect(read(keep, "supabase/functions/fixture-send/index.ts.genesis-next")).toBe(TEMPLATE_V2);
    expect(kept.refreshed[0]).toMatchObject({ outcome: "kept-mine" });
  });

  it("waits while .genesis-next is there, then takes the app's resolution once it's gone", async () => {
    const mine = "name: my e2e\nsteps:\n  - one\n  - two\n";
    const install = (r: string) => void fakePackage(r, "@marktiderman/genesis-fixture", { version: "1.2.0" }, { "functions/fixture-send/index.ts": TEMPLATE_V2 });
    const root = app(mine, TEMPLATE_V1);
    expect((await upgrade(root, { install, keepMine: true })).refreshed[0]).toMatchObject({ outcome: "kept-mine" });
    expect(readLock(root).files["supabase/functions/fixture-send/index.ts"]!.pending).toBe(sha256(TEMPLATE_V2));
    // Run again before resolving: nothing rewritten, still waiting.
    expect((await upgrade(root, { install: false })).refreshed[0]).toMatchObject({ outcome: "kept-mine", detail: expect.stringContaining("waiting for you") });
    // Resolve: keep a merged file, delete .genesis-next.
    writeFileSync(path.join(root, "supabase/functions/fixture-send/index.ts"), `${mine}  - three\n`);
    rmSync(path.join(root, "supabase/functions/fixture-send/index.ts.genesis-next"));
    expect((await upgrade(root, { install: false })).refreshed[0]).toMatchObject({ outcome: "resolved" });
    const entry = readLock(root).files["supabase/functions/fixture-send/index.ts"]!;
    expect(entry.sha256).toBe(sha256(TEMPLATE_V2));
    expect(entry.pending).toBeUndefined();
    expect((await upgrade(root, { install: false })).refreshed[0]).toMatchObject({ outcome: "unchanged" });
  });

  it("never brings back an owned file the app deleted", async () => {
    const root = app(TEMPLATE_V1, TEMPLATE_V2);
    rmSync(path.join(root, "supabase/functions/fixture-send/index.ts"));
    const report = await upgrade(root);
    expect(report.refreshed[0]).toMatchObject({ outcome: "kept-deleted" });
  });

  it("leaves out a locked block whose starter.config.ts switch is off: no migrations listed, its files neither refreshed nor added", async () => {
    const root = app(TEMPLATE_V1, TEMPLATE_V2);
    fakePackage(root, "@marktiderman/genesis-fixture", { genesis: { blocks: { "fixture-notes": { migrations: [{ file: "migrations/0001_fixture_notes.sql" }], functions: [{ dir: "functions/fixture-send" }] } } } }, { "functions/fixture-send/index.ts": TEMPLATE_V2, "migrations/0001_fixture_notes.sql": "create table public.fixture_notes (id int);\n" });
    const lock = readLock(root);
    lock.blocks["fixture-notes"] = { package: "@marktiderman/genesis-fixture" };
    writeLock(root, lock);
    writeTree(root, {
      "starter.config.ts": "export default defineStarter({\n  features: {\n    // A comment line is skipped.\n    notes: false,\n  },\n});\n",
      "genesis.config.json": JSON.stringify({ starter: { blocks: { notes: ["fixture-notes"] } } }),
    });
    const report = await upgrade(root);
    expect(report.switchedOff).toEqual(["fixture-notes: features.notes is off in starter.config.ts, so it's left out (turn it on to have it again)"]);
    expect(report.newMigrations).toEqual([]);
    expect(report.refreshed).toEqual([]);
    expect(read(root, "supabase/functions/fixture-send/index.ts")).toBe(TEMPLATE_V1);
    expect(report.summary).toContain("Blocks switched off (left out):");
  });

  it("says how to mark a deletion on purpose, and keeps the file deleted either way", async () => {
    const root = app(TEMPLATE_V1, TEMPLATE_V2);
    rmSync(path.join(root, "supabase/functions/fixture-send/index.ts"));
    expect((await upgrade(root, { dryRun: true })).refreshed[0]).toMatchObject({ outcome: "kept-deleted", detail: expect.stringContaining('"deleted": true') });
    const lock = readLock(root);
    lock.files["supabase/functions/fixture-send/index.ts"]!.deleted = true;
    writeLock(root, lock);
    const report = await upgrade(root);
    expect(report.refreshed[0]).toMatchObject({ outcome: "kept-deleted", detail: "deleted in the app; not brought back" });
    expect(readLock(root).files["supabase/functions/fixture-send/index.ts"]!.deleted).toBe(true);
  });

  it("runs a codemod only when its package crosses its version, and names major moves without one", async () => {
    const ran: string[] = [];
    const mod: Codemod = { id: "fixture-rename", package: "@marktiderman/genesis-fixture", version: "1.1.0", description: "Renames a prop.", run: () => (ran.push("ran"), []) };
    expect(codemodsFor([{ file: "p", name: mod.package, from: "^1.0.0", to: "^1.2.0" }], [mod])).toEqual([mod]);
    expect(codemodsFor([{ file: "p", name: mod.package, from: "^1.1.0", to: "^1.2.0" }], [mod])).toEqual([]);
    expect(uncoveredBreaks([{ file: "p", name: "@marktiderman/genesis-ui", from: "^0.1.0", to: "^0.2.0" }], [mod])).toHaveLength(1);
    await upgrade(app(TEMPLATE_V1, TEMPLATE_V1), { codemods: [mod] });
    expect(ran).toEqual(["ran"]);
  });
});

// What pnpm 11 writes in loose mode when an upgrade installs Genesis releases younger than
// minimumReleaseAge: one entry per version. On pnpm 11.1.3 a frozen install reads the list first
// match per package, so a second entry for one package (this run's, next to an earlier run's) fails
// CI with ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION; one entry listing both ('name@a || b') doesn't.
const PINNED = `# Settings for this app.
autoInstallPeers: false
minimumReleaseAgeExclude:
  - '@marktiderman/genesis-cli@1.17.2'
  - '@marktiderman/genesis-features@0.8.1' # added by pnpm
  - left-pad@1.3.0
  # the umbrella
  - "@marktiderman/genesis@3.1.0"
  - '@marktiderman/genesis-features@0.8.0'
  - '@marktiderman/genesis-ui@2.26.0'
  - '@acme/genesis-ui@1.0.0'
  - '@marktiderman/other@1.0.0'
  - '@marktiderman/genesis-ui@^2.0.0'
strictPeerDependencies: false
`;

// The app's range for genesis-ui takes the pin into its entry (releaseAgeExcludeProblems warns: pnpm
// 11 rejects ranges).
const MERGED = `# Settings for this app.
autoInstallPeers: false
minimumReleaseAgeExclude:
  - '@marktiderman/genesis-cli@1.17.2'
  - '@marktiderman/genesis-features@0.8.0 || 0.8.1' # added by pnpm
  - left-pad@1.3.0
  # the umbrella
  - "@marktiderman/genesis@3.1.0"
  - '@marktiderman/genesis-ui@^2.0.0 || 2.26.0'
  - '@acme/genesis-ui@1.0.0'
  - '@marktiderman/other@1.0.0'
strictPeerDependencies: false
`;

// A lockfile (v9) after the dedupe: genesis-features at 0.8.1 only, the CLI no longer installed.
const LOCK = `lockfileVersion: '9.0'

packages:
  '@marktiderman/genesis-features@0.8.1':
    resolution: {integrity: sha512-x}
  '@marktiderman/genesis-ui@2.26.0':
    resolution: {integrity: sha512-y}
  '@marktiderman/genesis@3.1.0':
    resolution: {integrity: sha512-z}

snapshots:
  '@marktiderman/genesis-features@0.8.1(@marktiderman/genesis-ui@2.26.0(react@19.3.0))':
    dependencies:
      '@marktiderman/genesis-ui': 2.26.0(react@19.3.0)
`;

describe("pnpm's minimumReleaseAgeExclude after an upgrade", () => {
  it("merges each Genesis package's pins into one entry of exact versions, leaves every other entry and line, and is idempotent", () => {
    expect(normaliseReleaseAgeExcludes(PINNED)).toBe(MERGED);
    expect(normaliseReleaseAgeExcludes(MERGED)).toBe(MERGED);
    const crlf = PINNED.replace(/\n/g, "\r\n");
    expect(normaliseReleaseAgeExcludes(crlf)).toBe(MERGED.replace(/\n/g, "\r\n"));
    // A new pin merges into the package's entry, in version order.
    expect(normaliseReleaseAgeExcludes("minimumReleaseAgeExclude:\n  - '@marktiderman/genesis-ui@2.26.0 || 2.27.0'\n  - '@marktiderman/genesis-ui@2.9.0'\n"))
      .toBe("minimumReleaseAgeExclude:\n  - '@marktiderman/genesis-ui@2.9.0 || 2.26.0 || 2.27.0'\n");
    // Nothing of Genesis's, or no list at all: unchanged.
    const other = "minimumReleaseAgeExclude:\n  - left-pad@1.3.0\n";
    expect(normaliseReleaseAgeExcludes(other)).toBe(other);
    expect(normaliseReleaseAgeExcludes("autoInstallPeers: false\n")).toBe("autoInstallPeers: false\n");
    // The flow form.
    expect(normaliseReleaseAgeExcludes("minimumReleaseAgeExclude: ['@marktiderman/genesis-ui@2.26.0', left-pad, '@marktiderman/genesis-ui@2.25.0'] # x\nfoo: 1\n"))
      .toBe("minimumReleaseAgeExclude: ['@marktiderman/genesis-ui@2.25.0 || 2.26.0', left-pad] # x\nfoo: 1\n");
  });

  it("never writes a pattern; replaces the two 1.17.3 wrote with the lockfile's exact versions, and leaves the app's own", () => {
    const locked = lockedGenesisVersions(LOCK);
    // What 1.17.3 left in an app, with pnpm's new pin for this upgrade beside it.
    const from1173 = "minimumReleaseAgeExclude:\n  - '@marktiderman/genesis-*' # tidied\n  - left-pad@1.3.0\n  - '@marktiderman/genesis'\n  - '@marktiderman/genesis-ui@2.27.0'\n";
    const tidied = normaliseReleaseAgeExcludes(from1173, locked);
    expect(tidied).toBe("minimumReleaseAgeExclude:\n  - '@marktiderman/genesis-features@0.8.1' # tidied\n  - '@marktiderman/genesis-ui@2.26.0' # tidied\n  - left-pad@1.3.0\n  - '@marktiderman/genesis@3.1.0'\n");
    expect(tidied).not.toMatch(/genesis-\*|'@marktiderman\/genesis'/);
    expect(normaliseReleaseAgeExcludes(tidied, locked)).toBe(tidied);
    expect(releaseAgeExcludeProblems(tidied)).toEqual([]);
    // The flow form too.
    expect(normaliseReleaseAgeExcludes("minimumReleaseAgeExclude: ['@marktiderman/genesis-*', left-pad]\n", locked)).toBe(
      "minimumReleaseAgeExclude: ['@marktiderman/genesis-features@0.8.1', '@marktiderman/genesis-ui@2.26.0', left-pad]\n",
    );
    // Without a lockfile to read versions from, they stay, and the problems say so.
    expect(normaliseReleaseAgeExcludes(from1173)).toContain("'@marktiderman/genesis-*'");
    expect(releaseAgeExcludeProblems(normaliseReleaseAgeExcludes(from1173))).toEqual([expect.stringMatching(/genesis-\*' exempts every Genesis release/), expect.stringMatching(/'@marktiderman\/genesis' exempts/)]);
    // Any other pattern is the app's own.
    for (const pattern of ["'@marktiderman/*'", "'@acme/*'", "'@marktiderman/genesis-ui'"]) {
      const text = `minimumReleaseAgeExclude:\n  - ${pattern}\n  - '@marktiderman/genesis-ui@2.26.0'\n  - '@marktiderman/genesis-ui@2.27.0'\n`;
      expect(normaliseReleaseAgeExcludes(text, locked)).toBe(`minimumReleaseAgeExclude:\n  - ${pattern}\n  - '@marktiderman/genesis-ui@2.26.0'\n`);
    }
    expect(normaliseReleaseAgeExcludes(PINNED)).not.toContain("genesis-*");
  });

  it("keeps a merged entry's comment only from an entry whose version survives", () => {
    const locked = lockedGenesisVersions(LOCK);
    const text = "minimumReleaseAgeExclude:\n  - '@marktiderman/genesis-features@0.8.0' # old pin\n  - '@marktiderman/genesis-features@0.8.1' # this upgrade\n";
    expect(normaliseReleaseAgeExcludes(text, locked)).toBe("minimumReleaseAgeExclude:\n  - '@marktiderman/genesis-features@0.8.1' # this upgrade\n");
    expect(normaliseReleaseAgeExcludes(text)).toBe("minimumReleaseAgeExclude:\n  - '@marktiderman/genesis-features@0.8.0 || 0.8.1' # old pin\n");
  });

  it("folds a pin into the app's range for the package, and warns that pnpm 11 rejects ranges", () => {
    const text = "minimumReleaseAgeExclude:\n  - '@marktiderman/genesis-ui@~2.25.0'\n  - '@marktiderman/genesis-ui@2.27.0'\n";
    const folded = normaliseReleaseAgeExcludes(text);
    expect(folded).toBe("minimumReleaseAgeExclude:\n  - '@marktiderman/genesis-ui@~2.25.0 || 2.27.0'\n");
    expect(normaliseReleaseAgeExcludes(folded)).toBe(folded);
    expect(releaseAgeExcludeProblems(folded)).toEqual([expect.stringMatching(/has a range \(~2\.25\.0\); pnpm 11 accepts only exact versions/)]);
  });

  it("knows which pnpm reads exact versions (10.19 and later)", () => {
    expect(["10.18.3", "9.15.0"].map(pnpmReadsExactExcludes)).toEqual([false, false]);
    expect(["10.19.0", "11.1.3", "11.26.0", "", "unknown"].map(pnpmReadsExactExcludes)).toEqual([true, true, true, true, true]);
  });

  it("drops versions the lockfile no longer holds, and an entry left with none", () => {
    const locked = lockedGenesisVersions(LOCK);
    expect([...locked.get("@marktiderman/genesis-features")!]).toEqual(["0.8.1"]);
    expect([...locked.get("@marktiderman/genesis")!]).toEqual(["3.1.0"]);
    expect(normaliseReleaseAgeExcludes(PINNED, locked)).toBe(`# Settings for this app.
autoInstallPeers: false
minimumReleaseAgeExclude:
  - '@marktiderman/genesis-features@0.8.1' # added by pnpm
  - left-pad@1.3.0
  # the umbrella
  - "@marktiderman/genesis@3.1.0"
  - '@marktiderman/genesis-ui@^2.0.0 || 2.26.0'
  - '@acme/genesis-ui@1.0.0'
  - '@marktiderman/other@1.0.0'
strictPeerDependencies: false
`);
    // Every entry dropped: an empty list, which pnpm reads, not a null one.
    expect(normaliseReleaseAgeExcludes("minimumReleaseAgeExclude:\n  - '@marktiderman/genesis-cli@1.17.2'\nfoo: 1\n", locked)).toBe("minimumReleaseAgeExclude: []\nfoo: 1\n");
    // A workspace whose projects keep their own lockfiles: one lockfile doesn't hold every version, so nothing is dropped.
    expect(tidyLocked("sharedWorkspaceLockfile: false\n", LOCK)).toBeNull();
    expect(tidyLocked("sharedWorkspaceLockfile: 'false' # own lockfiles\n", LOCK)).toBeNull();
    expect(tidyLocked('sharedWorkspaceLockfile: "false"\n', LOCK)).toBeNull();
    expect(tidyLocked("packages: []\n", LOCK, "registry=https://registry.npmjs.org/\nshared-workspace-lockfile=false\n")).toBeNull();
    expect(tidyLocked("packages: []\n", LOCK, "shared-workspace-lockfile = false ; why\n")).toBeNull();
    expect(tidyLocked("packages: []\n", LOCK, "shared-workspace-lockfile=true\n")).toEqual(locked);
    expect(tidyLocked("sharedWorkspaceLockfile: true\n", LOCK)).toEqual(locked);
    expect(tidyLocked("packages: []\n", null)).toBeNull();
    expect(tidyLocked("packages: []\n", LOCK)).toEqual(locked);
  });

  it("matches the CI fixture's shape", () => {
    const dir = path.join(PACKAGES, "..", ".github/ci-fixture");
    const fixture = readFileSync(path.join(dir, "pnpm-workspace.yaml"), "utf8");
    const locked = tidyLocked(fixture, readFileSync(path.join(dir, "pnpm-lock.yaml"), "utf8"));
    expect(normaliseReleaseAgeExcludes(fixture, locked)).toBe(fixture);
    expect(fixture).not.toContain("- '@marktiderman/genesis-*'");
    const pinned = fixture.replace("  - '@marktiderman/genesis-core@1.6.0 || 1.7.0'\n", "  - '@marktiderman/genesis-core@1.7.0'\n  - '@marktiderman/genesis-core@1.5.0'\n  - '@marktiderman/genesis-core@1.6.0'\n");
    expect(pinned).not.toBe(fixture);
    expect(normaliseReleaseAgeExcludes(pinned, locked)).toBe(fixture);
  });

  it("tidies pnpm-workspace.yaml after the install, then dedupes, and commits the file with the upgrade", async () => {
    const root = app(TEMPLATE_V1, TEMPLATE_V1);
    writeFileSync(path.join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    writeFileSync(path.join(root, "pnpm-workspace.yaml"), "autoInstallPeers: false\nminimumReleaseAgeExclude:\n  - '@marktiderman/genesis-fixture@1.0.0'\n");
    const steps: string[] = [];
    // The install pins the new, young version next to the earlier run's pin, as pnpm's loose mode
    // does, and the lockfile holds both until the dedupe.
    const install = (r: string) => {
      steps.push("install");
      writeFileSync(path.join(r, "pnpm-workspace.yaml"), "autoInstallPeers: false\nminimumReleaseAgeExclude:\n  - '@marktiderman/genesis-fixture@1.0.0'\n  - '@marktiderman/genesis-fixture@1.2.0'\n");
      writeFileSync(path.join(r, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\npackages:\n  '@marktiderman/genesis-fixture@1.0.0': {}\n  '@marktiderman/genesis-fixture@1.2.0': {}\n");
    };
    const dedupe = (r: string) => {
      steps.push(`dedupe:${read(r, "pnpm-workspace.yaml").includes("1.0.0 || 1.2.0") ? "merged" : "pinned"}`);
      writeFileSync(path.join(r, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\npackages:\n  '@marktiderman/genesis-fixture@1.2.0': {}\n");
    };
    const report = await upgrade(root, { install, dedupe });
    expect(steps).toEqual(["install", "dedupe:merged"]);
    expect(read(root, "pnpm-workspace.yaml")).toBe("autoInstallPeers: false\nminimumReleaseAgeExclude:\n  - '@marktiderman/genesis-fixture@1.2.0'\n");
    expect(report.files).toContain("pnpm-workspace.yaml");
    expect(report.summary).toContain("exact versions");
    expect(report.summary).not.toContain("genesis-*'");
    // A dry run neither installs nor touches the file.
    const before = read(root, "pnpm-workspace.yaml");
    await upgrade(root, { dryRun: true, install, dedupe });
    expect(read(root, "pnpm-workspace.yaml")).toBe(before);
  });

  it("an app upgraded from 1.17.3's output: its patterns become exact versions, and an old pnpm is warned about", async () => {
    const root = app(TEMPLATE_V1, TEMPLATE_V1);
    writeFileSync(path.join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    // What genesis-cli 1.17.3's tidy left.
    writeFileSync(path.join(root, "pnpm-workspace.yaml"), "minimumReleaseAgeExclude:\n  - '@marktiderman/genesis-*'\n  - '@marktiderman/genesis'\n");
    const install = (r: string) => {
      writeFileSync(path.join(r, "pnpm-workspace.yaml"), "minimumReleaseAgeExclude:\n  - '@marktiderman/genesis-*'\n  - '@marktiderman/genesis'\n");
      writeFileSync(path.join(r, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\npackages:\n  '@marktiderman/genesis-fixture@1.2.0': {}\n  '@marktiderman/genesis@9.0.0': {}\n");
    };
    const report = await upgrade(root, { install, dedupe: () => {}, pnpmVersion: () => "10.18.3" });
    expect(read(root, "pnpm-workspace.yaml")).toBe("minimumReleaseAgeExclude:\n  - '@marktiderman/genesis-fixture@1.2.0'\n  - '@marktiderman/genesis@9.0.0'\n");
    expect(report.files).toContain("pnpm-workspace.yaml");
    expect(report.summary).toMatch(/pnpm 10\.18\.3 reads minimumReleaseAgeExclude's exact versions .* use pnpm 10\.19 or later/);
    // On a current pnpm: no warning.
    const fresh = app(TEMPLATE_V1, TEMPLATE_V1);
    writeFileSync(path.join(fresh, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    const quiet = await upgrade(fresh, { install, dedupe: () => {}, pnpmVersion: () => "11.1.3" });
    expect(quiet.summary).not.toContain("Warnings:");
  });

  it("finds pnpm-workspace.yaml as pnpm does, above an app with its own lockfile, and beside the lockfile in a standalone app", async () => {
    const pins = "minimumReleaseAgeExclude:\n  - '@marktiderman/genesis-fixture@1.0.0'\n  - '@marktiderman/genesis-fixture@1.2.0'\n";
    // A workspace with sharedWorkspaceLockfile: false: the app's lockfile is its own, the settings are the root's.
    const ws = makeApp({ "pnpm-workspace.yaml": "packages:\n  - apps/*\nsharedWorkspaceLockfile: false\n" });
    const root = path.join(ws, "apps", "a");
    writeTree(root, {
      "package.json": JSON.stringify({ name: "a", dependencies: { "@marktiderman/genesis-fixture": "^1.0.0" } }, null, 2) + "\n",
      "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
    });
    const intoRoot = (r: string) => writeFileSync(path.join(r, "..", "..", "pnpm-workspace.yaml"), `packages:\n  - apps/*\nsharedWorkspaceLockfile: false\n${pins}`);
    const report = await upgrade(root, { install: intoRoot, dedupe: () => {} });
    expect(read(ws, "pnpm-workspace.yaml")).toBe("packages:\n  - apps/*\nsharedWorkspaceLockfile: false\nminimumReleaseAgeExclude:\n  - '@marktiderman/genesis-fixture@1.0.0 || 1.2.0'\n");
    expect(report.files).toContain(path.join("..", "..", "pnpm-workspace.yaml"));

    // A standalone app with no pnpm-workspace.yaml yet: pnpm creates it beside the lockfile.
    const alone = app(TEMPLATE_V1, TEMPLATE_V1);
    writeFileSync(path.join(alone, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    const created = await upgrade(alone, {
      install: (r) => {
        writeFileSync(path.join(r, "pnpm-workspace.yaml"), pins);
        writeFileSync(path.join(r, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\npackages:\n  '@marktiderman/genesis-fixture@1.2.0': {}\n");
      },
      dedupe: () => {},
    });
    expect(read(alone, "pnpm-workspace.yaml")).toBe("minimumReleaseAgeExclude:\n  - '@marktiderman/genesis-fixture@1.2.0'\n");
    expect(created.files).toContain("pnpm-workspace.yaml");
  });

  it("never looks above the repository's top level for pnpm-workspace.yaml", async () => {
    // A pnpm-workspace.yaml outside the repository, above it.
    const outside = makeApp({ "pnpm-workspace.yaml": "packages:\n  - repo\nminimumReleaseAgeExclude:\n  - '@marktiderman/genesis-fixture@1.0.0'\n" });
    const repo = path.join(outside, "repo");
    writeTree(repo, {
      "package.json": JSON.stringify({ name: "a", dependencies: { "@marktiderman/genesis-fixture": "^1.0.0" } }, null, 2) + "\n",
      "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
    });
    execFileSync("git", ["init", "-q"], { cwd: repo });
    const real = realpathSync(repo);
    expect(pnpmWorkspaceFileFor(repo)).toBe(path.join(real, "pnpm-workspace.yaml"));
    const before = read(outside, "pnpm-workspace.yaml");
    const report = await upgrade(repo, {
      install: (r) => {
        // pnpm itself writes the outer file; the upgrade neither rewrites nor commits it.
        writeFileSync(path.join(r, "..", "pnpm-workspace.yaml"), `${before}  - '@marktiderman/genesis-fixture@1.2.0'\n`);
      },
      dedupe: () => {},
    });
    expect(read(outside, "pnpm-workspace.yaml")).toBe(`${before}  - '@marktiderman/genesis-fixture@1.2.0'\n`);
    expect(report.files.some((f) => f.startsWith(".."))).toBe(false);
    // Outside git, the search goes up as pnpm's does.
    rmSync(path.join(repo, ".git"), { recursive: true, force: true });
    expect(pnpmWorkspaceFileFor(repo)).toBe(path.join(realpathSync(outside), "pnpm-workspace.yaml"));
  });

  it("explains pnpm's strict-mode refusal instead of loosening the app's minimumReleaseAge", async () => {
    const root = app(TEMPLATE_V1, TEMPLATE_V1);
    writeFileSync(path.join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    const workspace = "minimumReleaseAge: 1440\n";
    writeFileSync(path.join(root, "pnpm-workspace.yaml"), workspace);
    const refusal = Object.assign(new Error("Command failed: pnpm install"), {
      stdout: "[ERR_PNPM_NO_MATURE_MATCHING_VERSION] 1 version does not meet the minimumReleaseAge constraint:\n  @marktiderman/genesis-fixture@1.2.0 was published at 2026-11-01T20:57:00.337Z, within the minimumReleaseAge cutoff\n",
    });
    await expect(upgrade(root, { install: () => { throw refusal; }, dedupe: () => {} })).rejects.toThrow(/wait until[\s\S]*minimumReleaseAgeExclude[\s\S]*@marktiderman\/genesis-fixture@1\.2\.0|@marktiderman\/genesis-fixture@1\.2\.0[\s\S]*wait until[\s\S]*minimumReleaseAgeExclude/);
    expect(read(root, "pnpm-workspace.yaml")).toBe(workspace);
    expect(releaseAgeError("ERR_PNPM_FETCH_404")).toBeNull();
    // Any other failure is the install's own.
    await expect(upgrade(app(TEMPLATE_V1, TEMPLATE_V1), { install: () => { throw new Error("network down"); } })).rejects.toThrow("network down");
  });
});

describe("genesis upgrade --version", () => {
  it("reaches the upgrade, not the CLI's own --version", () => {
    const cli = path.join(PACKAGES, "genesis-cli", "dist", "cli.js");
    const dir = makeApp({ "package.json": "{}\n" });
    // Not a version, so the upgrade itself refuses it before asking npm.
    const result = spawnSync(process.execPath, [cli, "upgrade", "--version", "not a version!", "--dry-run", "--dir", dir], { encoding: "utf8" });
    expect(result.stderr).toContain('--version must be an exact version or a dist-tag, not "not a version!"');
    expect(result.status).toBe(1);
    expect(spawnSync(process.execPath, [cli, "--version"], { encoding: "utf8" }).stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });
});
