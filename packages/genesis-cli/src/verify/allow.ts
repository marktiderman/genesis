/**
 * Known findings, the doctor's way: each entry names what it covers and why, and the list only
 * shrinks (an entry that matches nothing in a full run is stale and fails it).
 */
import type { Engine } from "./matrix.js";
import type { CheckId, Finding } from "./page.js";

export interface AllowEntry {
  check: CheckId;
  /** The axe rule, for `axe` entries. */
  rule?: string;
  /** The page: a path (`/items`), a story id (`story:forms--default`), or a prefix ending in `*`. */
  page: string;
  /** Viewport names (`320`, `zoom-400`); every viewport when left out. */
  viewports?: string[];
  engines?: Engine[];
  /** A substring of the finding's target; any target when left out. */
  target?: string;
  reason: string;
}

export interface Where {
  page: string;
  viewport: string;
  engine: Engine;
}

export function matchesPage(pattern: string, page: string): boolean {
  return pattern.endsWith("*") ? page.startsWith(pattern.slice(0, -1)) : pattern === page;
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

/** Splits findings into the ones an entry covers and the rest; entries missing a reason are errors. */
export function applyAllow(entries: AllowEntry[], findings: Finding[], where: Where) {
  const allowed: Array<{ finding: Finding; entry: AllowEntry }> = [];
  const failing: Finding[] = [];
  for (const finding of findings) {
    const entry = allowFor(entries, finding, where);
    if (entry) allowed.push({ finding, entry });
    else failing.push(finding);
  }
  return { allowed, failing };
}

export function validateAllow(entries: AllowEntry[]): string[] {
  return entries.flatMap((e, i) => (e.reason?.trim() ? [] : [`allow entry ${i} (${e.check} on ${e.page}) has no reason`]));
}

export function formatFinding(f: Finding): string {
  return `${f.check}${f.rule ? `/${f.rule}` : ""}${f.target ? ` at ${f.target}` : ""}: ${f.message}`;
}
