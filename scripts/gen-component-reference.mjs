#!/usr/bin/env node
/**
 * gen-component-reference.mjs
 *
 * PRD-07 Phase D7.2 — auto-generate the canonical component reference
 * from each Genesis package's `src/index.ts` barrel.
 *
 * Why a script, not handwritten markdown: per genesis CLAUDE.md rule #2 —
 * "Enforcement > documentation. If a rule matters, it gets a hook or
 * script." Manual component lists drift the moment someone adds an export
 * and forgets the doc. This regenerates from source on demand.
 *
 * Approach (lightweight, regex-based — Path 1 in the PRD):
 *   1. Read each package's barrel: `src/index.ts`.
 *   2. For each `export { ... } from "./path"` entry, follow the import
 *      and read the source file. For `export * from "./path"`, recurse if
 *      that path is itself a barrel.
 *   3. In the source file, walk every exported declaration. For each, look
 *      for the JSDoc block immediately above the export and capture:
 *         - first paragraph as the summary
 *         - `@stability` tag (Stable / Beta / Deprecated) if present
 *      Detect Props interface by matching `<Symbol>Props` in source.
 *
 * Heavy alternative (Path 2, future): swap regex for `react-docgen`
 * or `typedoc` once we want to render every prop's type + default.
 * Tracked as a follow-up; this script is intentionally minimal.
 *
 * Output:
 *   docs/component-reference.md (committed in source control)
 *
 * Usage:
 *   pnpm gen:component-reference
 *   node scripts/gen-component-reference.mjs
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Package targets
// ---------------------------------------------------------------------------

const PACKAGES = [
  {
    name: "@marktiderman/genesis-core",
    dir: "packages/core",
    barrel: "packages/core/src/index.ts",
    description:
      "Platform-agnostic providers, hooks, and data layer. Use anywhere — web, native, Node.",
  },
  {
    name: "@marktiderman/genesis-design-system",
    dir: "packages/design-system",
    barrel: "packages/design-system/src/index.ts",
    description:
      "DTCG design tokens, brand schema, theme generators. Brand-agnostic; consumer brand packages satisfy the canonical schema.",
  },
  {
    name: "@marktiderman/genesis-ui",
    dir: "packages/ui",
    barrel: "packages/ui/src/index.ts",
    description: "Shadcn-based web components. Use in Vite / RR7 / Next surfaces.",
  },
  {
    name: "@marktiderman/genesis-ui-native",
    dir: "packages/ui-native",
    barrel: "packages/ui-native/src/index.ts",
    description: "React Native components (NativeWind v4-5). Use in Expo / RN surfaces.",
  },
  {
    name: "@marktiderman/genesis-switchboard",
    dir: "packages/data-switchboard",
    barrel: "packages/data-switchboard/src/index.ts",
    description:
      "Pluggable data layer — a resource's backing (L1 Code / L2 Airtable·Notion / L3 Supabase × tiers A/B/C) is config, not a rewrite. Read one canonical shape via data.resource('x'). See packages/data-switchboard/README.md + SWITCHBOARD.md.",
  },
];

// ---------------------------------------------------------------------------
// Regex helpers — lightweight, regex-only TS parsing
// ---------------------------------------------------------------------------

const REEXPORT_RE = /export\s+(?:type\s+)?\{([^}]+)\}\s+from\s+["']([^"']+)["'];?/g;
const REEXPORT_STAR_RE = /export\s+\*\s+from\s+["']([^"']+)["'];?/g;

// Tempered greedy token in the JSDoc body so the match can't backtrack
// past an earlier `*/` and steal a comment that belongs to a non-exported
// helper above the next export.
const DECL_RE =
  /(?:^|\n)(\/\*\*(?:(?!\*\/)[\s\S])*?\*\/\s*\n)?export\s+(function|const|let|var|class|interface|type|default function)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g;

// `Experimental` is the fourth value, added for primitives that wrap an
// upstream `unstable_*` export whose API the vendor documents as subject to
// change (docs/FRAMEWORK.md's PasswordToggleField case). Without it the tag
// simply failed to match and the component rendered as untagged — i.e. as
// "treat as Beta", which understates the risk.
const STABILITY_RE = /@stability\s+(Stable|Beta|Deprecated|Experimental)/i;

// ---------------------------------------------------------------------------
// JSDoc utilities
// ---------------------------------------------------------------------------

function parseJsDoc(jsdoc) {
  if (!jsdoc) return { summary: null, stability: null };

  // Trim outer whitespace first because the matched JSDoc block includes
  // trailing `\s*\n` between the comment and the export — without trimming,
  // the trailing-`*/` strip won't anchor.
  let body = jsdoc.trim().replace(/^\/\*\*/, "").replace(/\*\/$/, "").trim();

  body = body
    .split("\n")
    .map((l) => l.replace(/^\s*\*\s?/, ""))
    .join("\n")
    .trim();

  const stabilityMatch = body.match(STABILITY_RE);
  const stability = stabilityMatch ? stabilityMatch[1] : null;

  const lines = body.split("\n");
  const summaryLines = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") break;
    if (trimmed.startsWith("@")) break;
    summaryLines.push(trimmed);
  }
  const summary = summaryLines.join(" ").trim() || null;

  return { summary, stability };
}

// ---------------------------------------------------------------------------
// Path resolution + source scanning
// ---------------------------------------------------------------------------

function resolveImport(fromFileAbs, importPath) {
  const fromDir = dirname(fromFileAbs);
  const base = resolve(fromDir, importPath);
  const candidates = [
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

function scanSourceFile(absPath) {
  const out = new Map();
  if (!absPath || !existsSync(absPath)) return out;
  const src = readFileSync(absPath, "utf8");

  DECL_RE.lastIndex = 0;
  let m;
  while ((m = DECL_RE.exec(src)) !== null) {
    const [, jsdoc, kind, name] = m;
    const { summary, stability } = parseJsDoc(jsdoc);
    if (!out.has(name)) {
      out.set(name, { kind, summary, stability });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Recursive barrel parser — handles nested `export *` chains.
// ---------------------------------------------------------------------------

function parseBarrel(barrelAbsPath, visited = new Set()) {
  const exports = [];
  if (!existsSync(barrelAbsPath)) return exports;
  if (visited.has(barrelAbsPath)) return exports;
  visited.add(barrelAbsPath);

  const src = readFileSync(barrelAbsPath, "utf8");
  const localDecls = scanSourceFile(barrelAbsPath);

  // ---- 1. `export { ... } from "./path";` (named re-exports) ----
  REEXPORT_RE.lastIndex = 0;
  let m;
  while ((m = REEXPORT_RE.exec(src)) !== null) {
    const [full, names, importPath] = m;
    const isTypeOnly = /^export\s+type\s+/.test(full);
    const sourceFile = resolveImport(barrelAbsPath, importPath);

    // Strip JSDoc/line comments from the whole export block BEFORE splitting on
    // commas — a commented re-export (e.g. `/** @deprecated ... */ foo`) would
    // otherwise leak the comment (and any commas inside it) into the export
    // name, dumping raw multiline text into the markdown table cell.
    const cleanNames = names
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "")
      .replace(/\/\*|\*\//g, ""); // sweep any dangling comment markers from a malformed comment
    for (const raw of cleanNames.split(",")) {
      const entry = raw.replace(/\s+/g, " ").trim();
      if (!entry) continue;
      const isType = isTypeOnly || entry.startsWith("type ");
      const cleaned = entry.replace(/^type\s+/, "");
      const [orig, alias] = cleaned.split(/\s+as\s+/).map((s) => s.trim());
      const name = alias || orig;
      const scanned = sourceFile ? scanSourceFile(sourceFile) : new Map();
      const meta = scanned.get(orig) || { kind: null, summary: null, stability: null };
      const finalIsType = isType || meta.kind === "type" || meta.kind === "interface";
      exports.push({
        name,
        isType: finalIsType,
        sourceFile,
        ...meta,
      });
    }
  }

  // ---- 2. `export * from "./path";` (re-export-all) — recurse ----
  REEXPORT_STAR_RE.lastIndex = 0;
  while ((m = REEXPORT_STAR_RE.exec(src)) !== null) {
    const [, importPath] = m;
    const sourceFile = resolveImport(barrelAbsPath, importPath);
    if (!sourceFile) continue;

    const subSrc = readFileSync(sourceFile, "utf8");
    const looksLikeBarrel =
      /export\s+(\*|\{|type\s+\{)/.test(subSrc) && /from\s+["']/.test(subSrc);

    if (looksLikeBarrel) {
      const sub = parseBarrel(sourceFile, visited);
      exports.push(...sub);
    } else {
      const scanned = scanSourceFile(sourceFile);
      for (const [name, meta] of scanned.entries()) {
        const isType = meta.kind === "type" || meta.kind === "interface";
        exports.push({
          name,
          isType,
          sourceFile,
          ...meta,
        });
      }
    }
  }

  // ---- 3. In-file declarations exported directly from this barrel ----
  for (const [name, meta] of localDecls.entries()) {
    const isType = meta.kind === "type" || meta.kind === "interface";
    exports.push({
      name,
      isType,
      sourceFile: barrelAbsPath,
      ...meta,
    });
  }

  return exports;
}

// ---------------------------------------------------------------------------
// Classification + rendering
// ---------------------------------------------------------------------------

function classifyExports(exports) {
  const valueExports = [];
  const typeExports = new Set();
  for (const e of exports) {
    if (e.isType) typeExports.add(e.name);
    else valueExports.push(e);
  }

  const components = [];
  const otherValues = [];
  const usedPropsTypes = new Set();

  for (const v of valueExports) {
    const propsName = `${v.name}Props`;
    if (typeExports.has(propsName)) {
      components.push({ ...v, propsType: propsName });
      usedPropsTypes.add(propsName);
    } else {
      otherValues.push(v);
    }
  }

  const standaloneTypes = [...typeExports].filter((t) => !usedPropsTypes.has(t)).sort();
  return { components, otherValues, standaloneTypes };
}

function relForLink(absPath) {
  if (!absPath) return null;
  const rel = absPath.startsWith(REPO_ROOT) ? absPath.slice(REPO_ROOT.length + 1) : absPath;
  return `../${rel}`;
}

function renderSummary(s) {
  if (!s) return "_(no summary)_";
  const collapsed = s.replace(/\s+/g, " ").trim();
  return collapsed.length > 240 ? `${collapsed.slice(0, 237)}...` : collapsed;
}

function renderPackageSection(pkg, classification) {
  const { components, otherValues, standaloneTypes } = classification;
  const lines = [];

  lines.push(`## ${pkg.name}`);
  lines.push("");
  lines.push(pkg.description);
  lines.push("");
  lines.push(`**Barrel:** [\`${pkg.barrel}\`](../${pkg.barrel})`);
  lines.push("");

  if (components.length > 0) {
    lines.push(`### Components (${components.length})`);
    lines.push("");
    lines.push("| Name | Props | Stability | Summary |");
    lines.push("| --- | --- | --- | --- |");
    for (const c of components.slice().sort((a, b) => a.name.localeCompare(b.name))) {
      const link = relForLink(c.sourceFile);
      const nameCell = link ? `[\`${c.name}\`](${link})` : `\`${c.name}\``;
      const propsCell = `\`${c.propsType}\``;
      const stabilityCell = c.stability || "—";
      const summaryCell = renderSummary(c.summary);
      lines.push(`| ${nameCell} | ${propsCell} | ${stabilityCell} | ${summaryCell} |`);
    }
    lines.push("");
  }

  if (otherValues.length > 0) {
    lines.push(`### Other exports (${otherValues.length})`);
    lines.push("");
    lines.push(
      "Hooks, utilities, factories, and component sub-parts (no top-level `<Name>Props` type).",
    );
    lines.push("");
    lines.push("| Name | Kind | Stability | Summary |");
    lines.push("| --- | --- | --- | --- |");
    for (const v of otherValues.slice().sort((a, b) => a.name.localeCompare(b.name))) {
      const link = relForLink(v.sourceFile);
      const nameCell = link ? `[\`${v.name}\`](${link})` : `\`${v.name}\``;
      const kindCell = v.kind || "value";
      const stabilityCell = v.stability || "—";
      const summaryCell = renderSummary(v.summary);
      lines.push(`| ${nameCell} | ${kindCell} | ${stabilityCell} | ${summaryCell} |`);
    }
    lines.push("");
  }

  if (standaloneTypes.length > 0) {
    lines.push(`### Types (${standaloneTypes.length})`);
    lines.push("");
    lines.push("Type-only exports not consumed as a component's `Props`.");
    lines.push("");
    lines.push("```ts");
    lines.push(standaloneTypes.map((t) => `export type { ${t} };`).join("\n"));
    lines.push("```");
    lines.push("");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const sections = [];
  let totalComponents = 0;
  let totalOther = 0;
  let totalTypes = 0;

  for (const pkg of PACKAGES) {
    const barrelAbs = resolve(REPO_ROOT, pkg.barrel);
    const allExports = parseBarrel(barrelAbs);
    const classified = classifyExports(allExports);

    totalComponents += classified.components.length;
    totalOther += classified.otherValues.length;
    totalTypes += classified.standaloneTypes.length;

    sections.push(renderPackageSection(pkg, classified));
  }

  const header = [
    "# Genesis — Component Reference",
    "",
    "> **Auto-generated.** Do not edit by hand. Run `pnpm gen:component-reference` (or `node scripts/gen-component-reference.mjs`) to regenerate.",
    "",
    "> **Source:** [`scripts/gen-component-reference.mjs`](../scripts/gen-component-reference.mjs). Reads each Genesis package's `src/index.ts` barrel + adjacent JSDoc / `<Name>Props` types. Lightweight regex parser (PRD-07 D7.2 path 1); a `react-docgen` / `typedoc` upgrade is tracked as a follow-up.",
    "",
    `**Totals:** ${totalComponents} components · ${totalOther} other exports · ${totalTypes} standalone types across ${PACKAGES.length} packages.`,
    "",
    "**Cross-link:** [`docs/README.md`](./README.md) — canonical Genesis docs entry point.",
    "",
    "**Stability tags** (per the C2.0 convention; populate in JSDoc as `@stability Stable|Beta|Deprecated|Experimental`):",
    "",
    "- `Stable` — public API; breaking change requires major (1.x+) or minor (0.x).",
    "- `Beta` — public but volatile; signature may change without a major bump.",
    "- `Experimental` — wraps an upstream `unstable_*` API; props may change in a minor.",
    "- `Deprecated` — slated for removal; consult `MIGRATION.md` for the replacement.",
    "- `—` — untagged (default; treat as Beta until tagged).",
    "",
    "---",
    "",
  ].join("\n");

  const body = sections.join("\n---\n\n");
  const output = `${header}${body}\n`;
  const outPath = resolve(REPO_ROOT, "docs/component-reference.md");
  writeFileSync(outPath, output, "utf8");

  console.log(`[gen-component-reference] wrote ${outPath}`);
  console.log(
    `[gen-component-reference] ${totalComponents} components · ${totalOther} other exports · ${totalTypes} types · ${PACKAGES.length} packages`,
  );
}

main();
