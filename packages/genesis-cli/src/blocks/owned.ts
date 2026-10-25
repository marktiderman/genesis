/**
 * Files Genesis owns in an app (templates, Edge Functions, skills, pgTAP
 * tests): written once, recorded in genesis.lock.json, and refreshed by
 * `genesis upgrade` only while the app hasn't changed them.
 *
 * The refresh is a three-way decision on checksums: the lock's checksum is the
 * base, the file on disk is the app's, the package's current text is the new
 * one. Unchanged upstream: nothing to do. Unchanged in the app: take the new
 * text. Both changed: merge with `git merge-file` when the base text is known
 * (the version installed before the upgrade); a clean merge is written, a
 * conflicted one goes to `<file>.genesis-next` and the app's file is kept.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { createApp, readApp, replaceApp, sha256 } from "./files.js";
import { parseSource, type GenesisLock } from "./lock.js";
import { GENESIS_PACKAGE, safeRelative } from "./manifest.js";

export interface OwnedWrite {
  /** App-relative path. */
  path: string;
  /** `<package>:<path>`. */
  source: string;
  content: string;
  version?: string;
}

export type CopyOutcome = "created" | "same" | "kept";

/**
 * Copy an owned file in: create it when missing; when it already holds the same
 * text, adopt it into the lock; when it holds other text, leave it and report.
 */
export function copyOwned(root: string, lock: GenesisLock, write: OwnedWrite, dryRun = false): CopyOutcome {
  const existing = readApp(root, write.path);
  const record = () => {
    lock.files[write.path] = { source: write.source, sha256: sha256(write.content), ...(write.version ? { version: write.version } : {}) };
  };
  if (existing === null) {
    if (!dryRun) createApp(root, write.path, write.content);
    record();
    return "created";
  }
  if (existing === write.content) {
    record();
    return "same";
  }
  return "kept";
}

export type RefreshOutcome =
  | { path: string; outcome: "unchanged" | "updated" | "merged" | "conflict" | "kept-deleted" | "gone-upstream" | "kept-mine" | "refused" | "deferred" | "resolved"; detail?: string };

const CLI = "@marktiderman/genesis-cli";

/**
 * Why a genesis.lock.json entry can't be an owned file, or null. Each kind of
 * source writes only to its own place: a template to the app's template folders,
 * a function file to supabase/functions/<its name>/, a pgTAP test to
 * supabase/tests/database/, a skill to .claude/skills/. Never a migration, never
 * .git (appPath refuses that too). A lock is a file anyone with commit access can
 * edit, so it is checked like a manifest.
 */
export function ownedKeyProblem(key: string, source: string): string | null {
  let parsed: { package: string; path: string };
  try {
    parsed = parseSource(source);
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
  const { package: pkg, path: rel } = parsed;
  if (!GENESIS_PACKAGE.test(pkg)) return `${key}'s source ${pkg} isn't a Genesis package`;
  if (!safeRelative(rel) || !safeRelative(key)) return `${key} or its source isn't a plain path`;
  if (key.startsWith("supabase/migrations/")) return `${key} is a migration; migrations are never refreshed`;
  const base = rel.split("/").pop()!;
  if (pkg === CLI && rel.startsWith("templates/")) {
    return /^(eas\.json|\.eas\/[\w./-]+|\.maestro\/[\w./-]+|\.github\/workflows\/[\w.-]+\.ya?ml)$/.test(key) ? null : `${key} isn't where a template goes`;
  }
  const fn = /^functions\/([a-z0-9][a-z0-9_-]*)\/([A-Za-z0-9][A-Za-z0-9._-]*)$/.exec(rel);
  if (fn) return key === `supabase/functions/${fn[1]}/${fn[2]}` ? null : `${key} isn't where ${rel} goes`;
  if (/\.test\.sql$/.test(base)) return key === `supabase/tests/database/${base.replace(/^\d{4}_/, "")}` ? null : `${key} isn't where ${rel} goes`;
  if (/^\.claude\/skills\/[a-z0-9][a-z0-9_-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(key) && key.endsWith(`/${base}`)) return null;
  return `${key} doesn't match its source ${source}`;
}

/** Three-way merge with git, or null when git isn't there. */
export function mergeThreeWay(mine: string, base: string, theirs: string): { text: string; clean: boolean } | null {
  const dir = mkdtempSync(path.join(tmpdir(), "genesis-merge-"));
  try {
    const [m, b, t] = ["mine", "base", "theirs"].map((n) => path.join(dir, n));
    writeFileSync(m!, mine);
    writeFileSync(b!, base);
    writeFileSync(t!, theirs);
    try {
      execFileSync("git", ["merge-file", "-q", "-L", "yours", "-L", "base", "-L", "genesis", m!, b!, t!], { stdio: "ignore" });
      return { text: readFileSync(m!, "utf8"), clean: true };
    } catch (err) {
      const status = (err as { status?: number }).status;
      // git merge-file exits with the number of conflicts (1..127); anything else means it couldn't run.
      if (typeof status === "number" && status > 0 && status < 128) return { text: readFileSync(m!, "utf8"), clean: false };
      return null;
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export interface RefreshInput {
  path: string;
  /** The package's current text (substitutions applied), or null when it no longer ships it. */
  theirs: string | null;
  /** The text the lock's checksum was taken from, when it can still be read. */
  base: string | null;
  version?: string;
}

/**
 * Refresh one owned file. `keepMine` leaves every file the app changed as it
 * is (no merge), writing the new text beside it as `.genesis-next`.
 */
export function refreshOwned(root: string, lock: GenesisLock, input: RefreshInput, options: { dryRun?: boolean; keepMine?: boolean } = {}): RefreshOutcome {
  const entry = lock.files[input.path];
  if (!entry) throw new Error(`${input.path} isn't in genesis.lock.json`);
  const problem = ownedKeyProblem(input.path, entry.source);
  if (problem) return { path: input.path, outcome: "refused", detail: `genesis.lock.json: ${problem}; left alone` };
  const write = (rel: string, text: string) => {
    if (!options.dryRun) replaceApp(root, rel, text);
  };
  const mine = readApp(root, input.path);
  if (input.theirs === null) return { path: input.path, outcome: "gone-upstream", detail: "no longer shipped; left as it is" };
  const theirsSha = sha256(input.theirs);
  if (theirsSha === entry.sha256) return { path: input.path, outcome: "unchanged" };
  const record = (sha: string) => {
    const { pending: _settled, ...rest } = entry;
    lock.files[input.path] = { ...rest, sha256: sha, ...(input.version ? { version: input.version } : {}) };
  };
  if (mine === null) {
    return { path: input.path, outcome: "kept-deleted", detail: "deleted in the app; not brought back" };
  }
  const mineSha = sha256(mine);
  if (mineSha === entry.sha256 || mineSha === theirsSha) {
    write(input.path, input.theirs);
    record(theirsSha);
    return { path: input.path, outcome: "updated" };
  }
  // Both changed.
  const next = `${input.path}.genesis-next`;
  const existingNext = readApp(root, next);
  // Resolved since the last run: the .genesis-next it left is gone, and the package still ships
  // that version. The app's file is the resolution; that version becomes the base.
  if (entry.pending === theirsSha) {
    if (existingNext === null) {
      const { pending: _done, ...rest } = entry;
      lock.files[input.path] = { ...rest, sha256: theirsSha, ...(input.version ? { version: input.version } : {}) };
      return { path: input.path, outcome: "resolved", detail: "your file is kept as the resolution of the last upgrade" };
    }
    return { path: input.path, outcome: "kept-mine", detail: `waiting for you: resolve ${next} into your file, then delete it` };
  }
  // A .genesis-next someone may be working through is never replaced with different text.
  const writeNext = (text: string): string | null => {
    if (existingNext !== null && existingNext !== text) return `${next} is already there with other text; resolve it (and delete it) first`;
    write(next, text);
    lock.files[input.path] = { ...entry, pending: theirsSha };
    return null;
  };
  if (!options.keepMine && input.base !== null && sha256(input.base) === entry.sha256) {
    const merged = mergeThreeWay(mine, input.base, input.theirs);
    if (merged?.clean) {
      write(input.path, merged.text);
      // The new base is the package's text: the app's edits stay on top of it.
      record(theirsSha);
      return { path: input.path, outcome: "merged", detail: "your edits kept on top of the new version" };
    }
    if (merged) {
      const blocked = writeNext(merged.text);
      return { path: input.path, outcome: "conflict", detail: blocked ?? `merge conflicts written to ${next}; your file is unchanged` };
    }
  }
  const blocked = writeNext(input.theirs);
  return { path: input.path, outcome: "kept-mine", detail: blocked ?? `you changed it; the new version is in ${next}` };
}
