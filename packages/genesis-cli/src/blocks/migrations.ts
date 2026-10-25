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
 * it can't land between applied ones. A copy whose text no longer matches its
 * header (edited in the app), or whose package now ships a different text
 * (changed upstream), is reported and left alone; `--forward` writes a new
 * migration to carry the change instead. Copies made before headers existed
 * (`<timestamp>_<name>.sql` with the package's exact text) count as current.
 */
import * as path from "node:path";
import { createApp, listApp, readApp, sha256 } from "./files.js";
import { MIGRATION_FILE, type ManifestMigration } from "./manifest.js";

export const MIGRATIONS_DIR = "supabase/migrations";
export const TESTS_DIR = "supabase/tests/database";

const HEADER = /^-- genesis-migration: (\S+) (\S+) sha256:([0-9a-f]{64})\r?\n-- [^\n]*\n/;

export function migrationHeader(pkg: string, file: string, source: string): string {
  return `-- genesis-migration: ${pkg} ${file} sha256:${sha256(source)}\n-- Copied by the Genesis CLI. Never edit it once applied: write a new migration instead.\n`;
}

export interface AppMigration {
  path: string;
  name: string;
  /** Set when it carries a genesis-migration header. */
  tracked?: { package: string; file: string; sha256: string; body: string };
  content: string;
}

/** `0004_genesis_tenant_features.sql` → `genesis_tenant_features`. */
export function stemOf(file: string): string {
  const m = MIGRATION_FILE.exec(path.posix.basename(file));
  if (!m) throw new Error(`${file} is not named NNNN_name.sql`);
  return m[2]!;
}

export function readAppMigrations(root: string, dir = MIGRATIONS_DIR): AppMigration[] {
  return listApp(root, dir)
    .filter((p) => p.endsWith(".sql"))
    .map((p) => {
      const content = readApp(root, p) ?? "";
      const m = HEADER.exec(content);
      const name = path.posix.basename(p);
      return m ? { path: p, name, content, tracked: { package: m[1]!, file: m[2]!, sha256: m[3]!, body: content.slice(m[0].length) } } : { path: p, name, content };
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
  /** A file with the same name but other text and no header: the app's own. Never rewritten. */
  | "differs"
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
  detail?: string;
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

function addSecond(ts: string): string {
  const d = new Date(Date.UTC(+ts.slice(0, 4), +ts.slice(4, 6) - 1, +ts.slice(6, 8), +ts.slice(8, 10), +ts.slice(10, 12), +ts.slice(12, 14) + 1));
  return timestampOf(d);
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
  if (latest && ts <= latest) ts = addSecond(latest);
  // Anything else that sorts after (a longer prefix) must stay after: refuse rather than interleave.
  const after = existing.filter((n) => !/^\d{14}_/.test(n) && n > `${ts}_`);
  if (after.length) throw new Error(`${after.join(", ")} sort after a ${ts} timestamp; rename them to the <14-digit timestamp>_name.sql form first.`);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(ts);
    ts = addSecond(ts);
  }
  return out;
}

export interface MigrationPlan {
  rows: MigrationRow[];
  /** New files: migrations, their tests and forward migrations. Each is created, never overwritten. */
  creates: { path: string; content: string; kind: "migration" | "test" | "forward"; source?: { package: string; file: string } }[];
}

/**
 * Compare package migrations with the app's copies and plan what to create.
 * With `forward`, an edited or changed-upstream copy gets a new forward
 * migration stub instead of a rewrite.
 */
export function planMigrations(root: string, sources: SourceMigration[], options: { now: Date; forward?: boolean; tests?: boolean } = { now: new Date() }): MigrationPlan {
  const app = readAppMigrations(root);
  const rows: MigrationRow[] = [];
  const pending: { row: MigrationRow; src: SourceMigration; kind: "migration" | "forward" }[] = [];
  const seen = new Set<string>();
  for (const src of sources) {
    const key = `${src.package} ${src.file}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const stem = stemOf(src.file);
    const base: MigrationRow = { ...(src.block ? { block: src.block } : {}), package: src.package, file: src.file, state: "current" };
    const tracked = app.filter((m) => m.tracked?.package === src.package && m.tracked.file === src.file);
    const legacy = app.filter((m) => !m.tracked && m.name.replace(/^\d+_/, "") === `${stem}.sql`);
    const copy = tracked[0] ?? legacy[0];
    if (tracked.length + legacy.length > 1) {
      rows.push({ ...base, state: "differs", copy: copy!.path, detail: `${tracked.length + legacy.length} copies (${[...tracked, ...legacy].map((m) => m.name).join(", ")}); left alone` });
      continue;
    }
    if (src.source === null) {
      rows.push({ ...base, state: "unavailable", ...(copy ? { copy: copy.path } : {}), detail: `${src.package} isn't installed, or doesn't ship ${src.file}` });
      continue;
    }
    if (!copy) {
      const row: MigrationRow = { ...base, state: "new" };
      rows.push(row);
      pending.push({ row, src, kind: "migration" });
      continue;
    }
    if (copy.tracked) {
      if (sha256(copy.tracked.body) !== copy.tracked.sha256) {
        const row: MigrationRow = { ...base, state: "edited", copy: copy.path, detail: "edited after it was copied; it is never rewritten" };
        rows.push(row);
        if (options.forward) pending.push({ row, src, kind: "forward" });
      } else if (sha256(src.source) !== copy.tracked.sha256) {
        const row: MigrationRow = { ...base, state: "changed-upstream", copy: copy.path, detail: `${src.package} now ships a different ${path.posix.basename(src.file)}; the applied copy is never rewritten` };
        rows.push(row);
        if (options.forward) pending.push({ row, src, kind: "forward" });
      } else rows.push({ ...base, copy: copy.path });
      continue;
    }
    if (copy.content === src.source) rows.push({ ...base, copy: copy.path, detail: "copied before headers; matches the package" });
    else {
      const row: MigrationRow = { ...base, state: "differs", copy: copy.path, detail: "has the package migration's name but other text and no header; treated as the app's own" };
      rows.push(row);
      if (options.forward) pending.push({ row, src, kind: "forward" });
    }
  }

  const creates: MigrationPlan["creates"] = [];
  const stamps = nextTimestamps(app.map((m) => m.name), options.now, pending.length);
  pending.forEach(({ row, src, kind }, i) => {
    const stem = stemOf(src.file);
    if (kind === "migration") {
      const target = `${MIGRATIONS_DIR}/${stamps[i]}_${stem}.sql`;
      row.target = target;
      creates.push({ path: target, content: migrationHeader(src.package, src.file, src.source!) + src.source!, kind, source: { package: src.package, file: src.file } });
      return;
    }
    const target = `${MIGRATIONS_DIR}/${stamps[i]}_${stem}_forward.sql`;
    row.target = target;
    const why =
      row.state === "changed-upstream"
        ? `${src.package} now ships a different ${src.file} than ${row.copy} was copied from.`
        : `${row.copy} no longer matches ${src.package} ${src.file}.`;
    creates.push({
      path: target,
      kind,
      content: [
        `-- Forward migration for ${src.package} ${src.file}, written by \`genesis migrate --forward\`.`,
        `-- ${why}`,
        `-- ${row.copy} is applied and is never rewritten: write the change as SQL here, review it, then apply it.`,
        "-- The package's current text follows, commented out, for reference.",
        "",
        ...src.source!.split("\n").map((l) => (l ? `-- ${l}` : "--")),
        "",
      ].join("\n"),
    });
  });

  if (options.tests !== false) {
    for (const src of sources) {
      if (!src.test || src.testSource == null) continue;
      const target = `${TESTS_DIR}/${path.posix.basename(src.test).replace(/^\d{4}_/, "")}`;
      if (readApp(root, target) !== null || creates.some((c) => c.path === target)) continue;
      creates.push({ path: target, content: src.testSource, kind: "test", source: { package: src.package, file: src.test } });
    }
  }
  return { rows, creates };
}

/** Write a plan's new files. Each must not exist: an existing file is never overwritten. */
export function applyMigrationPlan(root: string, plan: MigrationPlan): string[] {
  for (const file of plan.creates) createApp(root, file.path, file.content);
  return plan.creates.map((c) => c.path);
}

export function formatMigrationRows(rows: MigrationRow[]): string {
  if (!rows.length) return "No package migrations to compare.";
  const mark: Record<MigrationState, string> = { current: "=", new: "+", edited: "!", "changed-upstream": "!", differs: "!", unavailable: "?" };
  return rows
    .map((r) => {
      const where = r.target ? ` → ${r.target}` : r.copy ? ` (${r.copy})` : "";
      return `${mark[r.state]} ${r.state.padEnd(16)} ${r.package} ${r.file}${where}${r.detail ? `: ${r.detail}` : ""}`;
    })
    .join("\n");
}
