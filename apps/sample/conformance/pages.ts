/**
 * What the conformance run visits: every page of the built sample (its sitemap) and every story
 * (Storybook's index.json). The per-PR scope keeps one page per route pattern (React Router's
 * manifest); the full scope (nightly) keeps every page. A route pattern with no page in the
 * sitemap is reported as skipped, never dropped silently.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { flattenReactRouterRoutes, onePathPerPattern, patternFor, type RoutePattern } from "@marktiderman/genesis-cli/verify";

export const SAMPLE_DIR = join(import.meta.dirname, "..");
export const SITE_DIR = join(SAMPLE_DIR, "build", "client");
export const STORYBOOK_DIR = join(SAMPLE_DIR, "storybook-static");

export const PORTS = { site: 4310, storybook: 4311 };
export const ORIGINS = { site: `http://127.0.0.1:${PORTS.site}`, storybook: `http://127.0.0.1:${PORTS.storybook}` };

export type Scope = "pr" | "full";
export const SCOPE: Scope = process.env.CONFORMANCE_SCOPE === "full" ? "full" : "pr";

export interface Target {
  /** The id in reports and allow entries: a path (`/items`) or `story:<id>`. */
  id: string;
  kind: "route" | "story";
  url: string;
  /** The page is expected to redirect (a legacy path); the landing-URL check is off. */
  redirects?: boolean;
}

/**
 * React Router's manifest as the build job writes it (`react-router routes --json`, which loads the
 * app's config and so needs every package built). CI's shards get it in the build artifact.
 */
export const ROUTES_MANIFEST = join(SAMPLE_DIR, "build", "routes.json");

/** The sample's route patterns, from React Router's manifest, cached for the workers. */
function routePatterns(): RoutePattern[] {
  // Keyed by its inputs, so a changed route file or manifest is never answered from an old cache.
  const inputs = [ROUTES_MANIFEST, join(SAMPLE_DIR, "app", "routes.ts")].map((f) => (existsSync(f) ? `${f}:${statSync(f).mtimeMs}` : `${f}:-`)).join("|");
  const cache = join(SAMPLE_DIR, "test-results", "conformance-routes.json");
  if (existsSync(cache)) {
    const cached = JSON.parse(readFileSync(cache, "utf8")) as { inputs: string; patterns: RoutePattern[] };
    if (cached.inputs === inputs) return cached.patterns;
  }
  // The written manifest in CI, where the build job writes it fresh for this commit. Locally, only
  // when it is strictly newer than the route file (one left from an old build would be stale);
  // otherwise React Router's own command.
  const routesFile = join(SAMPLE_DIR, "app", "routes.ts");
  const fresh =
    existsSync(ROUTES_MANIFEST) &&
    (!!process.env.CI || !existsSync(routesFile) || statSync(ROUTES_MANIFEST).mtimeMs > statSync(routesFile).mtimeMs);
  const json = fresh
    ? readFileSync(ROUTES_MANIFEST, "utf8")
    : execFileSync("pnpm", ["exec", "react-router", "routes", "--json"], { cwd: SAMPLE_DIR, encoding: "utf8" });
  const patterns = flattenReactRouterRoutes(JSON.parse(json));
  mkdirSync(dirname(cache), { recursive: true });
  writeFileSync(cache, JSON.stringify({ inputs, patterns }));
  return patterns;
}

export function sitemapPaths(): string[] {
  const sitemap = join(SITE_DIR, "sitemap.xml");
  if (!existsSync(sitemap)) throw new Error("No sample build: run `pnpm --filter sample build` first.");
  return [...readFileSync(sitemap, "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
}

/** Route patterns no sitemap page reaches: reported as skipped. */
export function unvisitedPatterns(): string[] {
  const patterns = routePatterns();
  const reached = new Set(sitemapPaths().map((p) => patternFor(p, patterns)?.pattern));
  return patterns.map((p) => p.pattern).filter((p) => !reached.has(p));
}

export function routeTargets(scope: Scope = SCOPE): Target[] {
  const paths = sitemapPaths();
  const kept = scope === "full" ? paths : onePathPerPattern(paths, routePatterns());
  return kept.map((p) => ({ id: p, kind: "route", url: p }));
}

export function storyTargets(): Target[] {
  const index = join(STORYBOOK_DIR, "index.json");
  if (!existsSync(index)) throw new Error("No Storybook build: run `pnpm --filter sample build-storybook` first.");
  const { entries } = JSON.parse(readFileSync(index, "utf8")) as { entries: Record<string, { id: string; type: string }> };
  return Object.values(entries)
    .filter((e) => e.type === "story")
    .map((e) => ({ id: `story:${e.id}`, kind: "story", url: `/iframe.html?id=${encodeURIComponent(e.id)}&viewMode=story` }));
}
