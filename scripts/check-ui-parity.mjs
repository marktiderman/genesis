#!/usr/bin/env node
/**
 * check-ui-parity.mjs
 *
 * Every genesis-ui component should have a genesis-ui-native twin, and the reverse, or the gap
 * should be written down with a reason. A screen that works on the web and has no phone
 * counterpart (or the other way round) is found here, in CI, instead of by an app halfway
 * through a build.
 *
 * Which components count: the visual components check-code-connect.mjs finds in each package
 * (it owns the rules for sub-parts, hooks, providers and constants), plus each package's data
 * layer, which code-connect leaves out: ResourceView and RecordView on the web,
 * NativeResourceView and NativeRecordView on the phone.
 *
 * What a twin is: web `X` and native `NativeX`, or the same name on both (the page layouts),
 * unless ui-parity.json says otherwise:
 *   - `twins`: web name → native name, for twins whose names differ
 *     (`"AlertDialog": "NativeAlert"`);
 *   - `webOnly`, `nativeOnly`: name → reason. A reason either says why the component is
 *     platform-shaped (a pointer-only menu, the phone's pull to refresh), or starts with
 *     `notYet:` and names the gap, which a twin closes later.
 *
 * It's a ratchet, like check-code-connect: today's gaps are recorded, a new one fails, and an
 * entry that stops being true (the twin now exists, the component is gone) fails too, so the
 * file only shrinks.
 *
 * Exit codes:
 *   0 — every component has a twin or a recorded reason, and every entry is still true.
 *   1 — an unrecorded gap, a stale entry, an empty reason, or a name listed twice.
 *   2 — usage error.
 *
 * Usage:
 *   node scripts/check-ui-parity.mjs              # repo root
 *   node scripts/check-ui-parity.mjs --list       # every component, with its twin or reason
 *   node scripts/check-ui-parity.mjs --root <dir> # another checkout, or a test fixture
 *   pnpm check:ui-parity
 *
 * Wired into: package.json `lint:genesis`, which CI runs.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PACKAGES, componentsFromIndex, discoverComponents, exportStatements } from "./check-code-connect.mjs";

export const PARITY_FILE = "ui-parity.json";

/** Each package's data layer: the view components code-connect's visual list leaves out. */
export const DATA_INDEXES = {
  web: ["packages/ui/src/components/data/resource-view/index.ts"],
  native: ["packages/ui-native/src/data/index.ts", "packages/ui-native/src/data/resource-view/index.ts"],
};

/** Data-layer exports that are a screen's parts, not components of their own. */
const DATA_SUBPARTS = new Set([
  "RowAvatar",
  "RelativeTime",
  "NativeResourceFormFieldRenderer",
  "NativeRecordViewMenu",
  "NativeResourceWorkspaceMenu",
]);

const isPascal = (name) => /^[A-Z][a-z][A-Za-z0-9]*$/.test(name); // as check-code-connect: no ALL_CAPS
const isHookOrProvider = (name) => /^use[A-Z]/.test(name) || /Provider$/.test(name);

/** The web data layer's components: PascalCase value exports that aren't parts or providers. */
export function webDataComponents(sources) {
  const out = new Set();
  for (const source of sources) {
    for (const names of exportStatements(source)) {
      for (const name of names) if (isPascal(name) && !isHookOrProvider(name) && !DATA_SUBPARTS.has(name)) out.add(name);
    }
  }
  return [...out];
}

/** The native data layer's components: Native* exports, minus sub-parts. */
export function nativeDataComponents(sources) {
  return [...new Set(sources.flatMap((source) => componentsFromIndex(source)))].filter((n) => !DATA_SUBPARTS.has(n));
}

/** Both packages' components, each once, in export order. */
export function discover(root) {
  const read = (rel) => {
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) throw new Error(`${rel} is missing`);
    return fs.readFileSync(file, "utf8");
  };
  const pkg = (name) => PACKAGES.find((p) => p.name === name);
  const web = new Set([...discoverComponents(root, pkg("ui")), ...webDataComponents(DATA_INDEXES.web.map(read))]);
  const native = new Set([...discoverComponents(root, pkg("ui-native")), ...nativeDataComponents(DATA_INDEXES.native.map(read))]);
  return { web: [...web], native: [...native] };
}

export function readParity(root) {
  const file = path.join(root, PARITY_FILE);
  if (!fs.existsSync(file)) throw new Error(`${PARITY_FILE} is missing: {"twins": {}, "webOnly": {}, "nativeOnly": {}}`);
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const key of ["twins", "webOnly", "nativeOnly"]) {
    const value = json[key] ?? {};
    if (typeof value !== "object" || Array.isArray(value) || Object.values(value).some((v) => typeof v !== "string")) {
      throw new Error(`${PARITY_FILE}: "${key}" must be an object of name → string`);
    }
  }
  return { twins: json.twins ?? {}, webOnly: json.webOnly ?? {}, nativeOnly: json.nativeOnly ?? {} };
}

/**
 * The whole check: { pairs, webOnly, nativeOnly, failures }. `pairs` maps each web component to
 * its twin; `failures` are the lines that make the check exit 1.
 */
export function checkUiParity(root, components = discover(root), parity = readParity(root)) {
  const web = new Set(components.web);
  const native = new Set(components.native);
  const failures = [];

  // Twins named in the file must both exist, and each native component may be the twin of one web one.
  const claimed = new Map();
  for (const [w, n] of Object.entries(parity.twins)) {
    if (!web.has(w)) failures.push(`twins: "${w}" isn't a genesis-ui component (any more?): remove the entry`);
    if (!native.has(n)) failures.push(`twins: "${w}" → "${n}", which isn't a genesis-ui-native component: fix or remove the entry`);
    if (claimed.has(n)) failures.push(`twins: "${n}" is the twin of both "${claimed.get(n)}" and "${w}"`);
    claimed.set(n, w);
  }

  const twinOf = (w) => {
    if (Object.hasOwn(parity.twins, w)) return native.has(parity.twins[w]) ? parity.twins[w] : null;
    for (const candidate of [`Native${w}`, w]) if (native.has(candidate) && !claimed.has(candidate)) return candidate;
    return null;
  };
  const pairs = new Map();
  for (const w of web) {
    const n = twinOf(w);
    if (n) pairs.set(w, n);
  }
  const paired = new Set(pairs.values());

  const checkList = (key, list, have, isPaired, label) => {
    for (const [name, reason] of Object.entries(list)) {
      if (!have.has(name)) failures.push(`${key}: "${name}" isn't a ${label} component (any more?): remove the entry`);
      else if (isPaired(name)) failures.push(`${key}: "${name}" has a twin now: remove the entry`);
      if (!reason.trim()) failures.push(`${key}: "${name}" needs a reason`);
    }
  };
  checkList("webOnly", parity.webOnly, web, (w) => pairs.has(w), "genesis-ui");
  checkList("nativeOnly", parity.nativeOnly, native, (n) => paired.has(n), "genesis-ui-native");
  for (const name of Object.keys(parity.twins)) {
    if (Object.hasOwn(parity.webOnly, name)) failures.push(`"${name}" is in both twins and webOnly`);
  }
  for (const name of Object.values(parity.twins)) {
    if (Object.hasOwn(parity.nativeOnly, name)) failures.push(`"${name}" is in both twins and nativeOnly`);
  }

  const webOnly = [...web].filter((w) => !pairs.has(w));
  const nativeOnly = [...native].filter((n) => !paired.has(n));
  for (const w of webOnly) {
    if (!Object.hasOwn(parity.webOnly, w)) {
      failures.push(`genesis-ui's ${w} has no genesis-ui-native twin: build Native${w}, map it in "twins", or add it to "webOnly" with a reason`);
    }
  }
  for (const n of nativeOnly) {
    if (!Object.hasOwn(parity.nativeOnly, n)) {
      failures.push(`genesis-ui-native's ${n} has no genesis-ui twin: build ${n.replace(/^Native/, "")}, map it in "twins", or add it to "nativeOnly" with a reason`);
    }
  }
  return { pairs, webOnly, nativeOnly, failures };
}

function main(argv) {
  let root = process.cwd();
  let list = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--root") root = path.resolve(argv[++i] ?? "");
    else if (arg === "--list") list = true;
    else {
      console.error(`check-ui-parity: unknown argument ${arg}`);
      return 2;
    }
  }
  let result;
  let parity;
  try {
    parity = readParity(root);
    result = checkUiParity(root, discover(root), parity);
  } catch (error) {
    console.error(`check-ui-parity: ${error.message}`);
    return 2;
  }
  const { pairs, webOnly, nativeOnly, failures } = result;
  if (list) {
    for (const [w, n] of pairs) console.log(`${w} ↔ ${n}`);
    for (const w of webOnly) console.log(`${w} (web only: ${parity.webOnly[w] ?? "unrecorded"})`);
    for (const n of nativeOnly) console.log(`${n} (native only: ${parity.nativeOnly[n] ?? "unrecorded"})`);
    return 0;
  }
  const notYet = [...Object.values(parity.webOnly), ...Object.values(parity.nativeOnly)].filter((r) => r.startsWith("notYet:")).length;
  if (failures.length) {
    console.error(`check-ui-parity: ${failures.length} problem(s):`);
    for (const line of failures) console.error(`  - ${line}`);
    return 1;
  }
  console.log(
    `check-ui-parity: ${pairs.size} twins; ${webOnly.length} web-only and ${nativeOnly.length} native-only, each with a reason (${notYet} not built yet).`,
  );
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exit(main(process.argv.slice(2)));
