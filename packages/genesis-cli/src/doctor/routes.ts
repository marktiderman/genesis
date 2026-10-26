/**
 * The web app's routes, read from its file layout: TanStack Router (flat
 * `courses.$courseId.tsx` or folders, `route.tsx` layouts, `__root.tsx`,
 * `-private` files skipped, a trailing `_` un-nesting a segment) and
 * Next-style `app/` folders (`layout.tsx` around `page.tsx`, `[id]` params).
 */
import { existsSync } from "node:fs";
import * as path from "node:path";
import { JSX_EXTS, renderedElements } from "./source.js";
import type { DoctorContext, SourceFile } from "./types.js";

/** Where the routes live when `routesDir` isn't set: the first that exists. */
export const ROUTES_DIR_CANDIDATES = ["src/routes", "src/app", "app", "src/pages", "pages"];

/** File stems that are layouts (or the root) whatever they render. */
const LAYOUT_STEMS = new Set(["route", "layout", "_layout", "__root", "_app"]);
/** File stems that name the folder's own page. */
const INDEX_STEMS = new Set(["index", "page"]);
/** Elements a redirect-only route renders. */
const NON_PAGE_ELEMENTS = new Set(["Navigate", "Redirect", "Outlet", "Fragment", "React.Fragment"]);
/** A JSX host element or fragment (`<main>`, `<div className>`, `<>`). */
const HTML_ELEMENT = /(?<![\w$.])<(?:[a-z][\w-]*(?=[\s>/])|>)/;

export interface RouteFile {
  file: SourceFile;
  /** Path segments (`$param`, `[param]` and pathless `_layout` segments included), without the index/route stem. */
  segments: string[];
  /** The folder's own page: `index.tsx`, `page.tsx`, `my.index.tsx`. */
  index: boolean;
  /** Wraps child routes: `route.tsx` / `layout.tsx` / `__root`, or a file rendering `<Outlet>`. */
  layout: boolean;
  /** Its own last segment is a param (`$courseId`, `[id]`): a detail page. */
  detail: boolean;
  /** Renders nothing but a redirect (or no JSX at all). */
  redirectOnly: boolean;
  /** The layout routes around it, nearest first. */
  parents: RouteFile[];
}

/** The routes folder (`routesDir`, else the first candidate that exists), or null. */
export function routesDir(ctx: Pick<DoctorContext, "root" | "config">): string | null {
  if (ctx.config.routesDir) return ctx.config.routesDir;
  return ROUTES_DIR_CANDIDATES.find((d) => existsSync(path.join(ctx.root, d))) ?? null;
}

const key = (segments: string[]) => segments.map((s) => s.replace(/_$/, "")).join("/");

/** Every scanned JSX route file under the routes folder, with its layouts. Empty without one. */
export function webRoutes(ctx: Pick<DoctorContext, "root" | "config" | "files">): RouteFile[] {
  const dir = routesDir(ctx);
  if (!dir) return [];
  const routes: RouteFile[] = [];
  for (const file of ctx.files) {
    if (!JSX_EXTS.has(file.ext) || !file.path.startsWith(`${dir}/`)) continue;
    const rel = file.path.slice(dir.length + 1).replace(/\.[^.]+$/, "");
    const parts = rel.split("/");
    if (parts.some((p) => p.startsWith("-"))) continue;
    const stem = parts.pop()!;
    const segments = [...parts, ...(LAYOUT_STEMS.has(stem) || INDEX_STEMS.has(stem) ? [] : stem.split("."))];
    let index = INDEX_STEMS.has(stem);
    if (!index && !LAYOUT_STEMS.has(stem) && INDEX_STEMS.has(segments.at(-1) ?? "")) {
      segments.pop();
      index = true;
    }
    const elements = renderedElements(file.code);
    const layout = LAYOUT_STEMS.has(stem) || elements.includes("Outlet");
    routes.push({
      file,
      segments,
      index,
      layout,
      detail: !index && !layout && /^(?:\$|\[)/.test(segments.at(-1) ?? ""),
      redirectOnly: elements.every((e) => NON_PAGE_ELEMENTS.has(e)) && !HTML_ELEMENT.test(file.code),
      parents: [],
    });
  }
  for (const r of routes) {
    const own = r.segments;
    for (const p of routes) {
      if (p === r || !p.layout) continue;
      const n = p.segments.length;
      // A layout wraps the routes below it, and the index page of its own folder (my/route.tsx around my/index.tsx).
      if (n > own.length || (n === own.length && !(r.index && !r.layout))) continue;
      if (key(own.slice(0, n)) !== key(p.segments)) continue;
      // `$commitmentId_` opts out of the `$commitmentId` layout.
      if (n > 0 && own[n - 1].endsWith("_") && !p.segments[n - 1].endsWith("_")) continue;
      r.parents.push(p);
    }
    r.parents.sort((a, b) => b.segments.length - a.segments.length);
  }
  return routes;
}
