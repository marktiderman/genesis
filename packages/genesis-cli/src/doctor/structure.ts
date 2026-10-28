/**
 * Structural rules: an app that rebuilds what Genesis already has, in shape
 * rather than in pixels. Hand-rolled section tabs on a page inside the shell,
 * app components named like Genesis ones, detail pages in one folder built two
 * ways, and routes with no Genesis page layout. Like the core rules, every
 * name comes from the installed packages.
 */
import { lineAt } from "./scan.js";
import { routesDir, webRoutes, type RouteFile } from "./routes.js";
import { JSX_EXTS, namedImportsFrom, openElementsAt, rendersJsx } from "./source.js";
import { trailFor, type Reach } from "./trail.js";
import type { DoctorContext } from "./types.js";

/** Where the shell's sub-navigation is documented. */
export const SUB_NAV_DOCS = "https://github.com/marktiderman/genesis/blob/main/packages/ui/SKILL.md (Sub-navigation)";

/** Elements a section switcher inside them belongs to, not the page: cards, overlays, disclosure, other tabs. */
const CONTAINER = /(?:Card|CardContent|Dialog|DialogContent|Sheet|SheetContent|Drawer|DrawerContent|Popover|PopoverContent|Modal|Accordion|AccordionContent|AccordionItem|Collapsible|CollapsibleContent|Tooltip|Menu|MenuContent|Panel|Table|TabsContent)$/;
const SWITCHER = /<(TabsList|SubNavTabs)(?=[\s>/])/g;
const SHELL = /<AppShell(?=[\s>/])/;
const GENESIS_PACKAGE = /^@marktiderman\/genesis(?:-[\w-]+)?(?:\/|$)/;
/**
 * A web page layout: an exported component named `…Page` or `…PageShell` (not the breadcrumb's
 * `BreadcrumbPage`), or `ResourceView`, which draws a ResourcePage from a view.
 */
const PAGE_LAYOUT = /^(?:(?!Breadcrumb)[A-Z]\w*(?:Page|PageShell)|ResourceView)$/;
/** A package screen built on a Genesis layout: a `…Page` / `…Screen` / `…Record view` imported from a Genesis package. */
/**
 * A `<ResourceView … layout="embedded" …>` tag, up to its first `>`. The trail blanks string contents
 * but keeps their length, and `layout` is typed `"page" | "embedded" | "compact"`, so a literal of eight
 * characters is `"embedded"` (as a string or `{"embedded"}`).
 */
const EMBEDDED_RESOURCE_VIEW = /<ResourceView\b[^>]*?\blayout\s*=\s*(?:(["'`]) {8}\1|\{\s*(["'`]) {8}\2\s*\})[^>]*>/g;
const PACKAGE_SCREEN = /^(?:(?!Breadcrumb)[A-Z]\w*(?:Page|PageShell|Screen|Workspace)|ResourceView)$/;

const isNative = (ctx: DoctorContext) => ctx.config.packs?.includes("native") ?? false;
const rendersRe = (names: Iterable<string>) => {
  const list = [...names];
  return list.length ? new RegExp(`<(?:${list.map((n) => n.replace(/[.$]/g, "\\$&")).join("|")})(?=[\\s>/])`) : null;
};

/**
 * Whether `test` holds for one of the route's files (`posts.tsx`, `posts.lazy.tsx`) or a module they reach
 * through imports, re-exports and barrels: `yes`, `no`, or `unknown` when the trail ran out.
 */
function routeReach(ctx: DoctorContext, r: RouteFile, test: (code: string) => boolean): Reach {
  const trail = trailFor(ctx);
  let unknown = false;
  for (const f of r.files) {
    const got = trail.reach(f, test);
    if (got === "yes") return "yes";
    if (got === "unknown") unknown = true;
  }
  return unknown ? "unknown" : "no";
}
const routeVia = (ctx: DoctorContext, r: RouteFile, test: (code: string) => boolean) => routeReach(ctx, r, test) === "yes";

/**
 * Which routes render inside the AppShell: those under a layout route that
 * renders it (directly or through one local import). When no route renders it
 * but some app file does, the app mounts the shell elsewhere, so every route counts.
 * The shell's own layout route is not "inside" it.
 */
function insideShell(ctx: DoctorContext, routes: RouteFile[]): (r: RouteFile) => boolean {
  const shell = new Set(routes.filter((r) => routeVia(ctx, r, (code) => SHELL.test(code))));
  const anyShell = shell.size === 0 && ctx.files.some((f) => SHELL.test(f.code));
  return (r) => !shell.has(r) && (anyShell || r.parents.some((p) => shell.has(p)));
}

/** `hand-rolled-sub-nav`: a route inside the shell draws its own page-level section tabs. */
export function checkHandRolledSubNav(ctx: DoctorContext): void {
  if (isNative(ctx) || !ctx.genesis.values.has("useAppShellSubNav")) return;
  const routes = webRoutes(ctx);
  if (routes.length === 0) return;
  const inShell = insideShell(ctx, routes);
  const ui = ctx.genesis.uiPackage;
  // Every route in the shell, pages and layouts alike: a page that also renders an <Outlet> is a page, and a
  // layout route drawing tabs over its children is the classic hand-rolled sub-nav.
  for (const r of routes) {
    if (!inShell(r) || r.files.some((f) => /\buseAppShellSubNav\s*\(/.test(f.code))) continue;
    const hit = r.files
      .flatMap((f) => [...f.code.matchAll(SWITCHER)].map((m) => ({ f, m })))
      .find(({ f, m }) => openElementsAt(f.code, m.index!, (n) => CONTAINER.test(n)).length === 0);
    if (hit) {
      const { f, m } = hit;
      const code = f.code;
      ctx.report({
        rule: "hand-rolled-sub-nav",
        level: "warn",
        file: f.path,
        line: lineAt(code, m.index!),
        subject: m[1],
        message:
          `switches the page's sections with its own <${m[1]}>; hand them to the shell with useAppShellSubNav(items, { mode: "tabs" }) ` +
          `and put the header in AppShellPageHeader (chips in AppShellSubNavEnd), from ${ui}/layout, so the sections are the shell's tab row ` +
          `and the phone's bottom bar. See ${SUB_NAV_DOCS}`,
      });
    }
  }
}

/**
 * `local-genesis-copy`: an app component named like a Genesis component
 * (`ResourceHeader`, `PageHeader`, `StatusBadge`). Only a component
 * definition counts: it renders JSX, the file doesn't import the Genesis one,
 * and it is exported or lives outside the routes folder. A route's own
 * `errorComponent` / `pendingComponent` / `notFoundComponent` (TanStack's
 * `FormError`) shares a name, not a job.
 */
export function checkLocalGenesisCopies(ctx: DoctorContext): void {
  const owner = new Map<string, string>();
  for (const c of ctx.genesis.companions) for (const name of c.components) owner.set(name, c.package);
  for (const name of ctx.genesis.components) owner.set(name, ctx.genesis.uiPackage);
  if (owner.size === 0) return;
  const decl = /\b(export\s+(?:default\s+)?)?(?:declare\s+)?(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Z][\w$]*)\b/g;
  const routes = routesDir(ctx);
  for (const file of ctx.files) {
    if (!JSX_EXTS.has(file.ext)) continue;
    const imported = new Set(namedImportsFrom(file.code, GENESIS_PACKAGE));
    const inRoutes = routes !== null && file.path.startsWith(`${routes}/`);
    // Route options that take a component: `errorComponent: FormError`, `pendingComponent`, `component`.
    const routeComponents = new Set([...file.code.matchAll(/\b\w*[cC]omponent\s*:\s*([A-Z][\w$]*)\b/g)].map((r) => r[1]));
    const decls = [...file.code.matchAll(decl)];
    decls.forEach((m, i) => {
      const [, exported, name] = m;
      const pkg = owner.get(name);
      if (!pkg || imported.has(name) || routeComponents.has(name)) return;
      if (inRoutes && !exported && !new RegExp(`\\bexport\\s*(?:default\\s+${name}\\b|\\{[^}]*\\b${name}\\b)`).test(file.code)) return;
      // Its body, up to the next declaration in the file: a component renders JSX.
      const body = file.code.slice(m.index! + m[0].length, decls[i + 1]?.index ?? file.code.length);
      if (!rendersJsx(body)) return;
      // An exported value named like a genesis-ui export is already shadowed-export (an error).
      if (exported && pkg === ctx.genesis.uiPackage && ctx.genesis.values.has(name)) return;
      // `const RichTextEditor = lazy(() => import("@marktiderman/genesis-ui/…"))` loads the Genesis one.
      const init = file.code.slice(m.index! + m[0].length, m.index! + m[0].length + 400).split(";")[0];
      if (/["']@marktiderman\/genesis/.test(init)) return;
      ctx.report({
        rule: "local-genesis-copy",
        level: "warn",
        file: file.path,
        line: lineAt(file.code, m.index!),
        subject: name,
        message: `defines its own ${name}; Genesis already has ${name} (${pkg}). Use it, or extend it upstream`,
      });
    });
  }
}

/**
 * `resource-workspace`: in a folder where one detail page puts its header in
 * AppShellPageHeader, the other detail pages that don't.
 */
export function checkRecordViews(ctx: DoctorContext): void {
  if (isNative(ctx) || !ctx.genesis.values.has("AppShellPageHeader")) return;
  const header = /<AppShellPageHeader(?=[\s>/])/;
  const byFolder = new Map<string, RouteFile[]>();
  for (const r of webRoutes(ctx)) {
    if (!r.detail || r.redirectOnly) continue;
    const dir = r.file.path.slice(0, r.file.path.lastIndexOf("/"));
    byFolder.set(dir, [...(byFolder.get(dir) ?? []), r]);
  }
  for (const [dir, routes] of byFolder) {
    const reach = new Map(routes.map((r) => [r, routeReach(ctx, r, (code) => header.test(code))]));
    const has = routes.filter((r) => reach.get(r) === "yes");
    if (has.length === 0) continue;
    const ref = has.map((r) => r.file.path.slice(dir.length + 1)).join(", ");
    for (const r of routes) {
      if (reach.get(r) !== "no") continue;
      ctx.report({
        rule: "resource-workspace",
        level: "info",
        file: r.file.path,
        message:
          `is a detail page without AppShellPageHeader, unlike ${ref} beside it; put its header in AppShellPageHeader and its sections in ` +
          `useAppShellSubNav so every workspace in ${dir} has the same header, tabs and phone bar`,
      });
    }
  }
}

/**
 * `page-layout`: a web route inside the AppShell that renders no Genesis page
 * layout, directly, through one local import, or from a layout route around it.
 *
 * Only routes inside the shell are checked: Genesis has no layout yet for the
 * pages outside it (sign-in, reset password, invite, landing, public forms).
 * When PublicPage and AuthPage ship (Elite plan L3), check every route, and
 * name those two in the message for routes outside the shell.
 */
export function checkPageLayouts(ctx: DoctorContext): void {
  if (isNative(ctx)) return;
  const layouts = new Set(ctx.genesis.components.filter((n) => PAGE_LAYOUT.test(n)));
  for (const c of ctx.genesis.companions) for (const n of c.components) if (PAGE_LAYOUT.test(n)) layouts.add(n);
  if (layouts.size === 0) return;
  const routes = webRoutes(ctx);
  const inShell = insideShell(ctx, routes);
  const rendersLayout = (code: string) => {
    const names = new Set(layouts);
    for (const n of namedImportsFrom(code, GENESIS_PACKAGE)) if (PACKAGE_SCREEN.test(n)) names.add(n);
    // An embedded ResourceView is a list inside a page and never claims it. Only a literal
    // `layout="embedded"` is set aside; an expression could be anything, so it still counts.
    return rendersRe(names)?.test(code.replace(EMBEDDED_RESOURCE_VIEW, "")) ?? false;
  };
  const cache = new Map<RouteFile, Reach>();
  const provides = (r: RouteFile) => {
    if (!cache.has(r)) cache.set(r, routeReach(ctx, r, rendersLayout));
    return cache.get(r)!;
  };
  const list = [...layouts].sort();
  const named = list.length > 4 ? `${list.slice(0, 4).join(", ")}, …` : list.join(", ");
  for (const r of routes) {
    // Pure layouts are judged through their pages; a page that also renders an <Outlet> is checked like any other.
    if (!r.page || r.redirectOnly || !inShell(r)) continue;
    // Report only a sure "no": when a trail runs out (an alias we can't read, the depth limit), stay quiet.
    if (provides(r) !== "no" || r.parents.some((p) => provides(p) !== "no")) continue;
    ctx.report({
      rule: "page-layout",
      level: "warn",
      file: r.file.path,
      message: `renders no Genesis page layout (${named}) itself, through one local import, or from a layout route around it; wrap it in one so the header, width and spacing match every other page`,
    });
  }
}
