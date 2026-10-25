/**
 * Route stubs for a block's screens. On an Expo Router app (a router root
 * with a `_layout.tsx`) a missing route gets a stub screen that renders a
 * Genesis layout and no text, for the app to fill in; a route the app already
 * has (in any group) is left alone. Other routers get a manual step.
 */
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import type { BlockRoute } from "@marktiderman/genesis-features/blocks";
import { listApp } from "./files.js";

/** The Expo Router root: genesis.config.json's doctor.native.routerRoot, else src/app or app. */
export function routerRoot(root: string): string | null {
  try {
    const config = JSON.parse(readFileSync(path.join(root, "genesis.config.json"), "utf8")) as { doctor?: { native?: { routerRoot?: string } } };
    const configured = config.doctor?.native?.routerRoot;
    if (configured && existsSync(path.join(root, configured, "_layout.tsx"))) return configured.replace(/\/+$/, "");
  } catch {
    // No config, or not JSON: look for the usual folders.
  }
  for (const dir of ["src/app", "app"]) if (existsSync(path.join(root, dir, "_layout.tsx"))) return dir;
  return null;
}

/** A route file's URL path: groups dropped, `index` the folder itself. */
export function routeOf(file: string): string | null {
  if (!/\.(tsx|ts|jsx|js)$/.test(file)) return null;
  const parts = file.replace(/\.(tsx|ts|jsx|js)$/, "").split("/");
  const last = parts[parts.length - 1]!;
  if (last.startsWith("_") || last.startsWith("+")) return null;
  const segments = parts.filter((p) => !/^\(.*\)$/.test(p));
  if (segments[segments.length - 1] === "index") segments.pop();
  return `/${segments.join("/")}`;
}

export interface RouteStub {
  route: BlockRoute;
  /** App-relative file to create, or null when the app already routes it. */
  file: string | null;
  existing?: string;
}

/**
 * Where each route's stub goes: under the router root, inside the one
 * top-level group when the route is for signed-in people and there is one.
 */
export function planRouteStubs(root: string, routes: readonly BlockRoute[]): { routerRoot: string | null; stubs: RouteStub[] } {
  const dir = routerRoot(root);
  if (!dir) return { routerRoot: null, stubs: routes.map((route) => ({ route, file: null })) };
  const files = listApp(root, dir).map((f) => f.slice(dir.length + 1));
  const byRoute = new Map<string, string>();
  for (const f of files) {
    const r = routeOf(f);
    if (r && !byRoute.has(r)) byRoute.set(r, `${dir}/${f}`);
  }
  const groups = [...new Set(files.map((f) => f.split("/")[0]!).filter((s) => /^\(.*\)$/.test(s) && files.includes(`${s}/_layout.tsx`)))];
  const stubs = routes.map((route): RouteStub => {
    const existing = byRoute.get(route.path.replace(/\/+$/, "") || "/");
    if (existing) return { route, file: null, existing };
    const segments = route.path.replace(/^\/|\/+$/g, "").split("/").filter(Boolean);
    if (!segments.length) return { route, file: null };
    const group = route.signedIn && groups.length === 1 ? `${groups[0]}/` : "";
    return { route, file: `${dir}/${group}${segments.join("/")}.tsx` };
  });
  return { routerRoot: dir, stubs };
}

export function routeStub(blockId: string, route: BlockRoute): string {
  return `// A stub for the ${blockId} block's ${route.path} screen, written by \`genesis add ${blockId}\`.
// ${route.description ?? "Replace it with the block's screen"}. See the block's README for the screen to render here.
import { ScreenContainer } from "@marktiderman/genesis-ui-native";

export default function Screen() {
  return <ScreenContainer />;
}
`;
}
