// Put the studio's page inside a React Router app's own layout route, so it
// renders under the app's shell (sidebar, header, theme) like its other
// pages. A plain-text edit of the router file, done only when the file's
// shape is unambiguous; otherwise the caller prints what to add instead.

export interface WireResult {
  /** The router file's new text, when it was changed. */
  content?: string;
  /** Why it wasn't changed, for the printed steps. */
  skipped?: string;
  /** The guard component the route was wrapped in, if any. */
  guard?: string;
}

interface RouteTag {
  start: number;
  /** Index just past the opening tag's `>`. */
  openEnd: number;
  selfClosing: boolean;
  /** Index of the matching `</Route>`, for an opening tag. */
  close?: number;
  text: string;
}

/** Every `<Route …>` tag, with its matching close, skipping `{…}` and strings inside tags. */
function routeTags(source: string): RouteTag[] {
  const tags: RouteTag[] = [];
  const stack: RouteTag[] = [];
  const re = /<Route\b|<\/Route>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    if (m[0] === "</Route>") {
      const open = stack.pop();
      if (open) open.close = m.index;
      continue;
    }
    let i = m.index + "<Route".length;
    let depth = 0;
    let quote: string | null = null;
    for (; i < source.length; i++) {
      const ch = source[i]!;
      if (quote) {
        if (ch === quote && source[i - 1] !== "\\") quote = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") quote = ch;
      else if (ch === "{") depth++;
      else if (ch === "}") depth--;
      else if (depth === 0 && ch === ">") break;
    }
    const selfClosing = source[i - 1] === "/";
    const tag: RouteTag = { start: m.index, openEnd: i + 1, selfClosing, text: source.slice(m.index, i + 1) };
    tags.push(tag);
    if (!selfClosing) stack.push(tag);
    re.lastIndex = i + 1;
  }
  return tags;
}

const GUARD = /<((?:[A-Z]\w*)?(?:Admin|Staff)\w*(?:Guard|Route|Only)|RequireAdmin|RequireStaff)>/;

export function wireStudioRoute(source: string, route: string, pageImportPath: string): WireResult {
  const tags = routeTags(source);
  const relative = route.replace(/^\//, "");
  const existing = tags.find((t) => new RegExp(`path=["'](/?${relative.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})["']`).test(t.text));
  if (existing) {
    return { skipped: `Your router already has a page at ${route}. Replace its element with <DataStudioPage /> to use the studio there.` };
  }
  // The layout route: one that wraps child routes and renders a layout or shell.
  const layouts = tags.filter((t) => !t.selfClosing && t.close !== undefined && /Layout|Shell/.test(t.text));
  const roots = layouts.length ? layouts : tags.filter((t) => !t.selfClosing && t.close !== undefined && /path=["']\/["']/.test(t.text));
  if (roots.length !== 1) {
    return {
      skipped:
        roots.length === 0
          ? `No layout route found to put the page under. Add <Route path="${route}" element={<DataStudioPage />} /> where your app's other pages are.`
          : `More than one layout route; add <Route path="${relative}" element={<DataStudioPage />} /> inside the one your other admin pages use.`,
    };
  }
  const layout = roots[0]!;
  const childPath = /path=["']\/["']/.test(layout.text) || !/path=/.test(layout.text) ? relative : route;
  const guard = GUARD.exec(source)?.[1];
  const element = guard ? `<${guard}><DataStudioPage /></${guard}>` : "<DataStudioPage />";

  // Indent like the last child route.
  const before = source.slice(0, layout.close!);
  const lastLine = before.slice(before.lastIndexOf("\n", before.lastIndexOf("<Route")) + 1);
  const indent = /^\s*/.exec(lastLine)?.[0] ?? "  ";
  const closeLineStart = source.lastIndexOf("\n", layout.close!) + 1;
  const routeLine = `${indent}<Route path="${childPath}" element={${element}} />\n`;
  let next = source.slice(0, closeLineStart) + routeLine + source.slice(closeLineStart);

  // Import it the way the file imports its other pages.
  const lazy = /const \w+ = lazy\(\(\) => import\(["'][^"']+["']\)\);?\n/g;
  let lastLazy: RegExpExecArray | null = null;
  let mm: RegExpExecArray | null;
  while ((mm = lazy.exec(next))) lastLazy = mm;
  if (lastLazy) {
    const at = lastLazy.index + lastLazy[0].length;
    next = `${next.slice(0, at)}const DataStudioPage = lazy(() => import("${pageImportPath}"));\n${next.slice(at)}`;
  } else {
    const imports = /^import .*;\s*$/gm;
    let lastImport: RegExpExecArray | null = null;
    while ((mm = imports.exec(next))) lastImport = mm;
    const at = lastImport ? lastImport.index + lastImport[0].length + 1 : 0;
    next = `${next.slice(0, at)}import DataStudioPage from "${pageImportPath}";\n${next.slice(at)}`;
  }
  return { content: next, ...(guard ? { guard } : {}) };
}
