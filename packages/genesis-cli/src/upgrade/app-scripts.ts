import { readdirSync, statSync } from "node:fs";
import * as path from "node:path";

const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".git", ".next", ".output", ".turbo", ".expo", "coverage", "ios", "android"]);
const SCRIPT = /\.(?:[cm]?[jt]sx?)$/;
const MAX_BYTES = 2 * 1024 * 1024;

/** The app's script files (tests and declarations included: they use the same names), app-relative and sorted. */
export function appScripts(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(abs);
      } else if (entry.isFile() && SCRIPT.test(entry.name) && statSync(abs).size <= MAX_BYTES) {
        out.push(path.relative(root, abs).split(path.sep).join("/"));
      }
    }
  };
  walk(root);
  return out;
}
