/**
 * The package catalog, read at build time from the packages themselves
 * (package.json exports → source barrels → exports, JSDoc and README),
 * through the same reader as docs/component-reference.md. Server-only: the
 * routes call it from their `loader`, which runs while prerendering.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export interface CatalogExport {
  name: string;
  kind: string;
  stability: string | null;
  summary: string | null;
  source: string | null;
  propsType?: string;
}
export interface CatalogEntry {
  name: string;
  subpath: string;
  barrel: string;
  description: string;
  components: CatalogExport[];
  values: CatalogExport[];
  types: string[];
}
export interface CatalogPackage {
  name: string;
  dir: string;
  version: string;
  description: string;
  entries: CatalogEntry[];
}

const ROOT = resolve(process.cwd(), "..", "..");
let cache: CatalogPackage[] | undefined;

/** Loaded from its own file at run time (not bundled), so it finds the repo from where it lives. */
export async function catalog(): Promise<CatalogPackage[]> {
  if (!cache) {
    const script = pathToFileURL(join(ROOT, "scripts", "gen-component-reference.mjs")).href;
    const { collectCatalog } = (await import(/* @vite-ignore */ script)) as { collectCatalog: () => CatalogPackage[] };
    cache = collectCatalog();
  }
  return cache;
}

/** The README's opening paragraphs, as plain text. */
export function readmeIntro(dir: string): string[] {
  const file = join(ROOT, "packages", dir, "README.md");
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p && !p.startsWith("#") && !p.startsWith("```") && !p.startsWith("|") && !p.startsWith("<") && !p.startsWith("!["))
    .slice(0, 2)
    .map((p) => p.replace(/\s+/g, " ").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1"));
}
