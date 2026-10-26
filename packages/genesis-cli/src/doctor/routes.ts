/**
 * The web app's routes, read from its file layout.
 *
 * - TanStack Router: flat `courses.$courseId.tsx` or folders, `route.tsx`
 *   layouts, `__root.tsx`, `-private` files skipped, a trailing `_`
 *   un-nesting a segment, and `posts.lazy.tsx` paired with `posts.tsx` (one
 *   route, the component in the lazy file).
 * - Next.js `app/`: `layout.tsx` around `page.tsx`, `[id]` params; private
 *   `_folders`, `(groups)`, `@slots` and the special files (error, loading,
 *   not-found, template, default, route handlers) aren't routes. Pages router
 *   `pages/`: `_app` is the layout; `_document`, `_error` and `api/` aren't pages.
 */
import { existsSync } from "node:fs";
import * as path from "node:path";
import { JSX_EXTS, renderedElements } from "./source.js";
import type { DoctorContext, SourceFile } from "./types.js";

/** Where the routes live when `routesDir` isn't set: the first that exists. */
export const ROUTES_DIR_CANDIDATES = ["src/routes", "src/app", "app", "src/pages", "pages"];

type Flavor = "tanstack" | "next-app" | "next-pages";

/** Per router: stems that are layouts whatever they render, stems that are the folder's own page, files that aren't routes. */
const STEMS: Record<Flavor, { layout: Set<string>; index: Set<string>; skip: RegExp }> = {
  tanstack: { layout: new Set(["route", "__root"]), index: new Set(["index"]), skip: /^$/ },
  "next-app": {
    layout: new Set(["layout"]),
    index: new Set(["page"]),
    skip: /^(?:error|global-error|loading|not-found|forbidden|unauthorized|template|default|route|middleware|instrumentation|opengraph-image|twitter-image|icon|apple-icon|sitemap|robots|manifest)$/,
  },
  "next-pages": { layout: new Set(["_app"]), index: new Set(["index"]), skip: /^(?:_document|_error|404|500)$/ },
};
/** Elements a redirect-only route renders. */
const NON_PAGE_ELEMENTS = new Set(["Navigate", "Redirect", "Outlet", "Fragment", "React.Fragment"]);
/** A JSX host element or fragment (`<main>`, `<div className>`, `<>`). */
const HTML_ELEMENT = /(?<![\w$.])<(?:[a-z][\w-]*(?=[\s>/])|>)/;
/** A route option naming its component (`component: CoursePage`, `component: lazyRouteComponent(...)`). */
const COMPONENT_OPTION = /\bcomponent\s*:\s*(?!undefined\b|null\b)([A-Za-z_$][\w$]*)/;

export interface RouteFile {
  /** The file holding the route's component: the `.lazy` file when there is one. */
  file: SourceFile;
  /** Every file of the route (`posts.tsx` and `posts.lazy.tsx`). */
  files: SourceFile[];
  /** Path segments (`$param`, `[param]` and pathless `_layout` segments included), without the index/route stem. */
  segments: string[];
  /** The folder's own page: `index.tsx`, `page.tsx`, `my.index.tsx`. */
  index: boolean;
  /** Wraps child routes: a layout file (`route.tsx`, `layout.tsx`, `__root`) or one rendering `<Outlet>`. */
  layout: boolean;
  /**
   * A page of its own: not a pure layout. A layout file is pure, as is a
   * pathless `_layout` route or one rendering nothing but `<Outlet>`; a route
   * rendering its own content around an `<Outlet>` is both a layout and a page.
   */
  page: boolean;
  /** A page whose own last segment is a param (`$courseId`, `[id]`): a detail page. */
  detail: boolean;
  /** Renders nothing but a redirect (or no component at all). */
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

/** Which router lays out these files: TanStack's `__root` wins, then Next's `page` / `layout` files. */
function flavorOf(dir: string, rels: string[]): Flavor {
  const stems = rels.map((r) => r.split("/").pop()!);
  if (stems.includes("__root")) return "tanstack";
  if (stems.some((s) => s === "page" || s === "layout")) return "next-app";
  if (/(?:^|\/)pages$/.test(dir) && stems.some((s) => s === "_app" || s === "_document")) return "next-pages";
  return "tanstack";
}

/** Whether a route renders anything but a redirect: a JSX element of its own, or a component it names that it doesn't define. */
function renders(code: string): boolean {
  const elements = renderedElements(code);
  if (elements.some((e) => !NON_PAGE_ELEMENTS.has(e)) || HTML_ELEMENT.test(code)) return true;
  // `component: CoursePage` where CoursePage is imported (or `lazyRouteComponent(...)`): it renders over there.
  const named = COMPONENT_OPTION.exec(code)?.[1];
  if (named && !new RegExp(`\\b(?:function|const|let|var|class)\\s+${named.replace(/\$/g, "\\$")}\\b`).test(code)) return true;
  // Next.js / file routes that re-export their page: `export { default } from "./CoursePage"`.
  return /\bexport\s*\{\s*default\b[^}]*\}\s*from\b|\bexport\s+default\s+[A-Z][\w$]*\s*;?\s*$/m.test(code);
}

/** Every scanned JSX route file under the routes folder, with its layouts. Empty without one. */
export function webRoutes(ctx: Pick<DoctorContext, "root" | "config" | "files">): RouteFile[] {
  const dir = routesDir(ctx);
  if (!dir) return [];
  const candidates = ctx.files
    .filter((f) => JSX_EXTS.has(f.ext) && f.path.startsWith(`${dir}/`))
    .map((file) => ({ file, rel: file.path.slice(dir.length + 1).replace(/\.[^.]+$/, "") }));
  const flavor = flavorOf(dir, candidates.map((c) => c.rel));
  const stems = STEMS[flavor];

  // Group a TanStack `posts.lazy.tsx` with `posts.tsx`: one route.
  const groups = new Map<string, SourceFile[]>();
  for (const { file, rel } of candidates) {
    const parts = rel.split("/");
    if (parts.some((p) => p.startsWith("-"))) continue;
    if (flavor !== "tanstack" && parts.slice(0, -1).some((p) => p.startsWith("_"))) continue; // Next private folders
    if (flavor === "next-pages" && parts[0] === "api") continue;
    if (stems.skip.test(parts.at(-1)!)) continue;
    const id = flavor === "tanstack" ? rel.replace(/\.lazy$/, "") : rel;
    groups.set(id, [...(groups.get(id) ?? []), file]);
  }

  const routes: RouteFile[] = [];
  for (const [id, files] of groups) {
    const parts = id.split("/");
    const stem = parts.pop()!;
    // Next: `(group)` and `@slot` folders aren't URL segments.
    const folders = flavor === "next-app" ? parts.filter((p) => !/^\(.*\)$/.test(p) && !p.startsWith("@")) : parts;
    const named = stems.layout.has(stem) || stems.index.has(stem);
    const segments = [...folders, ...(named ? [] : flavor === "tanstack" ? stem.split(".") : [stem])];
    let index = stems.index.has(stem);
    if (!index && !stems.layout.has(stem) && flavor === "tanstack" && stems.index.has(segments.at(-1) ?? "")) {
      segments.pop();
      index = true;
    }
    const code = files.map((f) => f.code).join("\n");
    const elements = renderedElements(code);
    const outlet = elements.includes("Outlet");
    const layout = stems.layout.has(stem) || outlet;
    const rendering = renders(code);
    const ownContent = elements.some((e) => !NON_PAGE_ELEMENTS.has(e)) || HTML_ELEMENT.test(code);
    const pathless = /^_(?!_)/.test(segments.at(-1) ?? "") && flavor === "tanstack";
    const page = !stems.layout.has(stem) && !(outlet && (pathless || !ownContent));
    routes.push({
      file: files.find((f) => /\.lazy\.[^.]+$/.test(f.path)) ?? files[0],
      files,
      segments,
      index,
      layout,
      page,
      detail: page && !index && /^(?:\$|\[)/.test(segments.at(-1) ?? ""),
      redirectOnly: !rendering,
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
