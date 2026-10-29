/**
 * `genesis upstream check|export`: an app's register of what it needed from Genesis
 * (feature `genesis-upstream`). The register is `docs/genesis-upstream.md`, one Markdown table:
 *
 *   | id | kind | status | feature | package | local | need |
 *   | --- | --- | --- | --- | --- | --- | --- |
 *   | kanban-swimlanes | extension | candidate | data-views | @marktiderman/genesis-ui | src/components/lanes.tsx | Swimlanes on KanbanBoard |
 *
 * - `kind`: gap (nothing in Genesis), extension (a part with no prop, variant or slot for it) or
 *   invention (the app built it; it may belong in Genesis).
 * - `status`: candidate, proposed (filed with Genesis), promoted (Genesis shipped it) or declined.
 * - `local`: the app's own code for it, a repo-relative path, or empty.
 *
 * `check` validates the table, and flags a promoted entry whose local code is still there (the
 * app should delete its copy). `export <id>` prints the new-issue link for Genesis's gap form,
 * filled in from the entry; it sends nothing.
 */
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";

export const UPSTREAM_KINDS = ["gap", "extension", "invention"] as const;
export const UPSTREAM_STATUSES = ["candidate", "proposed", "promoted", "declined"] as const;
export const REGISTER_PATH = "docs/genesis-upstream.md";
const COLUMNS = ["id", "kind", "status", "feature", "package", "local", "need"] as const;
const ISSUE_FORM = "https://github.com/marktiderman/genesis/issues/new";

/** A table row's cells: split on pipes outside inline code and not escaped (`\\|`). */
export function cells(line: string): string[] {
  const out: string[] = [];
  let cell = "";
  let code = false;
  const text = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === "\\" && text[i + 1] === "|") {
      cell += "|";
      i++;
    } else if (ch === "`") {
      code = !code;
      cell += ch;
    } else if (ch === "|" && !code) {
      out.push(cell);
      cell = "";
    } else cell += ch;
  }
  out.push(cell);
  return out.map((c) => c.trim()).map((c) => (/^`[^`]*`$/.test(c) ? c.slice(1, -1) : c));
}

export interface UpstreamEntry {
  id: string;
  kind: (typeof UPSTREAM_KINDS)[number];
  status: (typeof UPSTREAM_STATUSES)[number];
  feature?: string;
  package?: string;
  local?: string;
  need: string;
}

/** The register's entries and what is wrong with it. */
export function readRegister(markdown: string): { entries: UpstreamEntry[]; problems: string[] } {
  const problems: string[] = [];
  const entries: UpstreamEntry[] = [];
  const lines = markdown.split("\n");
  const isRow = (l: string) => l.trim().startsWith("|");
  // The register is the first table whose header has every column; it ends at the first line that isn't a row.
  const start = lines.findIndex((l) => isRow(l) && COLUMNS.every((c) => cells(l).map((h) => h.toLowerCase()).includes(c)));
  if (start < 0) {
    return { entries, problems: [lines.some(isRow) ? `no table has the columns ${COLUMNS.join(", ")}` : `no table: add one with the columns ${COLUMNS.join(", ")}`] };
  }
  const after = lines.slice(start + 1).findIndex((l) => !isRow(l));
  const rows = lines.slice(start, after < 0 ? undefined : start + 1 + after);
  const header = cells(rows[0]!).map((h) => h.toLowerCase());
  const at = (row: string[], c: (typeof COLUMNS)[number]) => row[header.indexOf(c)] ?? "";
  const ids = new Set<string>();
  for (const line of rows.slice(1)) {
    const row = cells(line);
    if (row.every((c) => /^:?-+:?$/.test(c))) continue;
    const id = at(row, "id");
    const where = id || `row "${line.trim().slice(0, 40)}"`;
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) problems.push(`${where}: id must be lowercase words and dashes`);
    else if (ids.has(id)) problems.push(`${id}: listed twice`);
    ids.add(id);
    const kind = at(row, "kind");
    const status = at(row, "status");
    if (!(UPSTREAM_KINDS as readonly string[]).includes(kind)) problems.push(`${where}: kind must be ${UPSTREAM_KINDS.join(", ")}`);
    if (!(UPSTREAM_STATUSES as readonly string[]).includes(status)) problems.push(`${where}: status must be ${UPSTREAM_STATUSES.join(", ")}`);
    const need = at(row, "need");
    if (!need || need === "-") problems.push(`${where}: say the need in one line`);
    const local = at(row, "local");
    if (local && local !== "-" && (path.isAbsolute(local) || /^[A-Za-z]:[\\/]/.test(local) || local.split(/[\\/]/).includes(".."))) {
      problems.push(`${where}: local must be a path inside the app, relative to its root`);
    }
    const opt = (c: (typeof COLUMNS)[number]) => (at(row, c) && at(row, c) !== "-" ? at(row, c) : undefined);
    entries.push({ id, kind: kind as UpstreamEntry["kind"], status: status as UpstreamEntry["status"], need, ...(opt("feature") ? { feature: opt("feature") } : {}), ...(opt("package") ? { package: opt("package") } : {}), ...(opt("local") ? { local: opt("local") } : {}) });
  }
  return { entries, problems };
}

/** `genesis upstream check`: the register's problems, with a promoted entry whose local copy remains. */
export function checkUpstream(root: string): { entries: UpstreamEntry[]; problems: string[]; warnings: string[]; missing?: true } {
  const file = path.join(root, REGISTER_PATH);
  if (!existsSync(file)) return { entries: [], problems: [], warnings: [`no ${REGISTER_PATH}: nothing to check (add it when the app first needs something Genesis lacks)`], missing: true };
  const { entries, problems } = readRegister(readFileSync(file, "utf8"));
  const warnings: string[] = [];
  for (const e of entries) {
    if (e.local && !existsSync(path.join(root, e.local))) {
      if (e.status !== "promoted" && e.status !== "declined") problems.push(`${e.id}: local ${e.local} doesn't exist`);
    } else if (e.local && e.status === "promoted") {
      warnings.push(`${e.id}: Genesis ships it now; delete ${e.local} and use ${e.package ?? e.feature ?? "the Genesis version"}`);
    }
  }
  return { entries, problems, warnings };
}

/** `genesis upstream export <id>`: the gap form's link, filled in from the entry. */
export function exportIssueUrl(entry: UpstreamEntry): string {
  const kindOption = { gap: "gap (Genesis has nothing for it)", extension: "extension (a Genesis part is close but has no prop, variant or slot for it)", invention: "invention (the app built it; it may belong in Genesis)" }[entry.kind];
  // The kind goes in the title too: GitHub fills text fields from the link, not always dropdowns.
  const title = `[Gap: ${entry.kind}] ${entry.need}`;
  const params = new URLSearchParams({ template: "gap.yml", title: title.length > 120 ? `${title.slice(0, 117)}…` : title, kind: kindOption, need: entry.need, register: entry.id });
  if (entry.feature) params.set("feature", entry.feature);
  if (entry.package) params.set("package", entry.package);
  return `${ISSUE_FORM}?${params.toString()}`;
}
