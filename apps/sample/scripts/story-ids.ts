/**
 * Story ids for the primitive pages' "Open in Storybook" links.
 *
 * Reads each `stories/*.stories.tsx` file's CSF title and named exports and
 * computes the ids Storybook gives them, so the sample app can link a
 * primitive to a story that exists without building Storybook first (the
 * deploy builds the sample app before Storybook). The result maps a
 * component name (lowercase letters and digits, the last segment of the
 * title) to that component's first story: `Default` when there is one,
 * otherwise the first exported story.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Storybook's id sanitiser (storybook/internal/csf `sanitize`).
function sanitize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[ ’–—―′¿'`~!@#$%^&*()_|+\-=?;:'",.<>{}[\]\\/]/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
}

// Storybook's story name from an export name (lodash startCase).
function storyNameFromExport(name: string): string {
  return name
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-zA-Z])(\d)/g, "$1 $2")
    .replace(/(\d)([a-zA-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
}

export function componentKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function buildStoryIds(storiesDir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const files = readdirSync(storiesDir)
    .filter((f) => /\.stories\.tsx?$/.test(f))
    .sort();
  for (const file of files) {
    const source = readFileSync(join(storiesDir, file), "utf8");
    // The meta object's title: the first `title:` after `const meta` or `export default {`.
    const metaAt = source.search(/^(?:const meta\b|export default \{)/m);
    if (metaAt < 0) continue;
    const title = source.slice(metaAt).match(/\btitle:\s*["']([^"']+)["']/)?.[1];
    if (!title) continue;
    const exports = [...source.matchAll(/^export\s+(?:const|let|function)\s+([A-Za-z_$][\w$]*)/gm)].map(
      (m) => m[1]
    );
    if (exports.length === 0) continue;
    const first = exports.includes("Default") ? "Default" : exports[0];
    const key = componentKey(title.split("/").pop() ?? title);
    if (out[key]) continue;
    out[key] = `${sanitize(title)}--${sanitize(storyNameFromExport(first))}`;
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}
