// @feat:cli-upgrade
// `genesis upgrade` cleans out each overlay and rebases it onto the release, against a local
// stand-in for the Genesis repository and its `<name>@<version>` tags.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import * as path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { clearLocalPackagesCache } from "../src/blocks/local.js";
import { runUpgrade, type ReleaseLookup } from "../src/upgrade/index.js";
import { diffHunks, gitUpstream } from "../src/upgrade/overlays.js";
import { makeApp, read, snapshot, tempDir, writeTree } from "./blocks-helpers.js";

beforeEach(clearLocalPackagesCache);

const NAME = "@marktiderman/genesis-fixture";
const V1 = "export const a = 1;\nexport const b = 1;\nexport const c = 1;\nexport const d = 1;\nexport const e = 1;\nexport const f = 1;\nexport const g = 1;\n";
// 1.2.0 ships the overlay's fix to `b`, changes `g`, and adds a file.
const V2 = "export const a = 1;\nexport const b = 2;\nexport const c = 1;\nexport const d = 1;\nexport const e = 1;\nexport const f = 1;\nexport const g = 3;\n";

const manifest = (version: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ name: NAME, version, dependencies: { "@marktiderman/genesis-core": "workspace:^" }, ...extra }, null, 2) + "\n";

/** A Genesis repository with the package at 1.0.0 and 1.2.0, each tagged. */
function genesisRepo(v2 = V2): string {
  const repo = tempDir("genesis-repo-");
  const git = (...args: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...args], { cwd: repo, stdio: "ignore" });
  git("init", "-q");
  const release = (version: string, files: Record<string, string>) => {
    writeTree(repo, { "packages/fixture/package.json": manifest(version), ...Object.fromEntries(Object.entries(files).map(([f, t]) => [`packages/fixture/${f}`, t])) });
    writeTree(repo, { "packages/other/package.json": JSON.stringify({ name: "@marktiderman/genesis-other", version: "1.0.0" }) });
    git("add", "-A");
    git("commit", "-qm", version);
    git("tag", `${NAME}@${version}`);
  };
  release("1.0.0", { "src/index.ts": V1, "src/gone.ts": "export const gone = 1;\n", "README.md": "# fixture\n" });
  execFileSync("git", ["rm", "-q", "packages/fixture/src/gone.ts"], { cwd: repo });
  release("1.2.0", { "src/index.ts": v2, "src/added.ts": "export const added = 1;\n", "README.md": "# fixture\n" });
  return repo;
}

const lookup: ReleaseLookup = { release: () => ({ version: "9.0.0", packages: { [NAME]: "1.2.0" } }), latest: () => null };

/** An app whose overlay of the package was copied from 1.0.0, with `index` its src/index.ts. */
function app(index: string, extra: Record<string, string> = {}): string {
  return makeApp({
    "package.json": JSON.stringify({ name: "sample-app", dependencies: { [NAME]: "workspace:*" }, pnpm: { overrides: { [NAME]: "workspace:*" } } }, null, 2) + "\n",
    "genesis.config.json": JSON.stringify({ localPackages: ["packages/*"] }),
    "packages/fixture/package.json": manifest("1.0.0+local.2", {
      dependencies: { "@marktiderman/genesis-core": "^1.0.0" },
      private: true,
      genesis: { overlay: { upstream: `${NAME}@1.0.0`, since: new Date().toISOString().slice(0, 10), owner: "web team", reason: "a sample fix" } },
    }),
    "packages/fixture/src/index.ts": index,
    "packages/fixture/src/gone.ts": "export const gone = 1;\n",
    "packages/fixture/README.md": "# fixture\n",
    ...extra,
  });
}

const upgrade = (root: string, repo: string, extra: Partial<Parameters<typeof runUpgrade>[0]> = {}) =>
  runUpgrade({ root, lookup, install: false, doctor: false, upstream: gitUpstream(repo), ...extra });

describe("genesis upgrade rebases overlays", () => {
  it("sorts each hunk (shipped, promoted, kept), rebases the rest onto the release and moves the marker", async () => {
    const repo = genesisRepo();
    // b: the fix 1.2.0 ships; d: the app's own change; a new file the register says was promoted.
    const mine = "export const a = 1;\nexport const b = 2;\nexport const c = 1;\nexport const d = 9;\nexport const e = 1;\nexport const f = 1;\nexport const g = 1;\n";
    const root = app(mine, {
      "packages/fixture/src/lanes.ts": "export const lanes = 1;\n",
      "docs/genesis-upstream.md":
        "| id | kind | status | feature | package | local | need |\n| --- | --- | --- | --- | --- | --- | --- |\n" +
        `| fixture-lanes | extension | promoted | data-views | ${NAME} | packages/fixture/src/lanes.ts | Lanes |\n`,
    });
    const report = await upgrade(root, repo);
    const [plan] = report.overlays;
    expect(plan).toMatchObject({ name: NAME, from: "1.0.0", to: "1.2.0", conflicts: [], remove: false });
    expect(plan!.hunks.map((h) => `${h.file} ${h.at} ${h.verdict}`)).toEqual(["src/index.ts 2 shipped", "src/index.ts 4 kept", "src/lanes.ts new file promoted"]);

    // The rebase: the release's change to g, the app's d, the new upstream file; the deleted one gone.
    expect(read(root, "packages/fixture/src/index.ts")).toBe("export const a = 1;\nexport const b = 2;\nexport const c = 1;\nexport const d = 9;\nexport const e = 1;\nexport const f = 1;\nexport const g = 3;\n");
    expect(read(root, "packages/fixture/src/added.ts")).toBe("export const added = 1;\n");
    expect(existsSync(path.join(root, "packages/fixture/src/gone.ts"))).toBe(false);
    const json = JSON.parse(read(root, "packages/fixture/package.json"));
    expect(json.version).toBe("1.2.0+local.2");
    expect(json.genesis.overlay.upstream).toBe(`${NAME}@1.2.0`);
    expect(json.private).toBe(true);

    expect(report.summary).toContain("an upgrade PR isn't done until this checklist is");
    expect(report.summary).toContain("- [x] `src/index.ts` lines 2: already shipped in 1.2.0; dropped from the overlay");
    expect(report.summary).toContain("- [ ] `src/index.ts` lines 4: kept; say why here");
    expect(report.summary).toContain("- [ ] `src/lanes.ts` (new file): promoted (fixture-lanes); link its Genesis PR in docs/genesis-upstream.md");
    expect(report.files).toEqual(expect.arrayContaining(["packages/fixture/src/index.ts", "packages/fixture/src/added.ts", "packages/fixture/package.json"]));

    // Run again: on the release, nothing left to rebase.
    expect((await upgrade(root, repo)).overlays).toEqual([]);
  });

  it("deletes an overlay with nothing of the app's own left, and pins the release", async () => {
    const repo = genesisRepo();
    // Only the fix 1.2.0 ships.
    const root = app("export const a = 1;\nexport const b = 2;\nexport const c = 1;\nexport const d = 1;\nexport const e = 1;\nexport const f = 1;\nexport const g = 1;\n");
    const report = await upgrade(root, repo);
    expect(report.overlays[0]).toMatchObject({ remove: true, conflicts: [] });
    expect(existsSync(path.join(root, "packages/fixture"))).toBe(false);
    const pkg = JSON.parse(read(root, "package.json"));
    expect(pkg.dependencies[NAME]).toBe("1.2.0");
    expect(pkg.pnpm.overrides[NAME]).toBeUndefined();
    expect(report.summary).toContain("nothing of the app's own is left: the overlay is deleted");
  });

  it("stops on a conflict, lists the files and changes nothing", async () => {
    const repo = genesisRepo();
    // The app changed g, which 1.2.0 changed too.
    const root = app("export const a = 1;\nexport const b = 1;\nexport const c = 1;\nexport const d = 1;\nexport const e = 1;\nexport const f = 1;\nexport const g = 7;\n");
    const before = snapshot(root);
    await expect(upgrade(root, repo)).rejects.toThrow(/conflicts; nothing was changed[\s\S]*packages\/fixture\/src\/index\.ts/);
    expect(snapshot(root)).toEqual(before);
    // A dry run reports it instead.
    const dry = await upgrade(root, repo, { dryRun: true });
    expect(dry.overlays[0]!.conflicts).toEqual(["src/index.ts"]);
    expect(dry.summary).toContain("rebase conflicts, nothing written");
    expect(snapshot(root)).toEqual(before);
  });

  it("leaves an overlay alone, and says so, when its upstream tag can't be read", async () => {
    const root = app(V1);
    const report = await upgrade(root, path.join(tempDir(), "no-such-repo"));
    expect(report.overlays[0]!.skipped).toMatch(/no source for .*@1\.0\.0/);
    expect(read(root, "packages/fixture/src/index.ts")).toBe(V1);
    expect(JSON.parse(read(root, "packages/fixture/package.json")).genesis.overlay.upstream).toBe(`${NAME}@1.0.0`);
  });

  it("diffs hunks without context", () => {
    expect(diffHunks("a\nb\nc\n", "a\nB\nc\nd\n")).toEqual([
      { at: "2", removed: ["b"], added: ["B"] },
      { at: "after 3", removed: [], added: ["d"] },
    ]);
    expect(diffHunks("x\n", "x\n")).toEqual([]);
  });
});
