/**
 * The `supabase` pack: rules for `supabase/migrations`. Turned on with
 * `doctor.packs: ["supabase"]`.
 *
 * - migration-grants: blanket function grants, and private functions granted
 *   to anon/public, in new or changed migrations.
 * - migration-rls: a table in an exposed schema that no migration enables RLS on.
 * - migration-definer-search-path: a security definer function without a pinned search_path.
 * - migration-edited: a migration that already exists on the base ref was changed.
 *
 * The SQL is read statement by statement with comments removed and string and
 * dollar-quoted bodies blanked, so text inside a function body never matches.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { DoctorConfigError } from "./config.js";
import type { DoctorContext } from "./types.js";

export const DEFAULT_MIGRATIONS = "supabase/migrations";
export const DEFAULT_BASE = "origin/main";
const DEFAULT_EXPOSED = ["public"];

export interface SqlStatement {
  /** The statement, lowercased, comments removed, literals blanked, whitespace collapsed. */
  sql: string;
  /** 1-based line where it starts. */
  line: number;
}

/** Split SQL into statements, dropping comments and blanking quoted literals and dollar-quoted bodies. */
export function sqlStatements(text: string): SqlStatement[] {
  const out: SqlStatement[] = [];
  let buf = "";
  let line = 1;
  let start = 0;
  const flush = () => {
    const sql = buf.replace(/\s+/g, " ").trim().toLowerCase();
    if (sql) out.push({ sql, line: start });
    buf = "";
    start = 0;
  };
  const put = (s: string) => {
    if (!start && /\S/.test(s)) start = line;
    buf += s;
  };
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    const two = text.slice(i, i + 2);
    if (ch === "\n") {
      buf += " ";
      line++;
      i++;
    } else if (two === "--") {
      while (i < text.length && text[i] !== "\n") i++;
    } else if (two === "/*") {
      let depth = 0;
      while (i < text.length) {
        if (text.startsWith("/*", i)) {
          depth++;
          i += 2;
        } else if (text.startsWith("*/", i)) {
          depth--;
          i += 2;
          if (depth === 0) break;
        } else {
          if (text[i] === "\n") line++;
          i++;
        }
      }
      buf += " ";
    } else if (ch === "'") {
      put("'");
      i++;
      while (i < text.length) {
        if (text[i] === "'" && text[i + 1] === "'") i += 2;
        else if (text[i] === "'") break;
        else {
          if (text[i] === "\n") line++;
          i++;
        }
      }
      put("'");
      i++;
    } else if (ch === '"') {
      // Quoted identifiers keep their name, minus the quotes.
      i++;
      while (i < text.length && text[i] !== '"') put(text[i++]);
      i++;
    } else if (ch === "$" && /^\$(?:[A-Za-z_]\w*)?\$/.test(text.slice(i))) {
      const tag = /^\$(?:[A-Za-z_]\w*)?\$/.exec(text.slice(i))![0];
      const end = text.indexOf(tag, i + tag.length);
      const stop = end === -1 ? text.length : end + tag.length;
      for (let k = i; k < stop; k++) if (text[k] === "\n") line++;
      put(`${tag} ${tag}`);
      i = stop;
    } else if (ch === ";") {
      flush();
      i++;
    } else {
      put(ch);
      i++;
    }
  }
  flush();
  return out;
}

/** `schema.name`, unquoted and lowercased, defaulting the schema to public. */
function qualify(name: string): string {
  const n = name.replace(/"/g, "").trim().toLowerCase();
  return n.includes(".") ? n : `public.${n}`;
}

interface Migration {
  /** Path relative to the app root, POSIX. */
  file: string;
  statements: SqlStatement[];
}

/** What git says about the migrations folder against the base ref. */
interface GitView {
  /** Paths (app-relative) that are new or changed since the merge base, including untracked files. */
  touched: Set<string>;
  /** Migrations that existed at the merge base and were modified, deleted or renamed. */
  edited: Array<{ file: string; status: "modified" | "deleted" | "renamed" }>;
}

function git(root: string, args: string[]): string | null {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  return r.status === 0 ? r.stdout : null;
}

/** null when the app isn't in a git repo; a string when it is but can't be compared (the reason). */
function gitView(root: string, dir: string, base: string): GitView | string | null {
  if (git(root, ["rev-parse", "--is-inside-work-tree"])?.trim() !== "true") return null;
  if (git(root, ["rev-parse", "--verify", "--quiet", `${base}^{commit}`]) === null) return `the git ref ${base} isn't available (fetch it, or set doctor.supabase.base)`;
  const mergeBase = git(root, ["merge-base", "HEAD", base])?.trim();
  if (!mergeBase) return `HEAD has no merge base with ${base}`;
  const diff = git(root, ["diff", "--relative", "--name-status", "-M", mergeBase, "--", dir]);
  const untracked = git(root, ["ls-files", "--others", "--exclude-standard", "--", dir]);
  if (diff === null || untracked === null) return `git diff against ${base} failed`;
  const touched = new Set<string>(untracked.split("\n").filter(Boolean));
  const edited: GitView["edited"] = [];
  for (const row of diff.split("\n").filter(Boolean)) {
    const [status, a, b] = row.split("\t");
    if (status.startsWith("A")) touched.add(a);
    else if (status.startsWith("M") || status.startsWith("T")) {
      touched.add(a);
      edited.push({ file: a, status: "modified" });
    } else if (status.startsWith("D")) edited.push({ file: a, status: "deleted" });
    else if (status.startsWith("R")) {
      touched.add(b);
      edited.push({ file: a, status: "renamed" });
    }
  }
  return { touched, edited };
}

export function checkSupabasePack(ctx: DoctorContext): void {
  const dir = (ctx.config.supabase?.migrations ?? DEFAULT_MIGRATIONS).replace(/\/+$/, "");
  const abs = path.join(ctx.root, dir);
  if (!existsSync(abs)) throw new DoctorConfigError(`the supabase pack reads ${dir}, which doesn't exist; set doctor.supabase.migrations`);
  const migrations: Migration[] = readdirSync(abs)
    .filter((n) => n.endsWith(".sql"))
    .sort()
    .map((n) => ({ file: `${dir}/${n}`, statements: sqlStatements(readFileSync(path.join(abs, n), "utf8")) }));

  const base = ctx.config.supabase?.base ?? DEFAULT_BASE;
  const view = gitView(ctx.root, dir, base);
  if (typeof view === "string") {
    ctx.report({ rule: "migration-edited", level: "warn", file: dir, message: `can't check for edited migrations: ${view}` });
  } else if (view) {
    for (const e of view.edited) {
      ctx.report({
        rule: "migration-edited",
        file: e.file,
        subject: e.file,
        message: `${e.status === "modified" ? "edits" : e.status === "deleted" ? "deletes" : "renames"} a migration that already exists on ${base}, so it has been applied; put the change in a new migration instead`,
      });
    }
  }
  // Without git (or a base to compare to), every migration counts as new.
  const isNew = (file: string) => (view && typeof view !== "string" ? view.touched.has(file) : true);

  checkGrants(ctx, migrations.filter((m) => isNew(m.file)));
  checkRls(ctx, migrations, new Set(ctx.config.supabase?.exposedSchemas ?? DEFAULT_EXPOSED));
  checkDefinerSearchPath(ctx, migrations);
}

/** `migration-grants`: grant and revoke function privileges by name. */
function checkGrants(ctx: DoctorContext, migrations: Migration[]): void {
  const fix = "grant by name (grant execute on function schema.fn(args) to role) so an earlier revoke survives";
  for (const { file, statements } of migrations) {
    for (const { sql, line } of statements) {
      if (/^grant\b.*\bon all (?:functions|routines|procedures) in schema\b/.test(sql)) {
        ctx.report({ rule: "migration-grants", file, line, subject: "on all functions", message: `grants on all functions in a schema, which re-grants functions an earlier migration revoked; ${fix}` });
        continue;
      }
      if (/^alter default privileges\b.*\bgrant\b.*\bon (?:functions|routines)\b/.test(sql)) {
        ctx.report({ rule: "migration-grants", file, line, subject: "alter default privileges", message: `grants default privileges on functions, so every future function is callable; ${fix}` });
        continue;
      }
      const g = /^grant\b.*?\bon (?:function|procedure|routine)s? (.+?) to (.+)$/.exec(sql);
      if (!g) continue;
      const grantees = g[2].split(/\s*,\s*|\s+with\s+/).map((s) => s.trim());
      if (!grantees.some((r) => r === "anon" || r === "public")) continue;
      for (const name of g[1].match(/(?:^|[\s,])(private\.[\w$]+)/g) ?? []) {
        const fn = name.replace(/^[\s,]+/, "");
        ctx.report({
          rule: "migration-grants",
          file,
          line,
          subject: fn,
          message: `grants ${fn} to ${grantees.filter((r) => r === "anon" || r === "public").join(" and ")}; a private function is never callable by anon or public (grant it to authenticated, or expose a public wrapper)`,
        });
      }
    }
  }
}

/** `migration-rls`: every table created in an exposed schema has RLS enabled by some migration. */
function checkRls(ctx: DoctorContext, migrations: Migration[], exposed: Set<string>): void {
  const pending = new Map<string, { file: string; line: number }>();
  for (const { file, statements } of migrations) {
    for (const { sql, line } of statements) {
      const create = /^create (?:(?:global |local )?(?:temp|temporary) |unlogged )?table (?:if not exists )?([\w$."]+)/.exec(sql);
      if (create && !/^create (?:global |local )?(?:temp|temporary) /.test(sql)) {
        const name = qualify(create[1]);
        if (exposed.has(name.split(".")[0])) pending.set(name, { file, line });
        continue;
      }
      const enable = /^alter table (?:if exists )?(?:only )?([\w$."]+) .*\benable row level security\b/.exec(sql);
      if (enable) {
        pending.delete(qualify(enable[1]));
        continue;
      }
      const drop = /^drop table (?:if exists )?(.+?)(?: cascade| restrict)?$/.exec(sql);
      if (drop) for (const n of drop[1].split(",")) pending.delete(qualify(n));
    }
  }
  for (const [name, at] of pending) {
    ctx.report({
      rule: "migration-rls",
      file: at.file,
      line: at.line,
      subject: name,
      message: `creates ${name} without enabling row level security in any migration; add "alter table ${name} enable row level security;" and its policies`,
    });
  }
}

/** `migration-definer-search-path`: a security definer function pins its search_path. */
function checkDefinerSearchPath(ctx: DoctorContext, migrations: Migration[]): void {
  const pending = new Map<string, { file: string; line: number }>();
  for (const { file, statements } of migrations) {
    for (const { sql, line } of statements) {
      const create = /^create (?:or replace )?(?:function|procedure) ([\w$."]+)\s*\(/.exec(sql);
      if (create) {
        const name = qualify(create[1]);
        if (/\bsecurity definer\b/.test(sql) && !/\bset search_path\b/.test(sql)) pending.set(name, { file, line });
        else pending.delete(name);
        continue;
      }
      const alter = /^alter (?:function|procedure) ([\w$."]+)\s*(?:\(|\s).*\bset search_path\b/.exec(sql);
      if (alter) pending.delete(qualify(alter[1]));
      const drop = /^drop (?:function|procedure) (?:if exists )?([\w$."]+)/.exec(sql);
      if (drop) pending.delete(qualify(drop[1]));
    }
  }
  for (const [name, at] of pending) {
    ctx.report({
      rule: "migration-definer-search-path",
      file: at.file,
      line: at.line,
      subject: name,
      message: `${name} is security definer without "set search_path"; add set search_path = '' and schema-qualify the names in its body, so a caller's objects can't stand in for yours`,
    });
  }
}
