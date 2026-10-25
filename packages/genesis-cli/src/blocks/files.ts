/**
 * File access for the block commands: reads inside a package and writes inside
 * the app, each checked so a manifest (or a symlink) can't reach outside them.
 * Nothing here overwrites a file unless the caller says so by name.
 */
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { safeRelative } from "./manifest.js";

export const sha256 = (text: string | Buffer): string => createHash("sha256").update(text).digest("hex");

/** Is `child` (absolute) inside `parent` (absolute)? */
export function inside(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/**
 * A file in a package, by package-relative path, read only when it resolves
 * (symlinks followed) inside the package. Null when it doesn't exist.
 */
export function readPackageFile(packageDir: string, rel: string): string | null {
  const safe = safeRelative(rel);
  if (!safe) throw new Error(`"${rel}" is not a plain path inside the package`);
  const root = realpathSync(packageDir);
  const file = path.join(root, ...safe.split("/"));
  if (!existsSync(file)) return null;
  const real = realpathSync(file);
  if (!inside(root, real)) throw new Error(`${rel} in ${packageDir} points outside the package`);
  if (!statSync(real).isFile()) return null;
  return readFileSync(real, "utf8");
}

/** The files of a package folder (one level, regular files only), each checked like {@link readPackageFile}. */
export function readPackageDir(packageDir: string, rel: string): { name: string; content: string }[] | null {
  const safe = safeRelative(rel);
  if (!safe) throw new Error(`"${rel}" is not a plain path inside the package`);
  const root = realpathSync(packageDir);
  const dir = path.join(root, ...safe.split("/"));
  if (!existsSync(dir)) return null;
  const real = realpathSync(dir);
  if (!inside(root, real) || !statSync(real).isDirectory()) throw new Error(`${rel} in ${packageDir} is not a folder inside the package`);
  const out: { name: string; content: string }[] = [];
  for (const entry of readdirSync(real, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(entry.name)) continue;
    const content = readPackageFile(packageDir, `${safe}/${entry.name}`);
    if (content !== null && entry.isFile()) out.push({ name: entry.name, content });
  }
  return out;
}

/**
 * Where an app-relative path lands, refusing one that leaves the app: through
 * `..`, an absolute path, or a symlinked folder that points elsewhere.
 */
export function appPath(root: string, rel: string): string {
  const safe = safeRelative(rel.replace(/^\.\//, ""));
  // Leading dots are fine for app paths (.eas, .github), unlike `.` and `..` segments.
  if (!safe) throw new Error(`"${rel}" is not a plain path inside the app`);
  const realRoot = realpathSync(root);
  const target = path.join(realRoot, ...safe.split("/"));
  // The nearest existing ancestor must resolve inside the app.
  let probe = path.dirname(target);
  while (!existsSync(probe)) probe = path.dirname(probe);
  if (!inside(realRoot, realpathSync(probe))) throw new Error(`${rel} is outside the app (a symlinked folder?)`);
  if (existsSync(target) && lstatSync(target).isSymbolicLink()) throw new Error(`${rel} is a symlink; left alone`);
  return target;
}

export function readApp(root: string, rel: string): string | null {
  const file = appPath(root, rel);
  return existsSync(file) ? readFileSync(file, "utf8") : null;
}

/** Create a file that must not exist yet. Throws (EEXIST) rather than overwrite. */
export function createApp(root: string, rel: string, content: string): void {
  const file = appPath(root, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content, { encoding: "utf8", flag: "wx" });
}

/** Replace a file the caller has decided to replace (a lock-tracked file it wrote, or a generated block). */
export function replaceApp(root: string, rel: string, content: string): void {
  const file = appPath(root, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content, "utf8");
}

/** Every file under an app folder, app-relative, sorted. */
export function listApp(root: string, rel: string): string[] {
  const dir = path.join(root, rel);
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (r: string) => {
    for (const entry of readdirSync(path.join(root, r), { withFileTypes: true })) {
      const child = `${r}/${entry.name}`;
      if (entry.isDirectory()) walk(child);
      else if (entry.isFile()) out.push(child);
    }
  };
  walk(rel);
  return out.sort();
}
