/**
 * Package migrations in an app, shared by `genesis add` and `genesis migrate`.
 *
 * A package migration is copied into `supabase/migrations/` as a new file,
 * `<timestamp>_<name>.sql`, with a two-line header naming the package, the
 * file and the checksum of the package's text:
 *
 *   -- genesis-migration: @marktiderman/genesis-supabase migrations/0004_genesis_tenant_features.sql sha256:…
 *   -- Copied by the Genesis CLI. Never edit it once applied: write a new migration instead.
 *
 * The rules: every file already in the folder counts as applied and is never
 * written again. A new copy's timestamp is after every existing migration's, so
 * it can't land between applied ones. A package migration is copied only when
 * nothing in the folder already holds it: not a copy with its header, not a
 * file with its name (a package that renumbered or moved it), not a file with
 * its text. A copy whose text no longer matches its header (edited in the app),
 * or whose package now ships a different text (changed upstream), is reported
 * and left alone; `--forward` writes one forward migration to carry the change
 * instead, and a later run counts that copy as handled. A copy the app
 * deleted (genesis.lock.json's `migrations` remembers where each one went) is
 * reported the same way and never copied again. Checksums and comparisons
 * ignore CRLF versus LF.
 */
import * as path from "node:path";
import { createApp, listApp, readApp, sha256 } from "./files.js";
import { MIGRATION_FILE, safeRelative, type ManifestMigration } from "./manifest.js";
import { migrationKey, type GenesisLock } from "./lock.js";

export const MIGRATIONS_DIR = "supabase/migrations";
export const TESTS_DIR = "supabase/tests/database";

const HEADER = /^-- genesis-migration: (\S+) (\S+) sha256:([0-9a-f]{64})\r?\n-- [^\n]*\n/;
const FORWARD = /^-- genesis-forward: (\S+) (\S+) sha256:([0-9a-f]{64}) copy-sha256:([0-9a-f]{64})\r?\n/;

/** Line endings don't make a migration different. */
const normal = (text: string) => text.replace(/\r\n/g, "\n");
export const textSha = (text: string) => sha256(normal(text));

export function migrationHeader(pkg: string, file: string, source: string): string {
  return `-- genesis-migration: ${pkg} ${file} sha256:${textSha(source)}\n-- Copied by the Genesis CLI. Never edit it once applied: write a new migration instead.\n`;
}

export interface AppMigration {
  path: string;
  name: string;
  /** Set when it carries a genesis-migration header. */
  tracked?: { package: string; file: string; sha256: string; body: string };
  /** Set when it is a forward migration this CLI wrote. */
  forward?: { package: string; file: string; sha256: string; copySha256: string };
  content: string;
}

/** `0004_genesis_tenant_features.sql` → `genesis_tenant_features`, or null when it isn't named that way. */
export function stemOrNull(file: string): string | null {
  return MIGRATION_FILE.exec(path.posix.basename(file))?.[2] ?? null;
}

export function stemOf(file: string): string {
  const stem = stemOrNull(file);
  if (!stem) throw new Error(`${file} is not named NNNN_name.sql`);
  return stem;
}

/** The app's migrations. A symlink among them is refused: the CLI can't tell what it holds or where it sorts. */
export function readAppMigrations(root: string, dir = MIGRATIONS_DIR): AppMigration[] {
  return listApp(root, dir, { symlinks: true })
    .filter((p) => p.endsWith(".sql"))
    .map((p) => {
      const content = readApp(root, p) ?? "";
      const name = path.posix.basename(p);
      const m = HEADER.exec(content);
      if (m) return { path: p, name, content, tracked: { package: m[1]!, file: m[2]!, sha256: m[3]!, body: content.slice(m[0].length) } };
      const f = FORWARD.exec(content);
      if (f) return { path: p, name, content, forward: { package: f[1]!, file: f[2]!, sha256: f[3]!, copySha256: f[4]! } };
      return { path: p, name, content };
    });
}

export type MigrationState =
  /** In the app, unchanged. */
  | "current"
  /** In the package, not in the app: copied as a new file. */
  | "new"
  /** The app's copy no longer matches the text it was copied with. Never rewritten. */
  | "edited"
  /** The package ships a different text than the copy was made from. Never rewritten. */
  | "changed-upstream"
  /** A file with the same name but other text: the app's own. Never rewritten. */
  | "differs"
  /** Copied once (genesis.lock.json remembers where), then deleted in the app. Never copied again. */
  | "deleted"
  /** The package's file can't be read (not installed, or removed). */
  | "unavailable";

export interface MigrationRow {
  block?: string;
  package: string;
  file: string;
  state: MigrationState;
  /** The app's copy, when there is one. */
  copy?: string;
  /** Where a new copy (or a forward migration) is written. */
  target?: string;
  /** The forward migration that carries an edited or changed copy, when one was written. */
  forward?: string;
  detail?: string;
}

/** Does this row still need a person? */
export function needsAttention(row: MigrationRow): boolean {
  // A deleted copy is reported, but deleting it was the app's choice: nothing is waiting on a person.
  return row.state !== "current" && row.state !== "new" && row.state !== "deleted" && !row.forward;
}

export interface SourceMigration extends ManifestMigration {
  block?: string;
  /** The package's text, or null when it can't be read. */
  source: string | null;
  testSource?: string | null;
}

/** `YYYYMMDDHHMMSS`, UTC. */
export function timestampOf(date: Date): string {
  return date.toISOString().replace(/\D/g, "").slice(0, 14);
}

/** The next 14-digit timestamp: a second later when it is a real date, else the next number. */
export function nextStamp(ts: string): string {
  const d = new Date(Date.UTC(+ts.slice(0, 4), +ts.slice(4, 6) - 1, +ts.slice(6, 8), +ts.slice(8, 10), +ts.slice(10, 12), +ts.slice(12, 14)));
  const real = !Number.isNaN(d.getTime()) && d.getUTCFullYear() >= 1000 && timestampOf(d) === ts;
  const next = real ? timestampOf(new Date(d.getTime() + 1000)) : (BigInt(ts) + 1n).toString().padStart(14, "0");
  if (next.length !== 14 || next <= ts) throw new Error(`No 14-digit timestamp follows ${ts}.`);
  return next;
}

/**
 * Timestamps for `count` new migrations: from now, but always after the latest
 * migration already in the folder (by name, which is the order Supabase applies them).
 */
export function nextTimestamps(existing: string[], now: Date, count: number): string[] {
  let latest = "";
  for (const name of existing) {
    const prefix = /^(\d+)_/.exec(name)?.[1];
    if (prefix && prefix.length === 14 && prefix > latest) latest = prefix;
  }
  let ts = timestampOf(now);
  if (latest && ts <= latest) ts = nextStamp(latest);
  // Anything else that sorts after (a longer prefix) must stay after: refuse rather than interleave.
  const after = existing.filter((n) => !/^\d{14}_/.test(n) && n > `${ts}_`);
  if (after.length) throw new Error(`${after.join(", ")} sort after a ${ts} timestamp; rename them to the <14-digit timestamp>_name.sql form first.`);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(ts);
    if (i < count - 1) ts = nextStamp(ts);
  }
  for (const t of out) if (latest && t <= latest) throw new Error(`A new migration's timestamp ${t} would sort before ${latest}; refusing.`);
  return out;
}

export interface MigrationPlan {
  rows: MigrationRow[];
  /** New files: migrations, their tests and forward migrations. Each is created, never overwritten. */
  creates: { path: string; content: string; kind: "migration" | "test" | "forward"; source?: { package: string; file: string } }[];
}

/**
 * Compare package migrations with the app's copies and plan what to create.
 * With `forward`, an edited or changed-upstream copy gets one forward
 * migration stub instead of a rewrite. A pgTAP test is copied only with its
 * migration, in the same run.
 */
export function planMigrations(
  root: string,
  sources: SourceMigration[],
  options: { now: Date; forward?: boolean; tests?: boolean; copied?: Readonly<Record<string, string>> } = { now: new Date() },
): MigrationPlan {
  const app = readAppMigrations(root);
  const rows: MigrationRow[] = [];
  const pending: { row: MigrationRow; src: SourceMigration; kind: "migration" | "forward"; copySha?: string }[] = [];
  const seen = new Set<string>();
  for (const src of sources) {
    const key = `${src.package} ${src.file}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const stem = stemOf(src.file);
    const base: MigrationRow = { ...(src.block ? { block: src.block } : {}), package: src.package, file: src.file, state: "current" };
    const sourceSha = src.source === null ? null : textSha(src.source);
    const sameName = (m: AppMigration) => m.name.replace(/^\d+_/, "") === `${stem}.sql`;
    const sameText = (m: AppMigration) => sourceSha !== null && textSha(m.tracked ? m.tracked.body : m.content) === sourceSha;
    // Everything in the folder that already holds this migration, by header, name or text.
    const copies = app.filter((m) => !m.forward && ((m.tracked && m.tracked.package === src.package && m.tracked.file === src.file) || sameName(m) || sameText(m)));
    if (copies.length > 1) {
      rows.push({ ...base, state: "differs", copy: copies[0]!.path, detail: `${copies.length} files hold it (${copies.map((m) => m.name).join(", ")}); left alone` });
      continue;
    }
    const copy = copies[0];
    if (src.source === null || sourceSha === null) {
      rows.push({ ...base, state: "unavailable", ...(copy ? { copy: copy.path } : {}), detail: `${src.package} isn't installed, or doesn't ship ${src.file}` });
      continue;
    }
    const copiedTo = options.copied?.[migrationKey(src.package, src.file)];
    if (!copy && copiedTo) {
      rows.push({ ...base, state: "deleted", copy: copiedTo, detail: "deleted in the app after it was copied; not copied again" });
      continue;
    }
    if (!copy) {
      const row: MigrationRow = { ...base, state: "new" };
      rows.push(row);
      pending.push({ row, src, kind: "migration" });
      continue;
    }
    const copyBody = copy.tracked ? copy.tracked.body : copy.content;
    const copySha = textSha(copyBody);
    const renamed = copy.tracked && (copy.tracked.package !== src.package || copy.tracked.file !== src.file) ? ` (its header names ${copy.tracked.package} ${copy.tracked.file}: renamed or moved upstream)` : "";
    let state: MigrationState;
    let detail: string;
    if (copy.tracked && copySha !== copy.tracked.sha256) {
      state = "edited";
      detail = "edited after it was copied; it is never rewritten";
    } else if (copySha === sourceSha) {
      state = "current";
      detail = copy.tracked ? renamed.trim() : "copied before headers; matches the package";
    } else if (copy.tracked) {
      state = "changed-upstream";
      detail = `${src.package} now ships a different ${path.posix.basename(src.file)}; the applied copy is never rewritten`;
    } else {
      state = "differs";
      detail = "has the package migration's name but other text and no header; treated as the app's own";
    }
    const row: MigrationRow = { ...base, state, copy: copy.path, ...(detail ? { detail: `${detail}${state === "current" ? "" : renamed}` } : {}) };
    if (state !== "current") {
      // A forward migration already written for this exact pair of texts carries it.
      const done = app.find((m) => m.forward && m.forward.package === src.package && m.forward.file === src.file && m.forward.sha256 === sourceSha && m.forward.copySha256 === copySha);
      if (done) row.forward = done.path;
      else if (options.forward) pending.push({ row, src, kind: "forward", copySha });
    }
    rows.push(row);
  }

  const creates: MigrationPlan["creates"] = [];
  const stamps = nextTimestamps(app.map((m) => m.name), options.now, pending.length);
  pending.forEach(({ row, src, kind, copySha }, i) => {
    const stem = stemOf(src.file);
    if (kind === "migration") {
      const target = `${MIGRATIONS_DIR}/${stamps[i]}_${stem}.sql`;
      row.target = target;
      creates.push({ path: target, content: migrationHeader(src.package, src.file, src.source!) + src.source!, kind, source: { package: src.package, file: src.file } });
      // Its test, only with it, and only when the app has no file there.
      if (options.tests !== false && src.test && src.testSource != null) {
        const test = `${TESTS_DIR}/${path.posix.basename(src.test).replace(/^\d{4}_/, "")}`;
        if (readApp(root, test) === null && !creates.some((c) => c.path === test)) creates.push({ path: test, content: src.testSource, kind: "test", source: { package: src.package, file: src.test } });
      }
      return;
    }
    const target = `${MIGRATIONS_DIR}/${stamps[i]}_${stem}_forward.sql`;
    row.target = target;
    row.forward = target;
    const why =
      row.state === "changed-upstream"
        ? `${src.package} now ships a different ${src.file} than ${row.copy} was copied from.`
        : `${row.copy} no longer matches ${src.package} ${src.file}.`;
    creates.push({
      path: target,
      kind,
      content: [
        `-- genesis-forward: ${src.package} ${src.file} sha256:${textSha(src.source!)} copy-sha256:${copySha}`,
        `-- Forward migration for ${src.package} ${src.file}, written by \`genesis migrate --forward\`.`,
        `-- ${why}`,
        `-- ${row.copy} is applied and is never rewritten: write the change as SQL here, review it, then apply it.`,
        "-- The package's current text follows, commented out, for reference.",
        "",
        ...normal(src.source!).split("\n").map((l) => (l ? `-- ${l}` : "--")),
        "",
      ].join("\n"),
    });
  });
  return { rows, creates };
}

/**
 * Remember in the lock where each package migration is: the copies the plan
 * found and the ones it creates. Returns whether the lock changed.
 */
export function rememberMigrationCopies(lock: GenesisLock, plan: MigrationPlan): boolean {
  const before = JSON.stringify(lock.migrations ?? {});
  const migrations = { ...lock.migrations };
  for (const row of plan.rows) {
    if (row.copy && (row.state === "current" || row.state === "edited" || row.state === "changed-upstream")) migrations[migrationKey(row.package, row.file)] = row.copy;
  }
  for (const c of plan.creates) if (c.kind === "migration" && c.source) migrations[migrationKey(c.source.package, c.source.file)] = c.path;
  if (JSON.stringify(migrations) === before) return false;
  lock.migrations = migrations;
  return true;
}

/** Write a plan's new files. Each must not exist: an existing file is never overwritten. */
export function applyMigrationPlan(root: string, plan: MigrationPlan): string[] {
  for (const file of plan.creates) createApp(root, file.path, file.content);
  return plan.creates.map((c) => c.path);
}

/** A header's package file, checked before it is read: a plain path to an NNNN_name.sql. */
export function validHeaderFile(file: string): boolean {
  return safeRelative(file) !== null && stemOrNull(file) !== null;
}

export function formatMigrationRows(rows: MigrationRow[]): string {
  if (!rows.length) return "No package migrations to compare.";
  const mark: Record<MigrationState, string> = { current: "=", new: "+", edited: "!", "changed-upstream": "!", differs: "!", deleted: "!", unavailable: "?" };
  return rows
    .map((r) => {
      const where = r.target ? ` → ${r.target}` : r.copy ? ` (${r.copy})` : "";
      const fwd = r.forward && !r.target ? `; carried by ${r.forward}` : "";
      return `${r.forward && !r.target ? "~" : mark[r.state]} ${r.state.padEnd(16)} ${r.package} ${r.file}${where}${r.detail ? `: ${r.detail}` : ""}${fwd}`;
    })
    .join("\n");
}
