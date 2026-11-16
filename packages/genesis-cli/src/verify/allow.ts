/**
 * Known findings, the doctor's way: each entry names what it covers and why, and the list only
 * shrinks (a full run warns on an entry that covered nothing, so it gets removed).
 */
import type { Engine } from "./matrix.js";
import type { CheckId, Finding } from "./page.js";
import { matchesPattern } from "./routes.js";

export interface AllowEntry {
  check: CheckId;
  /** The axe rule, for `axe` entries. */
  rule?: string;
  /**
   * The page: a path (`/items`), a route pattern (`/items/:id`, `/docs/*`), a story id
   * (`story:forms--default`), or a story prefix ending in `*` (`story:forms--*`).
   */
  page: string;
  /** Viewport names (`320`, `zoom-400`); every viewport when left out. */
  viewports?: string[];
  engines?: Engine[];
  /** A substring of the finding's target (its path or its quoted accessible name); any target when left out. */
  target?: string;
  reason: string;
}

export interface Where {
  page: string;
  viewport: string;
  engine: Engine;
}

export function matchesPage(pattern: string, page: string): boolean {
  if (pattern.startsWith("story:") || page.startsWith("story:")) return pattern.endsWith("*") ? page.startsWith(pattern.slice(0, -1)) : pattern === page;
  return pattern === page || matchesPattern(pattern, page);
}

export function allowFor(entries: AllowEntry[], finding: Finding, where: Where): AllowEntry | undefined {
  return entries.find(
    (e) =>
      e.check === finding.check &&
      (e.rule === undefined || e.rule === finding.rule) &&
      matchesPage(e.page, where.page) &&
      (!e.viewports || e.viewports.includes(where.viewport)) &&
      (!e.engines || e.engines.includes(where.engine)) &&
      (e.target === undefined || (finding.target ?? "").includes(e.target)),
  );
}

/** Splits findings into the ones an entry covers, `info` notes (never failing), and the rest. */
export function applyAllow(entries: AllowEntry[], findings: Finding[], where: Where) {
  const allowed: Array<{ finding: Finding; entry: AllowEntry }> = [];
  const notes: Finding[] = [];
  const failing: Finding[] = [];
  for (const finding of findings) {
    if (finding.level === "info") {
      notes.push(finding);
      continue;
    }
    const entry = allowFor(entries, finding, where);
    if (entry) allowed.push({ finding, entry });
    else failing.push(finding);
  }
  return { allowed, notes, failing };
}

export function validateAllow(entries: AllowEntry[]): string[] {
  return entries.flatMap((e, i) => (e.reason?.trim() ? [] : [`allow entry ${i} (${e.check} on ${e.page}) has no reason`]));
}

export function formatFinding(f: Finding): string {
  return `${f.check}${f.rule ? `/${f.rule}` : ""}${f.target ? ` at ${f.target}` : ""}: ${f.message}`;
}
