/**
 * Structural rules: an app that rebuilds what Genesis already has, in shape
 * rather than in pixels. Hand-rolled section tabs on a page inside the shell,
 * app components named like Genesis ones, detail pages in one folder built two
 * ways, and routes with no Genesis page layout. Like the core rules, every
 * name comes from the installed packages.
 */
import { lineAt } from "./scan.js";
import { webRoutes, type RouteFile } from "./routes.js";
import { JSX_EXTS, namedImportsFrom, openElementsAt, viaOneImport } from "./source.js";
import type { DoctorContext } from "./types.js";

/** Where the shell's sub-navigation is documented. */
export const SUB_NAV_DOCS = "https://github.com/marktiderman/genesis/blob/main/packages/ui/SKILL.md (Sub-navigation)";

/** Elements a section switcher inside them belongs to, not the page: cards, overlays, disclosure, other tabs. */
const CONTAINER = /(?:Card|CardContent|Dialog|DialogContent|Sheet|SheetContent|Drawer|DrawerContent|Popover|PopoverContent|Modal|Accordion|AccordionContent|AccordionItem|Collapsible|CollapsibleContent|Tooltip|Menu|MenuContent|Panel|Table|TabsContent)$/;
const SWITCHER = /<(TabsList|SubNavTabs)(?=[\s>/])/g;
const SHELL = /<AppShell(?=[\s>/])/;
const GENESIS_PACKAGE = /^@marktiderman\/genesis(?:-[\w-]+)?(?:\/|$)/;
/** A web page layout: an exported component named `…Page` or `…PageShell` (not the breadcrumb's `BreadcrumbPage`). */
const PAGE_LAYOUT = /^(?!Breadcrumb)[A-Z]\w*(?:Page|PageShell)$/;
/** A package screen built on a Genesis layout: a `…Page` / `…Screen` / `…Workspace` imported from a Genesis package. */
const PACKAGE_SCREEN = /^(?!Breadcrumb)[A-Z]\w*(?:Page|PageShell|Screen|Workspace)$/;

const isNative = (ctx: DoctorContext) => ctx.config.packs?.includes("native") ?? false;
const rendersRe = (names: Iterable<string>) => {
  const list = [...names];
  return list.length ? new RegExp(`<(?:${list.map((n) => n.replace(/[.$]/g, "\\$&")).join("|")})(?=[\\s>/])`) : null;
};

/** `hand-rolled-sub-nav`: a route inside the shell draws its own page-level section tabs. */
export function checkHandRolledSubNav(ctx: DoctorContext): void {
  if (isNative(ctx) || !ctx.genesis.values.has("useAppShellSubNav")) return;
  const routes = webRoutes(ctx);
  if (routes.length === 0) return;
  const rendersShell = (r: RouteFile) => viaOneImport(ctx.root, ctx.files, r.file, (code) => SHELL.test(code));
  // Routes under a layout that renders AppShell; when no route does, any shell in the app counts for every route.
  const shellRoutes = new Set(routes.filter(rendersShell));
  const anyShell = shellRoutes.size === 0 && ctx.files.some((f) => SHELL.test(f.code));
  const ui = ctx.genesis.uiPackage;
  for (const r of routes) {
    if (shellRoutes.has(r)) continue;
    if (!anyShell && !r.parents.some((p) => shellRoutes.has(p))) continue;
    const code = r.file.code;
    if (/\buseAppShellSubNav\s*\(/.test(code)) continue;
    for (const m of code.matchAll(SWITCHER)) {
      if (openElementsAt(code, m.index!, (n) => CONTAINER.test(n)).length > 0) continue;
      ctx.report({
        rule: "hand-rolled-sub-nav",
        level: "warn",
        file: r.file.path,
        line: lineAt(code, m.index!),
        subject: m[1],
        message:
          `switches the page's sections with its own <${m[1]}>; hand them to the shell with useAppShellSubNav(items, { mode: "tabs" }) ` +
          `and put the header in AppShellPageHeader (chips in AppShellSubNavEnd), from ${ui}/layout, so the sections are the shell's tab row ` +
          `and the phone's bottom bar. See ${SUB_NAV_DOCS}`,
      });
      break;
    }
  }
}

/** `local-genesis-copy`: an app component named like a Genesis component (`ResourceHeader`, `PageHeader`, `StatusBadge`). */
export function checkLocalGenesisCopies(ctx: DoctorContext): void {
  const owner = new Map<string, string>();
  for (const c of ctx.genesis.companions) for (const name of c.components) owner.set(name, c.package);
  for (const name of ctx.genesis.components) owner.set(name, ctx.genesis.uiPackage);
  if (owner.size === 0) return;
  const decl = /\b(export\s+(?:default\s+)?)?(?:declare\s+)?(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Z][\w$]*)\b/g;
  for (const file of ctx.files) {
    if (!JSX_EXTS.has(file.ext)) continue;
    const imported = new Set(namedImportsFrom(file.code, GENESIS_PACKAGE));
    for (const m of file.code.matchAll(decl)) {
      const [, exported, name] = m;
      const pkg = owner.get(name);
      if (!pkg || imported.has(name)) continue;
      // An exported value named like a genesis-ui export is already shadowed-export (an error).
      if (exported && pkg === ctx.genesis.uiPackage && ctx.genesis.values.has(name)) continue;
      // `const RichTextEditor = lazy(() => import("@marktiderman/genesis-ui/…"))` loads the Genesis one.
      const init = file.code.slice(m.index! + m[0].length, m.index! + m[0].length + 400).split(";")[0];
      if (/["']@marktiderman\/genesis/.test(init)) continue;
      ctx.report({
        rule: "local-genesis-copy",
        level: "warn",
        file: file.path,
        line: lineAt(file.code, m.index!),
        subject: name,
        message: `defines its own ${name}; Genesis already has ${name} (${pkg}). Use it, or extend it upstream`,
      });
    }
  }
}

/**
 * `resource-workspace`: in a folder where one detail page puts its header in
 * AppShellPageHeader, the other detail pages that don't.
 */
export function checkResourceWorkspaces(ctx: DoctorContext): void {
  if (isNative(ctx) || !ctx.genesis.values.has("AppShellPageHeader")) return;
  const header = /<AppShellPageHeader(?=[\s>/])/;
  const byFolder = new Map<string, RouteFile[]>();
  for (const r of webRoutes(ctx)) {
    if (!r.detail || r.redirectOnly) continue;
    const dir = r.file.path.slice(0, r.file.path.lastIndexOf("/"));
    byFolder.set(dir, [...(byFolder.get(dir) ?? []), r]);
  }
  for (const [dir, routes] of byFolder) {
    const has = routes.filter((r) => viaOneImport(ctx.root, ctx.files, r.file, (code) => header.test(code)));
    if (has.length === 0) continue;
    const ref = has.map((r) => r.file.path.slice(dir.length + 1)).join(", ");
    for (const r of routes) {
      if (has.includes(r)) continue;
      ctx.report({
        rule: "resource-workspace",
        level: "warn",
        file: r.file.path,
        message:
          `is a detail page without AppShellPageHeader, unlike ${ref} beside it; put its header in AppShellPageHeader and its sections in ` +
          `useAppShellSubNav so every workspace in ${dir} has the same header, tabs and phone bar`,
      });
    }
  }
}

/**
 * `page-layout`: a web route that renders no Genesis page layout, directly,
 * through one local import, or from a layout route around it.
 */
export function checkPageLayouts(ctx: DoctorContext): void {
  if (isNative(ctx)) return;
  const layouts = new Set(ctx.genesis.components.filter((n) => PAGE_LAYOUT.test(n)));
  for (const c of ctx.genesis.companions) for (const n of c.components) if (PAGE_LAYOUT.test(n)) layouts.add(n);
  if (layouts.size === 0) return;
  const routes = webRoutes(ctx);
  const rendersLayout = (code: string) => {
    const names = new Set(layouts);
    for (const n of namedImportsFrom(code, GENESIS_PACKAGE)) if (PACKAGE_SCREEN.test(n)) names.add(n);
    return rendersRe(names)?.test(code) ?? false;
  };
  const cache = new Map<RouteFile, boolean>();
  const provides = (r: RouteFile) => {
    if (!cache.has(r)) cache.set(r, viaOneImport(ctx.root, ctx.files, r.file, rendersLayout));
    return cache.get(r)!;
  };
  const list = [...layouts].sort();
  const named = list.length > 4 ? `${list.slice(0, 4).join(", ")}, …` : list.join(", ");
  for (const r of routes) {
    if (r.layout || r.redirectOnly) continue;
    if (provides(r) || r.parents.some(provides)) continue;
    ctx.report({
      rule: "page-layout",
      level: "warn",
      file: r.file.path,
      message: `renders no Genesis page layout (${named}) itself, through one local import, or from a layout route around it; wrap it in one so the header, width and spacing match every other page`,
    });
  }
}
