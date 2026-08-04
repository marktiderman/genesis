/**
 * Regression tests for scripts/design-system-coverage.mjs — SCAN_PATHS scoping.
 *
 * THE BUG. The script classifies changed UI files by asking "does this file
 * import from @marktiderman/genesis-*?" — a question written for CONSUMER
 * repos. It is also run against the Genesis monorepo itself
 * (.github/workflows/self-lint.yml → genesis-lint.yml, with paths: 'apps'),
 * where the primitives in packages/ui/src/components/ui/ cannot import
 * @marktiderman/genesis-* because they ARE it. They therefore all score
 * CUSTOM, and coverage on any genesis-ui PR is 0% by construction.
 *
 * SCAN_PATHS existed to prevent exactly that, but was applied in the FULL-SCAN
 * FALLBACK branch only. On the diff branch — the branch every real PR takes —
 * every changed .tsx matching the UI path regex was classified regardless of
 * whether it fell under SCAN_PATHS. Confirmed in the wild on PR #382, a
 * mechanical `@radix-ui/react-*` → `radix-ui` import rewrite that added zero
 * files: the gate commented "Coverage: 0% (0 Genesis-aligned of 23 new UI
 * files)" over packages/ui/src/components/ui/*.tsx.
 *
 * THE SECOND BUG THE FIX MUST NOT INTRODUCE. Applying the filter makes that PR
 * report "_No new UI primitives in this PR._" — which is correct, and also
 * indistinguishable from a PR that touched no UI at all. Anything the filter
 * drops has to be named in the report. Silence is what got us here.
 *
 * THE THIRD BUG (#395), and why the last two describe blocks exist. UI_PATH_RE
 * read `/(components|ui)/(ui|composites)/`, which predated #384's layer split,
 * so every file in `patterns/`, `layout/` and `data/` failed `isUiSurface` and
 * hit a bare `continue` — dropped before it could ever reach the
 * `excludedByScanPath` bookkeeping above. Same output, different branch: the
 * mitigation written to stop "narrowed" from looking like "clean" was bypassed
 * by an earlier `continue` producing the identical sentence. Live instance:
 * #393 added five components across `layout/` and `data/` and the gate
 * commented "_No new UI primitives in this PR._".
 *
 * These tests must DISCRIMINATE, which for this bug means two separate reverts:
 *
 *   - narrow UI_PATH_RE back to `(ui|composites)` and the per-layer block plus
 *     "the #393 instance" fail;
 *   - delete the `skipped` bucket (restore the bare `continue` at the
 *     `!isUiSurface` branch) and "nothing component-shaped is dropped in
 *     silence" fails.
 *
 * Both were run and observed failing before this file was committed. A test
 * that cannot fail is the same silent green in a different costume.
 *
 * These tests drive the REAL script as a subprocess over throwaway git repos
 * in os.tmpdir(), matching the structure of tests/harness/test_conform_
 * mergebase.py: the script is COPIED into the fixture so its
 * `REPO_ROOT = resolve(__dirname, '..')` resolves to the fixture rather than to
 * this repo, and origin/main is faked with `git update-ref` so no network or
 * real remote is involved. Nothing here mutates the live repo.
 *
 * Run from the repo root:  pnpm test:scripts
 */
import { afterAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(HERE, "..", "design-system-coverage.mjs");

// Isolate git from the developer's ~/.gitconfig and from any repo-level state:
// a global `commit.gpgsign`, hooks path, or init.defaultBranch would otherwise
// make these fixtures behave differently on different machines.
const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
  GIT_TERMINAL_PROMPT: "0",
};

const tempDirs = [];

afterAll(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

function git(cwd, args) {
  const res = spawnSync(
    "git",
    [
      "-C",
      cwd,
      "-c",
      "user.name=coverage-test",
      "-c",
      "user.email=coverage-test@example.invalid",
      "-c",
      "commit.gpgsign=false",
      "-c",
      "init.defaultBranch=main",
      ...args,
    ],
    { encoding: "utf8", env: GIT_ENV },
  );
  if (res.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed (${res.status}): ${res.stderr}`);
  }
  return res.stdout.trim();
}

function write(dir, rel, content) {
  const abs = path.join(dir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

/** A throwaway repo carrying a copy of the gate, with `files` in its base commit. */
function makeRepo(files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ds-coverage-"));
  tempDirs.push(dir);
  // The gate lands in the BASE commit so it never shows up in the diff itself.
  write(dir, "scripts/design-system-coverage.mjs", fs.readFileSync(SCRIPT, "utf8"));
  write(dir, "README.md", "# fixture\n");
  for (const [rel, content] of Object.entries(files)) write(dir, rel, content);
  git(dir, ["init", "-q"]);
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-q", "-m", "base"]);
  return dir;
}

/** Fake the base branch the gate diffs against — no remote, no network. */
function markBase(dir) {
  git(dir, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
}

function commit(dir, files, message = "pr") {
  for (const [rel, content] of Object.entries(files)) write(dir, rel, content);
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-q", "-m", message]);
}

function run(dir, env = {}) {
  const res = spawnSync(process.execPath, ["scripts/design-system-coverage.mjs"], {
    cwd: dir,
    encoding: "utf8",
    // Every input the gate reads is pinned explicitly: GITHUB_BASE_REF and
    // PR_BODY are set for real inside GitHub Actions, and inheriting them would
    // make these assertions depend on where the suite runs.
    env: { ...GIT_ENV, GITHUB_BASE_REF: "main", SCAN_PATHS: "apps", PR_BODY: "", ...env },
  });
  const reportFile = path.join(dir, "coverage", "design-system-coverage.json");
  if (!fs.existsSync(reportFile)) {
    throw new Error(`gate wrote no report. stdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
  }
  const json = JSON.parse(fs.readFileSync(reportFile, "utf8"));
  return { ...res, json, report: json.report };
}

// ── fixture file shapes, one per classification ──────────────────────────────
const SOURCED = `export * from "@marktiderman/genesis-ui";\n`;

const EXTENDED = `import { Button } from "@marktiderman/genesis-ui";

export const FancyButton = (props) => <Button {...props} />;
`;

// What a Genesis-owned primitive actually looks like: it cannot import
// @marktiderman/genesis-ui, because it IS @marktiderman/genesis-ui.
const CUSTOM = `import * as React from "react";

export const Accordion = () => <div />;
`;

describe("design-system-coverage — SCAN_PATHS is honored on the diff branch", () => {
  it("classifies a changed UI file that is inside SCAN_PATHS", () => {
    const dir = makeRepo();
    markBase(dir);
    commit(dir, { "apps/web/src/components/ui/fancy.tsx": SOURCED });

    const { json, report } = run(dir, { SCAN_PATHS: "apps" });

    expect(json.total).toBe(1);
    expect(json.sourced).toBe(1);
    expect(json.coverage).toBe(100);
    expect(json.tally["GENESIS-SOURCED"]).toEqual(["apps/web/src/components/ui/fancy.tsx"]);
    // Nothing was dropped, so nothing is claimed to have been dropped.
    expect(json.excludedCount).toBe(0);
    expect(report).not.toMatch(/outside SCAN_PATHS/);
  });

  it("classifies an EXTENDED file inside SCAN_PATHS", () => {
    const dir = makeRepo();
    markBase(dir);
    commit(dir, { "apps/web/src/components/composites/fancy-button.tsx": EXTENDED });

    const { json } = run(dir, { SCAN_PATHS: "apps" });

    expect(json.total).toBe(1);
    expect(json.extended).toBe(1);
    expect(json.coverage).toBe(100);
  });

  // THE REGRESSION. Reproduces PR #382: genesis's own primitives, modified, with
  // SCAN_PATHS=apps. Before the fix this scored them CUSTOM and reported 0%.
  it("does NOT classify a changed UI file outside SCAN_PATHS", () => {
    const dir = makeRepo({ "packages/ui/src/components/ui/accordion.tsx": CUSTOM });
    markBase(dir);
    commit(dir, {
      "packages/ui/src/components/ui/accordion.tsx": CUSTOM.replace("react", "radix-ui"),
    });

    const { json, report } = run(dir, { SCAN_PATHS: "apps" });

    expect(json.total).toBe(0);
    expect(json.custom).toBe(0);
    expect(json.softBlocker).toBe(false);
    expect(report).toContain("_No new UI primitives in this PR._");
  });

  // …AND the exclusion is stated. An out-of-scope drop that reads exactly like
  // a clean PR is the same class of bug as scoring the wrong files.
  it("reports the files SCAN_PATHS excluded, by count and by path", () => {
    const dir = makeRepo({ "packages/ui/src/components/ui/accordion.tsx": CUSTOM });
    markBase(dir);
    commit(dir, {
      "packages/ui/src/components/ui/accordion.tsx": CUSTOM.replace("react", "radix-ui"),
    });

    const { json, report, stdout, stderr } = run(dir, { SCAN_PATHS: "apps" });

    expect(json.excludedCount).toBe(1);
    expect(json.excluded).toEqual(["packages/ui/src/components/ui/accordion.tsx"]);
    expect(json.scanPaths).toBe("apps");

    expect(report).toMatch(/1 changed UI file\(s\) NOT classified: outside SCAN_PATHS/);
    expect(report).toContain("packages/ui/src/components/ui/accordion.tsx");
    // …and it is not invisible in the job log either. GitHub reads workflow
    // commands from STDOUT, so that is where the annotation has to go.
    expect(stdout).toContain("::notice::");
    expect(stdout).toContain("packages/ui/src/components/ui/accordion.tsx");
    expect(stderr).not.toContain("::notice::");
  });

  it("scores the in-scope files and still names the out-of-scope ones", () => {
    const dir = makeRepo();
    markBase(dir);
    commit(dir, {
      "apps/web/src/components/ui/fancy.tsx": SOURCED,
      "packages/ui/src/components/ui/accordion.tsx": CUSTOM,
    });

    const { json, report } = run(dir, { SCAN_PATHS: "apps" });

    expect(json.total).toBe(1);
    expect(json.coverage).toBe(100);
    expect(json.excluded).toEqual(["packages/ui/src/components/ui/accordion.tsx"]);
    expect(report).toMatch(/Coverage: 100%/);
    expect(report).toMatch(/1 changed UI file\(s\) NOT classified/);
  });

  it("caps the excluded-file list at 5 and says how many more there are", () => {
    const base = {};
    for (let i = 0; i < 7; i += 1) base[`packages/ui/src/components/ui/p${i}.tsx`] = CUSTOM;
    const dir = makeRepo(base);
    markBase(dir);
    const touched = {};
    for (let i = 0; i < 7; i += 1) {
      touched[`packages/ui/src/components/ui/p${i}.tsx`] = `${CUSTOM}// touched\n`;
    }
    commit(dir, touched);

    const { json, report } = run(dir, { SCAN_PATHS: "apps" });

    expect(json.excludedCount).toBe(7);
    const listed = report.match(/^> - `packages\/ui/gm) || [];
    expect(listed).toHaveLength(5);
    expect(report).toContain("…and 2 more.");
  });

  // genesis-lint.yml's own consumer example passes `paths: 'apps/mobile/**'`,
  // so a naive string-prefix test would exclude everything and hand every
  // consumer using the documented form a brand-new silent green.
  it("honors glob SCAN_PATHS entries", () => {
    const dir = makeRepo();
    markBase(dir);
    commit(dir, {
      "apps/mobile/src/components/ui/fancy.tsx": SOURCED,
      "apps/web/src/components/ui/other.tsx": CUSTOM,
    });

    const { json } = run(dir, { SCAN_PATHS: "apps/mobile/**" });

    expect(json.total).toBe(1);
    expect(json.tally["GENESIS-SOURCED"]).toEqual(["apps/mobile/src/components/ui/fancy.tsx"]);
    expect(json.excluded).toEqual(["apps/web/src/components/ui/other.tsx"]);
  });

  it("honors multiple comma-separated SCAN_PATHS entries", () => {
    const dir = makeRepo();
    markBase(dir);
    commit(dir, {
      "apps/web/src/components/ui/fancy.tsx": SOURCED,
      "packages/ui/src/components/ui/accordion.tsx": CUSTOM,
      "vendor/x/src/components/ui/legacy.tsx": CUSTOM,
    });

    const { json } = run(dir, { SCAN_PATHS: "apps, packages" });

    expect(json.total).toBe(2);
    expect(json.excluded).toEqual(["vendor/x/src/components/ui/legacy.tsx"]);
  });
});

// Codex P2 on #383. The first cut compiled `**` to `.*` and joined every
// segment with '/', so `apps/**/src` became `apps/.*/src` — which cannot match
// zero segments, because the two literal slashes are always required. Files
// directly under `apps/src/` were silently dropped from scope: coverage reads
// 100%, the D6.6 soft blocker never fires. Same silent-drop class as the
// original bug, arriving from the opposite direction.
describe("design-system-coverage — globstar matches zero or more segments", () => {
  it("matches zero, one, and several directory segments", () => {
    const dir = makeRepo();
    markBase(dir);
    commit(dir, {
      "apps/src/components/ui/zero.tsx": SOURCED, // ** = 0 segments
      "apps/mobile/src/components/ui/one.tsx": SOURCED, // ** = 1 segment
      "apps/a/b/c/src/components/ui/several.tsx": SOURCED, // ** = 3 segments
    });

    const { json } = run(dir, { SCAN_PATHS: "apps/**/src" });

    expect(json.total).toBe(3);
    expect(json.excludedCount).toBe(0);
    // git reports diff paths in its own sort order, not authoring order.
    expect(json.tally["GENESIS-SOURCED"].sort()).toEqual([
      "apps/a/b/c/src/components/ui/several.tsx",
      "apps/mobile/src/components/ui/one.tsx",
      "apps/src/components/ui/zero.tsx",
    ]);
  });

  it("matches zero segments after a LEADING globstar", () => {
    const dir = makeRepo();
    markBase(dir);
    commit(dir, {
      "components/ui/root.tsx": SOURCED, // ** = 0 segments
      "apps/web/components/ui/nested.tsx": SOURCED, // ** = 2 segments
    });

    const { json } = run(dir, { SCAN_PATHS: "**/components/ui" });

    expect(json.total).toBe(2);
    expect(json.excludedCount).toBe(0);
  });

  // Zero-segment support must not be bought by letting the wildcard eat part of
  // a segment: `apps/**/src` is not `apps.*src`.
  it("does not let a globstar cross a non-slash boundary", () => {
    const dir = makeRepo();
    markBase(dir);
    commit(dir, {
      "apps/src/components/ui/kept.tsx": SOURCED,
      "appsfoo/src/components/ui/dropped.tsx": CUSTOM, // literal segment must end at the slash
      "apps/mobilesrc/components/ui/dropped.tsx": CUSTOM, // `src` is a whole segment, not a suffix
    });

    const { json } = run(dir, { SCAN_PATHS: "apps/**/src" });

    expect(json.total).toBe(1);
    expect(json.tally["GENESIS-SOURCED"]).toEqual(["apps/src/components/ui/kept.tsx"]);
    expect(json.excluded.sort()).toEqual([
      "apps/mobilesrc/components/ui/dropped.tsx",
      "appsfoo/src/components/ui/dropped.tsx",
    ]);
  });

  it("keeps a single * to exactly one segment", () => {
    const dir = makeRepo();
    markBase(dir);
    commit(dir, {
      "apps/web/src/components/ui/one.tsx": SOURCED,
      "apps/src/components/ui/zero.tsx": CUSTOM, // `*` is one segment, never zero
      "apps/a/b/src/components/ui/two.tsx": CUSTOM, // …and never two
    });

    const { json } = run(dir, { SCAN_PATHS: "apps/*/src" });

    expect(json.total).toBe(1);
    expect(json.tally["GENESIS-SOURCED"]).toEqual(["apps/web/src/components/ui/one.tsx"]);
    expect(json.excludedCount).toBe(2);
  });
});

describe("design-system-coverage — --diff-filter=AM wording", () => {
  it("counts MODIFIED files and calls them added or modified, not new", () => {
    const dir = makeRepo({ "apps/web/src/components/ui/existing.tsx": CUSTOM });
    markBase(dir);
    commit(dir, { "apps/web/src/components/ui/existing.tsx": `${CUSTOM}// touched\n` });

    const { json, report } = run(dir, { SCAN_PATHS: "apps" });

    expect(json.total).toBe(1);
    expect(json.custom).toBe(1);
    expect(report).toContain("1 added or modified UI files");
    expect(report).not.toContain("1 new UI files");
    // The D6.6 soft blocker fires on modified files too, so its wording has to
    // admit that rather than claiming the PR "adds" the surface.
    expect(report).toContain("adds or modifies CUSTOM UI surface area");
  });
});

describe("design-system-coverage — full-scan fallback", () => {
  it("still falls back to a full scan of SCAN_PATHS when there is no base", () => {
    // No refs/remotes/origin/main → `git merge-base` fails → fallback branch.
    const dir = makeRepo({
      "apps/web/src/components/ui/fancy.tsx": SOURCED,
      "packages/ui/src/components/ui/accordion.tsx": CUSTOM,
    });

    const { json, report, stdout, stderr } = run(dir, { SCAN_PATHS: "apps" });

    expect(json.usedFallback).toBe(true);
    expect(json.diffContextError).toMatch(/merge-base/);
    expect(report).toContain("**WARNING - no diff context; this is NOT a diff of your PR.**");
    // Workflow commands are read from stdout — the pre-existing `::warning::`
    // moved there too, so it is not silently a plain log line.
    expect(stdout).toContain("::warning::");
    expect(stderr).not.toContain("::warning::");

    // The fallback was already scoped to SCAN_PATHS — that must not regress.
    expect(json.total).toBe(1);
    expect(json.tally["GENESIS-SOURCED"]).toEqual(["apps/web/src/components/ui/fancy.tsx"]);
    // Nothing was excluded on the diff branch, because there was no diff branch.
    expect(json.excludedCount).toBe(0);
  });

  it("resolves a glob SCAN_PATHS entry to a real directory to walk", () => {
    const dir = makeRepo({
      "apps/mobile/src/components/ui/fancy.tsx": SOURCED,
      "apps/web/src/components/ui/other.tsx": CUSTOM,
    });

    const { json } = run(dir, { SCAN_PATHS: "apps/mobile/**" });

    expect(json.usedFallback).toBe(true);
    expect(json.total).toBe(1);
    expect(json.tally["GENESIS-SOURCED"]).toEqual(["apps/mobile/src/components/ui/fancy.tsx"]);
  });

  // The walk root and the matcher are the two halves of one definition. If the
  // matcher accepts `apps/src/...` while the walk root is computed from the
  // globbed segment, the fallback never visits the file the diff branch would
  // have scored — the identical silent drop, from the other direction.
  it("walks from the glob-free prefix, so a zero-segment globstar is still found", () => {
    const dir = makeRepo({
      "apps/src/components/ui/zero.tsx": SOURCED,
      "apps/mobile/src/components/ui/one.tsx": SOURCED,
      "packages/ui/src/components/ui/accordion.tsx": CUSTOM,
    });

    const { json } = run(dir, { SCAN_PATHS: "apps/**/src" });

    expect(json.usedFallback).toBe(true);
    expect(json.total).toBe(2);
    expect(json.tally["GENESIS-SOURCED"].sort()).toEqual([
      "apps/mobile/src/components/ui/one.tsx",
      "apps/src/components/ui/zero.tsx",
    ]);
  });

  it("does not double-count a file matched by two overlapping SCAN_PATHS", () => {
    const dir = makeRepo({ "apps/web/src/components/ui/fancy.tsx": SOURCED });

    const { json } = run(dir, { SCAN_PATHS: "apps, apps/web" });

    expect(json.usedFallback).toBe(true);
    expect(json.total).toBe(1);
  });
});

// ── #395: every layer docs/FRAMEWORK.md defines is a UI surface ──────────────
//
// One test per layer folder, each asserting the file is either CLASSIFIED or
// NAMED AS EXCLUDED — never silently dropped. `composites/` is covered above
// ("classifies an EXTENDED file inside SCAN_PATHS").
const LAYERS = ["ui", "patterns", "layout", "data"];

describe("design-system-coverage — the framework's layer folders are UI surface", () => {
  for (const layer of LAYERS) {
    it(`classifies a changed file in components/${layer}/ that is inside SCAN_PATHS`, () => {
      const rel = `apps/web/src/components/${layer}/thing.tsx`;
      const dir = makeRepo();
      markBase(dir);
      commit(dir, { [rel]: SOURCED });

      const { json, report } = run(dir, { SCAN_PATHS: "apps" });

      expect(json.total).toBe(1);
      expect(json.tally["GENESIS-SOURCED"]).toEqual([rel]);
      expect(report).toMatch(/Coverage: 100%/);
      // Classified, so it is not in either "we dropped it" bucket.
      expect(json.excluded).toEqual([]);
      expect(json.skipped).toEqual([]);
      expect(report).not.toContain("_No new UI primitives in this PR._");
    });

    // The inverse, per the "both directions" convention this file already uses:
    // out of scope is a legitimate drop, and it still has to be named.
    it(`names an out-of-scope components/${layer}/ file rather than dropping it`, () => {
      const rel = `packages/ui/src/components/${layer}/thing.tsx`;
      const dir = makeRepo();
      markBase(dir);
      commit(dir, { [rel]: CUSTOM });

      const { json, report, stdout } = run(dir, { SCAN_PATHS: "apps" });

      expect(json.total).toBe(0);
      expect(json.excluded).toEqual([rel]);
      expect(report).toMatch(/1 changed UI file\(s\) NOT classified: outside SCAN_PATHS/);
      expect(report).toContain(rel);
      expect(stdout).toContain("::notice::");
    });
  }

  // THE LIVE INSTANCE. PR #393's real added files: four templates in `layout/`
  // and one data-bound page in `data/`, all inside scope. Before the fix this
  // was total 0, coverage 100%, "_No new UI primitives in this PR._" — a green
  // check over five new components.
  it("reproduces #393: five components across layout/ and data/ are counted", () => {
    const dir = makeRepo();
    markBase(dir);
    commit(dir, {
      "packages/ui/src/components/layout/detail-page.tsx": CUSTOM,
      "packages/ui/src/components/layout/form-page.tsx": CUSTOM,
      "packages/ui/src/components/layout/dashboard-page.tsx": CUSTOM,
      "packages/ui/src/components/layout/settings-page.tsx": CUSTOM,
      "packages/ui/src/components/data/ResourceDetailPage.tsx": EXTENDED,
    });

    const { json, report } = run(dir, { SCAN_PATHS: "packages" });

    expect(json.total).toBe(5);
    expect(json.custom).toBe(4);
    expect(json.extended).toBe(1);
    expect(report).not.toContain("_No new UI primitives in this PR._");
    // …and the D6.6 soft blocker can finally see the surface it exists to ask
    // about. With CUSTOM files and an empty PR body it must arm.
    expect(json.softBlocker).toBe(true);
  });

  // …and the same PR under genesis's own SCAN_PATHS=apps, which is what
  // self-lint.yml runs. Out of scope is the correct answer here — but the whole
  // point of #395 is that "out of scope" must be SAID, not implied by silence.
  it("reproduces #393 under SCAN_PATHS=apps: still out of scope, no longer silent", () => {
    const dir = makeRepo();
    markBase(dir);
    commit(dir, {
      "packages/ui/src/components/layout/detail-page.tsx": CUSTOM,
      "packages/ui/src/components/data/ResourceDetailPage.tsx": EXTENDED,
    });

    const { json, report } = run(dir, { SCAN_PATHS: "apps" });

    expect(json.total).toBe(0);
    expect(json.excluded.sort()).toEqual([
      "packages/ui/src/components/data/ResourceDetailPage.tsx",
      "packages/ui/src/components/layout/detail-page.tsx",
    ]);
    expect(report).toMatch(/2 changed UI file\(s\) NOT classified/);
  });
});

// ── #395, the general case: nothing component-shaped drops in silence ────────
//
// The specific bug was a stale regex. The general bug is that "not a UI
// surface" and "not in scope" had different reporting contracts and only one
// was loud. These tests assert the contract rather than the regex, so the NEXT
// folder someone invents fails visibly instead of quietly.
describe("design-system-coverage — nothing component-shaped is dropped in silence", () => {
  it("reports a component in an unrecognised folder as skipped, not nothing", () => {
    const rel = "apps/web/src/components/experimental/thing.tsx";
    const dir = makeRepo();
    markBase(dir);
    commit(dir, { [rel]: CUSTOM });

    const { json, report, stdout, stderr } = run(dir, { SCAN_PATHS: "apps" });

    expect(json.skippedCount).toBe(1);
    expect(json.skipped).toEqual([rel]);
    expect(json.skippedFolders).toEqual(["apps/web/src/components/experimental"]);

    expect(report).toMatch(/1 component-shaped file\(s\) in 1 folder\(s\)/);
    expect(report).toContain("apps/web/src/components/experimental/");
    expect(report).toContain(rel);
    // Named in the job log too, on stdout where GitHub reads workflow commands.
    expect(stdout).toContain("::notice::");
    expect(stdout).toContain("does not recognize as a UI layer");
    expect(stderr).not.toContain("::notice::");
  });

  // The load-bearing assertion. A PR whose only component files were skipped
  // must not be able to read as a clean PR — that identical sentence, with
  // nothing above it, is what #393 got.
  it("does not let a skipped-only PR read as clean", () => {
    const dir = makeRepo();
    markBase(dir);
    commit(dir, { "apps/web/src/components/experimental/thing.tsx": CUSTOM });

    const { report } = run(dir, { SCAN_PATHS: "apps" });

    expect(report).toContain("_No new UI primitives in this PR._");
    // …but never on its own. The note is above it.
    const noteIdx = report.indexOf("component-shaped file(s)");
    expect(noteIdx).toBeGreaterThan(-1);
    expect(noteIdx).toBeLessThan(report.indexOf("_No new UI primitives"));
  });

  // ── noise control, which is the design problem, not a detail ──────────────
  //
  // A gate people ignore is the failure this whole exercise is about, so the
  // three bounds on the note's size are asserted, not assumed.

  // 1. The finding is the FOLDER. Forty files in one unknown folder is one
  //    line, because "components/experimental/ is unknown" is one fact.
  it("aggregates per folder, so file count does not drive report length", () => {
    const files = {};
    for (let i = 0; i < 40; i += 1) {
      files[`apps/web/src/components/experimental/c${i}.tsx`] = CUSTOM;
    }
    const dir = makeRepo();
    markBase(dir);
    commit(dir, files);

    const { json, report } = run(dir, { SCAN_PATHS: "apps" });

    expect(json.skippedCount).toBe(40);
    expect(json.skippedFolders).toHaveLength(1);
    expect(report).toMatch(/40 component-shaped file\(s\) in 1 folder\(s\)/);
    const listed = report.match(/^> - `apps\/web\/src\/components\//gm) || [];
    expect(listed).toHaveLength(1);
  });

  // 2. It fires only INSIDE SCAN_PATHS. Outside it the gate has not claimed the
  //    file, so there is nothing for it to have dropped — this is what keeps a
  //    monorepo's unrelated app folders out of a genesis-ui report.
  it("says nothing about unrecognised folders outside SCAN_PATHS", () => {
    const dir = makeRepo();
    markBase(dir);
    commit(dir, {
      "vendor/x/src/components/experimental/thing.tsx": CUSTOM,
      "apps/web/src/components/ui/fancy.tsx": SOURCED,
    });

    const { json, report } = run(dir, { SCAN_PATHS: "apps" });

    expect(json.total).toBe(1);
    expect(json.skipped).toEqual([]);
    expect(report).not.toContain("component-shaped file(s)");
  });

  // 3. Capped at 5 folders, the same shape and cap the SCAN_PATHS note uses.
  it("caps the skipped-folder list at 5 and says how many more there are", () => {
    const files = {};
    for (let i = 0; i < 7; i += 1) files[`apps/web/src/components/f${i}/thing.tsx`] = CUSTOM;
    const dir = makeRepo();
    markBase(dir);
    commit(dir, files);

    const { json, report } = run(dir, { SCAN_PATHS: "apps" });

    expect(json.skippedFolders).toHaveLength(7);
    // JSON stays uncapped — the cap is a readability measure, not a data limit.
    expect(json.skipped).toHaveLength(7);
    const listed = report.match(/^> - `apps\/web\/src\/components\/f\d\/`/gm) || [];
    expect(listed).toHaveLength(5);
    expect(report).toContain("…and 2 more folder(s).");
  });

  // "Plausible" means a component in a FOLDER. A .tsx sitting directly in
  // `components/` has no layer folder to have been missed, and neither does a
  // page or a hook — reporting those would be the noise that gets the whole
  // note ignored.
  it("does not report files that are not component-shaped", () => {
    const dir = makeRepo();
    markBase(dir);
    commit(dir, {
      "apps/web/src/components/loose.tsx": CUSTOM, // directly in components/
      "apps/web/src/pages/dashboard.tsx": CUSTOM,
      "apps/web/src/hooks/use-thing.tsx": CUSTOM,
      "apps/web/src/lib/util.ts": "export const x = 1;\n",
    });

    const { json, report } = run(dir, { SCAN_PATHS: "apps" });

    expect(json.skipped).toEqual([]);
    expect(json.total).toBe(0);
    expect(report).not.toContain("component-shaped file(s)");
  });

  it("reports the deepest components/ folder for a nested file", () => {
    const rel = "apps/web/src/components/experimental/nested/deep/thing.tsx";
    const dir = makeRepo();
    markBase(dir);
    commit(dir, { [rel]: CUSTOM });

    const { json } = run(dir, { SCAN_PATHS: "apps" });

    expect(json.skippedFolders).toEqual(["apps/web/src/components/experimental"]);
  });

  // Both branches answer the same question the same way, or the fallback
  // becomes a place for the drop to hide.
  it("reports skipped folders on the full-scan fallback too", () => {
    const dir = makeRepo({
      "apps/web/src/components/experimental/thing.tsx": CUSTOM,
      "apps/web/src/components/ui/fancy.tsx": SOURCED,
    });

    const { json, report } = run(dir, { SCAN_PATHS: "apps" });

    expect(json.usedFallback).toBe(true);
    expect(json.total).toBe(1);
    expect(json.skipped).toEqual(["apps/web/src/components/experimental/thing.tsx"]);
    expect(report).toMatch(/1 component-shaped file\(s\) in 1 folder\(s\)/);
  });

  // A file can only be in one bucket, and the three buckets have to add up to
  // what the PR actually touched — otherwise "nothing was dropped" is only a
  // claim about the buckets that happen to be printed.
  it("puts every component-shaped file in exactly one bucket", () => {
    const dir = makeRepo();
    markBase(dir);
    commit(dir, {
      "apps/web/src/components/patterns/in-scope.tsx": SOURCED, // classified
      "packages/ui/src/components/layout/out-of-scope.tsx": CUSTOM, // excluded
      "apps/web/src/components/experimental/unknown.tsx": CUSTOM, // skipped
    });

    const { json } = run(dir, { SCAN_PATHS: "apps" });

    expect(json.total).toBe(1);
    expect(json.excluded).toEqual(["packages/ui/src/components/layout/out-of-scope.tsx"]);
    expect(json.skipped).toEqual(["apps/web/src/components/experimental/unknown.tsx"]);
    const accounted = json.total + json.excludedCount + json.skippedCount;
    expect(accounted).toBe(3);
  });
});

// ── #395 / Codex P2: a test is not design-system surface ─────────────────────
//
// A test file lives inside a layer folder, imports the component it exercises
// and declares none of its own — the exact CUSTOM shape. So every test written
// for a primitive lowered coverage, and enough of them arm the D6.6 soft
// blocker on a test-only PR. True for `components/ui/**` before the layer
// split; widening UI_PATH_RE tripled its reach, and it corrupted this change's
// own headline number (2 of the 7 files #393 "added" were its own tests).
//
// The break that proves these are not vacuous is revert D: delete the
// `isTestFile` branch from `triage()` and every assertion here fails, because
// the tests come back as CUSTOM. Run and observed before committing.
const TEST_FILE = `import { render } from "@testing-library/react";
import { Thing } from "../thing";

describe("Thing", () => {
  it("renders", () => {
    render(<Thing />);
  });
});
`;

describe("design-system-coverage — tests are not design-system surface", () => {
  for (const layer of LAYERS) {
    it(`does not count components/${layer}/__tests__/ against coverage`, () => {
      const dir = makeRepo();
      markBase(dir);
      commit(dir, {
        [`apps/web/src/components/${layer}/thing.tsx`]: SOURCED,
        [`apps/web/src/components/${layer}/__tests__/thing.test.tsx`]: TEST_FILE,
      });

      const { json } = run(dir, { SCAN_PATHS: "apps" });

      // The component counts; its test does not drag coverage down with it.
      expect(json.total).toBe(1);
      expect(json.custom).toBe(0);
      expect(json.coverage).toBe(100);
      expect(json.testFiles).toEqual([
        `apps/web/src/components/${layer}/__tests__/thing.test.tsx`,
      ]);
    });
  }

  it("excludes a co-located *.test.tsx, not just a __tests__/ directory", () => {
    const dir = makeRepo();
    markBase(dir);
    commit(dir, {
      "apps/web/src/components/ui/thing.tsx": SOURCED,
      "apps/web/src/components/ui/thing.test.tsx": TEST_FILE,
      "apps/web/src/components/ui/other.spec.tsx": TEST_FILE,
    });

    const { json } = run(dir, { SCAN_PATHS: "apps" });

    expect(json.total).toBe(1);
    expect(json.testFiles.sort()).toEqual([
      "apps/web/src/components/ui/other.spec.tsx",
      "apps/web/src/components/ui/thing.test.tsx",
    ]);
  });

  // THE FIX MUST NOT BECOME THE BUG. `packages/ui/src/components/ui/
  // aspect-ratio.tsx` contains the substring "spec" — a-**spec**-t — so an
  // unanchored /spec/ would silently drop a real, shipping primitive. That is
  // the exact failure class #395 is about, reintroduced by its own fix.
  it("does not mistake a real primitive whose name contains 'spec' for a test", () => {
    const dir = makeRepo();
    markBase(dir);
    commit(dir, {
      "apps/web/src/components/ui/aspect-ratio.tsx": SOURCED,
      "apps/web/src/components/ui/test-utils.tsx": SOURCED,
      "apps/web/src/components/ui/latest.tsx": SOURCED,
    });

    const { json } = run(dir, { SCAN_PATHS: "apps" });

    expect(json.total).toBe(3);
    expect(json.testFiles).toEqual([]);
    expect(json.tally["GENESIS-SOURCED"].sort()).toEqual([
      "apps/web/src/components/ui/aspect-ratio.tsx",
      "apps/web/src/components/ui/latest.tsx",
      "apps/web/src/components/ui/test-utils.tsx",
    ]);
  });

  // The consequence that made this worth fixing here rather than filing: a
  // test-only PR must not be able to arm the D6.6 soft blocker.
  it("does not arm the D6.6 soft blocker on a test-only PR", () => {
    const dir = makeRepo({ "apps/web/src/components/patterns/thing.tsx": SOURCED });
    markBase(dir);
    commit(dir, {
      "apps/web/src/components/patterns/__tests__/thing.test.tsx": TEST_FILE,
    });

    const { json, report } = run(dir, { SCAN_PATHS: "apps", PR_BODY: "" });

    expect(json.total).toBe(0);
    expect(json.custom).toBe(0);
    expect(json.softBlocker).toBe(false);
    expect(report).not.toContain("WARN — design-system-coverage soft blocker");
  });

  // Tests are not surface in EITHER direction, so an out-of-scope test does not
  // pad the exclusion note either — 2 of the 7 files #393's report named were
  // its own tests, which overstated the finding.
  it("does not name out-of-scope test files in the SCAN_PATHS exclusion note", () => {
    const dir = makeRepo();
    markBase(dir);
    commit(dir, {
      "packages/ui/src/components/layout/detail-page.tsx": CUSTOM,
      "packages/ui/src/components/layout/__tests__/detail-page.test.tsx": TEST_FILE,
    });

    const { json, report } = run(dir, { SCAN_PATHS: "apps" });

    expect(json.excluded).toEqual(["packages/ui/src/components/layout/detail-page.tsx"]);
    expect(report).toMatch(/1 changed UI file\(s\) NOT classified/);
    expect(json.testFiles).toEqual([
      "packages/ui/src/components/layout/__tests__/detail-page.test.tsx",
    ]);
  });

  // Same answer on both branches, or the fallback becomes a place to hide.
  it("excludes test files on the full-scan fallback too", () => {
    const dir = makeRepo({
      "apps/web/src/components/ui/thing.tsx": SOURCED,
      "apps/web/src/components/ui/__tests__/thing.test.tsx": TEST_FILE,
    });

    const { json } = run(dir, { SCAN_PATHS: "apps" });

    expect(json.usedFallback).toBe(true);
    expect(json.total).toBe(1);
    expect(json.testFiles).toEqual(["apps/web/src/components/ui/__tests__/thing.test.tsx"]);
  });

  // A test in a folder that is not a UI layer was never surface, so it is not
  // "excluded" — it is simply not this gate's file, and must not pad the JSON.
  it("records only tests that would otherwise have been surface", () => {
    const dir = makeRepo();
    markBase(dir);
    commit(dir, {
      "apps/web/src/pages/__tests__/dashboard.test.tsx": TEST_FILE,
      "apps/web/src/components/ui/__tests__/thing.test.tsx": TEST_FILE,
    });

    const { json } = run(dir, { SCAN_PATHS: "apps" });

    expect(json.testFiles).toEqual(["apps/web/src/components/ui/__tests__/thing.test.tsx"]);
    expect(json.skipped).toEqual([]);
  });
});

// ── D6.6 soft blocker: the Simplicity Check detector ─────────────────────────
//
// The detector's old regex was `/simpler than before\?[^\n]*([\s\S]{0,500})/i`.
// `[^\n]*` is greedy and ate the rest of the PROMPT LINE, so the capture group
// began at the newline and the ticked box / explicit `Y` / the answer itself
// were structurally invisible. Measured against three real inputs before the
// fix — every one of them FAIL, "no y/n/yes/no token":
//
//   repo template, box checked   (false positive: gate fires on a compliant PR)
//   template, hint removed       (same)
//   explicit 'Y - because...'    (the literal shape the check was written for)
//
// #388 hit the first case with a fully written Simplicity Check section.
//
// The template is the spec, so these fixtures are its exact lines.
const TEMPLATE_PROMPT_TICKED =
  "- [x] **Simpler than before?** (check if yes; if no, explain why in the Why field below)";
const TEMPLATE_PROMPT_UNTICKED =
  "- [ ] **Simpler than before?** (check if yes; if no, explain why in the Why field below)";
const TEMPLATE_WHY_PLACEHOLDER =
  "- **Why:** [1-2 sentences justifying any new exports / variants / tokens / dependencies]";
const REAL_WHY = "- **Why:** One shared definition replaces two divergent code paths.";

const section = (...body) =>
  ["# Pull Request", "", "## Simplicity Check (PRD-07 F4 Gate)", "", ...body, ""].join("\n");

/** A repo whose diff adds ONE in-scope CUSTOM file — the state that arms D6.6. */
function runWithBody(prBody) {
  const dir = makeRepo();
  markBase(dir);
  commit(dir, { "apps/web/src/components/ui/thing.tsx": CUSTOM });
  return run(dir, { SCAN_PATHS: "apps", PR_BODY: prBody });
}

describe("design-system-coverage — D6.6 Simplicity Check detector", () => {
  it("arms only when there is CUSTOM surface to justify", () => {
    const { json } = runWithBody("");
    expect(json.custom).toBe(1);
    expect(json.justified).toBe(false);
    expect(json.softBlocker).toBe(true);
  });

  it("accepts a ticked template checkbox with a filled-in Why", () => {
    const { json, report } = runWithBody(section(TEMPLATE_PROMPT_TICKED, REAL_WHY));
    expect(json.justified).toBe(true);
    expect(json.softBlocker).toBe(false);
    expect(report).not.toContain("WARN — design-system-coverage soft blocker");
  });

  it("rejects a ticked checkbox with no justification", () => {
    const { json } = runWithBody(section(TEMPLATE_PROMPT_TICKED));
    expect(json.justified).toBe(false);
    expect(json.softBlocker).toBe(true);
  });

  it("rejects a ticked checkbox whose Why is still the template placeholder", () => {
    const { json } = runWithBody(section(TEMPLATE_PROMPT_TICKED, TEMPLATE_WHY_PLACEHOLDER));
    expect(json.justified).toBe(false);
    expect(json.softBlocker).toBe(true);
  });

  // DELIBERATE: an UNTICKED box with a real Why passes. The template says
  // "check if yes; if no, explain why in the Why field below", and the D6.6
  // warning asks for a "Simpler than before? Y/N line with justification" —
  // so a considered "not simpler, and here is why" is a compliant answer.
  // Failing it would reject the template's own instructions and pressure
  // authors into ticking the box dishonestly.
  it("accepts an UNTICKED checkbox when the Why is genuinely filled in", () => {
    const { json } = runWithBody(
      section(
        TEMPLATE_PROMPT_UNTICKED,
        "- **Why:** Not simpler — this adds a fourth primitive, but it replaces four hand-rolled copies in consumer apps.",
      ),
    );
    expect(json.justified).toBe(true);
    expect(json.softBlocker).toBe(false);
  });

  // …and the case the gate exists for.
  it("rejects an UNTICKED checkbox with no justification", () => {
    const { json } = runWithBody(section(TEMPLATE_PROMPT_UNTICKED, TEMPLATE_WHY_PLACEHOLDER));
    expect(json.justified).toBe(false);
    expect(json.softBlocker).toBe(true);
  });

  it("accepts the freeform 'Simpler than before? Y - because…' shape", () => {
    const { json } = runWithBody(section("Simpler than before? Y - fewer exports than before."));
    expect(json.justified).toBe(true);
    expect(json.softBlocker).toBe(false);
  });

  it("accepts an explicit N with a reason", () => {
    const { json } = runWithBody(
      section("Simpler than before? N - one more export, but it deletes two consumer copies."),
    );
    expect(json.justified).toBe(true);
    expect(json.softBlocker).toBe(false);
  });

  it("rejects a bare answer with no reasoning", () => {
    const { json } = runWithBody(section("Simpler than before? Y"));
    expect(json.justified).toBe(false);
    expect(json.softBlocker).toBe(true);
  });

  it("rejects a body with no Simplicity Check at all", () => {
    const { json, report } = runWithBody("# Pull Request\n\n## Summary\n\nAdds a component.\n");
    expect(json.justified).toBe(false);
    expect(json.softBlocker).toBe(true);
    expect(report).toContain("WARN — design-system-coverage soft blocker");
  });

  // The false-negative half: the old detector passed whenever a standalone
  // "no"/"yes" happened to appear in nearby prose. A body with no prompt at
  // all must never pass, however much unrelated prose it contains.
  it("does not pass a body that merely contains the word 'no' somewhere", () => {
    const { json } = runWithBody(
      "# Pull Request\n\n## Summary\n\nNo behaviour change, no new exports, no migration needed.\n",
    );
    expect(json.justified).toBe(false);
    expect(json.softBlocker).toBe(true);
  });

  it("still accepts an RFC link instead of a Simplicity Check", () => {
    const { json } = runWithBody("# Pull Request\n\nTracked in RFC-123.\n");
    expect(json.justified).toBe(false);
    expect(json.rfcLinked).toBe(true);
    expect(json.softBlocker).toBe(false);
  });

  // Verbatim from https://github.com/marktiderman/genesis/pull/388 — the PR
  // that hit the false positive with a fully written Simplicity Check.
  it("accepts PR #388's real Simplicity Check section", () => {
    const { json } = runWithBody(
      section(
        "- [x] **Simpler than before?**",
        "- **Why:** Four capabilities that consuming apps currently hand-roll — badly — arrive behind one peer dependency the package will hold anyway, and each replaces code that is easy to write and easy to get silently wrong.",
      ),
    );
    expect(json.justified).toBe(true);
    expect(json.softBlocker).toBe(false);
  });
});
