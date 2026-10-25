/**
 * Publish checks: what must be true before a release goes live. Each check
 * returns issues; any `error` blocks the publish (`isPublishable`), and
 * `warning`s are shown but don't.
 *
 * Accessibility (WCAG 2.2 AA) that a document can prove:
 * - one `h1` per page: the renderer gives it to the first section that
 *   `providesH1` (the hero), or prints the page title as a visually hidden
 *   `h1`; a second hero is over its limit;
 * - heading order inside rich text (no skipped levels);
 * - every image has alt text or is marked decorative (1.1.1);
 * - every colour pair the sections draw reaches 4.5:1 for text and 3:1 for
 *   the focus ring (1.4.3, 1.4.11).
 *
 * The rest is the renderer's job and is pinned by its tests: visible focus,
 * 24px targets (2.5.8), landmarks, a skip link, link text.
 *
 * And content rules: unknown or invalid sections, sections over their
 * limit or on the wrong kind of page, template placeholders still showing,
 * duplicate or reserved paths, a site with no home page.
 */
import { migrateNode } from "./migrate";
import { getSection, type AnySectionDefinition } from "./registry";
import type { PageKind, ReleasePage, ReleaseSnapshot, SectionNode, SiteDoc } from "./schemas";
import { contrastRatio, type SiteTheme } from "./theme";
import { isReservedPath, pagePathProblems, type ReservedPaths } from "./urls";

export interface SiteIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  pageId?: string;
  path?: string;
  sectionId?: string;
}

export const isPublishable = (issues: readonly SiteIssue[]) => !issues.some((i) => i.severity === "error");

type Lookup = (type: string) => AnySectionDefinition | undefined;

/** Every object in a props tree that looks like an image (`{ src, alt?, decorative? }`), with its path. */
function images(value: unknown, path: string[] = []): { path: string; image: { src: unknown; alt?: unknown; decorative?: unknown } }[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap((v, i) => images(v, [...path, String(i)]));
  const record = value as Record<string, unknown>;
  const found = typeof record.src === "string" && ("alt" in record || "decorative" in record || /\.(png|jpe?g|webp|avif|gif|svg)(\?|$)/i.test(record.src))
    ? [{ path: path.join("."), image: record as { src: unknown; alt?: unknown; decorative?: unknown } }]
    : [];
  return [...found, ...Object.entries(record).flatMap(([k, v]) => (k === "src" ? [] : images(v, [...path, k])))];
}

/** Heading levels in a rich text document, in order. */
function richTextHeadings(value: unknown): number[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(richTextHeadings);
  const node = value as { type?: unknown; attrs?: { level?: unknown }; content?: unknown };
  if (node.type === "heading") return typeof node.attrs?.level === "number" ? [node.attrs.level] : [];
  // A rich text node's children are in `content`; any other object is props: look in every value.
  if (node.type === "doc" || typeof node.type === "string") return richTextHeadings(node.content);
  return Object.values(value).flatMap(richTextHeadings);
}

interface NodeContext {
  where: "header" | "body" | "footer";
  kind?: PageKind;
  page?: ReleasePage;
}

function nodeIssues(node: SectionNode, ctx: NodeContext, lookup: Lookup): SiteIssue[] {
  const base = { ...(ctx.page ? { pageId: ctx.page.id, path: ctx.page.path } : {}), sectionId: node.id };
  const at = ctx.page ? `${ctx.page.path}` : `the site ${ctx.where}`;
  const migrated = migrateNode(node, lookup);
  const issues: SiteIssue[] = migrated.issues.map((i) => ({ ...base, severity: i.severity, code: i.code, message: `${at}: ${i.message}` }));
  const def = lookup(node.type);
  if (!def || !migrated.node) return issues;
  if (node.placeholder) {
    issues.push({ ...base, severity: "error", code: "placeholder", message: `${at}: the ${def.label} section still has the template's sample content. Replace it, or hide the section.` });
  }
  const placement = def.placement ?? "body";
  if (placement !== ctx.where) {
    issues.push({ ...base, severity: "error", code: "placement", message: `${at}: a ${def.label} section belongs in the ${placement === "body" ? "page" : `site ${placement}`}, not the ${ctx.where === "body" ? "page" : `site ${ctx.where}`}.` });
  }
  if (ctx.kind && def.enabledOn && !def.enabledOn.includes(ctx.kind)) {
    issues.push({ ...base, severity: "error", code: "enabled-on", message: `${at}: a ${def.label} section can't go on a ${ctx.kind} page.` });
  }
  for (const { path, image } of images(migrated.node.props)) {
    const alt = typeof image.alt === "string" ? image.alt.trim() : "";
    if (!alt && image.decorative !== true) {
      issues.push({ ...base, severity: "error", code: "image-alt", message: `${at}: an image in the ${def.label} section (${path || "image"}) needs alt text, or to be marked decorative.` });
    }
  }
  const levels = richTextHeadings(migrated.node.props);
  for (let i = 0; i < levels.length; i++) {
    const level = levels[i]!;
    const previous = i === 0 ? 2 : levels[i - 1]!;
    if (level === 1) issues.push({ ...base, severity: "error", code: "heading-h1", message: `${at}: rich text can't hold a level 1 heading; the page has one already.` });
    else if (level > previous + 1) {
      issues.push({ ...base, severity: "error", code: "heading-order", message: `${at}: a level ${level} heading follows a level ${previous} in the ${def.label} section; don't skip a level.` });
    }
  }
  return issues;
}

/** Issues on one page: its sections, limits and the h1. */
export function checkPage(page: ReleasePage, lookup: Lookup = getSection, reserved?: ReservedPaths): SiteIssue[] {
  const issues: SiteIssue[] = [];
  const base = { pageId: page.id, path: page.path };
  for (const problem of pagePathProblems(page.path, reserved)) issues.push({ ...base, severity: "error", code: "path", message: `${page.path}: ${problem}` });
  const visible = page.doc.content.filter((n) => !n.hidden);
  const counts = new Map<string, number>();
  let h1 = 0;
  for (const node of visible) {
    issues.push(...nodeIssues(node, { where: "body", kind: page.kind, page }, lookup));
    counts.set(node.type, (counts.get(node.type) ?? 0) + 1);
    if (lookup(node.type)?.providesH1) h1++;
  }
  for (const [type, count] of counts) {
    const def = lookup(type);
    if (def?.limit && count > def.limit) {
      issues.push({ ...base, severity: "error", code: "limit", message: `${page.path}: ${count} ${def.label} sections; a page has at most ${def.limit}.` });
    }
  }
  if (h1 === 0) {
    issues.push({ ...base, severity: "warning", code: "no-h1", message: `${page.path}: no hero, so the page title "${page.doc.root.props.title}" becomes its hidden main heading.` });
  }
  if (!page.doc.seo?.description) {
    issues.push({ ...base, severity: "warning", code: "seo-description", message: `${page.path}: no description for search results and link previews.` });
  }
  return issues;
}

/** Issues with the site's own parts: header, footer, redirects. */
export function checkSiteDoc(site: SiteDoc, lookup: Lookup = getSection): SiteIssue[] {
  const issues: SiteIssue[] = [];
  for (const node of site.header.filter((n) => !n.hidden)) issues.push(...nodeIssues(node, { where: "header" }, lookup));
  for (const node of site.footer.filter((n) => !n.hidden)) issues.push(...nodeIssues(node, { where: "footer" }, lookup));
  const froms = new Set<string>();
  for (const r of site.redirects) {
    if (froms.has(r.from)) issues.push({ severity: "error", code: "redirect-duplicate", path: r.from, message: `Two redirects from ${r.from}.` });
    froms.add(r.from);
    if (r.to === r.from) issues.push({ severity: "error", code: "redirect-loop", path: r.from, message: `The redirect from ${r.from} points at itself.` });
  }
  return issues;
}

/** Colour pairs below their minimum (1.4.3 text, 1.4.11 focus ring). */
export function checkContrast(theme: SiteTheme): SiteIssue[] {
  return theme.pairs
    .map((pair) => ({ pair, ratio: contrastRatio(pair.foreground, pair.background) }))
    .filter(({ pair, ratio }) => ratio < pair.minimum)
    .map(({ pair, ratio }) => ({
      severity: "error" as const,
      code: "contrast",
      message: `In ${pair.mode} mode, ${pair.name} is ${ratio.toFixed(2)}:1 (${pair.foreground} on ${pair.background}); it needs ${pair.minimum}:1. Adjust the brand colours.`,
    }));
}

export interface CheckReleaseOptions {
  /** The brand's theme: adds the contrast check. */
  theme?: SiteTheme;
  lookup?: Lookup;
  reserved?: ReservedPaths;
}

/**
 * Everything a publish checks, for a whole release.
 *
 * @stability Beta
 */
export function checkRelease(snapshot: ReleaseSnapshot, options: CheckReleaseOptions = {}): SiteIssue[] {
  const lookup = options.lookup ?? getSection;
  const issues: SiteIssue[] = [...checkSiteDoc(snapshot.site, lookup)];
  const paths = new Map<string, string>();
  for (const page of snapshot.pages) {
    const other = paths.get(page.path);
    if (other) issues.push({ severity: "error", code: "path-duplicate", pageId: page.id, path: page.path, message: `Two pages at ${page.path}.` });
    paths.set(page.path, page.id);
    issues.push(...checkPage(page, lookup, options.reserved));
  }
  if (!paths.has("/")) issues.push({ severity: "error", code: "no-home", message: "The site has no home page (a page at /)." });
  for (const r of snapshot.site.redirects) {
    if (paths.has(r.from)) issues.push({ severity: "warning", code: "redirect-shadows-page", path: r.from, message: `The redirect from ${r.from} hides the page there.` });
    if (options.reserved !== undefined ? isReservedPath(r.from, options.reserved) : isReservedPath(r.from)) {
      issues.push({ severity: "error", code: "redirect-reserved", path: r.from, message: `${r.from} is reserved for the app; a site can't redirect it.` });
    }
  }
  if (options.theme) issues.push(...checkContrast(options.theme));
  return issues;
}

/**
 * A rendered page's outline, from its HTML: one `h1`, no skipped heading
 * level, every `<img>` with an `alt` attribute. For tests and for hosts that
 * want to audit what was actually served.
 */
export function checkHtmlOutline(html: string): SiteIssue[] {
  const issues: SiteIssue[] = [];
  const body = html.replace(/<script\b[\s\S]*?<\/script>/gi, "").replace(/<style\b[\s\S]*?<\/style>/gi, "");
  const levels = [...body.matchAll(/<h([1-6])\b/gi)].map((m) => Number(m[1]));
  const h1 = levels.filter((l) => l === 1).length;
  if (h1 !== 1) issues.push({ severity: "error", code: "h1-count", message: `The page has ${h1} h1 elements; it needs exactly one.` });
  if (levels[0] !== undefined && levels[0] !== 1) issues.push({ severity: "error", code: "heading-order", message: `The first heading is an h${levels[0]}, not the h1.` });
  for (let i = 1; i < levels.length; i++) {
    if (levels[i]! > levels[i - 1]! + 1) issues.push({ severity: "error", code: "heading-order", message: `An h${levels[i]} follows an h${levels[i - 1]}.` });
  }
  for (const m of body.matchAll(/<img\b[^>]*>/gi)) {
    if (!/\salt=/.test(m[0])) issues.push({ severity: "error", code: "image-alt", message: `An image has no alt attribute: ${m[0].slice(0, 120)}` });
  }
  return issues;
}
