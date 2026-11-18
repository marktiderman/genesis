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
  /**
   * The element: the trailing parts of the finding's selector path, matched whole (`table-row >
   * button`; `:nth-of-type()`, `:nth-child()` and generated ids are ignored on both sides), with or
   * without its quoted accessible name, or the name alone (`"Save"`). Any element when left out.
   */
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

/**
 * What a selector part loses before matching: position (`:nth-…`), generated ids (Radix's
 * `#radix-…`, React's `#_r_…`) and attribute values other than data-slot, data-testid, role, type
 * and name (axe's `[datetime="…"]`), which change between renders and runs.
 */
const UNSTABLE = /:nth-(?:of-type|child)\(\d+\)|#(?:radix-|_r_|_R_)[^\s.[:#>]*|\[(?!(?:data-slot|data-testid|role|type|name)[=\]])[\w-]+(?:[~|^$*]?=(?:"[^"]*"|'[^']*'|[^\]]*))?\]/g;

/** A target split into its selector parts (no `:nth-…`) and its quoted accessible name. */
export function targetParts(target: string): { parts: string[]; name?: string } {
  const named = /\s("[^"]*")$/.exec(target);
  const path = named ? target.slice(0, named.index) : target;
  const parts = path
    .split(">")
    .map((p) => p.replace(UNSTABLE, "").trim())
    .filter(Boolean);
  return { parts, name: named?.[1] };
}

/** An `[aria-label=…]` in a selector part: stripped for the base comparison, but held to when an entry names one. */
const ARIA_LABEL = /\[aria-label(?:[~|^$*]?=(?:"[^"]*"|'[^']*'|[^\]]*))?\]/g;

function rawParts(target: string): string[] {
  const named = /\s("[^"]*")$/.exec(target);
  return (named ? target.slice(0, named.index) : target).split(">").map((p) => p.trim()).filter(Boolean);
}

/**
 * Whether an entry's target names a finding's element: its accessible name exactly, or the trailing
 * selector parts of the finding's path, each part whole. Never a substring: `html` doesn't match
 * `[data-slot="html-preview"]`, and `#tabs` doesn't match `#tabs-2`. An entry that names an
 * `[aria-label=…]` covers only findings with that same label (a Save entry never covers Delete).
 */
export function matchesTarget(entryTarget: string, findingTarget: string | undefined): boolean {
  if (!findingTarget) return false;
  const found = targetParts(findingTarget);
  if (/^"[^"]*"$/.test(entryTarget)) return found.name === entryTarget;
  const want = targetParts(entryTarget);
  if (want.name && want.name !== found.name) return false;
  if (!want.parts.length || want.parts.length > found.parts.length) return false;
  const tail = found.parts.slice(-want.parts.length);
  if (!want.parts.every((p, i) => p === tail[i])) return false;
  // An entry that names an aria-label holds the finding to it: a "Save" entry never covers "Delete".
  const wantRaw = rawParts(entryTarget);
  const foundRaw = rawParts(findingTarget).slice(-wantRaw.length);
  return wantRaw.every((p, i) => (p.match(ARIA_LABEL) ?? []).every((label) => (foundRaw[i] ?? "").includes(label)));
}

function covers(e: AllowEntry, finding: Finding, where: Where): boolean {
  return (
    e.check === finding.check &&
    (e.rule === undefined || e.rule === finding.rule) &&
    matchesPage(e.page, where.page) &&
    (!e.viewports || e.viewports.includes(where.viewport)) &&
    (!e.engines || e.engines.includes(where.engine)) &&
    (e.target === undefined || matchesTarget(e.target, finding.target))
  );
}

/** The entry that covers a finding. A targeted entry always wins over one without a target, wherever each sits in the list. */
export function allowFor(entries: AllowEntry[], finding: Finding, where: Where): AllowEntry | undefined {
  return entries.find((e) => e.target !== undefined && covers(e, finding, where)) ?? entries.find((e) => e.target === undefined && covers(e, finding, where));
}

/**
 * Whether a base entry already allows everything a new entry does: the same check and rule, a page
 * pattern that includes it, at least its viewports and engines, and no target or the same one. A
 * narrowed entry isn't growth.
 */
/**
 * Whether every path a page pattern matches is matched by another, segment by segment: a base
 * `:param` covers a static segment or another parameter, only a base `*` covers a `*`, and a base
 * that requires a segment never covers one that's optional. `/demo/:ws` doesn't cover `/demo/*`.
 */
export function patternCovers(base: string, pattern: string): boolean {
  const b = base.split("/").filter(Boolean);
  const p = pattern.split("/").filter(Boolean);
  const isParam = (s: string) => /^[:$][A-Za-z_]/.test(s);
  const walk = (i: number, j: number): boolean => {
    if (i < b.length && (b[i] === "*" || b[i] === "$")) return true;
    if (j === p.length) return b.slice(i).every((s) => s.endsWith("?"));
    if (i === b.length) return false;
    const bs = b[i];
    const ps = p[j];
    if (ps === "*" || ps === "$") return false;
    const bOpt = bs.endsWith("?");
    const pOpt = ps.endsWith("?");
    const bName = bOpt ? bs.slice(0, -1) : bs;
    const pName = pOpt ? ps.slice(0, -1) : ps;
    // A plain parameter covers any one segment; one with a static part (`:name.json`) covers only a
    // static segment it matches, or the identical parameter.
    const plainParam = /^[:$][A-Za-z_][\w-]*$/.test(bName);
    const segment = plainParam ? true : /[:$]/.test(pName) ? bName === pName : isParam(bName) ? matchesPattern(`/${bName}`, `/${pName}`) : bName === pName;
    if (segment && (bOpt || !pOpt) && walk(i + 1, j + 1)) return true;
    return bOpt && walk(i + 1, j);
  };
  return walk(0, 0);
}

export function entryCovers(base: AllowEntry, e: AllowEntry): boolean {
  const within = <T>(wide: T[] | undefined, narrow: T[] | undefined) => !wide || (!!narrow && narrow.every((x) => wide.includes(x)));
  const story = base.page.startsWith("story:") || e.page.startsWith("story:");
  const pageIn = story
    ? base.page === e.page || (base.page.endsWith("*") && e.page.startsWith(base.page.slice(0, -1)) && !(e.page.endsWith("*") && e.page.length < base.page.length))
    : patternCovers(base.page, e.page);
  const targetIn = base.target === undefined || (e.target !== undefined && (base.target === e.target || matchesTarget(base.target, e.target)));
  return base.check === e.check && (base.rule === undefined || base.rule === e.rule) && pageIn && within(base.viewports, e.viewports) && within(base.engines, e.engines) && targetIn;
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
