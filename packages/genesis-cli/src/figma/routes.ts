/**
 * `genesis figma:routes`: a read-only check that an app's Figma file covers its routes.
 *
 * It reads the app's routes from its files (Expo Router and TanStack Router), the navigation
 * targets its code names as string literals, and the Figma file through the REST API (page and
 * top-level frame names, and each frame's prototype links), and reports the drift between them.
 * It never writes to Figma (an agent closes the gaps through the Figma MCP) and caches nothing.
 *
 * Prototype links are read from each node of `GET /v1/files/:key/nodes?ids=…`:
 * - `interactions[].actions[]` with `type: "NODE"` and a `destinationId` (any `navigation` but
 *   `CHANGE_TO`, which swaps a component variant rather than going to a screen), and
 * - the older `transitionNodeID` (a string, or null), which Figma still returns beside them.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import * as path from "node:path";

export type Platform = "web" | "native";

export interface FigmaConfig {
  /** The app file's key (from its URL: figma.com/design/<key>/…). */
  file: string;
  /** The page that holds each platform's route frames. */
  pages: Partial<Record<Platform, string>>;
  /** The page proposals live on. Default `Proposals`. */
  proposalsPage: string;
}

export class FigmaConfigError extends Error {}

/** Check the `figma` block of genesis.config.json. */
export function validateFigmaConfig(raw: unknown, source = "genesis.config.json"): FigmaConfig {
  const obj = raw as Record<string, unknown> | null;
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) throw new FigmaConfigError(`${source}: figma must be an object`);
  if (typeof obj.file !== "string" || !/^[A-Za-z0-9]+$/.test(obj.file)) throw new FigmaConfigError(`${source}: figma.file must be the file key (letters and digits, from the file's URL)`);
  const pages = obj.pages as Record<string, unknown> | undefined;
  if (!pages || typeof pages !== "object" || Array.isArray(pages)) throw new FigmaConfigError(`${source}: figma.pages must be { "web"?: "<page>", "native"?: "<page>" }`);
  const out: FigmaConfig["pages"] = {};
  for (const [k, v] of Object.entries(pages)) {
    if (k !== "web" && k !== "native") throw new FigmaConfigError(`${source}: figma.pages.${k}: only "web" and "native"`);
    if (typeof v !== "string" || !v) throw new FigmaConfigError(`${source}: figma.pages.${k} must be a page name`);
    out[k] = v;
  }
  if (!out.web && !out.native) throw new FigmaConfigError(`${source}: figma.pages needs "web" or "native"`);
  if (obj.proposalsPage !== undefined && (typeof obj.proposalsPage !== "string" || !obj.proposalsPage)) throw new FigmaConfigError(`${source}: figma.proposalsPage must be a page name`);
  return { file: obj.file, pages: out, proposalsPage: (obj.proposalsPage as string | undefined) ?? "Proposals" };
}

/** The `figma` block of the app's genesis.config.json, or null when there is none. */
export function readFigmaConfig(root: string): FigmaConfig | null {
  const file = path.join(root, "genesis.config.json");
  if (!existsSync(file)) return null;
  let raw: { figma?: unknown } | null;
  try {
    raw = JSON.parse(readFileSync(file, "utf8")) as { figma?: unknown } | null;
  } catch (err) {
    throw new FigmaConfigError(`${file} isn't valid JSON: ${(err as Error).message}`);
  }
  return raw?.figma === undefined ? null : validateFigmaConfig(raw.figma, file);
}

// ---------------------------------------------------------------- routes

export interface AppRoute {
  /** As written, without a leading slash: `(tabs)/settings`, `courses/$id`, `index` for the root. */
  route: string;
  platform: Platform;
  /** App-relative, POSIX. */
  file: string;
  /** From a `// figma: <node-id>` line in the file's first lines. */
  figmaId?: string;
}

const CODE = /\.(?:tsx|ts|jsx|js)$/;
const FIGMA_ID = /^\s*\/\/\s*figma:\s*(\d+[:-]\d+)\s*$/;

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir).sort()) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (CODE.test(name) && !/\.(?:test|spec|d)\.[jt]sx?$/.test(name)) out.push(full);
  }
  return out;
}

/** `// figma: 12:34` (or `12-34`, as a URL writes it) in the first five lines. */
export function figmaIdOf(code: string): string | undefined {
  for (const line of code.split("\n").slice(0, 5)) {
    const m = FIGMA_ID.exec(line);
    if (m) return m[1]!.replace("-", ":");
  }
  return undefined;
}

/** Split a TanStack file stem on dots, keeping `{-$section}` whole. */
function tanstackSegments(stem: string): string[] {
  const out: string[] = [];
  let cur = "";
  let depth = 0;
  for (const ch of stem) {
    if (ch === "{") depth++;
    if (ch === "}") depth--;
    if (ch === "." && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** The Expo Router root: `src/app`, else `app`. */
export function expoRoot(root: string): string | null {
  for (const dir of ["src/app", "app"]) if (existsSync(path.join(root, dir))) return dir;
  return null;
}

/** The app's routes: Expo Router (`src/app` or `app`, native) and TanStack file routes (`src/routes`, web). */
export function appRoutes(root: string): AppRoute[] {
  const out: AppRoute[] = [];
  const rel = (f: string) => path.relative(root, f).split(path.sep).join("/");
  const expo = expoRoot(root);
  if (expo) {
    for (const f of walk(path.join(root, expo))) {
      const parts = path.relative(path.join(root, expo), f).split(path.sep);
      const stem = parts.pop()!.replace(CODE, "");
      // _layout wraps; +not-found, +native-intent (and +html, +api) aren't screens.
      if (stem === "_layout" || stem.startsWith("+")) continue;
      if (stem !== "index") parts.push(stem);
      out.push(withId({ route: parts.join("/") || "index", platform: "native", file: rel(f) }, f));
    }
  }
  const tanstack = path.join(root, "src/routes");
  if (existsSync(tanstack)) {
    const seen = new Set<string>();
    for (const f of walk(tanstack)) {
      const parts = path.relative(tanstack, f).split(path.sep);
      const stem = parts.pop()!.replace(CODE, "").replace(/\.lazy$/, "");
      if (stem === "__root" || stem === "route" || stem.startsWith("-") || parts.some((p) => p.startsWith("-"))) continue;
      const segs = [...parts.flatMap(tanstackSegments), ...tanstackSegments(stem)];
      if (segs.at(-1) === "index") segs.pop();
      const route = segs.join("/") || "index";
      if (seen.has(route)) continue;
      seen.add(route);
      out.push(withId({ route, platform: "web", file: rel(f) }, f));
    }
  }
  return out;
}

function withId(r: AppRoute, file: string): AppRoute {
  const id = figmaIdOf(readFileSync(file, "utf8"));
  return id ? { ...r, figmaId: id } : r;
}

/**
 * The URL a route answers, as matcher segments: groups `(x)` and pathless `_x` segments dropped,
 * params (`$id`, `[id]`) as `*`, an Expo catch-all `[...rest]` as `**` (one or more segments),
 * optional `{-$x}` as `?`.
 */
function urlSegments(route: string): string[] {
  return route
    .replace(/^\/+/, "")
    .split("/")
    .filter((s) => s && s !== "index" && !/^\(.*\)$/.test(s) && !/^_/.test(s))
    .map((s) => s.replace(/_$/, ""))
    .map((s) => (/^\{-\$.*\}$/.test(s) ? "?" : /^\[\.\.\..+\]$/.test(s) ? "**" : /^\$|^\[.*\]$/.test(s) ? "*" : s));
}

/** Does the route (as written) answer the URL `target` (a literal path)? */
export function routeMatches(route: string, target: string): boolean {
  const pattern = urlSegments(route);
  const url = target.split(/[?#]/)[0]!.split("/").filter(Boolean);
  // A bare `$` at the end (a splat) takes the rest.
  if (/(?:^|\/)\$$/.test(route)) {
    const head = pattern.slice(0, -1);
    return url.length >= head.length && head.every((p, i) => p === "*" || p === url[i]);
  }
  const go = (i: number, j: number): boolean => {
    if (i === pattern.length) return j === url.length;
    const p = pattern[i]!;
    if (p === "?") return go(i + 1, j) || (j < url.length && go(i + 1, j + 1));
    if (j === url.length) return false;
    if (p === "**") {
      for (let k = j + 1; k <= url.length; k++) if (go(i + 1, k)) return true;
      return false;
    }
    return (p === "*" || p === url[j]) && go(i + 1, j + 1);
  };
  return go(0, 0);
}

/** The same screen named two ways (`/settings` and `(tabs)/settings`): equal URL segments. */
function sameScreen(a: string, b: string): boolean {
  return a.replace(/^\/+/, "") === b.replace(/^\/+/, "") || urlSegments(a).join("/") === urlSegments(b).join("/");
}

// ---------------------------------------------------------------- navigation targets

export interface NavTarget {
  /** App-relative file holding the call. */
  file: string;
  line: number;
  target: string;
}

const STR = String.raw`(?:"([^"\n]*)"|'([^'\n]*)'|` + "`([^`$\\n]*)`)";
const NAV_PATTERNS = [
  new RegExp(String.raw`\brouter\.(?:push|replace|navigate)\(\s*` + STR, "g"),
  new RegExp(String.raw`<Link\b[^>]*?\b(?:href|to)=\{?\s*` + STR, "g"),
  new RegExp(String.raw`\bnavigate\(\s*\{[^}]*?\bto\s*:\s*` + STR, "g"),
];

/**
 * Navigation the check can't resolve to a route: a template literal with `${…}` and a
 * `{ pathname, params }` object. `target` is the expression as written (shortened).
 */
const DYNAMIC_PATTERNS = [
  new RegExp(String.raw`\brouter\.(?:push|replace|navigate)\(\s*` + "(`[^`\\n]*\\$\\{[^`\\n]*`)", "g"),
  new RegExp(String.raw`<Link\b[^>]*?\b(?:href|to)=\{\s*` + "(`[^`\\n]*\\$\\{[^`\\n]*`)", "g"),
  new RegExp(String.raw`\bnavigate\(\s*\{[^}]*?\bto\s*:\s*` + "(`[^`\\n]*\\$\\{[^`\\n]*`)", "g"),
  new RegExp(String.raw`\brouter\.(?:push|replace|navigate)\(\s*(\{[^}\n]*?\bpathname\b[^}\n]*\}?)`, "g"),
  new RegExp(String.raw`<Link\b[^>]*?\bhref=\{(\{[^}\n]*?\bpathname\b[^}\n]*\}?)`, "g"),
];

/** Navigation the check can't resolve (see DYNAMIC_PATTERNS): reported as unchecked, never matched. */
export function dynamicNavTargets(code: string, file: string): NavTarget[] {
  const out: NavTarget[] = [];
  for (const re of DYNAMIC_PATTERNS) {
    for (const m of code.matchAll(re)) {
      const raw = m[1]!.trim();
      out.push({ file, line: code.slice(0, m.index).split("\n").length, target: raw.length > 60 ? `${raw.slice(0, 57)}...` : raw });
    }
  }
  return out.sort((a, b) => a.line - b.line);
}

/** Navigation targets the code names as string literals. */
export function navTargets(code: string, file: string): NavTarget[] {
  const out: NavTarget[] = [];
  for (const re of NAV_PATTERNS) {
    for (const m of code.matchAll(re)) {
      const target = m[1] ?? m[2] ?? m[3];
      if (target === undefined || /^[a-z]+:/i.test(target) || target.startsWith("#") || target.startsWith(".")) continue;
      out.push({ file, line: code.slice(0, m.index).split("\n").length, target });
    }
  }
  return out.sort((a, b) => a.line - b.line);
}

/** Every navigation target in the app's code (`src/`, `app/`). */
export function appNavTargets(root: string): NavTarget[] {
  const files = [...new Set([...walk(path.join(root, "src")), ...walk(path.join(root, "app"))])];
  return files.flatMap((f) => navTargets(readFileSync(f, "utf8"), path.relative(root, f).split(path.sep).join("/")));
}

/** Every navigation in the app's code the check can't resolve (`dynamicNavTargets`). */
export function appDynamicNavTargets(root: string): NavTarget[] {
  const files = [...new Set([...walk(path.join(root, "src")), ...walk(path.join(root, "app"))])];
  return files.flatMap((f) => dynamicNavTargets(readFileSync(f, "utf8"), path.relative(root, f).split(path.sep).join("/")));
}

// ---------------------------------------------------------------- Figma

export interface FigmaNode {
  id: string;
  name: string;
  type: string;
  children?: FigmaNode[];
  transitionNodeID?: string | null;
  interactions?: { trigger?: unknown; actions?: ({ type?: string; destinationId?: string | null; navigation?: string } | null)[] | null }[];
}

export interface Frame {
  id: string;
  name: string;
  page: string;
  /** For a frame inside a section (every Proposals frame), the section's name. */
  section?: string;
  /** The route part of the name (before ` · `), and the state after it. */
  route: string;
  state?: string;
}

export interface Hotspot {
  /** The top-level frame the hotspot sits in. */
  from: string;
  /** The destination node. */
  to: string;
}

export interface FigmaFacts {
  pages: string[];
  frames: Frame[];
  hotspots: Hotspot[];
}

export type FetchLike = (url: string, init: { headers: Record<string, string>; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export const FIGMA_API = "https://api.figma.com";

/** How long one Figma API request may take before the check gives up (doctor must not hang). */
export const FIGMA_TIMEOUT_MS = 30_000;

function splitName(name: string): { route: string; state?: string } {
  const i = name.indexOf(" · ");
  return i < 0 ? { route: name.trim() } : { route: name.slice(0, i).trim(), state: name.slice(i + 3).trim() };
}

/** Every NODE destination a node tree links to (see the module comment for the fields). */
export function destinations(node: FigmaNode, out = new Set<string>()): Set<string> {
  if (node.transitionNodeID) out.add(node.transitionNodeID);
  for (const i of node.interactions ?? []) {
    for (const a of i.actions ?? []) if (a?.type === "NODE" && a.destinationId && a.navigation !== "CHANGE_TO") out.add(a.destinationId);
  }
  for (const c of node.children ?? []) destinations(c, out);
  return out;
}

const SCREEN_TYPES = new Set(["FRAME", "COMPONENT", "COMPONENT_SET", "INSTANCE"]);

/** Read pages, frames and prototype links. The token goes in a header and nowhere else. */
export async function readFigma(config: FigmaConfig, token: string, fetchImpl: FetchLike = fetch as unknown as FetchLike, timeoutMs = FIGMA_TIMEOUT_MS): Promise<FigmaFacts> {
  const get = async (p: string): Promise<unknown> => {
    const where = p.split("?")[0];
    try {
      const res = await fetchImpl(`${FIGMA_API}${p}`, { headers: { "X-Figma-Token": token }, signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) throw new Error(`Figma API ${where} answered ${res.status}${res.status === 403 ? " (check FIGMA_ACCESS_TOKEN and its access to the file)" : ""}`);
      return await res.json();
    } catch (err) {
      const name = (err as Error | undefined)?.name;
      if (name === "TimeoutError" || name === "AbortError") throw new Error(`Figma API ${where} didn't answer within ${Math.round(timeoutMs / 1000)}s`);
      throw err;
    }
  };
  const nodes = async (ids: string[], depth?: number): Promise<FigmaNode[]> => {
    const out: FigmaNode[] = [];
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50);
      const body = (await get(`/v1/files/${config.file}/nodes?ids=${encodeURIComponent(chunk.join(","))}${depth ? `&depth=${depth}` : ""}`)) as { nodes: Record<string, { document?: FigmaNode } | null> };
      for (const id of chunk) {
        const doc = body.nodes[id]?.document;
        if (doc) out.push(doc);
      }
    }
    return out;
  };
  const file = (await get(`/v1/files/${config.file}?depth=2`)) as { document: FigmaNode };
  const canvases = file.document.children ?? [];
  const wanted = new Set([...Object.values(config.pages), config.proposalsPage]);
  const frames: Frame[] = [];
  const sections: { id: string; name: string; page: string }[] = [];
  for (const page of canvases) {
    if (!wanted.has(page.name)) continue;
    for (const child of page.children ?? []) {
      if (child.type === "SECTION") sections.push({ id: child.id, name: child.name, page: page.name });
      else if (SCREEN_TYPES.has(child.type)) frames.push({ id: child.id, name: child.name, page: page.name, ...splitName(child.name) });
    }
  }
  // Sections' frames sit one level down: read each section to depth 1.
  for (const s of await nodes(sections.map((x) => x.id), 1)) {
    const section = sections.find((x) => x.id === s.id)!;
    for (const child of s.children ?? []) {
      if (SCREEN_TYPES.has(child.type)) frames.push({ id: child.id, name: child.name, page: section.page, section: section.name, ...splitName(child.name) });
    }
  }
  const hotspots: Hotspot[] = [];
  for (const tree of await nodes(frames.filter((f) => f.page !== config.proposalsPage).map((f) => f.id))) {
    for (const to of destinations(tree)) if (to !== tree.id) hotspots.push({ from: tree.id, to });
  }
  return { pages: canvases.map((p) => p.name), frames, hotspots };
}

// ---------------------------------------------------------------- report

export interface MissingHotspot extends NavTarget {
  from: string;
  to: string;
  /** False when the destination route has no frame either (it is also under routesWithoutFrame). */
  targetHasFrame: boolean;
}

export interface CoverageReport {
  file: string;
  summary: { routes: number; frames: number; covered: number; coveredPercent: number; hotspots: number; missing: number };
  /** Pages the config names that the file doesn't have. */
  missingPages: string[];
  routesWithoutFrame: AppRoute[];
  /** Frames on a route page whose name is no route: candidates for the Proposals page. */
  framesWithoutRoute: Frame[];
  /** The Proposals page's frames, by section. */
  proposals: Record<string, Frame[]>;
  missingHotspots: MissingHotspot[];
  deadHotspots: { from: Frame; to: Frame }[];
  idMismatches: (AppRoute & { frames: string[] })[];
  /** Navigation in a route file the check can't resolve (a template literal, a `{ pathname }` object): not checked. */
  uncheckedNavigation: NavTarget[];
}

export function compare(config: FigmaConfig, routes: AppRoute[], targets: NavTarget[], figma: FigmaFacts, dynamicTargets: NavTarget[] = []): CoverageReport {
  const platformOf = (page: string): Platform | undefined => (config.pages.web === page ? "web" : config.pages.native === page ? "native" : undefined);
  const routeFrames = figma.frames.filter((f) => platformOf(f.page));
  const framesFor = (r: AppRoute) => routeFrames.filter((f) => platformOf(f.page) === r.platform && (sameScreen(f.route, r.route) || (r.route === "index" && f.route === "/")));
  const byId = new Map(figma.frames.map((f) => [f.id, f]));
  const framed = new Set(routes.flatMap((r) => framesFor(r).map((f) => f.id)));

  const covered = routes.filter((r) => framesFor(r).length > 0);
  const routesWithoutFrame = routes.filter((r) => framesFor(r).length === 0);
  const framesWithoutRoute = routeFrames.filter((f) => !framed.has(f.id));
  const proposals: Record<string, Frame[]> = {};
  for (const f of figma.frames.filter((x) => x.page === config.proposalsPage)) (proposals[f.section ?? "(no section)"] ??= []).push(f);

  const missingHotspots: MissingHotspot[] = [];
  const seen = new Set<string>();
  for (const t of targets) {
    const source = routes.find((r) => r.file === t.file);
    if (!source) continue;
    const from = framesFor(source);
    if (!from.length) continue;
    const dest = routes.find((r) => r.platform === source.platform && routeMatches(r.route, t.target));
    if (!dest || dest === source) continue;
    const key = `${source.route}→${dest.route}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const to = new Set(framesFor(dest).map((f) => f.id));
    const linked = figma.hotspots.some((h) => from.some((f) => f.id === h.from) && to.has(h.to));
    if (!linked) missingHotspots.push({ ...t, from: source.route, to: dest.route, targetHasFrame: to.size > 0 });
  }

  const deadHotspots: CoverageReport["deadHotspots"] = [];
  for (const h of figma.hotspots) {
    const from = byId.get(h.from);
    const to = byId.get(h.to);
    if (from && to && platformOf(to.page) && !framed.has(to.id)) deadHotspots.push({ from, to });
  }

  const idMismatches = routes.filter((r) => r.figmaId && !framesFor(r).some((f) => f.id === r.figmaId)).map((r) => ({ ...r, frames: framesFor(r).map((f) => f.id) }));

  const wantedPages = [...Object.values(config.pages), config.proposalsPage];
  // A page the config names that the file lacks is a gap: with no route page, nothing on it is checked.
  const missingPages = wantedPages.filter((p) => !figma.pages.includes(p));
  const uncheckedNavigation = dynamicTargets.filter((t) => routes.some((r) => r.file === t.file));
  return {
    file: config.file,
    summary: {
      routes: routes.length,
      frames: routeFrames.length,
      covered: covered.length,
      coveredPercent: routes.length ? Math.round((covered.length / routes.length) * 100) : 100,
      hotspots: figma.hotspots.length,
      missing: missingPages.length + routesWithoutFrame.length + missingHotspots.length + idMismatches.length,
    },
    missingPages,
    routesWithoutFrame,
    framesWithoutRoute,
    proposals,
    missingHotspots,
    deadHotspots,
    idMismatches,
    uncheckedNavigation,
  };
}

export interface CheckOptions {
  root: string;
  /** Default `process.env.FIGMA_ACCESS_TOKEN`. */
  token?: string;
  fetch?: FetchLike;
  config?: FigmaConfig;
}

/** Read everything and compare. Throws FigmaConfigError when there is no config or no token. */
export async function checkFigmaRoutes(options: CheckOptions): Promise<CoverageReport> {
  const config = options.config ?? readFigmaConfig(options.root);
  if (!config) throw new FigmaConfigError(`no "figma" block in ${path.join(options.root, "genesis.config.json")}`);
  const token = options.token ?? process.env.FIGMA_ACCESS_TOKEN;
  if (!token) throw new FigmaConfigError("FIGMA_ACCESS_TOKEN isn't set");
  const figma = await readFigma(config, token, options.fetch);
  return compare(config, appRoutes(options.root), appNavTargets(options.root), figma, appDynamicNavTargets(options.root));
}

/** The report as text: a summary line, then one table per kind of finding. */
export function formatCoverage(r: CoverageReport): string {
  const s = r.summary;
  const lines = [`Figma route coverage (file ${r.file}): ${s.routes} routes, ${s.frames} frames, ${s.covered} covered (${s.coveredPercent}%), ${s.hotspots} hotspots, ${s.missing} missing`];
  const table = (title: string, head: string[], rows: string[][]) => {
    if (!rows.length) return;
    const widths = head.map((h, i) => Math.max(h.length, ...rows.map((row) => row[i]!.length)));
    const fmt = (row: string[]) => `  ${row.map((c, i) => c.padEnd(widths[i]!)).join("  ")}`.trimEnd();
    lines.push("", `${title} (${rows.length})`, fmt(head), fmt(widths.map((w) => "-".repeat(w))), ...rows.map(fmt));
  };
  if (r.missingPages.length) lines.push("", `Pages not in the file: ${r.missingPages.join(", ")}`);
  table("Routes with no frame", ["platform", "route", "file"], r.routesWithoutFrame.map((x) => [x.platform, x.route, x.file]));
  table("Frames with no route (move to Proposals, or add the route)", ["page", "frame", "id"], r.framesWithoutRoute.map((f) => [f.page, f.name, f.id]));
  table("Navigation with no hotspot", ["from", "to", "at"], r.missingHotspots.map((m) => [m.from, `${m.to}${m.targetHasFrame ? "" : " (no frame)"}`, `${m.file}:${m.line}`]));
  table("Hotspots to a frame with no route", ["from", "to"], r.deadHotspots.map((d) => [d.from.name, d.to.name]));
  table("figma: ids that don't match the route's frame", ["route", "comment", "frames"], r.idMismatches.map((m) => [m.route, m.figmaId!, m.frames.join(", ") || "none"]));
  table("Navigation not checked (not a string literal)", ["at", "target"], r.uncheckedNavigation.map((t) => [`${t.file}:${t.line}`, t.target]));
  table("Proposals", ["section", "frame", "id"], Object.entries(r.proposals).flatMap(([sec, fs]) => fs.map((f) => [sec, f.name, f.id])));
  return lines.join("\n");
}

/** Doctor findings from a report: coverage gaps at `info` (`warn` under --strict), the rest `info`. */
export function coverageFindings(r: CoverageReport, strict: boolean): { level: "info" | "warn"; file: string; line?: number; message: string; subject: string }[] {
  const gap = strict ? ("warn" as const) : ("info" as const);
  return [
    ...r.missingPages.map((p) => ({ level: gap, file: `figma:${p}`, message: `the Figma file has no page "${p}" (named in genesis.config.json figma)`, subject: p })),
    ...r.routesWithoutFrame.map((x) => ({ level: gap, file: x.file, message: `route ${x.route} has no ${x.platform} frame in the Figma file`, subject: x.route })),
    ...r.missingHotspots.map((m) => ({ level: gap, file: m.file, line: m.line, message: `navigates to ${m.to}, but the ${m.from} frame has no hotspot to it${m.targetHasFrame ? "" : " (and it has no frame)"}`, subject: m.to })),
    ...r.idMismatches.map((m) => ({ level: gap, file: m.file, line: 1, message: `// figma: ${m.figmaId} isn't the frame named ${m.route} (${m.frames.join(", ") || "none"})`, subject: m.route })),
    ...r.framesWithoutRoute.map((f) => ({ level: "info" as const, file: `figma:${f.page}`, message: `frame "${f.name}" (${f.id}) has no route: move it to Proposals, or add the route`, subject: f.route })),
    ...r.deadHotspots.map((d) => ({ level: "info" as const, file: `figma:${d.from.page}`, message: `"${d.from.name}" links to "${d.to.name}", which has no route`, subject: d.to.route })),
    ...r.uncheckedNavigation.map((t) => ({ level: "info" as const, file: t.file, line: t.line, message: `navigation to ${t.target} isn't a string literal, so it isn't checked against the Figma file`, subject: t.target })),
  ];
}
