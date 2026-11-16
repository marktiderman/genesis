/**
 * What the conformance run visits: every page of the built sample (its sitemap) and every story
 * (Storybook's index.json). The per-PR scope keeps one page per route pattern (React Router's
 * manifest); the full scope
 * (nightly, main) keeps every page.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { flattenReactRouterRoutes, onePathPerPattern, type RoutePattern } from "@marktiderman/genesis-cli/verify";

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
}

/** The sample's route patterns, from React Router's manifest, cached for the workers. */
function routePatterns(): RoutePattern[] {
  const cache = join(SAMPLE_DIR, "test-results", "conformance-routes.json");
  if (!existsSync(cache)) {
    const json = execFileSync("pnpm", ["exec", "react-router", "routes", "--json"], { cwd: SAMPLE_DIR, encoding: "utf8" });
    mkdirSync(dirname(cache), { recursive: true });
    writeFileSync(cache, JSON.stringify(flattenReactRouterRoutes(JSON.parse(json))));
  }
  return JSON.parse(readFileSync(cache, "utf8"));
}

export function routeTargets(scope: Scope = SCOPE): Target[] {
  const sitemap = join(SITE_DIR, "sitemap.xml");
  if (!existsSync(sitemap)) throw new Error("No sample build: run `pnpm --filter sample build` first.");
  const paths = [...readFileSync(sitemap, "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
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
