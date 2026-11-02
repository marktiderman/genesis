#!/usr/bin/env node
/**
 * check-docs-match-exports.mjs
 *
 * Docs must not describe API that isn't there. Agents read the docs and build against them, so a
 * documented prop, option or export that a package doesn't have becomes broken code in an app.
 * This checks the docs against the built packages' `.d.ts` (run `pnpm build:packages` first),
 * with the TypeScript checker, and reports only "this doesn't exist" claims, never prose.
 *
 * What is checked:
 *
 * 1. **Every fenced `ts` / `tsx` block** in the repo's Markdown is type-checked. Names a block uses
 *    without importing are imported from the Genesis entry point that exports them. Only these are
 *    reported, and only when the API is a Genesis one: an import a Genesis entry point doesn't
 *    export (or an entry point that doesn't exist), an unknown key in an object literal passed to
 *    a Genesis function or type, an unknown or mistyped prop on a Genesis component, and an
 *    unknown property read off a Genesis type. Everything else (an app's own modules, names the
 *    snippet leaves undefined, `…` placeholders that don't parse) is ignored.
 *
 * 2. **Prose, in a section that says which API it documents.** Put
 *    `<!-- api: ResourceViewProps, ViewDefinition<any> -->` under a heading: a comma-separated list
 *    of type expressions over Genesis exports. It applies to that section and its subsections. In
 *    it, these code spans are checked against the listed types (a span passes when any type has it):
 *    - `name="value"` and `name={…}`: the prop exists, and a string value is one it accepts;
 *    - `a.b: …`: a key path written as a definition;
 *    - a list item that starts with a code span (`` - `layout`: ``, `` - **`summary(row)`** ``)
 *      and a table row under a `Prop` / `Option` / `Setting` / `Key` header: the first span names
 *      an option;
 *    - a bare `a.b` path, when its first key exists on a listed type (so `bin.restorable` about
 *      something else isn't flagged).
 *    Other code spans, and everything outside such a section, is prose and never checked.
 *
 * Documenting what isn't built yet: write `**Planned**` and the features.ts id in a code span in
 * the same paragraph, list item or table row (`**Planned** ([`resource-view-sheet`](…/features.ts))`).
 * That unit is skipped; in the paragraph right under a heading it skips the whole section; in the
 * paragraph right before a fenced block it skips the block. The id must be a features.ts entry
 * whose status is `planned` or `building`, so a marker can't outlive its feature unnoticed.
 * `<!-- docs-check: skip -->` right before a fenced block skips pseudo-code that isn't meant to
 * compile against Genesis.
 *
 * Scanned: Markdown under docs/ (not the generated component-reference.md), and each package's
 * and app's README.md, SKILL.md and EXTENDING.md. CHANGELOGs are history and aren't scanned.
 *
 * Usage: node scripts/check-docs-match-exports.mjs [--root <dir>] [--verbose] [files…]
 * Exits 1 on a finding.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const PLANNED = /\*\*Planned\*\*[^`\n]*`([a-z0-9][a-z0-9-]*)`/;
const API_MARKER = /<!--\s*api:\s*([\s\S]*?)\s*-->/;
const SKIP_MARKER = /<!--\s*docs-check:\s*skip\s*-->/;
const TS_LANGS = new Set(["ts", "tsx", "typescript"]);
const GLOBALS = new Set(["Array", "Date", "Error", "JSON", "Map", "Math", "Number", "Object", "Promise", "Record", "Request", "Response", "Set", "String", "URL", "URLSearchParams", "console", "document", "fetch", "process", "window"]);
// `role="grid"` and `aria-busy` describe the DOM a component draws, not its props.
const HTML_ATTR = /^(role|aria-.*|data-.*|id|className|class|style|tabIndex|href)$/;
const OPTION_HEADERS = /^(props?|options?|settings?|keys?|parameters?)$/i;

// Diagnostics that mean "the docs name something that isn't there". Anything else is ignored.
const MISSING_EXPORT = new Set([2305, 2307, 2614, 2724]);
const UNKNOWN_KEY = new Set([2353, 2561]);
const UNKNOWN_PROPERTY = new Set([2339, 2551]);
// Assignability only when it is a "doesn't exist" claim: a prop the component doesn't have, or a
// literal value (`mode="cards"`) outside the accepted set. Other type mismatches are left to review.
const NOT_ASSIGNABLE = new Set([2322]);
// The wrong number of arguments, when the callee is a Genesis declaration (`f.pageBreak()` without its id).
const ARG_COUNT = new Set([2554, 2555]);

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

/** Splits a comma-separated list at the top level only (generics hold commas). */
export function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const ch of text) {
    if ("<([{".includes(ch)) depth++;
    if (">)]}".includes(ch)) depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else current += ch;
  }
  parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

const codeSpans = (text) => [...text.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]);

/**
 * Reads a Markdown file into what the check needs: fenced TS blocks, the code spans to check in
 * API sections, and the planned markers. Line numbers are 1-based.
 */
export function parseMarkdown(markdown) {
  const lines = markdown.split("\n");
  const blocks = [];
  const units = [];
  const planned = [];
  /** @type {{ level: number, apis: string[] | null, planned: string | null }[]} */
  const sections = [{ level: 0, apis: null, planned: null }];
  let unit = null;
  let firstUnitOfSection = true;
  let prevUnit = null;
  let skipNext = false;

  const current = () => {
    const apis = [...sections].reverse().find((s) => s.apis)?.apis ?? null;
    const sectionPlanned = [...sections].reverse().find((s) => s.planned)?.planned ?? null;
    return { apis, sectionPlanned };
  };
  const closeUnit = () => {
    if (!unit) return;
    const text = unit.lines.join("\n");
    const m = text.match(PLANNED);
    unit.planned = m ? m[1] : null;
    if (m) planned.push({ feature: m[1], line: unit.line });
    if (m && unit.first && unit.kind === "paragraph") sections[sections.length - 1].planned = m[1];
    const marker = text.match(API_MARKER);
    if (marker) sections[sections.length - 1].apis = splitTopLevel(marker[1]);
    if (SKIP_MARKER.test(text)) skipNext = true;
    const ctx = current();
    units.push({ ...unit, text, apis: ctx.apis, sectionPlanned: ctx.sectionPlanned });
    prevUnit = units[units.length - 1];
    if (!marker && !SKIP_MARKER.test(text)) firstUnitOfSection = false;
    unit = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.match(/^\s*(```+|~~~+)\s*([\w-]*)/);
    if (fence) {
      closeUnit();
      const close = fence[1];
      const lang = fence[2].toLowerCase();
      const start = i + 1;
      const body = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith(close)) body.push(lines[i++]);
      if (TS_LANGS.has(lang)) {
        const ctx = current();
        blocks.push({
          lang,
          code: body.join("\n"),
          line: start + 1,
          planned: prevUnit?.planned ?? ctx.sectionPlanned ?? null,
          skip: skipNext,
        });
      }
      skipNext = false;
      prevUnit = null;
      continue;
    }
    const heading = line.match(/^(#{1,6})\s/);
    if (heading) {
      closeUnit();
      const level = heading[1].length;
      while (sections.length > 1 && sections[sections.length - 1].level >= level) sections.pop();
      sections.push({ level, apis: null, planned: null });
      firstUnitOfSection = true;
      prevUnit = null;
      continue;
    }
    if (!line.trim()) {
      closeUnit();
      continue;
    }
    const item = line.match(/^(\s*)([-*+]|\d+[.)])\s+/);
    const row = /^\s*\|/.test(line);
    if (item || row || !unit || (unit.kind === "row" && !row)) {
      closeUnit();
      unit = { kind: row ? "row" : item ? "item" : "paragraph", line: i + 1, lines: [line], first: firstUnitOfSection };
      if (row) unit.table = tableHeaderFor(lines, i);
      continue;
    }
    unit.lines.push(line);
  }
  closeUnit();
  return { blocks, units, planned };
}

/** The first header cell of the table a row belongs to. */
function tableHeaderFor(lines, index) {
  let i = index;
  while (i > 0 && /^\s*\|/.test(lines[i - 1])) i--;
  const first = lines[i].split("|")[1] ?? "";
  return first.replace(/[`*]/g, "").trim();
}

const IDENT = "[A-Za-z_$][\\w$]*";
const ATTR = new RegExp(`^(${IDENT})=(?:"([^"]*)"|\\{.*\\})$`);
const DEFINITION = new RegExp(`^(${IDENT}(?:\\.${IDENT})*)\\??:\\s`);
const BARE_PATH = new RegExp(`^(${IDENT}(?:\\.${IDENT})+)$`);
const OPTION = new RegExp(`^(${IDENT}(?:\\.${IDENT})*)\\??(?:\\(.*\\))?$`);

/**
 * The checks a unit asks for: `{ path, value?, strict, text }`. `strict: false` is a bare path,
 * reported only when its first key exists.
 */
export function spanChecks(unit) {
  if (!unit.apis || unit.planned || unit.sectionPlanned) return [];
  const checks = [];
  const seen = new Set();
  const add = (check) => {
    const key = `${check.path.join(".")}=${check.value ?? ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      checks.push(check);
    }
  };
  // The span that names an option: the first in a list item or an option table's first column.
  let lead = null;
  if (unit.kind === "item") {
    const m = unit.text.match(/^\s*(?:[-*+]|\d+[.)])\s+(\*\*)?`([^`\n]+)`(\*\*)?(.?)/);
    if (m && (m[1] || /[:—–]/.test(m[4]) || unit.text.match(/^\s*(?:[-*+]|\d+[.)])\s+`[^`]+`\s+[—–-]\s/))) lead = m[2];
  } else if (unit.kind === "row" && OPTION_HEADERS.test(unit.table ?? "")) {
    const cell = unit.text.split("|")[1] ?? "";
    const span = codeSpans(cell)[0];
    if (span && !/^-+$/.test(cell.trim())) lead = span;
  }
  if (lead) {
    const m = lead.match(OPTION) ?? lead.match(DEFINITION) ?? lead.match(ATTR);
    if (m) add({ path: m[1].split("."), strict: true, text: lead });
  }
  for (const span of codeSpans(unit.text)) {
    let m;
    if ((m = span.match(ATTR)) && HTML_ATTR.test(m[1])) continue;
    if (m) add({ path: [m[1]], ...(m[2] !== undefined ? { value: m[2] } : {}), strict: true, text: span });
    else if ((m = span.match(DEFINITION))) add({ path: m[1].split("."), strict: true, text: span });
    else if ((m = span.match(BARE_PATH))) add({ path: m[1].split("."), strict: false, text: span });
  }
  return checks;
}

// ---------------------------------------------------------------------------
// Packages
// ---------------------------------------------------------------------------

/** Every Genesis entry point with types: `{ specifier, types, pkg, dir }`. */
export function entryPoints(root) {
  const out = [];
  const pkgs = join(root, "packages");
  if (!existsSync(pkgs)) return out;
  for (const name of readdirSync(pkgs).sort()) {
    const file = join(pkgs, name, "package.json");
    if (!existsSync(file)) continue;
    const pkg = JSON.parse(readFileSync(file, "utf8"));
    if (!pkg.name?.startsWith("@marktiderman/")) continue;
    const exports = typeof pkg.exports === "object" && pkg.exports ? pkg.exports : { ".": { types: pkg.types } };
    for (const [sub, target] of Object.entries(exports)) {
      if (sub.includes("*") || sub.endsWith(".json") || sub.endsWith(".css")) continue;
      const types = typeof target === "object" && target ? (target.types ?? target.import?.types) : null;
      if (typeof types !== "string") continue;
      out.push({ specifier: sub === "." ? pkg.name : `${pkg.name}/${sub.slice(2)}`, types: join(pkgs, name, types), pkg: pkg.name, dir: join(pkgs, name) });
    }
  }
  return out;
}

const isGenesisFile = (fileName) => /[\\/]packages[\\/][^\\/]+[\\/]dist[\\/]/.test(fileName);

// ---------------------------------------------------------------------------
// Checking
// ---------------------------------------------------------------------------

/** Names a snippet declares or imports at its top level, and every identifier it uses. */
function namesIn(code, tsx) {
  const sf = ts.createSourceFile(tsx ? "x.tsx" : "x.ts", code, ts.ScriptTarget.Latest, true, tsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const declared = new Set();
  const used = new Map(); // name -> "value" | "type"
  const bindingNames = (name) => {
    if (ts.isIdentifier(name)) declared.add(name.text);
    else for (const el of name.elements ?? []) if (!ts.isOmittedExpression(el)) bindingNames(el.name);
  };
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st)) {
      const clause = st.importClause;
      if (clause?.name) declared.add(clause.name.text);
      const nb = clause?.namedBindings;
      if (nb && ts.isNamespaceImport(nb)) declared.add(nb.name.text);
      if (nb && ts.isNamedImports(nb)) for (const el of nb.elements) declared.add(el.name.text);
    } else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) bindingNames(d.name);
    } else if ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st) || ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st) || ts.isEnumDeclaration(st)) && st.name) {
      declared.add(st.name.text);
    }
  }
  const visit = (node) => {
    if (ts.isIdentifier(node)) {
      const p = node.parent;
      const isKey = p && ((ts.isPropertyAccessExpression(p) && p.name === node) || (ts.isPropertyAssignment(p) && p.name === node) || ts.isJsxAttribute(p) || (ts.isQualifiedName(p) && p.right === node) || ts.isPropertySignature(p) || ts.isMethodDeclaration(p) || ts.isShorthandPropertyAssignment(p));
      // Only uses that name an API: a call, a tag, `new`, a type, or a constant's base
      // (`RATE_LIMIT_DEFAULTS.submit`). A lowercase base (`request.headers`) is the snippet's own.
      const asType = p && (ts.isTypeReferenceNode(p) || ts.isExpressionWithTypeArguments(p) || ts.isTypeQueryNode(p));
      const asValue = p && (((ts.isCallExpression(p) || ts.isNewExpression(p) || ts.isTaggedTemplateExpression(p)) && (p.expression ?? p.tag) === node) || ((ts.isJsxOpeningElement(p) || ts.isJsxSelfClosingElement(p) || ts.isJsxClosingElement(p)) && p.tagName === node) || (ts.isPropertyAccessExpression(p) && p.expression === node && /^[A-Z]/.test(node.text)));
      if (!isKey && (asType || asValue) && !GLOBALS.has(node.text)) {
        if (!used.has(node.text) || !asType) used.set(node.text, asType ? "type" : "value");
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { declared, used, syntaxErrors: sf.parseDiagnostics?.length ?? 0 };
}

/** Builds the snippet a fenced block is checked as: the block, plus imports for the Genesis names it uses. */
function prepareBlock(block, index, home) {
  const tsx = block.lang === "tsx";
  // Docs write JSX lines one after another (`<A />` then `<B />`), which isn't a program. Try the
  // block as is, then as a fragment's children, then with each top-level element its own statement.
  // A `…` placeholder (`useResourcePage({ … })`, `<DataFilters … />`) is dropped first.
  const tries = [];
  for (const source of new Set([block.code, block.code.replace(/…/g, "")])) {
    tries.push({ code: source, offset: 0 });
    if (tsx && source.trimStart().startsWith("<")) tries.push({ code: `const __docExample = (<>\n${source}\n</>);`, offset: 1 });
    if (tsx) tries.push({ code: source.replace(/^<(?=[A-Za-z])/gm, ";<"), offset: 0 });
  }
  let code;
  let names;
  let offset = 0;
  for (const t of tries) {
    const parsed = namesIn(t.code, tsx);
    if (!parsed.syntaxErrors) {
      ({ code, offset } = t);
      names = parsed;
      break;
    }
  }
  if (!names) return null;
  const imports = [];
  for (const [name, use] of names.used) {
    if (names.declared.has(name)) continue;
    const spec = pickEntry(index, name, use, home);
    if (spec) imports.push(`import { ${name} } from ${JSON.stringify(spec)};`);
  }
  const header = imports.length ? `${imports.join(" ")}\n` : "\n";
  // `export {}` keeps each snippet a module, so names don't clash across snippets.
  return { text: `${header}${code}\nexport {};\n`, lineOffset: 1 + offset, tsx };
}

/** The entry point to import a name from: a value export for a value use, the home package first. */
function pickEntry(index, name, use, home) {
  const options = index.get(name);
  if (!options?.length) return null;
  const fit = options.filter((o) => (use === "value" ? o.value : o.type));
  const pool = fit.length ? fit : options;
  return (pool.find((o) => o.pkg === home) ?? pool.find((o) => o.pkg === "@marktiderman/genesis-ui") ?? pool.find((o) => o.pkg === "@marktiderman/genesis-core") ?? pool[0]).specifier;
}

function compilerOptions(entries) {
  const paths = {};
  for (const e of entries) paths[e.specifier] = [e.types];
  return {
    strict: true,
    noImplicitAny: false,
    skipLibCheck: true,
    noEmit: true,
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ES2022,
    lib: ["lib.es2023.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
    types: [],
    paths,
    allowArbitraryExtensions: true,
    resolveJsonModule: true,
    esModuleInterop: true,
  };
}

function createProgram(root, entries, virtual) {
  const options = compilerOptions(entries);
  const host = ts.createCompilerHost(options, true);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (fileName, lang, onError, shouldCreate) =>
    virtual.has(fileName) ? ts.createSourceFile(fileName, virtual.get(fileName), lang, true) : getSourceFile(fileName, lang, onError, shouldCreate);
  const fileExists = host.fileExists.bind(host);
  host.fileExists = (f) => virtual.has(f) || fileExists(f);
  const readFile = host.readFile.bind(host);
  host.readFile = (f) => virtual.get(f) ?? readFile(f);
  return ts.createProgram([...virtual.keys()], options, host);
}

/** Every Genesis export name, with the entry points that export it and whether it is a value. */
function exportIndex(root, entries) {
  const virtual = new Map();
  const file = join(root, "packages", ".docs-check-index.ts");
  virtual.set(file, entries.map((e, i) => `import * as e${i} from ${JSON.stringify(e.specifier)};`).join("\n") + "\nexport {};\n");
  const program = createProgram(root, entries, virtual);
  const checker = program.getTypeChecker();
  const index = new Map();
  for (const e of entries) {
    const sf = program.getSourceFile(e.types);
    const symbol = sf && checker.getSymbolAtLocation(sf);
    if (!symbol) continue;
    for (const exp of checker.getExportsOfModule(symbol)) {
      const target = exp.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exp) : exp;
      const value = !!(target.flags & ts.SymbolFlags.Value);
      const type = !!(target.flags & (ts.SymbolFlags.Type | ts.SymbolFlags.Namespace));
      const list = index.get(exp.name) ?? [];
      list.push({ specifier: e.specifier, pkg: e.pkg, value, type });
      index.set(exp.name, list);
    }
  }
  return index;
}

/** Whether a type (or any part of an intersection or union) is declared in a Genesis package. */
function isGenesisType(type, seen = new Set()) {
  if (!type || seen.has(type)) return false;
  seen.add(type);
  for (const s of [type.aliasSymbol, type.symbol, type.target?.symbol]) {
    if (s?.declarations?.some((d) => isGenesisFile(d.getSourceFile().fileName))) return true;
  }
  if (type.types) return type.types.some((t) => isGenesisType(t, seen));
  return false;
}

function nodeAt(sf, pos) {
  let found = sf;
  const visit = (node) => {
    if (pos >= node.getStart(sf) && pos < node.getEnd()) {
      found = node;
      ts.forEachChild(node, visit);
    }
  };
  ts.forEachChild(sf, visit);
  return found;
}

/**
 * An interface left empty for module augmentation (`GenesisViewerRoles`): an
 * app declares its keys, so a doc naming one isn't wrong.
 */
function isAugmentable(checker, type) {
  const t = type && checker.getNonNullableType(type);
  const decls = t?.symbol?.declarations;
  return !!decls?.length && decls.every((d) => ts.isInterfaceDeclaration(d) && isGenesisFile(d.getSourceFile().fileName)) && checker.getPropertiesOfType(t).length === 0;
}

const declaredInGenesis = (decl) => !!decl && isGenesisFile(decl.getSourceFile().fileName);

/** Whether a diagnostic at `node` is about a Genesis API. */
function aboutGenesis(checker, node, code) {
  if (ARG_COUNT.has(code)) {
    let n = node;
    while (n && !ts.isCallExpression(n) && !ts.isNewExpression(n) && !ts.isStatement(n)) n = n.parent;
    if (!n || ts.isStatement(n)) return false;
    const sym = checker.getSymbolAtLocation(ts.isPropertyAccessExpression(n.expression) ? n.expression.name : n.expression);
    // A name the check imported for the block (line 0) isn't the doc's claim: it may mean another function.
    const imported = sym?.declarations?.[0];
    if (sym && sym.flags & ts.SymbolFlags.Alias && imported && imported.getSourceFile().getLineAndCharacterOfPosition(imported.getStart()).line === 0) return false;
    const target = sym && sym.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(sym) : sym;
    if (target?.declarations?.some(declaredInGenesis)) return true;
    return declaredInGenesis(checker.getResolvedSignature(n)?.declaration);
  }
  if (MISSING_EXPORT.has(code)) {
    let n = node;
    while (n && !ts.isImportDeclaration(n)) n = n.parent;
    return !!n && ts.isStringLiteral(n.moduleSpecifier) && n.moduleSpecifier.text.startsWith("@marktiderman/");
  }
  for (let n = node; n; n = n.parent) {
    if (ts.isJsxAttribute(n) || ts.isJsxAttributes(n)) {
      const el = ts.isJsxAttributes(n) ? n.parent : n.parent.parent;
      const sym = checker.getSymbolAtLocation(el.tagName);
      const target = sym && sym.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(sym) : sym;
      return !!target?.declarations?.some((d) => isGenesisFile(d.getSourceFile().fileName));
    }
    if (ts.isObjectLiteralExpression(n)) {
      const type = checker.getContextualType(n);
      return isGenesisType(type) && !isAugmentable(checker, type);
    }
    if (ts.isPropertyAccessExpression(n) && UNKNOWN_PROPERTY.has(code)) {
      const type = checker.getTypeAtLocation(n.expression);
      return isGenesisType(type) && !isAugmentable(checker, type);
    }
    if (ts.isIndexedAccessTypeNode(n) && UNKNOWN_PROPERTY.has(code)) return isGenesisType(checker.getTypeFromTypeNode(n.objectType));
    if (ts.isCallExpression(n) || ts.isStatement(n)) break;
  }
  return false;
}

/** A literal value, or a prop or key whose value is one. */
function isLiteral(node) {
  const literal = (n) => !!n && (ts.isStringLiteral(n) || ts.isNumericLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || n.kind === ts.SyntaxKind.TrueKeyword || n.kind === ts.SyntaxKind.FalseKeyword);
  if (literal(node)) return true;
  const p = node.parent;
  if (p && ts.isJsxAttribute(p)) {
    const init = p.initializer;
    return literal(init) || (!!init && ts.isJsxExpression(init) && literal(init.expression));
  }
  if (p && ts.isPropertyAssignment(p) && p.name === node) return literal(p.initializer);
  return false;
}

const message = (d) => ts.flattenDiagnosticMessageText(d.messageText, " ").replace(/\s+/g, " ");

/** Features that may carry a planned marker: id -> status. */
function featureStatuses(root) {
  const file = join(root, "features.json");
  if (!existsSync(file)) return null;
  const json = JSON.parse(readFileSync(file, "utf8"));
  return new Map((json.features ?? []).map((f) => [f.id, f.status]));
}

/**
 * Checks Markdown files. `docs` is `[{ file, markdown }]`; returns findings
 * `{ file, line, message }`, sorted.
 */
export function checkDocs({ root, docs, features = featureStatuses(root) }) {
  const entries = entryPoints(root);
  const index = exportIndex(root, entries);
  const findings = [];
  const unparsed = [];
  const virtual = new Map();
  /** file -> { doc, kind, line, ...} per virtual file, with line maps. */
  const meta = new Map();
  let n = 0;

  for (const { file, markdown } of docs) {
    const parsed = parseMarkdown(markdown);
    const home = homePackage(root, file);
    for (const p of parsed.planned) {
      const status = features?.get(p.feature);
      if (features && !status) findings.push({ file, line: p.line, message: `**Planned** names \`${p.feature}\`, which isn't in features.ts` });
      else if (status && !["planned", "building"].includes(status)) findings.push({ file, line: p.line, message: `**Planned** names \`${p.feature}\`, which is ${status}: drop the marker (or the doc's claim)` });
    }
    for (const block of parsed.blocks) {
      if (block.skip || block.planned) continue;
      const prepared = prepareBlock(block, index, home);
      if (!prepared) {
        unparsed.push({ file, line: block.line });
        continue;
      }
      const name = join(root, "packages", `.docs-check-${n++}.${prepared.tsx ? "tsx" : "ts"}`);
      virtual.set(name, prepared.text);
      meta.set(name, { kind: "block", file, line: block.line, lineOffset: prepared.lineOffset });
    }
    const spanUnits = parsed.units.map((u) => ({ unit: u, checks: spanChecks(u) })).filter((x) => x.checks.length);
    const apiLists = new Map();
    for (const u of parsed.units) if (u.apis) apiLists.set(u.apis.join("\u0000"), u.apis);
    if (!apiLists.size) continue;
    // One snippet per doc: each listed type as an alias, then one line per check per type.
    const lines = [];
    const lineInfo = [];
    const used = new Set();
    for (const apis of apiLists.values()) for (const a of apis) for (const [k] of namesIn(`type X = ${a};`, false).used) used.add(k);
    const imports = [...used].map((k) => [k, pickEntry(index, k, "type", home)]).filter(([, s]) => s);
    lines.push(imports.map(([k, s]) => `import type { ${k} } from ${JSON.stringify(s)};`).join(" "));
    lineInfo.push(null);
    const alias = new Map();
    for (const [key, apis] of apiLists) {
      alias.set(key, apis.map((a) => {
        const id = `__Api${alias.size}_${lines.length}`;
        lines.push(`type ${id} = ${a};`);
        lineInfo.push({ kind: "api", api: a, line: parsed.units.find((u) => u.apis?.join("\u0000") === key)?.line ?? 1 });
        return id;
      }));
    }
    let c = 0;
    for (const { unit, checks } of spanUnits) {
      const ids = alias.get(unit.apis.join("\u0000"));
      for (const check of checks) {
        const group = { unit, check, results: [] };
        for (const id of ids) {
          const access = check.path.reduce((t, k) => `NonNullable<${t}>[${JSON.stringify(k)}]`, id);
          const first = `NonNullable<${id}>[${JSON.stringify(check.path[0])}]`;
          const result = { path: lines.length, first: -1, value: -1, errors: [] };
          lines.push(`type __C${c++} = ${access};`);
          lineInfo.push({ kind: "check", group, result, role: "path" });
          if (!check.strict) {
            result.first = lines.length;
            lines.push(`type __C${c++} = ${first};`);
            lineInfo.push({ kind: "check", group, result, role: "first" });
          }
          if (check.value !== undefined) {
            result.value = lines.length;
            lines.push(`const __V${c++}: ${access} = ${JSON.stringify(check.value)};`);
            lineInfo.push({ kind: "check", group, result, role: "value" });
          }
          group.results.push(result);
        }
        lineInfo.groups ??= [];
        lineInfo.groups.push(group);
      }
    }
    lines.push("export {};");
    const name = join(root, "packages", `.docs-check-${n++}.ts`);
    virtual.set(name, lines.join("\n"));
    meta.set(name, { kind: "spans", file, lineInfo });
  }

  if (virtual.size) {
    const program = createProgram(root, entries, virtual);
    const checker = program.getTypeChecker();
    for (const [name, m] of meta) {
      const sf = program.getSourceFile(name);
      const diags = [...program.getSyntacticDiagnostics(sf), ...program.getSemanticDiagnostics(sf)];
      if (m.kind === "block") {
        for (const d of diags) {
          if (d.start === undefined) continue;
          if (![...MISSING_EXPORT, ...UNKNOWN_KEY, ...UNKNOWN_PROPERTY, ...NOT_ASSIGNABLE, ...ARG_COUNT].includes(d.code)) continue;
          const node = nodeAt(sf, d.start);
          if (NOT_ASSIGNABLE.has(d.code) && !/does not exist/.test(message(d)) && !isLiteral(node)) continue;
          if (!aboutGenesis(checker, node, d.code)) continue;
          const { line } = sf.getLineAndCharacterOfPosition(d.start);
          findings.push({ file: m.file, line: m.line + line - m.lineOffset, message: `example: ${message(d)}` });
        }
        continue;
      }
      for (const d of diags) {
        if (d.start === undefined) continue;
        const { line } = sf.getLineAndCharacterOfPosition(d.start);
        const info = m.lineInfo[line];
        if (!info) continue;
        if (info.kind === "api") findings.push({ file: m.file, line: info.line, message: `<!-- api: ${info.api} --> doesn't resolve: ${message(d)}` });
        else info.result.errors.push({ role: info.role, text: message(d) });
      }
      for (const group of m.lineInfo.groups ?? []) {
        const { check, unit } = group;
        const ok = group.results.some((r) => !r.errors.length);
        if (ok) continue;
        if (!check.strict && group.results.every((r) => r.errors.some((e) => e.role === "first"))) continue;
        // Some listed type has the key and only refuses the value.
        const valueOnly = group.results.some((r) => r.errors.length && r.errors.every((e) => e.role === "value"));
        const apis = unit.apis.join(", ");
        findings.push({
          file: m.file,
          line: unit.line,
          message: valueOnly
            ? `\`${check.text}\`: ${apis} doesn't accept "${check.value}" for \`${check.path.join(".")}\``
            : `\`${check.text}\`: ${apis} has no \`${check.path.join(".")}\``,
        });
      }
    }
  }
  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.message.localeCompare(b.message));
  // Blocks that don't parse (`…` placeholders, pseudo-code) aren't checked; `--verbose` lists them.
  Object.defineProperty(findings, "unparsed", { value: unparsed });
  return findings;
}

/** The package a doc lives in, so its examples import from it first. */
function homePackage(root, file) {
  const rel = relative(root, resolve(root, file)).split(sep);
  if (rel[0] !== "packages" || !rel[1]) return null;
  const pj = join(root, "packages", rel[1], "package.json");
  return existsSync(pj) ? JSON.parse(readFileSync(pj, "utf8")).name : null;
}

/** The Markdown files the check scans, relative to the root. */
export function docFiles(root) {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith(".md") && name !== "component-reference.md") out.push(relative(root, full));
    }
  };
  if (existsSync(join(root, "README.md"))) out.push("README.md");
  if (existsSync(join(root, "docs"))) walk(join(root, "docs"));
  // Every package's Markdown, except changelogs (history) and what's built or installed.
  const walkPackage = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walkPackage(full);
      else if (name.endsWith(".md") && name !== "CHANGELOG.md") out.push(relative(root, full));
    }
  };
  const packages = join(root, "packages");
  if (existsSync(packages)) for (const name of readdirSync(packages).sort()) if (statSync(join(packages, name)).isDirectory()) walkPackage(join(packages, name));
  const apps = join(root, "apps");
  if (existsSync(apps)) {
    for (const name of readdirSync(apps).sort()) {
      for (const doc of ["README.md", "SKILL.md", "EXTENDING.md"]) {
        if (existsSync(join(apps, name, doc))) out.push(join("apps", name, doc));
      }
    }
  }
  return out;
}

function main(argv) {
  const rootAt = argv.indexOf("--root");
  const root = resolve(rootAt >= 0 ? argv[rootAt + 1] : join(dirname(new URL(import.meta.url).pathname), ".."));
  const verbose = argv.includes("--verbose");
  const named = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--root");
  const files = named.length ? named.map((f) => relative(root, resolve(f))) : docFiles(root);
  const entries = entryPoints(root);
  const unbuilt = entries.filter((e) => !existsSync(e.types));
  if (unbuilt.length) {
    console.error(`check-docs-match-exports: ${unbuilt.length} entry points have no built types (first: ${unbuilt[0].specifier}). Run \`pnpm build:packages\` first.`);
    process.exit(1);
  }
  const docs = files.map((file) => ({ file, markdown: readFileSync(join(root, file), "utf8") }));
  const findings = checkDocs({ root, docs });
  for (const f of findings) console.log(`${f.file}:${f.line}: ${f.message}`);
  if (verbose) for (const u of findings.unparsed) console.log(`${u.file}:${u.line}: (not checked: the block doesn't parse)`);
  // Blocks that don't parse aren't checked: say how many, every run, so the gap stays visible.
  const skipped = findings.unparsed.length;
  console.log(`check-docs-match-exports: ${skipped} fenced block${skipped === 1 ? "" : "s"} couldn't be parsed and weren't checked${skipped && !verbose ? " (--verbose lists them)" : ""}.`);
  if (verbose || findings.length) console.log(`\n${docs.length} docs checked, ${findings.length} finding${findings.length === 1 ? "" : "s"}.`);
  if (findings.length) {
    console.log("A doc names API the packages don't have. Fix the doc, or mark it **Planned** with its features.ts id (scripts/check-docs-match-exports.mjs).");
    process.exit(1);
  }
  if (!verbose) console.log(`check-docs-match-exports: ${docs.length} docs match the packages' exports.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main(process.argv.slice(2));
