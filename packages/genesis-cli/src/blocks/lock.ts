/**
 * `genesis.lock.json`: what Genesis wrote into the app, so a later `upgrade`
 * knows which files it may refresh. Each owned file keeps its source (a
 * package and a path in it) and the checksum of what was written: a file whose
 * checksum still matches was not edited, so a newer version may replace it;
 * one that differs is the app's, and is merged or left alone.
 *
 * Migrations aren't here: each copy carries its own header (see migrations.ts),
 * and they are never refreshed.
 */
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { replaceApp } from "./files.js";

export const LOCK_FILE = "genesis.lock.json";

export interface OwnedFile {
  /** `<package>:<package-relative path>`. */
  source: string;
  /** Checksum of the content written (after the app's substitutions). */
  sha256: string;
  /** The source package's version when written. */
  version?: string;
  /**
   * After a refresh the app has to resolve (a conflict, or --keep-mine): the
   * checksum of the version left in `<file>.genesis-next`. Once that file is
   * gone and the package still ships that version, it becomes the base.
   */
  pending?: string;
}

export interface GenesisLock {
  version: 1;
  /** The app's own values, substituted into templates it owns (`com.example.genesisstarter` → its bundle id). */
  substitutions?: Record<string, string>;
  /** Blocks added, by id. */
  blocks: Record<string, { package: string; version?: string }>;
  /** Files Genesis owns in the app, by app-relative path. */
  files: Record<string, OwnedFile>;
}

export function emptyLock(): GenesisLock {
  return { version: 1, blocks: {}, files: {} };
}

export function readLock(root: string): GenesisLock {
  const file = path.join(root, LOCK_FILE);
  if (!existsSync(file)) return emptyLock();
  const raw = JSON.parse(readFileSync(file, "utf8")) as Partial<GenesisLock>;
  if (raw.version !== 1) throw new Error(`${LOCK_FILE} has version ${String(raw.version)}; this CLI reads version 1.`);
  return { version: 1, ...(raw.substitutions ? { substitutions: raw.substitutions } : {}), blocks: raw.blocks ?? {}, files: raw.files ?? {} };
}

/** Keys sorted, so the file diffs cleanly. */
export function writeLock(root: string, lock: GenesisLock): void {
  const sorted = <T>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
  const out = { version: 1, ...(lock.substitutions ? { substitutions: lock.substitutions } : {}), blocks: sorted(lock.blocks), files: sorted(lock.files) };
  replaceApp(root, LOCK_FILE, `${JSON.stringify(out, null, 2)}\n`);
}

export function parseSource(source: string): { package: string; path: string } {
  const at = source.indexOf(":");
  if (at < 1) throw new Error(`${LOCK_FILE}: "${source}" is not <package>:<path>`);
  return { package: source.slice(0, at), path: source.slice(at + 1) };
}

/** Apply the app's substitutions to a template's text. */
export function substitute(text: string, substitutions: Record<string, string> | undefined): string {
  let out = text;
  // Longest first, so a value that contains another (an id and its .dev variant) is replaced whole.
  for (const [from, to] of Object.entries(substitutions ?? {}).sort(([a], [b]) => b.length - a.length)) if (from) out = out.split(from).join(to);
  return out;
}
