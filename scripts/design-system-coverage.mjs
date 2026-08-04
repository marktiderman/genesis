#!/usr/bin/env node
/**
 * design-system-coverage.mjs
 *
 * PRD-07 Phase D6.3 + D6.6.
 *
 * For a given PR (diff against base), classify each UI primitive ADDED OR
 * MODIFIED (`--diff-filter=AM`) in any of the layer folders docs/FRAMEWORK.md
 * defines —
 *   `**\/components/{ui,patterns,layout,data}/**` (plus `composites/` for
 *   consumer apps)
 * and located under SCAN_PATHS, as:
 *   - GENESIS-SOURCED: file is a thin re-export of @marktiderman/genesis-*
 *     (matches `export * from "@marktiderman/genesis-*"` or single-default
 *     re-export shape).
 *   - GENESIS-EXTENDED: file imports a Genesis primitive AND wraps it
 *     (declares its own component on top).
 *   - CUSTOM: file imports nothing from @marktiderman/genesis-* and ships raw.
 *
 * coverage = (GENESIS-SOURCED + GENESIS-EXTENDED) / total
 *
 * D6.6 SOFT-BLOCKER LOGIC:
 *   When the PR is "additive" (adds new files in any of the layer folders
 *   above) AND the PR description does NOT contain either:
 *     (a) "Simpler than before? Y/N" (case-insensitive) plus a justification
 *     (b) An RFC link (matches `RFC-\d+`, `rfc/`, or a github issue link
 *         containing "rfc")
 *   …emit a WARN block in the report. The GitHub Action step uses this
 *   to leave a PR comment requiring reviewer override; this script never
 *   exits non-zero (informational only — true blocking lives in the
 *   reusable workflow's optional fail-on-warn step, off by default).
 *
 * Inputs (env, all optional — script degrades gracefully):
 *   - GITHUB_BASE_REF   The PR's base branch (e.g. `main`). Default `main`.
 *   - GITHUB_HEAD_REF   The PR's head branch. Default: current HEAD.
 *   - PR_BODY           The PR description (markdown). Default: empty.
 *   - SCAN_PATHS        Comma-separated paths (globs allowed) to scan.
 *                       Default: `apps`. Applied on BOTH the diff path and
 *                       the full-scan fallback — see SCAN_PATHS below.
 *
 * Output:
 *   - Markdown report on stdout (PR-comment ready).
 *   - `coverage/design-system-coverage.json` for downstream tooling.
 *   - `coverage/design-system-coverage.md` for the PR comment Action step.
 *
 * Exit codes:
 *   0 — always (informational; D6.6 soft blocker is enforced by the
 *       Action step posting a comment + requesting reviewer ack).
 *
 * Usage:
 *   node scripts/design-system-coverage.mjs
 *   pnpm coverage:design-system
 *
 * Wired into:
 *   .github/workflows/genesis-lint.yml design-system-coverage job.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const toPosix = (p) => p.split(path.sep).join('/');

// Paths inside which a new file represents a UI surface decision worth
// classifying. Other touched files (logic, hooks, tests) are ignored —
// they don't expand the design-system surface.
//
// The leaf folders are docs/FRAMEWORK.md's layers: primitives (`ui/`),
// patterns, layouts and data-bound. `composites/` is not a Genesis layer; it
// is the consumer-app extension folder PRD-07's usage doctrine names, and it
// stays for the apps already using it.
//
// This listed `ui|composites` only, which predated #384's layer split, so every
// component in `patterns/`, `layout/` and `data/` was invisible here — and,
// because the `!isUiSurface` branch used to `continue` silently, invisible in
// the report too. Measured on #393 (adds 5 components across `layout/` and
// `data/`) with those files fully inside SCAN_PATHS: `total: 0`, `coverage:
// 100`, "_No new UI primitives in this PR._". A coverage number that IMPROVES
// when components move into a folder it cannot see is worse than no number.
//
// `data/` IS included, deliberately. It is the one judgment call in this list:
// a data-bound component leans on TanStack Query and an adapter, so it is
// tempting to file it as logic. It is not — it renders, it is exported to
// consumers as UI, and it answers this gate's actual question the same way
// every other layer does (is it re-exported from Genesis, does it wrap Genesis,
// or is it raw?). `ResourceDetailPage` classifies as cleanly as `Button` does.
// Excluding it would also put the largest layer in genesis-ui (21 of 99
// component files at the time of writing) outside the denominator, which is the
// same coverage-by-omission this fix exists to stop.
const UI_PATH_RE = /\/(components|ui)\/(ui|composites|patterns|layout|data)\//;

// ── The general case: nothing component-shaped may vanish ────────────────────
//
// Widening the regex above fixes today's instance. It does not fix the shape of
// the bug, which is that "not a UI surface" and "not in scope" had different
// reporting contracts: a file outside SCAN_PATHS is NAMED (see
// excludedByScanPath), a file outside UI_PATH_RE was dropped in SILENCE. Both
// produce the identical "_No new UI primitives in this PR._", so the mitigation
// written to stop "narrowed" from looking like "clean" was bypassed by an
// earlier branch reaching the same output. The next layer folder someone
// invents would disappear exactly the same way.
//
// So a `.tsx`/`.jsx` one or more levels below a `components/` segment whose
// folder no rule matched is now reported as SKIPPED rather than dropped.
//
// NOISE CONTROL, which is the whole design problem here — a gate people ignore
// is the failure this exercise is about. Three bounds, in order of how much
// work they do:
//
//   1. The finding is a FOLDER, not a file. "components/experimental/ is
//      unknown to this gate" is one finding whether the PR touched 1 file in it
//      or 40. The human-readable note aggregates per folder, so its length is
//      O(distinct unmatched folders in the repo) — a stable handful — not
//      O(files changed).
//   2. It only fires INSIDE SCAN_PATHS. Outside that, the gate has not claimed
//      responsibility for the file, so there is nothing to report; that is what
//      SCAN_PATHS means. This is what keeps a monorepo's unrelated app folders
//      out of a genesis-ui report.
//   3. It is capped at 5 folders with a "…and N more", the same shape and cap
//      the SCAN_PATHS note already uses.
//
// It is also actionable in both directions and therefore finite: either the
// folder is a UI layer and belongs in UI_PATH_RE, or it is not and the note is
// the record that the gate looked rather than the record that it never did.
const COMPONENT_FOLDER_RE = /^(.*(?:^|\/)components\/[^/]+)\//;

// ── Tests are not design-system surface ──────────────────────────────────────
//
// A test file lives inside a layer folder, so it matches UI_PATH_RE. It imports
// the component it exercises and declares none of its own, which is exactly the
// CUSTOM shape — so every test written for a primitive LOWERED coverage, and
// enough of them arm the D6.6 soft blocker on a test-only PR. A gate that
// penalizes writing tests is worse than one that undercounts.
//
// This was already true for `components/ui/**` before the layer split (8 files
// in this repo today), but widening UI_PATH_RE tripled its reach — 11 more
// under `patterns/`, `layout/` and `data/` — and it corrupted this change's own
// headline measurement: 2 of the 7 files #393 "added to the UI surface" were
// its own test files. Closed here rather than filed, because the widening is
// what made it consequential.
//
// The boundary is DEFINITIONAL, not a scoping accident: a test does not ship as
// surface, the same way the `.ts` files this gate has always ignored do not.
// That is why it costs no report note — one on every test-touching PR is the
// noise that gets a gate ignored. It is recorded in the JSON (`testFiles`)
// instead, so the exclusion stays auditable and can never become invisible.
//
// ANCHORED ON BOTH SIDES, deliberately. `packages/ui/src/components/ui/
// aspect-ratio.tsx` contains the substring "spec" (a-**spec**-t), so a loose
// /spec/ would silently drop a real primitive — the exact failure class this
// file exists to stop, reintroduced by the fix for it. There is a test.
const TEST_FILE_RE = /(?:^|\/)__tests__\/|\.(?:test|spec)\.(?:tsx|jsx)$/;

const isTestFile = (relPath) => TEST_FILE_RE.test(toPosix(relPath));

// Genesis import marker. Anything from @marktiderman/genesis-* counts.
const GENESIS_IMPORT_RE = /from\s+['"]@marktiderman\/genesis-[a-z0-9-]+(\/[\w./-]*)?['"]/;

// Re-export shape: `export * from "@marktiderman/genesis-..."` or a single
// `export { Foo } from "@marktiderman/genesis-..."` with no other declarations.
const RE_EXPORT_RE = /^\s*export\s+(\*|\{[^}]+\})\s+from\s+['"]@marktiderman\/genesis-/;

// Component declaration markers — any one of these on a non-import line
// in a file that ALSO imports Genesis indicates Extended (wraps Genesis).
const COMPONENT_DECL_RE = /^\s*(export\s+)?(const|function|class)\s+[A-Z]/;

const baseRef = process.env.GITHUB_BASE_REF || 'main';
const prBody = process.env.PR_BODY || '';
const scanPathsEnv = process.env.SCAN_PATHS || 'apps';
const scanPaths = scanPathsEnv.split(',').map((s) => s.trim()).filter(Boolean);

// ── SCAN_PATHS ───────────────────────────────────────────────────────────────
//
// SCAN_PATHS names the surface this gate is responsible for. It is a CONTRACT,
// not a hint: genesis-lint.yml passes its `paths` input straight through, and
// self-lint.yml runs this same gate on GENESIS ITSELF with `paths: 'apps'`.
//
// It used to be honored in the full-scan fallback branch ONLY. On the diff
// branch every changed `.tsx` matching UI_PATH_RE was classified no matter
// where it lived — so genesis's own primitives in
// `packages/ui/src/components/ui/`, which cannot import `@marktiderman/
// genesis-*` because they ARE it, all fell through to CUSTOM and coverage on
// any genesis-ui PR was 0% BY CONSTRUCTION. Real instance: PR #382, a purely
// mechanical `@radix-ui/react-*` → `radix-ui` import rewrite that added zero
// files, was commented "Coverage: 0% (0 Genesis-aligned of 23 new UI files)".
// Every load-bearing word there was wrong — the files were out of scope, and
// they were modified, not new.
//
// Applying the filter on both branches makes the two agree and makes the
// number mean something. It must NOT, however, convert a real finding into
// silence: anything the filter drops is reported (see excludedByScanPath).

const escapeRe = (s) => s.replace(/[.+^${}()|[\]\\]/g, '\\$&');

// SCAN_PATHS entries are documented as globs — genesis-lint.yml's own consumer
// example passes `paths: 'apps/mobile/**'` — so a bare string-prefix test is
// not good enough here: against `apps/mobile/**` it would match nothing at all
// and hand every consumer using the documented form a fresh silent green.
// `**` spans directories, `*` spans one segment, and a trailing `/**` or `/*`
// means the same thing as naming the directory itself.
//
// Returns { spec, walkRoot, re }: `re` tests a repo-relative POSIX path,
// `walkRoot` is the deepest glob-free prefix, which is where the full-scan
// fallback starts walking (so both branches are driven by one definition).
function compileScanPath(spec) {
  const cleaned = toPosix(String(spec))
    .trim()
    .replace(/^\.\//, '')
    .replace(/\/+$/, '')
    .replace(/\/\*\*?$/, '');

  if (!cleaned || cleaned === '.' || cleaned === '*' || cleaned === '**') {
    return { spec, walkRoot: '', re: /^/ };
  }

  const segments = cleaned.split('/');

  // walkRoot is the deepest GLOB-FREE PREFIX, so it is always a superset of
  // what `re` can match — every match is anchored at `^` and must begin with
  // those literal segments. The two halves cannot disagree, in either
  // direction, as long as this stays a prefix of the pattern.
  const firstGlob = segments.findIndex((s) => s.includes('*'));
  const walkRoot = (firstGlob === -1 ? segments : segments.slice(0, firstGlob)).join('/');

  // `**` means ZERO OR MORE COMPLETE DIRECTORY SEGMENTS. Compiling it as `.*`
  // between two literal slashes — `apps/**/src` → `apps/.*/src` — quietly
  // drops the zero-segment case: it matches `apps/mobile/src/...` but NOT the
  // equally valid `apps/src/...`, so directly-nested UI files land outside
  // scope, coverage reads 100%, and the D6.6 soft blocker never fires. That is
  // the same silent-drop failure this whole file exists to stop (Codex P2 on
  // #383). The separator therefore belongs INSIDE the optional group, which is
  // why `**` is emitted as its own atom rather than joined with '/'.
  let body = '';
  let atStart = true; // nothing emitted yet that a following segment must be separated from
  for (const seg of segments) {
    if (seg === '**') {
      // Leading `**` swallows its TRAILING slash; anywhere else it swallows
      // its LEADING slash. Either way zero repetitions is a legal match, and
      // `[^/]+` per repetition keeps it from matching a partial segment
      // (`apps/**/src` must not match `appsfoo/src` or `apps/mobilesrc`).
      body += atStart ? '(?:[^/]+/)*' : '(?:/[^/]+)*';
      continue;
    }
    const literal = escapeRe(seg).replace(/\*/g, '[^/]*');
    body += atStart ? literal : `/${literal}`;
    atStart = false;
  }

  return { spec, walkRoot, re: new RegExp(`^${body}(?:/|$)`) };
}

// An empty SCAN_PATHS cannot sensibly mean "classify nothing" — that is a
// silent green by configuration, the same failure this file exists to stop.
// Treat it as "everything".
const scanMatchers = scanPaths.length > 0 ? scanPaths.map(compileScanPath) : [compileScanPath('')];

const inScanPaths = (relPath) => scanMatchers.some((m) => m.re.test(toPosix(relPath)));

// Set when the git commands below FAIL (as opposed to legitimately having no
// base, e.g. a local run on main). The full-scan fallback answers a different
// question than the diff does, so a failure that silently swaps one for the
// other has to be visible in the report rather than swallowed.
let diffContextError = null;

const firstLine = (v) => String(v || '').trim().split('\n')[0].trim();

// Diff against base. Falls back to "all UI files in scanPaths" when there
// is no git base (e.g. running locally on main).
//
// `--no-renames` is LOAD-BEARING, for two independent reasons:
//
//  1. PARTIAL CLONE. genesis-lint.yml checks this job out with
//     `filter: blob:none`. Rename detection compares blob CONTENTS, so on a
//     partial clone it triggers an on-demand promisor fetch of the base-side
//     blobs, and the whole diff hard-fails (exit 128, "could not fetch <oid>
//     from promisor remote") when that fetch fails. Reproduced: clone
//     --filter=blob:none, check out 1e56f68a, point origin at a dead URL, then
//     `git diff --name-only --diff-filter=AM 1e56f68a^ HEAD` exits 128 while
//     the same command with --no-renames exits 0 and fetches nothing. Only
//     ~2.5% of commits (5 of the last 200 on main) have both adds and deletes
//     and so reach rename detection at all, which is what makes this rare
//     enough to ship unnoticed.
//
//  2. CORRECTNESS, independent of clone type. A detected rename has status
//     `R`, which `--diff-filter=AM` drops. A UI primitive that arrives by
//     being MOVED into components/ui/ was therefore invisible to this gate on
//     a full clone too. With --no-renames it is reported as `A` and gets
//     classified.
//
// The output is a strict superset of the rename-detected form: across the
// last 200 commits on main the two differ on 2 commits, and every difference
// is a file appearing, never disappearing.
function getChangedFiles() {
  let mergeBase;
  try {
    mergeBase = execSync(`git merge-base origin/${baseRef} HEAD`, {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
      .toString()
      .trim();
  } catch (err) {
    // A missing base ref is the normal local-run case, so this stays a
    // fallback rather than a hard failure - but it is no longer silent.
    diffContextError = `git merge-base origin/${baseRef} HEAD failed: ${firstLine(err.stderr) || firstLine(err.message)}`;
    return null;
  }

  try {
    const out = execSync(`git diff --no-renames --name-only --diff-filter=AM ${mergeBase} HEAD`, {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return out
      .toString()
      .trim()
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  } catch (err) {
    diffContextError = `git diff against ${mergeBase} failed: ${firstLine(err.stderr) || firstLine(err.message)}`;
    return null;
  }
}

function* walk(dir) {
  if (!fs.existsSync(dir)) return;
  const stat = fs.statSync(dir);
  if (!stat.isDirectory()) {
    yield dir;
    return;
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

function classify(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  let importsGenesis = false;
  let isReExport = true; // start optimistic; downgrade if we see a non-trivial decl
  let hasGenesisReExport = false;
  let hasComponentDecl = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('//') || line.startsWith('*') || line.startsWith('/*')) continue;
    if (GENESIS_IMPORT_RE.test(line)) importsGenesis = true;
    if (RE_EXPORT_RE.test(line)) {
      hasGenesisReExport = true;
      continue;
    }
    if (COMPONENT_DECL_RE.test(line)) {
      hasComponentDecl = true;
      isReExport = false;
    }
    // Treat type aliases / interfaces as compatible with re-export shape.
    if (/^\s*(export\s+)?(type|interface)\s+/.test(line)) continue;
    // Bare `import` lines don't disqualify re-export shape.
    if (/^\s*import\s/.test(line)) continue;
    // Anything else is non-trivial code → not a re-export.
    if (line && !RE_EXPORT_RE.test(line) && !line.startsWith('export') && !line.startsWith('import')) {
      isReExport = false;
    }
  }

  if (hasGenesisReExport && isReExport && !hasComponentDecl) return 'GENESIS-SOURCED';
  if (importsGenesis && hasComponentDecl) return 'GENESIS-EXTENDED';
  return 'CUSTOM';
}

function isUiSurface(relPath) {
  return UI_PATH_RE.test('/' + toPosix(relPath));
}

// The `components/<folder>` prefix a path sits under, or null if it does not
// look like a component at all. Deepest `components/` segment wins, so a
// nested `packages/ui/src/components/experimental/sub/x.tsx` still reports the
// folder a human would act on. A file directly in `components/` has no folder
// and is not plausible — there is no layer there to have been missed.
function componentFolderOf(relPath) {
  const m = COMPONENT_FOLDER_RE.exec(toPosix(relPath));
  return m ? m[1] : null;
}

// ── D6.6 soft-blocker triggers ───────────────────────────────────────────────
//
// THE TEMPLATE IS THE SPEC. `.github/pull_request_template.md` is what authors
// are actually told to fill in, so it is what this has to be able to read:
//
//   - [ ] **Simpler than before?** (check if yes; if no, explain why in the Why field below)
//   - **Why:** [1-2 sentences justifying any new exports / variants / tokens / dependencies]
//
// The previous detector could not read that — or anything else. Its regex was
//
//   /simpler than before\?[^\n]*([\s\S]{0,500})/i
//
// where `[^\n]*` is greedy and eats the REST OF THE PROMPT LINE, so the capture
// group always began at the newline. Everything written ON the prompt line —
// the ticked box, an explicit `Y`, the answer itself — was structurally
// invisible, and the `\b(y|n|yes|no)\b` test that followed only ever examined
// LATER lines. Measured against three real inputs:
//
//   repo template, box checked  -> FAIL: no y/n/yes/no token
//   template, hint removed      -> FAIL: no y/n/yes/no token
//   explicit 'Y - because...'   -> FAIL: no y/n/yes/no token
//
// The third is the damning one: the literal `Simpler than before? Y - fewer
// exports than before.` shape the check was written for failed, because the
// capture group was the single character "\n". So the gate false-positived on
// every PR that followed the template (#388 hit this with a fully written
// Simplicity Check), and false-negatived whenever unrelated prose on a later
// line happened to contain a standalone "no" or "yes" — which is common. A
// soft blocker that fires on correct PRs trains everyone to ignore it, which
// is worse than not having the gate at all.

const SIMPLER_PROMPT_RE = /simpler than before/i;
const SIMPLER_PROMPT_TEXT = 'simpler than before';
const TICKED_BOX_RE = /^\s*[-*+]?\s*\[[xX]\]/;
const UNTICKED_BOX_RE = /^\s*[-*+]?\s*\[\s*\]/;
const WHY_FIELD_RE = /^\s*[-*+]?\s*[*_]*\s*why\b[*_]*\s*:?\s*(.*)$/i;

const stripEmphasis = (s) => s.replace(/[*_`]+/g, ' ').trim();

// `[1-2 sentences justifying …]` — the template's own placeholder. Shipping it
// back untouched is not an answer.
const isPlaceholder = (s) => /^\[[^\]]*\]$/.test(s.trim());

// Same measure the original used: drop the answer token and separators, then
// require real characters to be left over. A bare "Y" is not a reason.
const proseLength = (s) =>
  s.replace(/\b(y|n|yes|no)\b/gi, '').replace(/[\s.,;:|/\\()[\]*_`?—–-]+/g, '').length;

function hasSimplificationJustification(body) {
  const lines = String(body || '').split('\n');
  const promptIdx = lines.findIndex((l) => SIMPLER_PROMPT_RE.test(l));
  if (promptIdx === -1) return false;

  const promptLine = lines[promptIdx];

  // AN ANSWER WAS GIVEN. A checkbox in EITHER state counts, because the
  // template itself offers the negative path — "if no, explain why in the Why
  // field below". A considered "not simpler, and here is why" is a compliant
  // answer, and the D6.6 warning text asks for exactly that: a "Simpler than
  // before? Y/N line WITH justification". Requiring the box to be ticked would
  // reject the template's own instructions and quietly pressure authors into
  // ticking it dishonestly. The justification rule below is what has teeth:
  // an unticked box with nothing written still fails.
  const hasCheckbox = TICKED_BOX_RE.test(promptLine) || UNTICKED_BOX_RE.test(promptLine);

  // The template's parenthetical hint contains BOTH "yes" and "no", so it has
  // to come out before looking for a written-out answer — otherwise every
  // unfilled template looks like it carries one.
  const tail = promptLine
    .slice(promptLine.search(SIMPLER_PROMPT_RE) + SIMPLER_PROMPT_TEXT.length)
    .replace(/\([^)]*\)/g, ' ');
  const explicitAnswer = /^[\s?*_:—–-]*\b(y|n|yes|no)\b/i.test(tail);

  if (!hasCheckbox && !explicitAnswer) return false;

  // A JUSTIFICATION EXISTS. Prefer the template's `Why:` field; fall back to
  // whatever prose is left on the prompt line itself, which is the freeform
  // `Simpler than before? Y - because …` shape.
  let whyValue = '';
  for (let i = promptIdx + 1; i < lines.length; i += 1) {
    if (/^\s*#{1,6}\s/.test(lines[i])) break; // next section — stop looking
    const m = lines[i].match(WHY_FIELD_RE);
    if (!m) continue;
    whyValue = m[1];
    // Wrapped prose continues until a blank line or the next list item.
    for (let j = i + 1; j < lines.length; j += 1) {
      if (!lines[j].trim()) break;
      if (/^\s*([-*+]\s|#{1,6}\s)/.test(lines[j])) break;
      whyValue += ` ${lines[j]}`;
    }
    break;
  }

  const whyProse = isPlaceholder(stripEmphasis(whyValue)) ? 0 : proseLength(whyValue);
  return Math.max(whyProse, proseLength(tail)) >= 10;
}

function hasRfcLink(body) {
  return /\bRFC-\d+\b/i.test(body) || /\/rfc\//i.test(body) || /(issues|pull)\/\d+[^\n]*rfc/i.test(body);
}

const changedFiles = getChangedFiles();
const usedFallback = !(changedFiles && changedFiles.length > 0);
const filesToClassify = [];

// UI-surface files this PR touched that SCAN_PATHS puts out of scope. Kept
// (not discarded) so the report can name them — a gate that quietly drops
// files is the same class of bug as a gate that quietly scores the wrong ones.
const excludedByScanPath = [];

// Component-shaped files INSIDE scope that matched no layer rule. See
// COMPONENT_FOLDER_RE — this is the same "name the drop" contract
// excludedByScanPath provides, applied to the branch that used to `continue`.
const skippedUnmatched = [];

// UI-surface-shaped files excluded for being tests. Not reported in the
// markdown — see TEST_FILE_RE — but kept so the JSON can show its work.
const testFiles = [];

// Both branches answer the same four questions in the same order, so the diff
// branch and the full-scan fallback cannot disagree about which bucket a file
// lands in. Exactly one bucket per file:
//   in scope + UI layer   -> classify
//   out of scope + UI layer -> excludedByScanPath (named)
//   in scope + component-shaped, no layer matched -> skippedUnmatched (named)
//   otherwise             -> not this gate's file
function triage(rel) {
  // Tests first, and regardless of scope, so both buckets agree about what
  // surface means. Only tests that WOULD have been surface are recorded —
  // that is exactly the set whose exclusion moves the number.
  if (isTestFile(rel)) return isUiSurface(rel) ? 'test' : 'ignore';
  if (isUiSurface(rel)) return inScanPaths(rel) ? 'classify' : 'excluded';
  if (inScanPaths(rel) && componentFolderOf(rel)) return 'skipped';
  return 'ignore';
}

if (changedFiles && changedFiles.length > 0) {
  for (const f of changedFiles) {
    if (!/\.(tsx|jsx)$/.test(f)) continue;
    const rel = toPosix(f);
    const abs = path.join(REPO_ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    const bucket = triage(rel);
    if (bucket === 'excluded') excludedByScanPath.push(rel);
    else if (bucket === 'skipped') skippedUnmatched.push(rel);
    else if (bucket === 'test') testFiles.push(rel);
    else if (bucket === 'classify') filesToClassify.push({ rel, abs });
  }
} else {
  // Full-scan fallback (local run / no git context). Same scan-path
  // definition as the diff branch above — walk each matcher's glob-free
  // prefix, then filter with the matcher itself.
  const seen = new Set();
  for (const { walkRoot } of scanMatchers) {
    for (const f of walk(path.join(REPO_ROOT, walkRoot))) {
      if (!/\.(tsx|jsx)$/.test(f)) continue;
      const rel = toPosix(path.relative(REPO_ROOT, f));
      if (seen.has(rel)) continue;
      const bucket = triage(rel);
      // `excluded` DOES occur here — the walk starts at a matcher's glob-free
      // prefix, which is a superset of what the matcher accepts — but it is
      // deliberately not recorded: the fallback has no diff, so there is no
      // "this PR touched it and we dropped it" to report. Unchanged behavior.
      if (bucket === 'ignore' || bucket === 'excluded') continue;
      seen.add(rel);
      if (bucket === 'skipped') skippedUnmatched.push(rel);
      else if (bucket === 'test') testFiles.push(rel);
      else filesToClassify.push({ rel, abs: f });
    }
  }
}

const excludedCount = excludedByScanPath.length;
const skippedCount = skippedUnmatched.length;

// One entry per unmatched folder, in first-seen order, with the files under it.
// The finding is the folder; the file count is how much rode on it.
const skippedFolders = [];
const skippedByFolder = new Map();
for (const rel of skippedUnmatched) {
  const folder = componentFolderOf(rel);
  if (!skippedByFolder.has(folder)) {
    skippedByFolder.set(folder, []);
    skippedFolders.push(folder);
  }
  skippedByFolder.get(folder).push(rel);
}

const tally = { 'GENESIS-SOURCED': [], 'GENESIS-EXTENDED': [], CUSTOM: [] };
for (const { rel, abs } of filesToClassify) {
  const klass = classify(abs);
  tally[klass].push(rel);
}

const total = filesToClassify.length;
const sourced = tally['GENESIS-SOURCED'].length;
const extended = tally['GENESIS-EXTENDED'].length;
const custom = tally['CUSTOM'].length;
const coverage = total === 0 ? 100 : Math.round(((sourced + extended) / total) * 1000) / 10;

// D6.6: additive PR + missing justification + missing RFC link → WARN.
const isAdditive = total > 0 && (sourced + extended + custom) > 0;
const justified = hasSimplificationJustification(prBody);
const rfcLinked = hasRfcLink(prBody);
const softBlocker = isAdditive && custom > 0 && !justified && !rfcLinked;

// Markdown report. Designed to be the body of a PR comment (D6.6 step).
const reportLines = [];
reportLines.push('## Genesis Design-System Coverage');
reportLines.push('');

// A git failure silently swaps "the files this PR changed" for "every UI file
// under SCAN_PATHS". In genesis itself SCAN_PATHS=apps holds zero UI files, so
// that swap turns any real finding into "_No new UI primitives in this PR._"
// and still exits 0 - a green check indistinguishable from a clean PR. Say so,
// loudly, in the comment body itself.
if (diffContextError && usedFallback) {
  reportLines.push('> **WARNING - no diff context; this is NOT a diff of your PR.**');
  reportLines.push('>');
  reportLines.push(`> The numbers below are a full scan of \`${scanPathsEnv}\`, because:`);
  reportLines.push('>');
  reportLines.push(`> \`${diffContextError}\``);
  reportLines.push('>');
  reportLines.push('> Treat this report as unreliable until that is fixed.');
  reportLines.push('');
}

// SCAN_PATHS legitimately narrows this gate, but "narrowed" and "clean" must
// never look the same. Without this block, a genesis-ui-only PR (every file
// outside SCAN_PATHS=apps) reads exactly like a PR that touched no UI at all —
// "_No new UI primitives in this PR._" and a green check. Name the drop.
if (excludedCount > 0) {
  const shown = excludedByScanPath.slice(0, 5);
  reportLines.push(
    `> **NOTE — ${excludedCount} changed UI file(s) NOT classified: outside SCAN_PATHS.**`,
  );
  reportLines.push('>');
  reportLines.push(
    `> This gate scores \`${scanPathsEnv}\`. The following UI-surface files were added or modified by this PR but fall outside that scope, so they are absent from the numbers below:`,
  );
  reportLines.push('>');
  for (const rel of shown) reportLines.push(`> - \`${rel}\``);
  if (excludedCount > shown.length) {
    reportLines.push(`> - _…and ${excludedCount - shown.length} more._`);
  }
  reportLines.push('');
}

// The general guard (see COMPONENT_FOLDER_RE). Sits ABOVE the total block for
// the same reason the SCAN_PATHS note does: a PR whose only component files
// were skipped must not be able to read as clean.
if (skippedCount > 0) {
  const shown = skippedFolders.slice(0, 5);
  reportLines.push(
    `> **NOTE — ${skippedCount} component-shaped file(s) in ${skippedFolders.length} folder(s) this gate does not recognize as a UI layer.**`,
  );
  reportLines.push('>');
  reportLines.push(
    '> These are inside `' +
      scanPathsEnv +
      '`, so they are in scope, but they sit under a `components/` folder that is not one of `ui`, `composites`, `patterns`, `layout` or `data`. They are absent from the numbers below. If one of these is a UI layer, add it to `UI_PATH_RE` in `scripts/design-system-coverage.mjs`:',
  );
  reportLines.push('>');
  for (const folder of shown) {
    const files = skippedByFolder.get(folder);
    reportLines.push(`> - \`${folder}/\` — ${files.length} file(s), e.g. \`${files[0]}\``);
  }
  if (skippedFolders.length > shown.length) {
    reportLines.push(`> - _…and ${skippedFolders.length - shown.length} more folder(s)._`);
  }
  reportLines.push('');
}

if (total === 0) {
  reportLines.push('_No new UI primitives in this PR._');
} else {
  reportLines.push(
    `**Coverage: ${coverage}%** (${sourced + extended} Genesis-aligned of ${total} added or modified UI files)`,
  );
  reportLines.push('');
  reportLines.push(`| Class | Count | Files |`);
  reportLines.push(`| --- | ---: | --- |`);
  reportLines.push(`| GENESIS-SOURCED | ${sourced} | ${tally['GENESIS-SOURCED'].slice(0, 5).join(', ') || '_none_'} |`);
  reportLines.push(`| GENESIS-EXTENDED | ${extended} | ${tally['GENESIS-EXTENDED'].slice(0, 5).join(', ') || '_none_'} |`);
  reportLines.push(`| CUSTOM | ${custom} | ${tally['CUSTOM'].slice(0, 5).join(', ') || '_none_'} |`);
}

if (softBlocker) {
  reportLines.push('');
  reportLines.push('### WARN — design-system-coverage soft blocker (D6.6)');
  reportLines.push('');
  reportLines.push(
    'This PR adds or modifies CUSTOM UI surface area but the PR description does not include:',
  );
  reportLines.push('- A "Simpler than before? Y/N" line with justification, **OR**');
  reportLines.push('- A link to an RFC (e.g. `RFC-123`).');
  reportLines.push('');
  reportLines.push('Per Phase F4, additive surface-area changes need either a clear');
  reportLines.push('simplification rationale or a tracked RFC. Add one of those to');
  reportLines.push('the PR description, or get a reviewer to ack the override.');
}

const report = reportLines.join('\n');
console.log(report);

// Annotate the job too. The step still exits 0 (this gate is informational by
// contract), but the failure must not be invisible in the log either.
//
// ON STDOUT, NOT STDERR (CodeRabbit CMT-383-001). GitHub documents workflow
// commands as being read from a step's STDOUT; these were on stderr, which
// means neither the pre-existing `::warning::` nor the new `::notice::` was
// reliably rendering as an annotation. An invisible warning is the exact
// failure class this change exists to remove, so both moved rather than only
// the new one. Safe: the PR-comment step reads coverage/design-system-
// coverage.md, not this stream, so nothing downstream consumes stdout.
if (diffContextError && usedFallback) {
  console.log(
    `::warning::design-system-coverage has no diff context - reporting a full scan of ${scanPathsEnv} instead of this PR's changes. ${diffContextError}`,
  );
}

// Same reasoning as the report block: an out-of-scope drop is expected, but it
// must not be invisible in the job log either.
if (excludedCount > 0) {
  const shown = excludedByScanPath.slice(0, 5).join(', ');
  const more = excludedCount > 5 ? `, +${excludedCount - 5} more` : '';
  console.log(
    `::notice::design-system-coverage did not classify ${excludedCount} changed UI file(s) outside SCAN_PATHS=${scanPathsEnv}: ${shown}${more}`,
  );
}

// …and the same for the folders no layer rule matched. One line, folders not
// files, so a 40-file PR in one unknown folder is still one line.
if (skippedCount > 0) {
  const shown = skippedFolders.slice(0, 5).join(', ');
  const more = skippedFolders.length > 5 ? `, +${skippedFolders.length - 5} more` : '';
  console.log(
    `::notice::design-system-coverage skipped ${skippedCount} component-shaped file(s) in folder(s) it does not recognize as a UI layer: ${shown}${more}`,
  );
}

const reportDir = path.join(REPO_ROOT, 'coverage');
fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(
  path.join(reportDir, 'design-system-coverage.json'),
  JSON.stringify(
    {
      total,
      sourced,
      extended,
      custom,
      coverage,
      tally,
      scanPaths: scanPathsEnv,
      excludedCount,
      excluded: excludedByScanPath,
      // Uncapped here — the cap is a readability measure for humans, not a
      // limit on what downstream tooling gets to see.
      skippedCount,
      skipped: skippedUnmatched,
      skippedFolders,
      // Not in the markdown by design (see TEST_FILE_RE); auditable here.
      testFileCount: testFiles.length,
      testFiles,
      softBlocker,
      justified,
      rfcLinked,
      usedFallback,
      diffContextError,
      report,
    },
    null,
    2,
  ),
);

fs.writeFileSync(path.join(reportDir, 'design-system-coverage.md'), report + '\n');

// Always exit 0 — this is informational; D6.6 enforcement is the comment
// + reviewer override, not an auto-fail.
process.exit(0);
