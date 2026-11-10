#!/usr/bin/env node
/**
 * check-code-connect.mjs
 *
 * Every visual component genesis-ui-native and genesis-ui (web) export should have a Figma Code Connect template
 * in packages/<package>/figma/<Name>.figma.ts, so Figma's Dev Mode shows the Genesis call for
 * the component a designer selected instead of generic markup. This check lists the
 * components, checks each template's shape, and ratchets: a component is `required` (its
 * template must exist and be well-formed), `notYet` (reported, not failing) or `composed` (a
 * screen assembled from library components, no template by design) in
 * packages/<package>/figma/code-connect.json (one allowlist per package: ui-native and ui; chat has
 * one per entry point, packages/chat/figma/{native,web}/code-connect.json, and so has
 * notifications; native has one).
 * Promote a component by moving it to `required` once its Figma node exists and its template is
 * published (docs/DESIGN-LIBRARY.md).
 *
 * Why: the Genesis Figma library is built component by component, after the code. Without a
 * list, a new export ships with no design counterpart and nobody notices; with a hard fail on
 * every export, the check is red from day one and gets ignored. The allowlist turns the gap
 * into a count that only shrinks.
 *
 * What counts as a visual component (read from each package's export indexes, see PACKAGES):
 *   - packages/ui-native/src/components/index.ts: value exports whose name starts with
 *     `Native`, minus sub-parts that belong to their parent's template (a name that extends
 *     another export of the same `export { … }` statement with Header, Title, Description,
 *     Content, Footer, Trigger, Item, List, Divider or ScrollView: NativeCardHeader is part of
 *     NativeCard's template). Hooks (`use*`), providers (`*Provider`), constants (ALL_CAPS),
 *     variant functions (camelCase) and type-only exports are skipped.
 *   - packages/ui-native/src/layouts/index.ts: PascalCase value exports (the page layouts and
 *     screens), minus the same hooks, providers and constants, and minus the parts of a
 *     layout's chrome (NavBar* belongs to ScreenContainer, ForgotPasswordLink to AuthForm).
 *   - genesis-ui (web): packages/ui/src/index.ts and components/{layout,patterns,data,resource}/
 *     index.ts together: PascalCase value exports, each name once, minus hooks, providers and
 *     constants; minus sub-parts (a name that is another export plus a suffix in
 *     WEB_SUBPART_SUFFIXES, or one in WEB_SUBPARTS: CardHeader belongs to Card); minus the
 *     typography names, the Stack/Grid/Split/Container auto-layout primitives and the
 *     cell-formatter factories (WEB_EXCLUDED). The deprecated /data aliases (AppShell,
 *     PageHeader) are `export const`, not re-exports, so each component is counted once.
 *
 *   - genesis-chat: packages/chat/src/native/index.ts and packages/chat/src/web/index.ts, each on
 *     its own: PascalCase value exports minus hooks, providers, constants and CHAT_EXCLUDED.
 *   - genesis-native: src/index.ts, src/push/index.ts and src/updates/index.ts: PascalCase value
 *     exports minus hooks, providers, constants and the app plumbing (roots, boundaries, gates,
 *     error classes, GenesisNativeApp, BootScreen).
 *   - genesis-notifications: src/web/index.tsx and src/native/index.tsx declare their components
 *     in the index itself (`export function Name(`), so those declarations are read, each entry
 *     point on its own. The React Email parts (./email) are not app UI and are not read.
 *   - genesis-forms-native and genesis-forms-web: src/index.ts, PascalCase value exports minus
 *     hooks, providers, constants, React contexts (`*Context`) and the ChoiceRow parts (Indicator,
 *     OptionImage). forms-web exports its slots and field renderers, each with a template.
 *   - genesis-studio: src/index.ts, the same rule (DataStudio and the toolbar, panels and views it is built from).
 *   - genesis-sites: src/sections/index.ts. A section is a `defineSection` constant, not a
 *     component export, so the section's `type` string (read from the file each `*Section` is
 *     imported from) is the name: hero, rich-text… (template `hero.figma.ts`). Beside them, the
 *     shared parts the index re-exports as PascalCase values (SectionBand, ButtonLink…), minus the
 *     zod schemas and the screen-reader-only HiddenTitle (SITES_EXCLUDED).
 *
 * What a template must have, as its first three lines (Code Connect CLI v2, parserless):
 *   // url=<the Figma node>
 *   // source=<path from the repo root to the component's source file, which must exist>
 *   // component=<Name, equal to the file name>
 *
 * Exit codes:
 *   0 — every `required` component has a well-formed template, and the allowlist is in step
 *       with the exports (every component listed once, no stale names).
 *   1 — a `required` component is missing or malformed, a `notYet` or `composed` component
 *       has a template (promote it, or it is a component after all), a component is in no list
 *       or in two, or a listed name is not a component any more.
 *   2 — usage error.
 *
 * Usage:
 *   node scripts/check-code-connect.mjs              # repo root, every package
 *   node scripts/check-code-connect.mjs --list ui    # print the discovered component names
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

/**
 * The packages the ratchet covers. Each has its own export indexes (read with the named rule),
 * Figma folder and allowlist (`<figmaDir>/code-connect.json`).
 */
export const PACKAGES = [
  {
    name: "ui-native",
    indexes: [
      { file: COMPONENTS_INDEX, rule: "native" },
      { file: LAYOUTS_INDEX, rule: "layouts" },
    ],
    figmaDir: FIGMA_DIR,
  },
  {
    name: "ui",
    indexes: [
      "packages/ui/src/index.ts",
      "packages/ui/src/components/layout/index.ts",
      "packages/ui/src/components/patterns/index.ts",
      "packages/ui/src/components/data/index.ts",
      "packages/ui/src/components/resource/index.ts",
    ].map((file) => ({ file, rule: "web" })),
    figmaDir: "packages/ui/figma",
  },
  // genesis-chat: the phone renderers (/native, on genesis-ui-native) and the web ones (/web, on
  // genesis-ui) export several components under the same name (ChatComposer, ChatTopicBar), so
  // each entry point has its own Figma folder and allowlist under packages/chat/figma/.
  {
    name: "chat-native",
    indexes: [{ file: "packages/chat/src/native/index.ts", rule: "chat" }],
    figmaDir: "packages/chat/figma/native",
  },
  {
    name: "chat-web",
    indexes: [{ file: "packages/chat/src/web/index.ts", rule: "chat" }],
    figmaDir: "packages/chat/figma/web",
  },
  {
    name: "native",
    indexes: ["packages/native/src/index.ts", "packages/native/src/push/index.ts", "packages/native/src/updates/index.ts"].map(
      (file) => ({ file, rule: "app" }),
    ),
    figmaDir: "packages/native/figma",
  },
  // genesis-notifications: the web and native entry points each have their own folder, like chat.
  {
    name: "notifications-native",
    indexes: [{ file: "packages/notifications/src/native/index.tsx", rule: "declared" }],
    figmaDir: "packages/notifications/figma/native",
  },
  {
    name: "notifications-web",
    indexes: [{ file: "packages/notifications/src/web/index.tsx", rule: "declared" }],
    figmaDir: "packages/notifications/figma/web",
  },
  {
    name: "forms-native",
    indexes: [{ file: "packages/forms-native/src/index.ts", rule: "forms" }],
    figmaDir: "packages/forms-native/figma",
  },
  {
    name: "forms-web",
    indexes: [{ file: "packages/forms-web/src/index.ts", rule: "forms" }],
    figmaDir: "packages/forms-web/figma",
  },
  {
    name: "sites",
    indexes: [{ file: "packages/sites/src/sections/index.ts", rule: "sections" }],
    figmaDir: "packages/sites/figma",
  },
  {
    name: "studio",
    indexes: [{ file: "packages/studio/src/index.ts", rule: "forms" }],
    figmaDir: "packages/studio/figma",
  },
];
const allowlistOf = (pkg) => `${pkg.figmaDir}/code-connect.json`;

/** A Native* name ending in one of these, after another export of the same statement, is a sub-part. */
const SUBPART_SUFFIXES = ["Header", "Title", "Description", "Content", "Footer", "Trigger", "Item", "List", "Divider", "ScrollView"];
/** Layout exports that are parts of a layout's chrome, covered by the parent's template. */
const LAYOUT_SUBPARTS = new Set(["NavBarSaveButton", "NavBarSearchBar", "NavBarTitle", "ForgotPasswordLink"]);

/** Web: a name ending in one of these, after another export, is a sub-part of that export. */
const WEB_SUBPART_SUFFIXES = [
  ...SUBPART_SUFFIXES,
  "Portal", "Overlay", "Close", "Group", "Value", "ScrollUpButton", "ScrollDownButton", "Label", "Separator",
  "Shortcut", "Sub", "SubContent", "SubTrigger", "RadioGroup", "CheckboxItem", "RadioItem", "Action", "Cancel",
  "Link", "Previous", "Next", "Ellipsis", "Page", "Input", "Empty", "Body", "Row", "Head", "Cell", "Caption",
  "Image", "Fallback", "Menu", "Indicator", "Viewport", "Slot", "Button", "Toggle", "Icon", "Prefix", "Suffix",
  "ToggleGroup", "ToggleItem",
];
/** Web sub-parts no suffix rule covers (their parent is not an export, or the name is irregular). */
const WEB_SUBPARTS = new Set([
  "CommandDialog", "CalendarDayButton", "SettingsSection", "CopyField", "FormLabel", "FormError", "FormDescription",
  "ChartTooltip", "ChartTooltipContent", "ChartLegend", "ChartLegendContent", "ChartStyle",
  "ResizablePanel", "ResizableHandle", "AppShellSubNavEnd", "AppShellPageHeader", "BandLead",
]);
/** Web names that look like parent + suffix but are components in their own right. */
const WEB_NOT_SUBPARTS = new Set(["ToggleGroup", "ToggleRow", "ButtonGroup", "InputGroup", "ResizablePanelGroup"]);
/** Web exports that are not Figma components: typography, auto-layout primitives, cell-formatter factories. */
const WEB_EXCLUDED = new Set([
  "H1", "H2", "H3", "H4", "P", "Lead", "Large", "Small", "Muted",
  "Stack", "Grid", "Split", "Container",
  "DateCell", "NumberCell", "CurrencyCell", "BadgeCell",
]);

/** Chat exports that render no design of their own: a retry effect and an error boundary. */
const CHAT_EXCLUDED = new Set(["ChatAutoRetry", "ChatErrorBoundary"]);

/** genesis-forms-native: the radio dot and option thumbnail are drawn inside ChoiceRow's template. */
const FORMS_SUBPARTS = new Set(["Indicator", "OptionImage"]);
/** genesis-sites: zod schemas exported under PascalCase names, and the screen-reader-only title. */
const SITES_EXCLUDED = new Set(["Anchor", "IconName", "HiddenTitle"]);

/** Exports that are app plumbing, not a design: roots, boundaries, gates, error classes. */
const isPlumbing = (name) => /(Root|Boundary|Gate|Error)$/.test(name);
/** genesis-native: the plumbing plus the provider root and its trivial default boot slot. */
const isAppPlumbing = (name) => isPlumbing(name) || name === "GenesisNativeApp" || name === "BootScreen";

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
 * Visual components of the web package, from all its indexes together: PascalCase value exports,
 * each once, minus sub-parts, typography, auto-layout primitives and cell formatters.
 */
export function webComponentsFromIndexes(sources) {
  const all = new Set();
  for (const source of sources) {
    for (const names of exportStatements(source)) {
      for (const name of names) if (isPascal(name) && !isHookOrProvider(name)) all.add(name);
    }
  }
  const isSubpart = (name) =>
    WEB_SUBPARTS.has(name) ||
    (!WEB_NOT_SUBPARTS.has(name) &&
      [...all].some((p) => p !== name && name.startsWith(p) && WEB_SUBPART_SUFFIXES.includes(name.slice(p.length))));
  return [...all].filter((n) => !WEB_EXCLUDED.has(n) && !isSubpart(n));
}

/**
 * Visual components of a genesis-chat entry point: PascalCase value exports, minus hooks,
 * providers, constants and the non-visual exports in CHAT_EXCLUDED.
 */
export function chatComponentsFromIndex(source) {
  const out = new Set();
  for (const names of exportStatements(source)) {
    for (const name of names) if (isPascal(name) && !isHookOrProvider(name) && !CHAT_EXCLUDED.has(name)) out.add(name);
  }
  return [...out];
}

/** PascalCase value exports of one index, minus hooks, providers, constants and `skip`. */
export function pascalComponentsFromIndex(source, skip = () => false) {
  const out = new Set();
  for (const names of exportStatements(source)) {
    for (const name of names) if (isPascal(name) && !isHookOrProvider(name) && !skip(name)) out.add(name);
  }
  return [...out];
}

/** genesis-native: PascalCase value exports minus the app plumbing. */
export function appComponentsFromIndex(source) {
  return pascalComponentsFromIndex(source, isAppPlumbing);
}

/** genesis-forms-native, -forms-web and -studio: PascalCase value exports minus contexts and ChoiceRow's parts. */
export function formsComponentsFromIndex(source) {
  return pascalComponentsFromIndex(source, (name) => /Context$/.test(name) || FORMS_SUBPARTS.has(name));
}

/**
 * genesis-sites: the section types and the shared parts. `readSection(rel)` returns the source of
 * a module the index imports a `*Section` from ("./hero" → its `defineSection({ type: "hero" })`).
 */
export function sitesComponentsFromIndex(source, readSection) {
  const out = [];
  const re = /^import\s*\{\s*(\w+Section)\s*\}\s*from\s*["'](\.\/[\w-]+)["']/gm;
  let m;
  while ((m = re.exec(source))) {
    const section = readSection(m[2]);
    const type = section.match(/defineSection\(\{\s*type:\s*["']([a-z][a-z0-9-]*)["']/);
    if (!type) throw new Error(`${m[2]}: ${m[1]} has no defineSection({ type: "…" })`);
    out.push(type[1]);
  }
  out.push(...pascalComponentsFromIndex(source, (name) => SITES_EXCLUDED.has(name)));
  return out;
}

/**
 * Components declared in the index file itself (`export function Name(`), as genesis-notifications
 * writes its web and native entry points, minus hooks, providers and the plumbing.
 */
export function declaredComponentsFromIndex(source) {
  const out = new Set();
  const re = /^export\s+function\s+([A-Z]\w*)\s*[(<]/gm;
  let m;
  while ((m = re.exec(source))) {
    const name = m[1];
    if (isPascal(name) && !isHookOrProvider(name) && !isPlumbing(name)) out.add(name);
  }
  return [...out];
}

/**
 * Checks one template's three leading directives. Returns the problems (empty when fine), or
 * `null` when the file does not exist.
 */
export function templateProblems(root, name, figmaDir = FIGMA_DIR) {
  const file = path.join(root, figmaDir, `${name}.figma.ts`);
  if (!fs.existsSync(file)) return null;
  const rel = `${figmaDir}/${name}.figma.ts`;
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

export function readAllowlist(root, pkg = PACKAGES[0]) {
  const allowlist = allowlistOf(pkg);
  const file = path.join(root, allowlist);
  if (!fs.existsSync(file)) throw new Error(`${allowlist} is missing: {"required": [...], "notYet": [...], "composed": [...]}`);
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  // `composed` is optional: the web allowlist and older fixtures have only the first two lists.
  if (json.composed === undefined) json.composed = [];
  for (const key of ["required", "notYet", "composed"]) {
    if (!Array.isArray(json[key]) || json[key].some((n) => typeof n !== "string")) {
      throw new Error(`${allowlist}: "${key}" must be an array of component names`);
    }
  }
  return { required: json.required, notYet: json.notYet, composed: json.composed };
}

/** The visual components one package exports, read from its indexes. */
export function discoverComponents(root, pkg = PACKAGES[0]) {
  const read = (rel) => {
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) throw new Error(`${rel} is missing`);
    return fs.readFileSync(file, "utf8");
  };
  const web = pkg.indexes.filter((i) => i.rule === "web");
  const out = [];
  for (const { file, rule } of pkg.indexes) {
    if (rule === "native") out.push(...componentsFromIndex(read(file)));
    else if (rule === "layouts") out.push(...layoutsFromIndex(read(file)));
    else if (rule === "chat") out.push(...chatComponentsFromIndex(read(file)));
    else if (rule === "app") out.push(...appComponentsFromIndex(read(file)));
    else if (rule === "declared") out.push(...declaredComponentsFromIndex(read(file)));
    else if (rule === "pascal") out.push(...pascalComponentsFromIndex(read(file)));
    else if (rule === "forms") out.push(...formsComponentsFromIndex(read(file)));
    else if (rule === "sections") {
      const dir = path.posix.dirname(file);
      out.push(...sitesComponentsFromIndex(read(file), (rel) => read(`${path.posix.join(dir, rel)}.tsx`)));
    }
    else if (rule !== "web") throw new Error(`${file}: unknown rule ${rule}`);
  }
  if (web.length) out.push(...webComponentsFromIndexes(web.map((i) => read(i.file))));
  return out;
}

/**
 * Runs the whole check for one package of a checkout (ui-native by default). Returns
 * { components, failures, missing, covered, composed }: `failures` are the lines that make the
 * check exit 1; `missing` the notYet components without a template (reported only); `composed`
 * the screens assembled from library components, which have no template by design.
 */
export function checkCodeConnect(root, pkg = PACKAGES[0]) {
  const components = discoverComponents(root, pkg);
  const allowlist = allowlistOf(pkg);
  const lists = readAllowlist(root, pkg);
  const { required, notYet } = lists;
  const failures = [];
  const missing = [];
  const covered = [];
  const composed = [];

  const known = new Set(components);
  for (const name of [...required, ...notYet, ...lists.composed]) {
    if (!known.has(name)) failures.push(`${allowlist}: ${name} is not a visual component exported from ${pkg.name}; remove it`);
  }
  const listNames = ["required", "notYet", "composed"];
  for (const name of known) {
    const inLists = listNames.filter((key) => lists[key].includes(name));
    if (inLists.length > 1) failures.push(`${allowlist}: ${name} is in both ${inLists.map((k) => `"${k}"`).join(" and ")}`);
  }
  for (const name of components) {
    const isRequired = required.includes(name);
    const isNotYet = notYet.includes(name);
    const isComposed = lists.composed.includes(name);
    if (!isRequired && !isNotYet && !isComposed) {
      failures.push(`${name}: exported from ${pkg.name} but in no list of ${allowlist}; add it to "notYet" (or "required" with its template, or "composed" for a screen assembled from library components)`);
      continue;
    }
    const problems = templateProblems(root, name, pkg.figmaDir);
    if (isRequired) {
      if (problems === null) failures.push(`${name}: required, but ${pkg.figmaDir}/${name}.figma.ts is missing`);
      else if (problems.length) failures.push(...problems);
      else covered.push(name);
    } else if (problems === null) {
      if (isComposed) composed.push(name);
      else missing.push(name);
    } else if (problems.length) {
      failures.push(...problems);
    } else if (isComposed) {
      failures.push(`${name}: has a template but is "composed" in ${allowlist}; a composed screen has no template by design, so move it to "required" or delete the template`);
    } else {
      failures.push(`${name}: has a template but is still "notYet" in ${allowlist}; move it to "required"`);
    }
  }
  return { components, failures, missing, covered, composed };
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
  const listAt = argv.indexOf("--list");
  if (listAt !== -1) {
    const pkg = PACKAGES.find((p) => p.name === argv[listAt + 1]);
    if (!pkg) {
      console.error(`--list needs a package: ${PACKAGES.map((p) => p.name).join(", ")}`);
      return 2;
    }
    try {
      for (const name of discoverComponents(root, pkg)) console.log(name);
    } catch (err) {
      console.error(`check-code-connect: ${err.message}`);
      return 2;
    }
    return 0;
  }
  let failed = 0;
  for (const pkg of PACKAGES) {
    let result;
    try {
      result = checkCodeConnect(root, pkg);
    } catch (err) {
      console.error(`check-code-connect [${pkg.name}]: ${err.message}`);
      return 2;
    }
    const { components, failures, missing, covered, composed } = result;
    console.log(
      `check-code-connect [${pkg.name}]: ${components.length} visual components, ${covered.length} with a published template, ${missing.length} not yet, ${composed.length} composed, no template by design.`,
    );
    if (missing.length) {
      console.log(`\nNo Code Connect template yet (${allowlistOf(pkg)} "notYet"):`);
      for (const name of missing) console.log(`  - ${name}  →  ${pkg.figmaDir}/${name}.figma.ts`);
    }
    if (failures.length) {
      failed += failures.length;
      console.error(`\n[${pkg.name}] ${failures.length} problem(s):`);
      for (const line of failures) console.error(`  ${line}`);
    }
  }
  if (failed) {
    console.error(`\ncheck-code-connect: failed. See the header of scripts/check-code-connect.mjs and docs/DESIGN-LIBRARY.md.`);
    return 1;
  }
  console.log("check-code-connect: clean.");
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exitCode = main(process.argv.slice(2));
