/**
 * Collects the app files the doctor checks.
 */
import { localPackages } from "../blocks/local.js";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import * as path from "node:path";
import { LINE_COMMENT_EXTS, stripBlockComments } from "../../../../scripts/lib/color-literals.mjs";
import { globMatcher } from "./glob.js";
import type { DoctorConfig, SourceFile } from "./types.js";

export const DEFAULT_SRC = ["src"];
/** Expo apps keep routes in `app/` and shared UI in `components/` at the root. */
export const DEFAULT_NATIVE_SRC = ["app", "src", "components"];
export const DEFAULT_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".css"];
/** Always skipped: tests, fixtures, declarations and generated files are not shipped UI. */
export const DEFAULT_IGNORE = [
  "**/*.d.ts",
  "**/*.gen.*",
  "**/*.test.*",
  "**/*.spec.*",
  "**/__tests__/**",
  "**/__fixtures__/**",
  "**/__mocks__/**",
];
const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".git", ".next", ".output", ".turbo", "coverage"]);
const MAX_FILE_BYTES = 2 * 1024 * 1024;

const toPosix = (p: string) => p.split(path.sep).join("/");

export function scanFiles(root: string, config: DoctorConfig): SourceFile[] {
  const extensions = new Set(config.extensions ?? DEFAULT_EXTENSIONS);
  const ignored = globMatcher([...DEFAULT_IGNORE, ...(config.ignore ?? [])]);
  const files: SourceFile[] = [];
  const seen = new Set<string>();
  const visit = (abs: string) => {
    const rel = toPosix(path.relative(root, abs));
    if (seen.has(rel) || ignored(rel)) return;
    const ext = path.extname(abs);
    if (!extensions.has(ext)) return;
    if (statSync(abs).size > MAX_FILE_BYTES) return;
    seen.add(rel);
    const text = readFileSync(abs, "utf8");
    files.push({ path: rel, absolutePath: abs, ext, text, code: stripBlockComments(text, LINE_COMMENT_EXTS.has(ext)) });
  };
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name));
      } else if (entry.isFile()) {
        visit(path.join(dir, entry.name));
      }
    }
  };
  for (const src of config.src ?? (config.packs?.includes("native") ? DEFAULT_NATIVE_SRC : DEFAULT_SRC)) {
    const abs = path.resolve(root, src);
    if (!existsSync(abs)) continue;
    if (statSync(abs).isDirectory()) walk(abs);
    else visit(abs);
  }
  // The app's local packages are the app's code too: every rule reads them.
  for (const pkg of localPackages(root)) walk(pkg.dir);
  return files;
}

/** 1-based line of a character offset. */
export function lineAt(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}
