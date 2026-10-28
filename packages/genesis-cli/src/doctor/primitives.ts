/**
 * The primitives catalog: for each need ("a list screen", "a record page",
 * "data access"), the Genesis primitive to use, its import and its docs. Built
 * from every installed package's `genesis.doctor` declaration plus a short
 * static core, so the guidance agents read and the rules the doctor enforces
 * come from one place and can't drift.
 *
 * - `genesis primitives` prints it.
 * - `genesis agents` writes it as `.claude/skills/genesis/SKILL.md` and a
 *   marked block in the app's AGENTS.md.
 * - `agent-guide-stale` warns when either no longer matches the installed packages.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { preferRules, type DeclaringPackage } from "./package-rules.js";
import type { DoctorContext } from "./types.js";

const GENESIS_DOCS = "https://github.com/marktiderman/genesis/blob/main/docs";

/** One row of the catalog. */
export interface PrimitiveRow {
  need: string;
  use: string;
  import?: string;
  docs?: string;
  /** The rule that enforces it, when one does. */
  rule?: string;
  /** Where the row comes from: a package name, or `genesis-cli` for the static core. */
  from: string;
}

/** What every Genesis app shares, whatever is installed. */
const CORE: PrimitiveRow[] = [
  {
    need: "anything, before building it",
    use: "search what exists: `genesis features find <term>`, this catalog, and the doctor's \"Available but unused\" list",
    docs: `${GENESIS_DOCS}/FRAMEWORK.md`,
    from: "genesis-cli",
  },
  {
    need: "a page inside the app shell",
    use: "a Genesis page layout (`DashboardPage`, `SettingsPage`, `FormPage`, `DetailPage`, from `@marktiderman/genesis-ui`) or `ResourceView` (from `@marktiderman/genesis-ui/data`)",
    import: "@marktiderman/genesis-ui",
    rule: "page-layout",
    from: "genesis-cli",
  },
  {
    need: "a button, input, table, dialog or other component",
    use: "the Genesis component, never the raw tag or a local copy",
    import: "@marktiderman/genesis-ui/<component>",
    rule: "raw-tag",
    from: "genesis-cli",
  },
  {
    need: "colors and spacing",
    use: "semantic tokens (`bg-primary`, `text-muted-foreground`), never literal colors",
    import: "@marktiderman/genesis-design-system",
    rule: "raw-color",
    from: "genesis-cli",
  },
  {
    need: "something no primitive covers",
    use: "write the gap up for Genesis (an issue or a proposal) first, then invent in the app, on Genesis primitives",
    docs: `${GENESIS_DOCS}/FRAMEWORK.md`,
    from: "genesis-cli",
  },
];

/** The catalog: the static core, then each package's rules and primitives, in package order. */
export function primitivesCatalog(packages: readonly DeclaringPackage[]): PrimitiveRow[] {
  const rows = [...CORE];
  for (const rule of preferRules(packages)) {
    rows.push({
      need: rule.need ?? rule.id.replace(/-/g, " "),
      use: rule.use,
      ...(rule.import ? { import: rule.import } : {}),
      ...(rule.docs ? { docs: rule.docs } : {}),
      rule: rule.ruleId,
      from: rule.package,
    });
  }
  for (const p of packages) {
    for (const e of p.declaration?.primitives ?? []) {
      rows.push({ need: e.need, use: e.use, ...(e.import ? { import: e.import } : {}), ...(e.docs ? { docs: e.docs } : {}), from: p.name });
    }
  }
  return rows;
}

/** How many rules the packages declare, and how many packages declare at least one. */
export function primitivesSummary(packages: readonly DeclaringPackage[]): { rules: number; packages: number } {
  const rules = preferRules(packages);
  const withPlugin = packages.filter((p) => p.declaration?.plugin);
  return { rules: rules.length + withPlugin.length, packages: new Set([...rules.map((r) => r.package), ...withPlugin.map((p) => p.name)]).size };
}

/** A Markdown table cell: pipes escaped, one line, and `<Name>` written as code so it isn't read as an HTML tag. */
const cell = (s: string | undefined) =>
  (s ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\n/g, " ")
    .replace(/(`[^`]*`)|<([A-Za-z][\w.]*)>/g, (m, code: string | undefined, name: string | undefined) => code ?? `\`<${name}>\``);

/** An import as one Markdown code span: pipes escaped, one line, no backticks of its own. */
const importCell = (s: string) => `\`${s.replace(/`/g, "").replace(/\|/g, "\\|").replace(/\n/g, " ")}\``;

/** The catalog as a Markdown table. */
export function catalogTable(rows: readonly PrimitiveRow[], options: { docs?: boolean } = {}): string {
  const head = options.docs ? "| Need | Use | Import | Enforced by | Docs |\n| --- | --- | --- | --- | --- |" : "| Need | Use | Import |\n| --- | --- | --- |";
  const body = rows.map((r) =>
    options.docs
      ? `| ${cell(r.need)} | ${cell(r.use)} | ${r.import ? importCell(r.import) : ""} | ${r.rule ? `\`${r.rule}\`` : ""} | ${r.docs ? `[docs](${r.docs})` : ""} |`
      : `| ${cell(r.need)} | ${cell(r.use)} | ${r.import ? importCell(r.import) : ""} |`,
  );
  return [head, ...body].join("\n");
}

/** `genesis primitives`: the catalog for a terminal. */
export function formatPrimitives(rows: readonly PrimitiveRow[]): string {
  const lines: string[] = ["Genesis primitives: what to use for each need (reuse, then extend, then invent).", ""];
  for (const r of rows) {
    lines.push(`- ${r.need}: ${r.use}`);
    if (r.import) lines.push(`    import  ${r.import}`);
    if (r.rule) lines.push(`    rule    ${r.rule}`);
    if (r.docs) lines.push(`    docs    ${r.docs}`);
  }
  return lines.join("\n");
}

export const SKILL_PATH = ".claude/skills/genesis/SKILL.md";
export const AGENTS_START = "<!-- genesis-primitives:start -->";
export const AGENTS_END = "<!-- genesis-primitives:end -->";

/** The rules every agent follows, in both generated files. */
const RULES = [
  "Use the Genesis primitive for the need first: reuse, then extend, then invent (docs/FRAMEWORK.md, G1 to G6).",
  "Never copy an older screen as a template. Old screens predate the primitives; the doctor flags what they did.",
  "A list screen is a view (`defineView`) rendered by `ResourceView`; a record page is `ResourceWorkspace`; on the phone, `NativeResourceView`.",
  "Screens never call the database client (`supabase.from`, `.rpc`) directly: reads go through a view or a named data function, writes through the resource's provider rules.",
  "When no primitive fits, write the gap up for Genesis before inventing, then invent in the app on Genesis primitives.",
  "Run `genesis doctor` before you finish; it enforces these rules.",
];

/** `.claude/skills/genesis/SKILL.md`, generated. */
export function renderSkill(rows: readonly PrimitiveRow[]): string {
  return [
    "---",
    "name: genesis",
    "description: Which Genesis primitive to use for each need (list screens, record pages, forms, data access, dates and more), with its import and docs. Load before writing any screen, list, form or data access in a Genesis app.",
    "---",
    "",
    "<!-- Generated by `genesis agents` from the installed Genesis packages. Don't edit; run `genesis agents` after upgrading Genesis. -->",
    "",
    "# Genesis primitives",
    "",
    ...RULES.map((r) => `- ${r}`),
    "",
    "## What to use for each need",
    "",
    catalogTable(rows, { docs: true }),
    "",
    "`genesis primitives` prints the same list; `genesis doctor` enforces the rules named above.",
    "",
  ].join("\n");
}

/** The AGENTS.md block, generated (markers included). */
export function renderAgentsBlock(rows: readonly PrimitiveRow[]): string {
  return [
    AGENTS_START,
    "## Building with Genesis",
    "",
    "Generated by `genesis agents` from the installed Genesis packages. Don't edit this block; run `genesis agents` after upgrading Genesis.",
    "",
    `Before writing a screen, read \`${SKILL_PATH}\` (or run \`genesis primitives\`).`,
    "",
    ...RULES.map((r) => `- ${r}`),
    "",
    catalogTable(rows),
    AGENTS_END,
  ].join("\n");
}

/** Where the block's markers are: absent (neither), broken (one, or out of order), or the block's span. */
function blockSpan(text: string): "absent" | "broken" | { start: number; end: number } {
  const s = text.indexOf(AGENTS_START);
  const e = text.indexOf(AGENTS_END);
  if (s < 0 && e < 0) return "absent";
  // Exactly one of each, in order: a copied marker would otherwise pair with the wrong one and the write would eat the text between.
  if (s < 0 || e < 0 || e < s || text.indexOf(AGENTS_START, s + 1) >= 0 || text.indexOf(AGENTS_END, e + 1) >= 0) return "broken";
  return { start: s, end: e + AGENTS_END.length };
}

/** The AGENTS.md text with the block in place: replaced between its markers, or appended, in the file's own line endings. */
export function mergeAgentsBlock(agents: string | null, block: string): string {
  const text = agents ?? "# Agent notes\n";
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const own = block.replace(/\n/g, eol);
  const span = blockSpan(text);
  if (span === "broken") throw new Error(`AGENTS.md has a broken ${AGENTS_START} … ${AGENTS_END} block; fix it by hand.`);
  if (span === "absent") return `${text.replace(/\s*$/, "")}${eol}${eol}${own}${eol}`;
  return `${text.slice(0, span.start)}${own}${text.slice(span.end)}`;
}

/** The block currently in AGENTS.md (markers included, line endings as `\n`), "broken" when a marker is missing or out of order, or null. */
export function currentAgentsBlock(agents: string | null): string | "broken" | null {
  if (!agents) return null;
  const span = blockSpan(agents);
  if (span === "absent") return null;
  if (span === "broken") return "broken";
  return agents.slice(span.start, span.end).replace(/\r\n/g, "\n");
}

const read = (file: string) => (existsSync(file) ? readFileSync(file, "utf8") : null);

/** `genesis agents`: write the skill and the AGENTS.md block. Returns the files it changed. Writes nothing when AGENTS.md's block is broken. */
export function writeAgentGuide(root: string, packages: readonly DeclaringPackage[], agentsFile = "AGENTS.md"): string[] {
  const rows = primitivesCatalog(packages);
  const changed: string[] = [];
  const agents = path.join(root, agentsFile);
  const before = read(agents);
  // Merge first: a broken block throws before either file is touched.
  const after = mergeAgentsBlock(before, renderAgentsBlock(rows));
  const skill = path.join(root, SKILL_PATH);
  const skillText = renderSkill(rows);
  if (read(skill)?.replace(/\r\n/g, "\n") !== skillText) {
    mkdirSync(path.dirname(skill), { recursive: true });
    writeFileSync(skill, skillText);
    changed.push(SKILL_PATH);
  }
  if (before !== after) {
    writeFileSync(agents, after);
    changed.push(agentsFile);
  }
  return changed;
}

/** What `agent-guide-stale` found: the generated files that are missing or differ. */
export function agentGuideState(
  root: string,
  packages: readonly DeclaringPackage[],
  agentsFile = "AGENTS.md",
): { skill: "ok" | "missing" | "stale"; agents: "ok" | "missing" | "stale" | "broken" } {
  const rows = primitivesCatalog(packages);
  const skill = read(path.join(root, SKILL_PATH))?.replace(/\r\n/g, "\n") ?? null;
  const block = currentAgentsBlock(read(path.join(root, agentsFile)));
  return {
    skill: skill === null ? "missing" : skill === renderSkill(rows) ? "ok" : "stale",
    agents: block === null || block === "broken" ? (block ?? "missing") : block === renderAgentsBlock(rows) ? "ok" : "stale",
  };
}

/**
 * `agent-guide-stale`: the generated skill or AGENTS.md block doesn't match the
 * installed packages, or one of the two is missing. An app with neither is left alone.
 */
export function checkAgentGuide(ctx: DoctorContext): void {
  const state = agentGuideState(ctx.root, ctx.packages);
  // An app that hasn't adopted the guide yet isn't nagged on every run; `genesis agents` adopts it.
  if (state.skill === "missing" && state.agents === "missing") return;
  const fix = "run genesis agents and commit the result";
  if (state.skill !== "ok") {
    ctx.report({ rule: "agent-guide-stale", level: "warn", file: SKILL_PATH, message: `${state.skill === "missing" ? "is missing" : "doesn't match the installed Genesis packages"}; ${fix}` });
  }
  if (state.agents !== "ok") {
    const message = {
      missing: `has no genesis-primitives block; ${fix}`,
      broken: `has a broken genesis-primitives block (a ${AGENTS_START} or ${AGENTS_END} marker is missing, repeated or out of order); fix the markers by hand, then ${fix}`,
      stale: `has a genesis-primitives block that doesn't match the installed Genesis packages; ${fix}`,
    }[state.agents];
    ctx.report({ rule: "agent-guide-stale", level: "warn", file: "AGENTS.md", message });
  }
}
