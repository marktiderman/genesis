/**
 * `lock-files`: genesis.lock.json against the files on disk.
 *
 * - **warn**: a file the lock owns is missing. `genesis upgrade` never brings a
 *   deleted owned file back ("deleted stays deleted"), so a lock that names
 *   files that aren't there (or never were) passes every upgrade silently.
 *   A file deleted on purpose carries `"deleted": true` in its lock entry,
 *   which ends the warning and changes nothing for upgrade.
 * - **info**: a locked file whose checksum differs from the lock's: an app
 *   edit, which upgrade three-way merges the next version into (or one waiting
 *   on its `.genesis-next`). And a locked block whose starter.config.ts switch
 *   is off: upgrade and migrate leave it out, and its files aren't checked.
 *   And, in an app whose database files live elsewhere (genesis.config.json
 *   `supabase`), files under supabase/ the lock still lists: upgrade leaves
 *   them alone, so they aren't checked and the entries can go.
 *
 * And bun.lock (at or above the app), with or without genesis.lock.json:
 *
 * - **warn**: a nested copy of a Genesis package (`<parent>/<name>` in `packages`) at another
 *   version than the root's, when the root's version satisfies the parent's range. Bun keeps it
 *   across installs, so the app runs two copies (a provider from one is invisible to hooks from the
 *   other). The fix is exact: delete that entry and reinstall (`genesis upgrade` does it).
 */
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { catalogBlocks, findBlock } from "../blocks/discover.js";
import type { BlockManifest } from "../blocks/manifest.js";
import { appPath, sha256 } from "../blocks/files.js";
import { LOCK_FILE, readLock, type GenesisLock } from "../blocks/lock.js";
import { localPackageNames } from "../blocks/local.js";
import { ownedKeyProblem } from "../blocks/owned.js";
import { appBlocksSwitchedOff, blockOfSource, STARTER_CONFIG } from "../blocks/starter-features.js";
import { databaseElsewhere, isSupabasePath } from "../blocks/database.js";
import { BUN_LOCK, readBunLock, staleNestedEntries } from "../blocks/bun-lock.js";
import { findLockfile } from "../blocks/pm.js";
import type { DoctorContext } from "./types.js";

/** bun.lock's stale nested Genesis copies (blocks/bun-lock.ts), each with the exact fix. */
function checkBunLock(ctx: DoctorContext): void {
  const found = findLockfile(ctx.root);
  if (found?.pm !== "bun") return;
  const text = readBunLock(found.dir);
  if (text === null) return;
  const file = path.relative(ctx.root, path.join(found.dir, BUN_LOCK)).split(path.sep).join("/");
  let stale;
  try {
    stale = staleNestedEntries(text);
  } catch {
    return; // a bun.lock this can't read: bun install reports it
  }
  for (const s of stale) {
    ctx.report({
      rule: "lock-files",
      level: "warn",
      file,
      subject: s.key,
      message:
        `keeps a nested copy of ${s.name}@${s.version} under ${s.parent} beside the root's ${s.root}, which satisfies its ${s.range}: Bun keeps it across installs, so the app runs two copies (a provider from one is invisible to hooks from the other). ` +
        `Delete the "${s.key}" entry from ${file}'s packages, then reinstall (bun install); genesis upgrade does both`,
    });
  }
}

export async function checkLockFiles(ctx: DoctorContext): Promise<void> {
  checkBunLock(ctx);
  if (!existsSync(path.join(ctx.root, LOCK_FILE))) return;
  let lock: GenesisLock;
  try {
    lock = readLock(ctx.root);
  } catch (err) {
    ctx.report({ rule: "lock-files", level: "warn", file: LOCK_FILE, message: `can't be read (${err instanceof Error ? err.message : String(err)}); genesis upgrade and migrate can't either` });
    return;
  }
  const catalog = catalogBlocks();
  const off = appBlocksSwitchedOff(ctx.root, catalog, Object.keys(lock.blocks));
  const offManifests: BlockManifest[] = [];
  for (const [id, entry] of Object.entries(lock.blocks)) {
    const feature = off.get(id);
    if (!feature) continue;
    try {
      offManifests.push((await findBlock(ctx.root, id, { package: entry.package })).manifest);
    } catch {
      offManifests.push(...catalog.filter((m) => m.id === id));
    }
    ctx.report({
      rule: "lock-files",
      level: "info",
      file: LOCK_FILE,
      subject: id,
      message: `lists the ${id} block, but features.${feature} is off in ${STARTER_CONFIG}: genesis upgrade and migrate leave it out (delete its entry if it's gone for good)`,
    });
  }
  const local = localPackageNames(ctx.root);
  let home: ReturnType<typeof databaseElsewhere> = null;
  try {
    home = databaseElsewhere(ctx.root);
  } catch {
    // An invalid genesis.config.json is the config's own error.
  }
  const elsewhere = home ? Object.keys(lock.files).filter(isSupabasePath) : [];
  if (home && elsewhere.length) {
    ctx.report({
      rule: "lock-files",
      level: "info",
      file: LOCK_FILE,
      subject: "supabase/",
      message: `lists ${elsewhere.length} file${elsewhere.length === 1 ? "" : "s"} under supabase/, but this app's database files live ${home.app ? `in ${home.app}` : "nowhere"} (genesis.config.json supabase): genesis upgrade leaves them alone, so delete those entries`,
    });
  }
  for (const [rel, entry] of Object.entries(lock.files)) {
    if (home && isSupabasePath(rel)) continue;
    // An entry upgrade refuses is reported by upgrade; its path may not even be a plain one.
    if (ownedKeyProblem(rel, entry.source, local)) continue;
    // A switched-off block's files: reported once, above, for the block.
    if (offManifests.length && blockOfSource(entry.source, offManifests)) continue;
    let file: string;
    try {
      file = appPath(ctx.root, rel);
    } catch {
      // A path that leaves the app (a symlink out): upgrade refuses it too.
      continue;
    }
    let text: string | null;
    try {
      text = existsSync(file) ? readFileSync(file, "utf8") : null;
    } catch (err) {
      // There but unreadable (a folder now, say): upgrade fails on it, so say so here.
      ctx.report({
        rule: "lock-files",
        level: "warn",
        file: rel,
        subject: rel,
        message: `is in ${LOCK_FILE} (from ${entry.source}) but can't be read (${err instanceof Error ? err.message : String(err)}), so genesis upgrade can't refresh it. Make it a file again, or remove its entry from ${LOCK_FILE}`,
      });
      continue;
    }
    if (text === null) {
      if (entry.deleted) continue;
      ctx.report({
        rule: "lock-files",
        level: "warn",
        file: rel,
        subject: rel,
        message: `is in ${LOCK_FILE} (from ${entry.source}) but not on disk, and genesis upgrade won't bring it back. Deleted on purpose: add "deleted": true to its entry in ${LOCK_FILE}. Otherwise restore it (git checkout, or copy it from ${entry.source})`,
      });
      continue;
    }
    if (entry.deleted) {
      ctx.report({ rule: "lock-files", level: "info", file: rel, subject: rel, message: `is marked "deleted": true in ${LOCK_FILE} but is on disk; remove the marker` });
    }
    if (sha256(text) === entry.sha256) continue;
    ctx.report({
      rule: "lock-files",
      level: "info",
      file: rel,
      subject: rel,
      message: entry.pending
        ? `differs from ${LOCK_FILE}: the last upgrade's version is waiting in ${rel}.genesis-next; resolve it into this file and delete it`
        : `differs from ${LOCK_FILE} (edited in the app); genesis upgrade three-way merges the next version into your edits`,
    });
  }
}
