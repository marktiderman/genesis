#!/usr/bin/env node
/**
 * check-code-connect.mjs
 *
 * Every visual component genesis-ui-native exports should have a Figma Code Connect template
 * in packages/ui-native/figma/<Name>.figma.ts, so Figma's Dev Mode shows the Genesis call for
 * the component a designer selected instead of generic React Native. This check lists the
 * components, checks each template's shape, and ratchets: a component is either `required`
 * (its template must exist and be well-formed) or `notYet` (reported, not failing) in
 * packages/ui-native/figma/code-connect.json. Promote a component by moving it to `required`
 * once its Figma node exists and its template is published (docs/DESIGN-LIBRARY.md).
 *
 * Why: the Genesis Figma library is built component by component, after the code. Without a
 * list, a new export ships with no design counterpart and nobody notices; with a hard fail on
 * every export, the check is red from day one and gets ignored. The allowlist turns the gap
 * into a count that only shrinks.
 *
 * What counts as a visual component (read from the two export indexes):
 *   - packages/ui-native/src/components/index.ts: value exports whose name starts with
 *     `Native`, minus sub-parts that belong to their parent's template (a name that extends
 *     another export of the same `export { … }` statement with Header, Title, Description,
 *     Content, Footer, Trigger, Item, List, Divider or ScrollView: NativeCardHeader is part of
 *     NativeCard's template). Hooks (`use*`), providers (`*Provider`), constants (ALL_CAPS),
 *     variant functions (camelCase) and type-only exports are skipped.
 *   - packages/ui-native/src/layouts/index.ts: PascalCase value exports (the page layouts and
 *     screens), minus the same hooks, providers and constants, and minus the parts of a
 *     layout's chrome (NavBar* belongs to ScreenContainer, ForgotPasswordLink to AuthForm).
 *
 * What a template must have, as its first three lines (Code Connect CLI v2, parserless):
 *   // url=<the Figma node>
 *   // source=<path from the repo root to the component's source file, which must exist>
 *   // component=<Name, equal to the file name>
 *
 * Exit codes:
 *   0 — every `required` component has a well-formed template, and the allowlist is in step
 *       with the exports (every component listed once, no stale names).
 *   1 — a `required` component is missing or malformed, a `notYet` component already has a
 *       template (promote it), a component is in neither or both lists, or a listed name is
 *       not a component any more.
 *   2 — usage error.
 *
 * Usage:
 *   node scripts/check-code-connect.mjs              # repo root
 *   node scripts/check-code-connect.mjs --root <dir> # another checkout, or a test fixture
 *   pnpm check:code-connect
 *
 * Wired into: package.json `lint:genesis`, and ci.yml beside the other repo-only checks
 * (genesis-lint.yml is the reusable workflow consumer apps call; this check is Genesis's own).
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const COMPONENTS_INDEX = "packages/ui-native/src/components/index.ts";
export const LAYOUTS_INDEX = "packages/ui-native/src/layouts/index.ts";
export const FIGMA_DIR = "packages/ui-native/figma";
export const ALLOWLIST = `${FIGMA_DIR}/code-connect.json`;

/** A Native* name ending in one of these, after another export of the same statement, is a sub-part. */
const SUBPART_SUFFIXES = ["Header", "Title", "Description", "Content", "Footer", "Trigger", "Item", "List", "Divider", "ScrollView"];
/** Layout exports that are parts of a layout's chrome, covered by the parent's template. */
const LAYOUT_SUBPARTS = new Set(["NavBarSaveButton", "NavBarSearchBar", "NavBarTitle", "ForgotPasswordLink"]);

const isPascal = (name) => /^[A-Z][a-z][A-Za-z0-9]*$/.test(name); // excludes ALL_CAPS constants
const isHookOrProvider = (name) => /^use[A-Z]/.test(name) || /Provider$/.test(name);

/** The value exports of each `export { … } from "…"` statement, as one array per statement. */
export function exportStatements(source) {
  const statements = [];
  const re = /export\s+(type\s+)?\{([^}]*)\}\s*from\s*["'][^"']+["']/g;
  let m;
  while ((m = re.exec(source))) {
    if (m[1]) continue; // `export type { … }`: type-only
    const names = m[2]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s) => !/^type\s/.test(s)) // inline `type X` inside a value export
      .map((s) => s.split(/\s+as\s+/).pop().trim());
    statements.push(names);
  }
  return statements;
}

/** Visual components in the components index: Native* exports minus their sub-parts. */
export function componentsFromIndex(source) {
  const out = [];
  for (const names of exportStatements(source)) {
    const natives = names.filter((n) => n.startsWith("Native") && isPascal(n) && !isHookOrProvider(n));
    for (const name of natives) {
      const parent = natives.find(
        (p) => p !== name && name.startsWith(p) && SUBPART_SUFFIXES.includes(name.slice(p.length)),
      );
      if (!parent) out.push(name);
    }
  }
  return out;
}

/** Visual components in the layouts index: the pages and screens minus their chrome parts. */
export function layoutsFromIndex(source) {
  const out = [];
  for (const names of exportStatements(source)) {
    for (const name of names) {
      if (isPascal(name) && !isHookOrProvider(name) && !LAYOUT_SUBPARTS.has(name)) out.push(name);
    }
  }
  return out;
}

/**
 * Checks one template's three leading directives. Returns the problems (empty when fine), or
 * `null` when the file does not exist.
 */
export function templateProblems(root, name) {
  const file = path.join(root, FIGMA_DIR, `${name}.figma.ts`);
  if (!fs.existsSync(file)) return null;
  const rel = `${FIGMA_DIR}/${name}.figma.ts`;
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/, 3);
  const problems = [];
  const directive = (i, key) => {
    const line = lines[i] ?? "";
    const m = line.match(new RegExp(`^//\\s*${key}=(.*)$`));
    if (!m) {
      problems.push(`${rel}:${i + 1}: expected \`// ${key}=…\`, found ${JSON.stringify(line)}`);
      return undefined;
    }
    const value = m[1].trim();
    if (!value) problems.push(`${rel}:${i + 1}: \`// ${key}=\` is empty`);
    return value;
  };
  const url = directive(0, "url");
  if (url && !/^https:\/\/(www\.)?figma\.com\/design\/[0-9A-Za-z]{22,128}\/[^?\s]*\?(.*&)?node-id=\d+[-:]\d+(&|$)/.test(url)) {
    problems.push(`${rel}:1: \`// url=\` must be a figma.com/design file URL with a node-id, found ${url}`);
  }
  const source = directive(1, "source");
  const component = directive(2, "component");
  if (source) {
    if (path.isAbsolute(source) || source.startsWith("..")) {
      problems.push(`${rel}:2: \`// source=\` must be a path from the repo root, found ${source}`);
    } else if (!fs.existsSync(path.join(root, source))) {
      problems.push(`${rel}:2: \`// source=${source}\` does not exist`);
    }
  }
  if (component && component !== name) {
    problems.push(`${rel}:3: \`// component=${component}\` does not match the file name ${name}`);
  }
  return problems;
}

export function readAllowlist(root) {
  const file = path.join(root, ALLOWLIST);
  if (!fs.existsSync(file)) throw new Error(`${ALLOWLIST} is missing: {"required": [...], "notYet": [...]}`);
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const key of ["required", "notYet"]) {
    if (!Array.isArray(json[key]) || json[key].some((n) => typeof n !== "string")) {
      throw new Error(`${ALLOWLIST}: "${key}" must be an array of component names`);
    }
  }
  return { required: json.required, notYet: json.notYet };
}

/**
 * Runs the whole check against a checkout. Returns { components, failures, missing, covered }:
 * `failures` are the lines that make the check exit 1; `missing` the notYet components without
 * a template (reported only).
 */
export function checkCodeConnect(root) {
  const read = (rel) => {
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) throw new Error(`${rel} is missing`);
    return fs.readFileSync(file, "utf8");
  };
  const components = [...componentsFromIndex(read(COMPONENTS_INDEX)), ...layoutsFromIndex(read(LAYOUTS_INDEX))];
  const { required, notYet } = readAllowlist(root);
  const failures = [];
  const missing = [];
  const covered = [];

  const known = new Set(components);
  for (const name of [...required, ...notYet]) {
    if (!known.has(name)) failures.push(`${ALLOWLIST}: ${name} is not a visual component exported from ui-native; remove it`);
  }
  for (const name of required) {
    if (notYet.includes(name)) failures.push(`${ALLOWLIST}: ${name} is in both "required" and "notYet"`);
  }
  for (const name of components) {
    const isRequired = required.includes(name);
    const isNotYet = notYet.includes(name);
    if (!isRequired && !isNotYet) {
      failures.push(`${name}: exported from ui-native but in neither list of ${ALLOWLIST}; add it to "notYet" (or "required" with its template)`);
      continue;
    }
    const problems = templateProblems(root, name);
    if (isRequired) {
      if (problems === null) failures.push(`${name}: required, but ${FIGMA_DIR}/${name}.figma.ts is missing`);
      else if (problems.length) failures.push(...problems);
      else covered.push(name);
    } else if (problems === null) {
      missing.push(name);
    } else if (problems.length) {
      failures.push(...problems);
    } else {
      failures.push(`${name}: has a template but is still "notYet" in ${ALLOWLIST}; move it to "required"`);
    }
  }
  return { components, failures, missing, covered };
}

function main(argv) {
  let root = process.cwd();
  const at = argv.indexOf("--root");
  if (at !== -1) {
    root = argv[at + 1];
    if (!root) {
      console.error("--root needs a directory");
      return 2;
    }
    root = path.resolve(root);
  }
  let result;
  try {
    result = checkCodeConnect(root);
  } catch (err) {
    console.error(`check-code-connect: ${err.message}`);
    return 2;
  }
  const { components, failures, missing, covered } = result;
  console.log(`check-code-connect: ${components.length} visual components, ${covered.length} with a published template, ${missing.length} not yet.`);
  if (missing.length) {
    console.log(`\nNo Code Connect template yet (${ALLOWLIST} "notYet"):`);
    for (const name of missing) console.log(`  - ${name}  →  ${FIGMA_DIR}/${name}.figma.ts`);
  }
  if (failures.length) {
    console.error(`\n${failures.length} problem(s):`);
    for (const line of failures) console.error(`  ${line}`);
    console.error(`\ncheck-code-connect: failed. See the header of scripts/check-code-connect.mjs and docs/DESIGN-LIBRARY.md.`);
    return 1;
  }
  console.log("check-code-connect: clean.");
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exitCode = main(process.argv.slice(2));
