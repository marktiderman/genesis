// @feat:cli-upgrade @feat:cli-doctor
/**
 * What apps hit taking a release: a hand-built component the release now exports, an app in a
 * sub-folder of its repository, generated files left stale, nothing installed, a long report, and
 * major moves that say nothing about the app; and the codemods for the doctor rules that have a
 * mechanical fix.
 */
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { folderSubstitutions, renderOwned } from "../src/blocks/app-folder.js";
import { sha256 } from "../src/blocks/files.js";
import { readLock, writeLock } from "../src/blocks/lock.js";
import { GenesisConfigError, readGenesisConfig } from "../src/doctor/config.js";
import { formatReport, runDoctor } from "../src/doctor/index.js";
import { SKILL_PATH } from "../src/doctor/primitives.js";
import { breakingEntries, breakLines } from "../src/upgrade/changelog.js";
import { CODEMODS, codemodInstallNote, codemodsFor, uncoveredBreaks } from "../src/upgrade/codemods.js";
import { hapticsUseGenesis, overlaysFitThePhone, rewriteHaptics, rewriteOverlayHeights } from "../src/upgrade/doctor-rule-codemods.js";
import { checkSubstitutions, runUpgrade, type ReleaseLookup } from "../src/upgrade/index.js";
import { expoApp, fakePackage, linkWorkspacePackage, makeApp, PACKAGES, read, snapshot, tempDir, writeTree } from "./blocks-helpers.js";

const CLI = "@marktiderman/genesis-cli";
const UI = "@marktiderman/genesis-ui";
const release = (packages: Record<string, string>, version = "2.0.0"): ReleaseLookup => ({ release: () => ({ version, packages }), latest: () => null });

const uiPackage = (root: string, version: string, names: string[]) =>
  fakePackage(root, UI, { version, types: "dist/index.d.ts", exports: { ".": { types: "./dist/index.d.ts" } } }, { "dist/index.d.ts": names.map((n) => `export declare function ${n}(): void;`).join("\n") });

describe("an export the release adds, and the app builds by hand", () => {
  const app = () => {
    const root = makeApp({
      "package.json": JSON.stringify({ name: "a", dependencies: { [UI]: "^1.0.0" } }),
      "src/gallery-card.tsx": "export function GalleryCard() { return null; }\n",
      "src/button.tsx": "export function Button() { return null; }\n",
    });
    uiPackage(root, "1.0.0", ["Button"]);
    fakePackage(root, "@marktiderman/genesis-design-system", {}, { "dist/themes/genesis.css": ":root { --x: 1; }\n" });
    return root;
  };

  it("names the swap, only for what this release added, before the doctor reports it", async () => {
    const root = app();
    const logged: string[] = [];
    const report = await runUpgrade({ root, lookup: release({ [UI]: "1.2.0" }), install: (r) => void uiPackage(r, "1.2.0", ["Button", "GalleryCard"]), log: (m) => logged.push(m) });
    expect(report.swaps).toEqual([{ name: "GalleryCard", file: "src/gallery-card.tsx", line: 1, package: UI }]);
    expect(report.summary).toContain(`\`GalleryCard\` in src/gallery-card.tsx:1: ${UI} now exports it`);
    const named = logged.findIndex((m) => m.includes("adds exports the app builds by hand"));
    const doctor = logged.findIndex((m) => m.includes("[shadowed-export]"));
    expect(named).toBeGreaterThanOrEqual(0);
    expect(named).toBeLessThan(doctor);
    expect(logged[doctor]).toContain(`reuse or extend GalleryCard from ${UI}`);
    expect(report.doctor).toBe("failed");
  });

  it("says nothing when the release adds nothing the app builds", async () => {
    const root = app();
    const report = await runUpgrade({ root, lookup: release({ [UI]: "1.2.0" }), install: (r) => void uiPackage(r, "1.2.0", ["Button", "Lightbox"]), doctor: false });
    expect(report.swaps).toEqual([]);
    expect(report.summary).not.toContain("builds by hand");
  });
});

describe("the app-folder substitution", () => {
  it("takes the folder init writes and the folders its docs name, never one that leaves the repository", () => {
    for (const folder of ["src", "apps/web", "mobile/src"]) expect(() => checkSubstitutions({ REPLACE_WITH_APP_FOLDER: folder })).not.toThrow();
    for (const folder of ["../src", "/etc", 'a"b', ""]) expect(() => checkSubstitutions({ REPLACE_WITH_APP_FOLDER: folder })).toThrow(/plain folder/);
    expect(() => checkSubstitutions({ "not-a-starter-name": "x" })).toThrow(/starter's names/);
  });
});

const TEMPLATE = "templates/eas/workflows/pr-preview.yml";
const FILE = ".eas/workflows/pr-preview.yml";
const YML = (extra = "") => `# Paths are the app's.\non:\n  pull_request:\n    paths:\n      - "REPLACE_WITH_APP_FOLDER/**"\n      - "app.json"\n      - "eas.json"\n${extra}jobs: {}\n`;
const raw = (text: string) => text.replace("REPLACE_WITH_APP_FOLDER", "src");
const inMobile = (text: string) => raw(text).replace(/- "/g, '- "mobile/');

describe("an app in a sub-folder of its repository", () => {
  const app = (mine: string, config: Record<string, unknown> = { appFolder: "mobile" }) => {
    const repo = tempDir();
    const root = path.join(repo, "mobile");
    mkdirSync(root);
    execFileSync("git", ["init", "-q"], { cwd: repo });
    writeTree(root, {
      "package.json": JSON.stringify({ name: "a", devDependencies: { [CLI]: "^1.0.0" } }),
      "genesis.config.json": JSON.stringify(config),
      [FILE]: mine,
      ".github/workflows/ci.yml": "dead copy\n",
    });
    fakePackage(root, CLI, { version: "1.0.0" }, { [`dist/${TEMPLATE}`]: YML(), "dist/templates/ci/app-ci.yml": "ci: 1\n" });
    writeLock(root, {
      version: 1,
      substitutions: { REPLACE_WITH_APP_FOLDER: "src" },
      blocks: {},
      files: {
        [FILE]: { source: `${CLI}:${TEMPLATE}`, sha256: sha256(raw(YML())) },
        ".github/workflows/ci.yml": { source: `${CLI}:templates/ci/app-ci.yml`, sha256: sha256("ci: 1\n") },
      },
    });
    return root;
  };
  const next = (text: string, ci = "ci: 1\n") => (r: string) => void fakePackage(r, CLI, { version: "1.2.0" }, { [`dist/${TEMPLATE}`]: text, "dist/templates/ci/app-ci.yml": ci });
  const upgrade = (root: string, install: (r: string) => void, version = "1.2.0") => runUpgrade({ root, lookup: release({ [CLI]: version }), install, doctor: false });

  it("merges the paths the app keeps from the repository root, instead of a .genesis-next on each release", async () => {
    const root = app(inMobile(YML()));
    const report = await upgrade(root, next(YML('      - "global.css"\n')));
    expect(report.refreshed.find((r) => r.path === FILE)).toMatchObject({ outcome: "merged" });
    expect(read(root, FILE)).toBe(inMobile(YML('      - "global.css"\n')));
    expect(existsSync(path.join(root, `${FILE}.genesis-next`))).toBe(false);
    expect(readLock(root).files[FILE]!.sha256).toBe(sha256(inMobile(YML('      - "global.css"\n'))));
  });

  it("keeps the app's own lines on top, the first time the setting is on and after", async () => {
    const mine = inMobile(YML()).replace("on:\n", "# my note\non:\n");
    const root = app(mine);
    expect((await upgrade(root, next(YML('      - "global.css"\n')))).refreshed.find((r) => r.path === FILE)).toMatchObject({ outcome: "merged" });
    expect(read(root, FILE)).toContain('- "mobile/global.css"');
    expect(read(root, FILE)).toContain("# my note");
    const later = await upgrade(root, next(YML('      - "global.css"\n      - "metro.config.js"\n')), "1.3.0");
    expect(later.refreshed.find((r) => r.path === FILE)).toMatchObject({ outcome: "merged" });
    expect(read(root, FILE)).toContain('- "mobile/metro.config.js"');
    expect(existsSync(path.join(root, `${FILE}.genesis-next`))).toBe(false);
  });

  it("without the setting, still conflicts and says what ends that", async () => {
    const root = app(inMobile(YML()), {});
    const report = await upgrade(root, next(YML('      - "global.css"\n')));
    expect(report.refreshed.find((r) => r.path === FILE)).toMatchObject({ outcome: "conflict" });
    expect(report.summary).toContain('"appFolder": "mobile"');
  });

  it("merges the next release on the version the app resolved, when .genesis-next went with no run in between", async () => {
    const root = app(inMobile(YML()), {});
    await upgrade(root, next(YML('      - "global.css"\n')));
    expect(readLock(root).files[FILE]!.pending).toBeDefined();
    rmSync(path.join(root, `${FILE}.genesis-next`));
    // Worked in by hand: the file changed. The app's edit is further from the template's change this time, so it merges.
    writeTree(root, { [FILE]: inMobile(YML('      - "global.css"\n')) });
    const report = await upgrade(root, next(YML('      - "global.css"\n').replace("# Paths are the app's.", "# Paths are from here.")), "1.3.0");
    expect(report.refreshed.find((r) => r.path === FILE)).toMatchObject({ outcome: "merged" });
    expect(read(root, FILE)).toContain("# Paths are from here.");
    expect(read(root, FILE)).toContain('- "mobile/src/**"');
    expect(existsSync(path.join(root, `${FILE}.genesis-next`))).toBe(false);
  });

  it("doesn't take a missing .genesis-next as resolved when the app's file never changed: the version it held isn't dropped", async () => {
    const root = app(inMobile(YML()), {});
    await upgrade(root, next(YML('      - "global.css"\n')));
    const mine = read(root, FILE);
    expect(readLock(root).files[FILE]!.pendingMine).toBe(sha256(mine));
    // A teammate's clone, or a file deleted unread: .genesis-next is never committed.
    rmSync(path.join(root, `${FILE}.genesis-next`));
    const newer = YML('      - "global.css"\n').replace("# Paths are the app's.", "# Paths are from here.");
    const report = await upgrade(root, next(newer), "1.3.0");
    expect(report.refreshed.find((r) => r.path === FILE)).toMatchObject({ outcome: "kept-mine" });
    expect(read(root, FILE)).toBe(mine);
    expect(read(root, `${FILE}.genesis-next`)).toBe(raw(newer));
    expect(report.summary).not.toContain(`${FILE}: merged`);
  });

  it("with the same version still shipped, doesn't take a missing .genesis-next as resolved unless the file changed", async () => {
    const root = app(inMobile(YML()), {});
    await upgrade(root, next(YML('      - "global.css"\n')));
    const mine = read(root, FILE);
    const held = readLock(root).files[FILE]!;
    rmSync(path.join(root, `${FILE}.genesis-next`));
    const again = await runUpgrade({ root, lookup: release({ [CLI]: "1.2.0" }), install: false, doctor: false });
    expect(again.refreshed.find((r) => r.path === FILE)).toMatchObject({ outcome: "kept-mine" });
    expect(read(root, `${FILE}.genesis-next`)).toContain("global.css");
    expect(read(root, FILE)).toBe(mine);
    expect(readLock(root).files[FILE]!.sha256).toBe(held.sha256);
    // Now really worked in.
    rmSync(path.join(root, `${FILE}.genesis-next`));
    writeTree(root, { [FILE]: inMobile(YML('      - "global.css"\n')) });
    const resolved = await runUpgrade({ root, lookup: release({ [CLI]: "1.2.0" }), install: false, doctor: false });
    expect(resolved.refreshed.find((r) => r.path === FILE)).toMatchObject({ outcome: "resolved" });
    expect(readLock(root).files[FILE]!.pendingMine).toBeUndefined();
  });

  it("warns when the setting can't move a file's paths: other edits kept, the template's paths still from the app's folder", async () => {
    const root = app(raw(YML()).replace("on:\n", "# my note\non:\n").replace('      - "eas.json"\n', '      - "eas.json"\n      - "shared/**"\n'));
    const report = await upgrade(root, next(YML()));
    expect(report.refreshed.find((r) => r.path === FILE)).toMatchObject({ outcome: "merged" });
    expect(read(root, FILE)).toContain('- "src/**"');
    expect(report.summary).toContain(`- "src/**", - "app.json", - "eas.json". Start them with mobile/ by hand.`);
    // The app's own path isn't the template's, and prefixed lines say nothing.
    expect(report.summary).not.toContain("shared/**");
    writeTree(root, { [FILE]: inMobile(YML()).replace("on:\n", "# my note\non:\n") });
    expect((await upgrade(root, next(YML()))).summary).not.toContain("Start them with");
  });

  it("doesn't count a lock from before pendingMine as resolved", async () => {
    const root = app(inMobile(YML()), {});
    await upgrade(root, next(YML('      - "global.css"\n')));
    const lock = readLock(root);
    delete lock.files[FILE]!.pendingMine;
    writeLock(root, lock);
    rmSync(path.join(root, `${FILE}.genesis-next`));
    writeTree(root, { [FILE]: inMobile(YML('      - "global.css"\n')) });
    const report = await upgrade(root, next(YML('      - "global.css"\n').replace("# Paths are the app's.", "# Paths are from here.")), "1.3.0");
    expect(report.refreshed.find((r) => r.path === FILE)).toMatchObject({ outcome: "kept-mine" });
  });

  it("leaves .github/workflows to the repository: nothing written, a template's change named once, no doctor warning", async () => {
    const root = app(inMobile(YML()));
    const report = await upgrade(root, next(YML(), "ci: 2\n"));
    expect(report.refreshed.find((r) => r.path === ".github/workflows/ci.yml")).toMatchObject({ outcome: "repository" });
    expect(read(root, ".github/workflows/ci.yml")).toBe("dead copy\n");
    expect(existsSync(path.join(root, ".github/workflows/ci.yml.genesis-next"))).toBe(false);
    expect((await upgrade(root, next(YML(), "ci: 2\n"))).refreshed.find((r) => r.path === ".github/workflows/ci.yml")).toMatchObject({ outcome: "unchanged" });
    rmSync(path.join(root, ".github/workflows/ci.yml"));
    uiPackage(root, "1.0.0", ["Button"]);
    fakePackage(root, "@marktiderman/genesis-design-system", {}, { "dist/themes/genesis.css": ":root { --x: 1; }\n" });
    const doctor = await runDoctor({ root });
    expect(doctor.findings.filter((f) => f.rule === "lock-files" && f.file === ".github/workflows/ci.yml")).toEqual([]);
  });

  it("writes paths from the repository root, once, with the code folder an older lock never recorded", () => {
    expect(folderSubstitutions(undefined, "mobile")).toEqual({ REPLACE_WITH_APP_FOLDER: "src" });
    expect(folderSubstitutions({ REPLACE_WITH_APP_FOLDER: "lib" }, "mobile")).toEqual({ REPLACE_WITH_APP_FOLDER: "lib" });
    expect(folderSubstitutions({ a: "b" }, null)).toEqual({ a: "b" });
    const text = '#     paths: ["src/**", "mobile/app.json"]\non:\n  push:\n    paths:\n      # code\n      - src/**\n      - "!docs/**"\n      - "mobile/eas.json" # already\n    branches: [main]\n  x:\n    - "not-a-path"\n';
    expect(renderOwned(FILE, text, "mobile")).toBe('#     paths: ["mobile/src/**", "mobile/app.json"]\non:\n  push:\n    paths:\n      # code\n      - mobile/src/**\n      - "!mobile/docs/**"\n      - "mobile/eas.json" # already\n    branches: [main]\n  x:\n    - "not-a-path"\n');
    expect(renderOwned(FILE, text, null)).toBe(text);
    expect(renderOwned(".maestro/flows/a.yaml", text, "mobile")).toBe(text);
  });

  it("checks the setting", () => {
    const root = makeApp({ "genesis.config.json": JSON.stringify({ appFolder: "./apps/phone/" }) });
    expect(readGenesisConfig(root)?.appFolder).toBe("apps/phone");
    for (const bad of ["../x", "/abs", ""]) {
      writeTree(root, { "genesis.config.json": JSON.stringify({ appFolder: bad }) });
      expect(() => readGenesisConfig(root)).toThrow(GenesisConfigError);
    }
  });
});

describe("what's generated from the packages", () => {
  const packages = (root: string) => linkWorkspacePackage(root, "@marktiderman/genesis-features", "features");

  it("regenerates the agent guide the app has and its features outputs, so doctor has nothing stale to report", async () => {
    const root = expoApp({ "package.json": JSON.stringify({ name: "a", dependencies: { [UI]: "^1.0.0" } }), [SKILL_PATH]: "old\n" });
    packages(root);
    uiPackage(root, "1.0.0", ["Button"]);
    const report = await runUpgrade({ root, lookup: release({ [UI]: "1.2.0" }), install: (r) => void uiPackage(r, "1.2.0", ["Button"]), doctor: false });
    expect(read(root, SKILL_PATH)).toContain("# Genesis primitives");
    expect(read(root, "AGENTS.md")).toContain("<!-- genesis-primitives:start -->");
    expect(existsSync(path.join(root, "features.json"))).toBe(true);
    expect(report.files).toEqual(expect.arrayContaining([SKILL_PATH, "AGENTS.md", "features.json"]));
    expect(report.summary).toContain("Regenerated from the installed packages");
  });

  it("leaves an app without the guide or a registry alone, and honours the switches and --dry-run", async () => {
    const plain = makeApp({ "package.json": JSON.stringify({ name: "a", dependencies: { [UI]: "^1.0.0" } }) });
    uiPackage(plain, "1.0.0", ["Button"]);
    const report = await runUpgrade({ root: plain, lookup: release({ [UI]: "1.2.0" }), install: false, doctor: false });
    expect(existsSync(path.join(plain, SKILL_PATH))).toBe(false);
    expect(report.summary).not.toContain("Regenerated");

    const root = expoApp({ "package.json": JSON.stringify({ name: "a", dependencies: { [UI]: "^1.0.0" } }), [SKILL_PATH]: "old\n" });
    packages(root);
    uiPackage(root, "1.0.0", ["Button"]);
    await runUpgrade({ root, lookup: release({ [UI]: "1.2.0" }), install: false, doctor: false, agents: false, featuresBuild: false });
    expect(read(root, SKILL_PATH)).toBe("old\n");
    expect(existsSync(path.join(root, "features.json"))).toBe(false);
    await runUpgrade({ root, lookup: release({ [UI]: "1.3.0" }), install: false, doctor: false, dryRun: true });
    expect(read(root, SKILL_PATH)).toBe("old\n");
  });

  it("--pr leaves a gitignored file out of the commit and names it, instead of stopping on a new branch", async () => {
    const root = expoApp({
      "package.json": JSON.stringify({ name: "a", dependencies: { [UI]: "^1.0.0" } }),
      [SKILL_PATH]: "old\n",
      ".gitignore": "node_modules\nfeatures.json\n.claude/\npnpm-lock.yaml\n",
      "AGENTS.md": "# Notes\n",
      "pnpm-lock.yaml": "",
    });
    packages(root);
    uiPackage(root, "1.0.0", ["Button"]);
    const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    const origin = tempDir();
    execFileSync("git", ["init", "-q", "--bare"], { cwd: origin });
    git("init", "-q", "-b", "main");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "Test");
    git("config", "commit.gpgsign", "false");
    git("remote", "add", "origin", origin);
    git("add", ".");
    git("commit", "-q", "-m", "start");
    const bin = tempDir();
    writeTree(bin, { gh: '#!/bin/sh\necho "https://example.com/pull/1"\n' });
    chmodSync(path.join(bin, "gh"), 0o755);
    const was = process.env.PATH;
    process.env.PATH = `${bin}${path.delimiter}${was}`;
    try {
      const report = await runUpgrade({ root, lookup: release({ [UI]: "1.2.0" }), install: false, doctor: false, pr: true, upstream: { read: () => null } as never });
      expect(report.pr).toBe("https://example.com/pull/1");
      expect(report.summary).toContain(`Changed but gitignored, so not in the pull request: `);
      expect(report.summary).toContain("features.json");
      expect(report.summary).toContain(SKILL_PATH);
      expect(report.summary).toMatch(/not in the pull request: [^\n]*pnpm-lock\.yaml/);
      expect(report.files).not.toContain("features.json");
    } finally {
      process.env.PATH = was;
    }
    expect(git("rev-parse", "--abbrev-ref", "HEAD")).toBe("genesis-upgrade/2.0.0");
    const committed = git("show", "--name-only", "--format=", "HEAD").split("\n");
    expect(committed).toEqual(expect.arrayContaining(["package.json", "AGENTS.md"]));
    expect(committed).not.toContain("features.json");
  });

  it("carries on when a generator fails, with a warning", async () => {
    const root = expoApp({ "package.json": JSON.stringify({ name: "a", dependencies: { [UI]: "^1.0.0" } }), "features.ts": "throw new Error('broken registry');\n" });
    uiPackage(root, "1.0.0", ["Button"]);
    const report = await runUpgrade({ root, lookup: release({ [UI]: "1.2.0" }), install: false, doctor: false });
    expect(report.summary).toContain("features build failed");
  });
});

describe("dependencies not installed", () => {
  const app = (lockfile: Record<string, string> = {}) => {
    const root = makeApp({ "package.json": JSON.stringify({ name: "a", dependencies: { [UI]: "^1.0.0" } }), ".eas/workflows/pr-preview.yml": "x\n", ...lockfile });
    writeLock(root, { version: 1, blocks: {}, files: { [FILE]: { source: `${CLI}:${TEMPLATE}`, sha256: sha256("x\n") } } });
    return root;
  };

  it("upgrade stops before changing anything and gives the command", async () => {
    const root = app({ "pnpm-lock.yaml": "" });
    const before = snapshot(root);
    await expect(runUpgrade({ root, lookup: release({ [UI]: "1.2.0" }), doctor: false })).rejects.toThrow(/dependencies aren't installed.*`pnpm install`.*Nothing was changed/);
    expect(snapshot(root)).toEqual(before);
    await expect(runUpgrade({ root, lookup: release({ [UI]: "1.2.0" }), dryRun: true })).rejects.toThrow(/`pnpm install`/);
  });

  it("an app with no owned files can still let the upgrade install", async () => {
    const root = makeApp({ "package.json": JSON.stringify({ name: "a", dependencies: { [UI]: "^1.0.0" } }) });
    let installed = 0;
    await runUpgrade({ root, lookup: release({ [UI]: "1.2.0" }), install: () => void installed++, doctor: false });
    expect(installed).toBe(1);
  });

  it("the doctor tells a missing install from a package the app doesn't use", async () => {
    await expect(runDoctor({ root: app({ "bun.lock": "" }) })).rejects.toThrow(/in package.json but not installed.*`bun install`/);
    await expect(runDoctor({ root: makeApp() })).rejects.toThrow(/isn't in this app's package.json/);
  });

  it("the summary says why the doctor couldn't run", async () => {
    const root = makeApp({ "package.json": JSON.stringify({ name: "a", dependencies: { "@marktiderman/genesis-fixture": "^1.0.0", [UI]: "^1.0.0" } }) });
    fakePackage(root, "@marktiderman/genesis-fixture", {});
    const report = await runUpgrade({ root, lookup: release({}), install: false });
    expect(report.summary).toContain("`genesis doctor` couldn't run after the upgrade");
  });
});

describe("what a message points at", () => {
  it("the persistQueries deprecation links the guide by URL and says it can take a native build", () => {
    const source = readFileSync(path.join(PACKAGES, "native", "src", "persist.ts"), "utf8");
    const tags = [...source.matchAll(/^ \* @deprecated (.*)$/gm)].map((m) => m[1]!);
    expect(tags).toHaveLength(2);
    for (const tag of tags) {
      expect(tag).toContain("https://github.com/marktiderman/genesis/blob/main/docs/MIGRATION.md");
      expect(tag).toContain("can't ship as an OTA update");
      expect(tag).not.toContain("(docs/MIGRATION.md)");
    }
    expect(readFileSync(path.join(PACKAGES, "..", "docs", "MIGRATION.md"), "utf8")).toContain("can't always ship as an OTA update");
  });

  it("a codemod that edited package.json says nothing was installed, with the command", () => {
    const root = makeApp({ "pnpm-lock.yaml": "" });
    expect(codemodInstallNote(root, ["eslint.config.js", "package.json"], false)).toMatch(/^Not installed yet.*`pnpm install`/);
    expect(codemodInstallNote(root, ["package.json"], true)).toBeNull();
    expect(codemodInstallNote(root, ["eslint.config.js"], false)).toBeNull();
  });

  it("an upgrade with --no-install says so too", async () => {
    const root = makeApp({ "package.json": JSON.stringify({ name: "a", dependencies: { [UI]: "^1.0.0" } }), "yarn.lock": "" });
    const mod = { id: "x", package: UI, version: "1.1.0", description: "x", run: () => ["package.json"] };
    const report = await runUpgrade({ root, lookup: release({ [UI]: "1.2.0" }), install: false, doctor: false, codemods: [mod] });
    expect(report.summary).toContain("Not installed yet");
    expect(report.summary).toContain("`yarn install`");
  });
});

describe("the doctor's report", () => {
  it("counts the components no file imports, and lists them with verbose", async () => {
    const root = makeApp({ "package.json": JSON.stringify({ name: "a", dependencies: { [UI]: "^1.0.0" } }) });
    uiPackage(root, "1.0.0", ["Button", "Card"]);
    fakePackage(root, "@marktiderman/genesis-design-system", {}, { "dist/themes/genesis.css": ":root { --x: 1; }\n" });
    const result = await runDoctor({ root });
    expect(formatReport(result)).toContain("Available but unused: 2 (genesis doctor --verbose lists them)");
    expect(formatReport(result)).not.toContain("Button, Card");
    expect(formatReport(result, { verbose: true })).toContain("Available but unused (2): Button, Card");
    expect(result.unused).toEqual(["Button", "Card"]);
  });
});

describe("major moves with no codemod", () => {
  const CHANGELOG = [
    "# @marktiderman/genesis-ui",
    "",
    "## 3.1.0",
    "",
    "### Major Changes",
    "",
    "- abc1234: Too new to count.",
    "",
    "## 3.0.0",
    "",
    "### Major Changes",
    "",
    "- abc1234: `Tabs` takes `value`, not `active`.",
    "  More about it.",
    "",
    "### Patch Changes",
    "",
    "- def5678: A fix.",
    "",
    "## 2.5.0",
    "",
    "### Minor Changes",
    "",
    "- 1234567: Listed, in a move from 2.4.",
    "",
    "## 2.4.0",
    "",
    "### Major Changes",
    "",
    "- 7654321: Already here.",
    "",
  ].join("\n");

  it("reads the breaking entries between the versions", () => {
    expect(breakingEntries(CHANGELOG, "^2.4.0", "^3.0.0")).toEqual(["`Tabs` takes `value`, not `active`."]);
    expect(breakingEntries(CHANGELOG, "^2.4.0", "^2.5.0")).toEqual([]);
    expect(breakingEntries(CHANGELOG, "0.2.0", "2.5.0")).toEqual(expect.arrayContaining(["Listed, in a move from 2.4.", "Already here."]));
    expect(breakingEntries(CHANGELOG, "^9.0.0", "^10.0.0")).toBeNull();
    // Reaches into the range but not the version moved to (main behind the release): unknown, not empty.
    expect(breakingEntries(CHANGELOG, "^3.0.0", "^4.0.0")).toBeNull();
  });

  it("reads a mixed workspace from the lowest version any package.json moved from", async () => {
    const root = makeApp();
    fakePackage(root, UI, { repository: { directory: "packages/ui" } });
    const lines = await breakLines(
      root,
      [
        { file: "a/package.json", name: UI, from: "^2.5.0", to: "^3.0.0" },
        { file: "b/package.json", name: UI, from: "^1.0.0", to: "^3.0.0" },
      ],
      { changelog: () => "## 3.0.0\n\n### Patch Changes\n\n- a fix\n\n## 2.0.0\n\n### Major Changes\n\n- abc1234: The real break.\n" },
    );
    expect(lines[0]).toContain("^1.0.0 → ^3.0.0");
    expect(lines).toContain("  - The real break.");
  });

  it("a codemod declared at a minor doesn't cover a major move across it; one declared for that major does", () => {
    const names = (name: string, from: string, to: string) => uncoveredBreaks([{ file: "p", name, from, to }], CODEMODS).map((c) => c.name);
    expect(names(UI, "^2.30.0", "^3.0.0")).toEqual([UI]);
    expect(names("@marktiderman/genesis-ui-native", "^3.6.0", "^4.0.0")).toEqual(["@marktiderman/genesis-ui-native"]);
    expect(names("@marktiderman/genesis-core", "^1.9.0", "^2.3.0")).toEqual([]);
    // Moved past the major it was declared for.
    expect(names("@marktiderman/genesis-core", "^1.9.0", "^3.0.0")).toEqual(["@marktiderman/genesis-core"]);
    // A minor's codemod inside a major move's new line doesn't cover it either.
    expect(names("@marktiderman/genesis-cli", "^0.9.0", "^1.25.0")).toEqual(["@marktiderman/genesis-cli"]);
  });

  it("links each package's changelog, says when it lists no breaking change of its own, and links when it can't be read", async () => {
    const root = makeApp();
    fakePackage(root, UI, { repository: { directory: "packages/ui" } });
    fakePackage(root, "@marktiderman/genesis-forms", { repository: { directory: "packages/forms" } });
    fakePackage(root, "@marktiderman/genesis-data", { repository: { directory: "packages/data" } });
    const lines = await breakLines(
      root,
      [
        { file: "a/package.json", name: UI, from: "^2.4.0", to: "^3.0.0" },
        { file: "b/package.json", name: UI, from: "^2.4.0", to: "^3.0.0" },
        { file: "package.json", name: "@marktiderman/genesis-forms", from: "^3.0.0", to: "^4.0.0" },
        { file: "package.json", name: "@marktiderman/genesis-data", from: "^1.0.0", to: "^2.0.0" },
        { file: "package.json", name: "@marktiderman/genesis-gone", from: "^1.0.0", to: "^2.0.0" },
      ],
      { changelog: (dir) => (dir === "packages/ui" ? CHANGELOG : dir === "packages/forms" ? "## 4.0.0\n\n### Patch Changes\n\n- Updated dependencies\n" : null) },
    );
    expect(lines).toEqual([
      `- \`${UI}\` ^2.4.0 → ^3.0.0: [changelog](https://github.com/marktiderman/genesis/blob/main/packages/ui/CHANGELOG.md#300)`,
      "  - `Tabs` takes `value`, not `active`.",
      "- `@marktiderman/genesis-forms` ^3.0.0 → ^4.0.0: no breaking changes of its own; moved with its dependencies, see [its changelog](https://github.com/marktiderman/genesis/blob/main/packages/forms/CHANGELOG.md#400)",
      "- `@marktiderman/genesis-data` ^1.0.0 → ^2.0.0: read [its changelog](https://github.com/marktiderman/genesis/blob/main/packages/data/CHANGELOG.md#200)",
      "- `@marktiderman/genesis-gone` ^1.0.0 → ^2.0.0: read [its changelog](https://www.npmjs.com/package/@marktiderman/genesis-gone)",
    ]);
  });

  it("ends up in the upgrade's summary", async () => {
    const root = makeApp({ "package.json": JSON.stringify({ name: "a", dependencies: { [UI]: "^2.4.0" } }) });
    fakePackage(root, UI, { repository: { directory: "packages/ui" } });
    // The real registry: genesis-ui's codemod at 2.31.0 runs on this move and doesn't hide its major.
    const report = await runUpgrade({ root, lookup: { ...release({ [UI]: "3.0.0" }), changelog: () => CHANGELOG }, install: false, doctor: false });
    expect(report.codemods.map((c) => c.id)).toContain("genesis-ui-overlays-fit-the-phone");
    expect(report.summary).toContain("Major moves with no codemod:");
    expect(report.summary).toContain("`Tabs` takes `value`");
  });
});

const rulePattern = (folder: string, id: string) => {
  const pkg = JSON.parse(readFileSync(path.join(PACKAGES, folder, "package.json"), "utf8")) as { genesis: { doctor: { prefer: { id: string; forbid: { pattern: string } }[] } } };
  return new RegExp(pkg.genesis.doctor.prefer.find((r) => r.id === id)!.forbid.pattern);
};

describe("genesis-ui-overlays-fit-the-phone", () => {
  const rule = rulePattern("ui", "overlays-fit-the-phone");

  it("drops a screen-sized max-h, keeps a chosen cap or set height in dvh, and satisfies the rule", () => {
    const cases: [string, string][] = [
      ['<DialogContent className="max-h-[50vh] overflow-y-auto">', '<DialogContent className="max-h-[50dvh] overflow-y-auto">'],
      ['<DialogContent className="max-h-[85vh] overflow-y-auto">', '<DialogContent className="overflow-y-auto">'],
      ['<DialogContent className="max-h-[85vh]">', "<DialogContent>"],
      ['<SheetContent side="right" className="w-96 sm:max-h-[90.5vh] p-4">', '<SheetContent side="right" className="w-96 p-4">'],
      ['<AlertDialogContent className="h-[80vh] min-h-[40vh]">', '<AlertDialogContent className="h-[80dvh] min-h-[40dvh]">'],
      ['<DialogContent\n  mobileLayout="sheet"\n  className={cn("sm:h-[70vh]", x)}\n>', '<DialogContent\n  mobileLayout="sheet"\n  className={cn("sm:h-[70dvh]", x)}\n>'],
    ];
    for (const [before, after] of cases) {
      expect(rule.test(before)).toBe(true);
      expect(rewriteOverlayHeights(before)).toBe(after);
      expect(rule.test(after)).toBe(false);
    }
  });

  it("changes nothing else", () => {
    const text = '<div className="max-h-[85vh]" /><DialogContent className="max-h-dvh" /><Dialog><p className="h-[10vh]" /></Dialog>';
    expect(rewriteOverlayHeights(text)).toBe(text);
    // A tag with no vh keeps its own spacing, and an empty className.
    const untouched = '<DialogContent className="  a   b " /><SheetContent className="" />';
    expect(rewriteOverlayHeights(untouched)).toBe(untouched);
  });

  it("runs on files that import genesis-ui, leaves a local copy's, and honours --dry-run", async () => {
    const mine = 'import { DialogContent } from "@marktiderman/genesis-ui";\nexport const A = () => <DialogContent className="max-h-[80vh]" />;\n';
    const local = 'import { DialogContent } from "./my-dialog";\nexport const B = () => <DialogContent className="max-h-[80vh]" />;\n';
    const root = makeApp({ "src/a.tsx": mine, "src/b.tsx": local });
    const notes: string[] = [];
    expect(await overlaysFitThePhone.run({ root, dryRun: true, log: () => {} })).toEqual(["src/a.tsx"]);
    expect(read(root, "src/a.tsx")).toBe(mine);
    expect(await overlaysFitThePhone.run({ root, dryRun: false, log: (m) => notes.push(m) })).toEqual(["src/a.tsx"]);
    expect(read(root, "src/a.tsx")).toContain("<DialogContent />");
    expect(read(root, "src/b.tsx")).toBe(local);
    expect(notes.join("\n")).toContain("src/b.tsx");
  });
});

describe("genesis-ui-native-haptics", () => {
  const rule = rulePattern("ui-native", "haptics-use-genesis");
  const head = 'import * as Haptics from "expo-haptics";\n';

  it("turns each direct call into a named kind, and satisfies the rule", () => {
    const before = `${head}export const go = async () => {\n  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);\n  await Haptics.impactAsync();\n  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);\n  Haptics.selectionAsync();\n  Haptics?.notificationAsync(Haptics.NotificationFeedbackType.Error);\n  Haptics.notificationAsync();\n};\n`;
    expect(rule.test(before)).toBe(true);
    const { text, left } = rewriteHaptics(before);
    expect(left).toBe(false);
    expect(text).toBe(
      `${head}import { playHaptic } from "@marktiderman/genesis-ui-native";\nexport const go = async () => {\n  playHaptic(Haptics, "light");\n  playHaptic(Haptics, "medium");\n  void playHaptic(Haptics, "heavy");\n  playHaptic(Haptics, "select");\n  playHaptic(Haptics, "error");\n  playHaptic(Haptics, "success");\n};\n`,
    );
    expect(rule.test(text)).toBe(false);
  });

  it("joins an existing import, and keeps the app's name for the module", () => {
    const text = rewriteHaptics('import * as H from "expo-haptics";\nimport { NativeButton } from "@marktiderman/genesis-ui-native";\nH.selectionAsync();\n').text;
    expect(text).toBe('import * as H from "expo-haptics";\nimport { NativeButton, playHaptic } from "@marktiderman/genesis-ui-native";\nplayHaptic(H, "select");\n');
  });

  it("doesn't import twice from a multi-line import, and leaves calls in comments", () => {
    const multi = 'import * as Haptics from "expo-haptics";\nimport {\n  NativeButton,\n  playHaptic,\n} from "@marktiderman/genesis-ui-native";\nHaptics.selectionAsync();\n';
    expect(rewriteHaptics(multi).text).toBe(multi.replace("Haptics.selectionAsync()", 'playHaptic(Haptics, "select")'));
    const joined = rewriteHaptics('import * as Haptics from "expo-haptics";\nimport {\n  NativeButton,\n} from "@marktiderman/genesis-ui-native";\nHaptics.selectionAsync();\n').text;
    expect(joined.match(/playHaptic\b/g)).toHaveLength(2);
    expect(joined).toContain("NativeButton, playHaptic }");
    const commented = `${head}// Haptics.selectionAsync();\n/*\n * Haptics.impactAsync();\n */\nconst a = 1; // Haptics.notificationAsync()\n`;
    expect(rewriteHaptics(commented)).toEqual({ text: commented, left: false });
    const mixed = rewriteHaptics(`${head}// Haptics.selectionAsync();\nHaptics.selectionAsync();\n`).text;
    expect(mixed).toContain('// Haptics.selectionAsync();\nplayHaptic(Haptics, "select");');
  });

  it("leaves what it can't name, and says so", () => {
    const soft = `${head}Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);\nHaptics.selectionAsync().catch(() => {});\nHaptics.impactAsync(style);\n`;
    expect(rewriteHaptics(soft)).toEqual({ text: soft, left: true });
    const named = 'import { selectionAsync } from "expo-haptics";\nselectionAsync();\n';
    expect(rewriteHaptics(named)).toEqual({ text: named, left: true });
    const none = `${head}export const H = Haptics;\n`;
    expect(rewriteHaptics(none)).toEqual({ text: none, left: false });
  });

  it("skips tests and honours --dry-run", async () => {
    const call = `${head}Haptics.selectionAsync();\n`;
    const root = makeApp({ "src/a.tsx": call, "src/a.test.tsx": call, "src/__tests__/b.ts": call });
    expect(await hapticsUseGenesis.run({ root, dryRun: true, log: () => {} })).toEqual(["src/a.tsx"]);
    expect(read(root, "src/a.tsx")).toBe(call);
    expect(await hapticsUseGenesis.run({ root, dryRun: false, log: () => {} })).toEqual(["src/a.tsx"]);
    expect(read(root, "src/a.tsx")).toContain('playHaptic(Haptics, "select")');
    expect(read(root, "src/a.test.tsx")).toBe(call);
  });

  it("run on the upgrade that crosses their versions", () => {
    const ids = (name: string, from: string, to: string) => codemodsFor([{ file: "p", name, from, to }], CODEMODS).map((m) => m.id);
    expect(ids(UI, "^2.30.0", "^2.31.0")).toEqual(["genesis-ui-overlays-fit-the-phone"]);
    expect(ids(UI, "^2.31.0", "^2.31.1")).toEqual([]);
    expect(ids("@marktiderman/genesis-ui-native", "^3.6.0", "^3.7.0")).toEqual(["genesis-ui-native-haptics"]);
  });
});
