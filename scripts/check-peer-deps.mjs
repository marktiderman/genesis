#!/usr/bin/env node
/**
 * check-peer-deps.mjs
 *
 * PRD-07 Phase D6.2c enforcement guard. Fails CI when a consumer in the
 * workspace declares a Genesis dep but pins peer dependencies (react-native,
 * nativewind, etc.) outside Genesis's supported range.
 *
 * Why: Genesis publishes wide peer-dep ranges (e.g. nativewind 4 OR 5
 * preview) so consumers can move at their own pace. But if a consumer
 * pins below the supported floor, the resolved tree may render but break
 * at runtime in subtle ways (RN architecture flags, NativeWind v4→v5 API
 * differences). This guard catches the divergence before merge.
 *
 * What it checks (per consumer in apps/*\/package.json):
 *   1. `nativewind` declared range satisfies one of the Genesis-supported
 *      ranges (default: ^4.0.0 || ^5.0.0-preview).
 *   2. `react-native` is at least the Genesis minimum (default >=0.76.0).
 *   3. Every `@marktiderman/genesis-*` dep is `workspace:*`, `workspace:^`, or
 *      a published semver — never a wildcard or git URL.
 *
 * Reads ground truth from packages/ui-native/package.json so this script
 * stays in sync with whatever Genesis actually ships, instead of hard-
 * coding the supported version table here.
 *
 * Exit codes:
 *   0 — clean.
 *   1 — at least one violation. Prints all of them with consumer name.
 *
 * Usage:
 *   node scripts/check-peer-deps.mjs
 *   pnpm check:peer-deps
 *
 * Wired into:
 *   .github/workflows/genesis-lint.yml peer-deps job.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const toPosix = (p) => p.split(path.sep).join('/');

// Read Genesis-supported peer ranges from packages/ui-native/package.json
// so this script stays in sync with the source of truth instead of
// hard-coding versions.
function readGenesisPeerSpec() {
  const uiNativePkg = path.join(REPO_ROOT, 'packages/ui-native/package.json');
  if (!fs.existsSync(uiNativePkg)) {
    return null;
  }
  const json = JSON.parse(fs.readFileSync(uiNativePkg, 'utf8'));
  return json.peerDependencies ?? {};
}

// Lightweight semver helpers. We only need:
//   - Parse `^X.Y.Z`, `>=X.Y.Z`, `X.Y.Z`, `workspace:*`, `workspace:^`.
//   - Compare two ranges for "loosely overlaps" — used to decide whether a
//     consumer's declared range is compatible with Genesis's published
//     range. Full semver-range intersection logic is out of scope; we
//     accept the small set of patterns the workspace actually uses.
function parseSimpleRange(range) {
  if (!range || typeof range !== 'string') return null;
  if (range.startsWith('workspace:')) return { kind: 'workspace' };
  // "^4.0.0 || ^5.0.0-preview" → array of alternates.
  const parts = range.split('||').map((p) => p.trim()).filter(Boolean);
  const alts = [];
  for (const part of parts) {
    const m = part.match(/^([\^~>=<]*)(\d+)\.(\d+)\.(\d+)(?:-([\w.-]+))?/);
    if (!m) continue;
    const [, op, maj, min, pat, pre] = m;
    alts.push({
      op: op || '=',
      major: Number(maj),
      minor: Number(min),
      patch: Number(pat),
      pre: pre || null,
    });
  }
  return alts.length ? { kind: 'semver', alts } : null;
}

// Does the consumer's declared range have any alternate whose major version
// matches one of the Genesis-supported alternates? This is the cheap
// "loosely overlaps" approximation — it catches the real failure modes
// (consumer on RN 0.74 when Genesis requires >=0.76; consumer on
// nativewind 3 when Genesis is 4 or 5) without pulling in node-semver as
// a runtime dep.
function rangesOverlapByMajor(consumerRange, genesisRange) {
  const consumer = parseSimpleRange(consumerRange);
  const genesis = parseSimpleRange(genesisRange);
  if (!consumer || !genesis) return true; // unknown shape — don't fail closed
  if (consumer.kind === 'workspace') return true;
  if (genesis.kind === 'workspace') return true;

  for (const cAlt of consumer.alts) {
    for (const gAlt of genesis.alts) {
      if (cAlt.major === gAlt.major) return true;
      if (gAlt.op === '>=' && cAlt.major >= gAlt.major) return true;
    }
  }
  return false;
}

// Floor check for `>=X.Y.Z`-style genesis ranges. Returns true if the
// consumer's lowest possible version is >= the genesis floor.
function meetsFloor(consumerRange, genesisRange) {
  const genesis = parseSimpleRange(genesisRange);
  const consumer = parseSimpleRange(consumerRange);
  if (!genesis || genesis.kind !== 'semver') return true;
  if (!consumer || consumer.kind !== 'semver') return true;
  const floor = genesis.alts.find((a) => a.op === '>=' || a.op === '');
  if (!floor) return true;
  const consumerFloor = consumer.alts.reduce((acc, a) => {
    if (!acc) return a;
    if (a.major < acc.major) return a;
    if (a.major === acc.major && a.minor < acc.minor) return a;
    if (a.major === acc.major && a.minor === acc.minor && a.patch < acc.patch) return a;
    return acc;
  }, null);
  if (!consumerFloor) return true;
  if (consumerFloor.major > floor.major) return true;
  if (consumerFloor.major < floor.major) return false;
  if (consumerFloor.minor > floor.minor) return true;
  if (consumerFloor.minor < floor.minor) return false;
  return consumerFloor.patch >= floor.patch;
}

function findConsumers() {
  const appsDir = path.join(REPO_ROOT, 'apps');
  if (!fs.existsSync(appsDir)) return [];
  return fs
    .readdirSync(appsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(appsDir, e.name, 'package.json'))
    .filter((p) => fs.existsSync(p));
}

function consumerDependsOnGenesis(pkg) {
  const all = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  return Object.keys(all).some((name) => name.startsWith('@marktiderman/genesis-'));
}

const violations = [];
const peerSpec = readGenesisPeerSpec();

if (!peerSpec) {
  console.error('FAIL Could not read packages/ui-native/package.json. Cannot determine Genesis peer ranges.');
  process.exit(1);
}

const supportedNativewind = peerSpec.nativewind;
const supportedReactNative = peerSpec['react-native'];

for (const pkgPath of findConsumers()) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const rel = toPosix(path.relative(REPO_ROOT, pkgPath));
  if (!consumerDependsOnGenesis(pkg)) continue; // skip apps that don't use Genesis

  const allDeps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };

  // 1. nativewind must overlap Genesis's range.
  if (allDeps.nativewind && supportedNativewind) {
    if (!rangesOverlapByMajor(allDeps.nativewind, supportedNativewind)) {
      violations.push({
        consumer: pkg.name ?? rel,
        file: rel,
        message: `nativewind ${allDeps.nativewind} does not overlap Genesis-supported range ${supportedNativewind}`,
      });
    }
  }

  // 2. react-native must meet the Genesis floor.
  if (allDeps['react-native'] && supportedReactNative) {
    if (!meetsFloor(allDeps['react-native'], supportedReactNative)) {
      violations.push({
        consumer: pkg.name ?? rel,
        file: rel,
        message: `react-native ${allDeps['react-native']} below Genesis floor ${supportedReactNative}`,
      });
    }
  }

  // 3. @marktiderman/genesis-* must use workspace:* / workspace:^ / explicit semver.
  for (const [name, range] of Object.entries(allDeps)) {
    if (!name.startsWith('@marktiderman/genesis-')) continue;
    if (
      typeof range !== 'string' ||
      range === '*' ||
      ['git+', 'http', 'file:', 'link:'].some((prefix) => range.startsWith(prefix))
    ) {
      violations.push({
        consumer: pkg.name ?? rel,
        file: rel,
        message: `${name}@${range} should be 'workspace:*', 'workspace:^', or a semver — wildcards/git URLs/file:/link: forbidden`,
      });
    }
  }
}

if (violations.length === 0) {
  console.log('OK Peer-dep compliance: all consumers within Genesis-supported ranges.');
  process.exit(0);
}

console.error(`FAIL Found ${violations.length} peer-dep violation(s):`);
console.error();
for (const v of violations) {
  console.error(`  ${v.file} (${v.consumer})`);
  console.error(`    ${v.message}`);
}
console.error();
console.error(`Genesis-supported peer ranges (from packages/ui-native/package.json):`);
console.error(`  nativewind:    ${supportedNativewind}`);
console.error(`  react-native:  ${supportedReactNative}`);
console.error('Update consumer package.json to fall within these ranges, or');
console.error('open an RFC against packages/ui-native peerDependencies if a');
console.error('consumer genuinely needs a different supported set.');
process.exit(1);
