/**
 * The `supabase` pack: rules for `supabase/migrations`. Turned on with
 * `doctor.packs: ["supabase"]`.
 *
 * - migration-grants: blanket function grants and grants of unexposed
 *   functions or schemas to anon/public, in new or changed migrations.
 * - migration-rls: a table in an exposed schema whose row level security is off
 *   after every migration has run.
 * - migration-definer-search-path: a security definer function without a pinned search_path.
 * - migration-edited: a migration that already exists on the base ref was changed.
 *
 * The SQL is read statement by statement with comments removed and string and
 * dollar-quoted bodies blanked, so text inside a function body never matches
 * (dollar-quoted bodies are kept aside for the one rule that looks inside them).
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { DoctorConfigError } from "./config.js";
import type { DoctorContext, Level } from "./types.js";

export const DEFAULT_MIGRATIONS = "supabase/migrations";
export const DEFAULT_BASE = "origin/main";
const DEFAULT_EXPOSED = ["public"];

export interface SqlStatement {
  /** The statement, lowercased, comments removed, literals blanked, whitespace collapsed. */
  sql: string;
  /** 1-based line where it starts. */
  line: number;
  /** The lowercased text of each dollar-quoted body in the statement (`do $$ … $$`, function bodies). */
  bodies: string[];
}

/** Split SQL into statements, dropping comments and blanking quoted literals and dollar-quoted bodies. */
export function sqlStatements(text: string): SqlStatement[] {
  const out: SqlStatement[] = [];
  let buf = "";
  let bodies: string[] = [];
  let line = 1;
  let start = 0;
  const flush = () => {
    const sql = buf.replace(/\s+/g, " ").trim().toLowerCase();
    if (sql) out.push({ sql, line: start, bodies });
    buf = "";
    bodies = [];
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
      // E'…' strings take backslash escapes; standard strings only double the quote.
      const escapes = /[eE]/.test(text[i - 1] ?? "") && !/[\w$]/.test(text[i - 2] ?? "");
      put("'");
      i++;
      while (i < text.length) {
        if (escapes && text[i] === "\\") i += 2;
        else if (text[i] === "'" && text[i + 1] === "'") i += 2;
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
    } else if (ch === "$" && !/[\w$]/.test(text[i - 1] ?? "") && /^\$(?:[A-Za-z_]\w*)?\$/.test(text.slice(i))) {
      const tag = /^\$(?:[A-Za-z_]\w*)?\$/.exec(text.slice(i))![0];
      const end = text.indexOf(tag, i + tag.length);
      const stop = end === -1 ? text.length : end + tag.length;
      bodies.push(text.slice(i + tag.length, end === -1 ? text.length : end).toLowerCase());
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

/** `schema.name`, lowercased, defaulting the schema to public. */
function qualify(name: string): string {
  const n = name.trim().toLowerCase();
  return n.includes(".") ? n : `public.${n}`;
}

const schemaOf = (name: string) => name.split(".")[0];

/** The text inside the parentheses that open at `open` (balanced), and the index after the close. */
function parenthesized(sql: string, open: number): { inner: string; end: number } {
  let depth = 0;
  for (let k = open; k < sql.length; k++) {
    if (sql[k] === "(") depth++;
    else if (sql[k] === ")" && --depth === 0) return { inner: sql.slice(open + 1, k), end: k + 1 };
  }
  return { inner: sql.slice(open + 1), end: sql.length };
}

/** Remove every parenthesized group (argument lists, typmods). */
function stripParens(s: string): string {
  let out = "";
  let depth = 0;
  for (const c of s) {
    if (c === "(") depth++;
    else if (c === ")") depth = Math.max(0, depth - 1);
    else if (depth === 0) out += c;
  }
  return out;
}

/** Split on commas outside parentheses. */
function splitTop(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const c of s) {
    if (c === "(") depth++;
    if (c === ")") depth--;
    if (c === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += c;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}

const TYPE_ALIASES: Record<string, string> = {
  int: "integer",
  int4: "integer",
  int8: "bigint",
  int2: "smallint",
  bool: "boolean",
  varchar: "character varying",
  timestamptz: "timestamp with time zone",
  float8: "double precision",
};
const MULTIWORD_TYPE = /^(?:double precision|character varying|character|bit varying|timestamp|time|interval)\b/;

/** A function's identity: its argument types (names, defaults, OUT args and typmods dropped). */
export function argTypes(args: string): string[] {
  const types: string[] = [];
  for (const raw of splitTop(args)) {
    let tokens = stripParens(raw.replace(/\s+(?:default\b|=).*$/, "")).trim().split(/\s+/).filter(Boolean);
    const mode = tokens[0];
    if (mode === "out") continue;
    if (mode === "in" || mode === "inout" || mode === "variadic") tokens = tokens.slice(1);
    const joined = tokens.join(" ");
    const type = tokens.length > 1 && !MULTIWORD_TYPE.test(joined) ? tokens.slice(1).join(" ") : joined;
    types.push(TYPE_ALIASES[type] ?? type);
  }
  return types;
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

/** A GitView, or the reason git can't compare (null reason: not a git repo). */
function gitView(root: string, dir: string, base: string): GitView | { reason: string; repo: boolean } {
  if (git(root, ["rev-parse", "--is-inside-work-tree"])?.trim() !== "true") return { reason: "not a git repository", repo: false };
  if (git(root, ["rev-parse", "--verify", "--quiet", `${base}^{commit}`]) === null) {
    return { reason: `the git ref ${base} isn't available (fetch it, or set doctor.supabase.base)`, repo: true };
  }
  const mergeBase = git(root, ["merge-base", "HEAD", base])?.trim();
  if (!mergeBase) return { reason: `HEAD has no merge base with ${base} (a shallow clone? fetch with depth 0)`, repo: true };
  const diff = git(root, ["diff", "--relative", "--name-status", "-M", mergeBase, "--", dir]);
  const untracked = git(root, ["ls-files", "--others", "--exclude-standard", "--", dir]);
  if (diff === null || untracked === null) return { reason: `git diff against ${base} failed`, repo: true };
  const sql = (p: string | undefined) => p !== undefined && p.endsWith(".sql");
  const touched = new Set<string>(untracked.split("\n").filter(sql));
  const edited: GitView["edited"] = [];
  for (const row of diff.split("\n").filter(Boolean)) {
    const [status, a, b] = row.split("\t");
    if (status.startsWith("R")) {
      if (sql(b)) touched.add(b);
      if (sql(a)) edited.push({ file: a, status: "renamed" });
      continue;
    }
    if (!sql(a)) continue;
    if (status.startsWith("A")) touched.add(a);
    else if (status.startsWith("M") || status.startsWith("T")) {
      touched.add(a);
      edited.push({ file: a, status: "modified" });
    } else if (status.startsWith("D")) edited.push({ file: a, status: "deleted" });
  }
  return { touched, edited };
}

export function checkSupabasePack(ctx: DoctorContext): void {
  const settings = ctx.config.supabase ?? {};
  const dir = settings.migrations ?? DEFAULT_MIGRATIONS;
  const abs = path.join(ctx.root, dir);
  if (!existsSync(abs)) throw new DoctorConfigError(`the supabase pack reads ${dir}, which doesn't exist; set doctor.supabase.migrations`);
  const migrations: Migration[] = readdirSync(abs)
    .filter((n) => n.endsWith(".sql"))
    .sort()
    .map((n) => ({ file: `${dir}/${n}`, statements: sqlStatements(readFileSync(path.join(abs, n), "utf8")) }));
  const exposed = new Set((settings.exposedSchemas ?? DEFAULT_EXPOSED).map((s) => s.toLowerCase()));

  const base = settings.base ?? DEFAULT_BASE;
  const view = gitView(ctx.root, dir, base);
  if ("reason" in view) {
    if (view.repo) ctx.report({ rule: "migration-edited", level: "warn", file: dir, message: `can't check for edited migrations: ${view.reason}` });
  } else {
    for (const e of view.edited) {
      ctx.report({
        rule: "migration-edited",
        file: e.file,
        subject: e.file,
        message: `${e.status === "modified" ? "edits" : e.status === "deleted" ? "deletes" : "renames"} a migration that already exists on ${base}, so it has been applied; put the change in a new migration instead`,
      });
    }
  }

  // Which migrations are new: changed since the base (when git can tell) and not before `since`.
  const since = settings.since;
  const afterSince = (file: string) => since === undefined || path.posix.basename(file) >= since;
  if ("reason" in view && since === undefined) {
    ctx.report({
      rule: "migration-grants",
      level: "warn",
      file: dir,
      message: `skipped: can't tell new migrations from applied ones (${view.reason}); fetch the base ref (CI: fetch-depth 0) or set doctor.supabase.since`,
    });
  } else {
    const isNew = (file: string) => afterSince(file) && ("reason" in view || view.touched.has(file));
    checkGrants(ctx, migrations.filter((m) => isNew(m.file)), exposed);
  }
  checkRls(ctx, migrations, exposed);
  checkViewInvoker(ctx, migrations, exposed);
  checkDefinerSearchPath(ctx, migrations);
  checkTestingKit(ctx, migrations);
}

/**
 * genesis-supabase's pgTAP kit (`genesis_testing`) belongs in supabase/tests only: it signs in as
 * anyone and resets roles, which a migration must never ship to production.
 */
function checkTestingKit(ctx: DoctorContext, migrations: Migration[]): void {
  for (const { file, statements } of migrations) {
    const hit = statements.find(({ sql }) => /\bgenesis_testing\b/.test(sql));
    if (!hit) continue;
    ctx.report({
      rule: "migration-testing-kit",
      file,
      line: hit.line,
      subject: "genesis_testing",
      message: "a migration uses genesis_testing, the pgTAP kit for test databases only; move it to supabase/tests/database/000_genesis_testing.test.sql",
    });
  }
}

/** Grantee list of a grant: `to a, b [with grant option] [granted by x]`. */
function granteesOf(s: string): string[] {
  return s
    .replace(/\s+granted by .*$/, "")
    .replace(/\s+with grant option$/, "")
    .split(/\s*,\s*/)
    .map((r) => r.replace(/^group\s+/, "").trim())
    .filter(Boolean);
}

/** `migration-grants`: grant function privileges by name, and never expose an unexposed schema to anon/public. */
function checkGrants(ctx: DoctorContext, migrations: Migration[], exposed: Set<string>): void {
  const fix = "grant by name (grant execute on function schema.fn(args) to role) so an earlier revoke survives";
  const open = (roles: string[]) => roles.filter((r) => r === "anon" || r === "public");
  /** error for anon/public, warn for authenticated, nothing for other roles (service_role, postgres, …). */
  const blanket = (roles: string[]): { level: Level; who: string } | null => {
    const o = open(roles);
    if (o.length) return { level: "error", who: o.join(" and ") };
    if (roles.includes("authenticated")) return { level: "warn", who: "authenticated" };
    return null;
  };
  for (const { file, statements } of migrations) {
    for (const { sql, line } of statements) {
      const all = /^grant\b.*\bon all (?:functions|routines|procedures) in schema .+? to (.+)$/.exec(sql);
      if (all) {
        const hit = blanket(granteesOf(all[1]));
        if (hit) {
          ctx.report({ rule: "migration-grants", level: hit.level, file, line, subject: "on all functions", message: `grants every function in a schema to ${hit.who}, which re-grants functions an earlier migration revoked; ${fix}` });
        }
        continue;
      }
      const defaults = /^alter default privileges\b.*?\bgrant\b.*\bon (?:functions|routines) to (.+)$/.exec(sql);
      if (defaults) {
        const hit = blanket(granteesOf(defaults[1]));
        if (hit) {
          ctx.report({ rule: "migration-grants", level: hit.level, file, line, subject: "alter default privileges", message: `grants default privileges on functions to ${hit.who}, so every future function is callable by them; ${fix}` });
        }
        continue;
      }
      const fn = /^grant\b.*?\bon (?:function|procedure|routine)s? (.+?) to (.+)$/.exec(sql);
      if (fn) {
        const roles = open(granteesOf(fn[2]));
        if (!roles.length) continue;
        for (const name of splitTop(fn[1]).map((n) => qualify(stripParens(n)))) {
          if (exposed.has(schemaOf(name))) continue;
          ctx.report({
            rule: "migration-grants",
            file,
            line,
            subject: name,
            message: `grants ${name} to ${roles.join(" and ")}; a function outside the exposed schemas is never callable by anon or public (grant it to authenticated, or expose a wrapper)`,
          });
        }
        continue;
      }
      const schema = /^grant\b.*?\bon schema (.+?) to (.+)$/.exec(sql);
      if (schema) {
        const roles = open(granteesOf(schema[2]));
        if (!roles.length) continue;
        for (const s of schema[1].split(/\s*,\s*/).map((x) => x.trim())) {
          if (exposed.has(s)) continue;
          ctx.report({
            rule: "migration-grants",
            file,
            line,
            subject: `schema ${s}`,
            message: `grants schema ${s} to ${roles.join(" and ")}; a schema outside the exposed ones stays closed to anon and public`,
          });
        }
      }
    }
  }
}

/** `migration-rls`: after every migration, each table in an exposed schema has row level security on. */
function checkRls(ctx: DoctorContext, migrations: Migration[], exposed: Set<string>): void {
  const tables = new Map<string, { rls: boolean; file: string; line: number; disabled: boolean }>();
  const name = String.raw`([\w$.]+)`;
  const target = String.raw`^alter table (?:if exists )?(?:only )?${name}`;
  for (const { file, statements } of migrations) {
    for (const { sql, line, bodies } of statements) {
      // RLS turned on by dynamic SQL (a do-block loop over tables) can't be traced: trust it for every table so far.
      if (bodies.some((b) => /\benable row level security\b/.test(b))) for (const t of tables.values()) t.rls = true;
      const create = new RegExp(String.raw`^create (?:(?:global |local )?(?:temp|temporary) |unlogged )?table (?:if not exists )?${name}`).exec(sql);
      if (create) {
        if (!/^create (?:global |local )?(?:temp|temporary) /.test(sql)) tables.set(qualify(create[1]), { rls: false, file, line, disabled: false });
        continue;
      }
      const rename = new RegExp(`${target} rename to ([\\w$]+)$`).exec(sql);
      const move = new RegExp(`${target} set schema ([\\w$]+)$`).exec(sql);
      if (rename || move) {
        const from = qualify((rename ?? move)![1]);
        const to = rename ? `${schemaOf(from)}.${rename[2]}` : `${move![2]}.${from.split(".")[1]}`;
        const state = tables.get(from);
        if (state) {
          tables.delete(from);
          tables.set(to, state);
        }
        continue;
      }
      const alter = new RegExp(target).exec(sql);
      if (alter && /\b(?:enable|disable) row level security\b/.test(sql)) {
        const t = qualify(alter[1]);
        if (/\bdisable row level security\b/.test(sql)) tables.set(t, { rls: false, file, line, disabled: true });
        else {
          const state = tables.get(t);
          if (state) state.rls = true;
        }
        continue;
      }
      const drop = /^drop table (?:if exists )?(.+?)(?: cascade| restrict)?$/.exec(sql);
      if (drop) for (const n of drop[1].split(",")) tables.delete(qualify(n));
    }
  }
  for (const [t, at] of tables) {
    if (at.rls || !exposed.has(schemaOf(t))) continue;
    ctx.report({
      rule: "migration-rls",
      file: at.file,
      line: at.line,
      subject: t,
      message: at.disabled
        ? `disables row level security on ${t}, and no later migration turns it back on; anyone with the API key can read and write it`
        : `creates ${t} without enabling row level security in any migration; add "alter table ${t} enable row level security;" and its policies`,
    });
  }
}

/**
 * `migration-view-rls`: a view in an exposed schema runs as the signed-in user
 * (`security_invoker = true`) once every migration has run. A plain view runs as
 * its owner, so it reads past row-level security on every table it selects from.
 * `create or replace view` without the option turns it off again.
 */
function checkViewInvoker(ctx: DoctorContext, migrations: Migration[], exposed: Set<string>): void {
  const views = new Map<string, { invoker: boolean; file: string; line: number }>();
  const name = String.raw`([\w$.]+)`;
  const invokerOn = /\bsecurity_invoker\s*(?:=\s*(?:true|on|yes|1|'true'|'on'))?\s*(?:,|\))/;
  for (const { file, statements } of migrations) {
    for (const { sql, line } of statements) {
      const create = new RegExp(String.raw`^create (?:or replace )?(?:temp |temporary )?(?:recursive )?view ${name}`).exec(sql);
      if (create) {
        if (/^create (?:or replace )?(?:temp|temporary) /.test(sql)) continue;
        const options = /^[^(]*?\bwith\s*(\([^)]*\))\s*as\b/.exec(sql)?.[1] ?? "";
        views.set(qualify(create[1]), { invoker: invokerOn.test(options), file, line });
        continue;
      }
      const alter = new RegExp(String.raw`^alter view (?:if exists )?${name} (set|reset) (\([^)]*\))`).exec(sql);
      if (alter && /\bsecurity_invoker\b/.test(alter[3])) {
        const state = views.get(qualify(alter[1]));
        if (state) state.invoker = alter[2] === "set" && invokerOn.test(alter[3]);
        continue;
      }
      const rename = new RegExp(String.raw`^alter view (?:if exists )?${name} rename to ([\w$]+)$`).exec(sql);
      if (rename) {
        const from = qualify(rename[1]);
        const state = views.get(from);
        if (state) {
          views.delete(from);
          views.set(`${schemaOf(from)}.${rename[2]}`, state);
        }
        continue;
      }
      const drop = /^drop view (?:if exists )?(.+?)(?: cascade| restrict)?$/.exec(sql);
      if (drop) for (const n of drop[1].split(",")) views.delete(qualify(n));
    }
  }
  for (const [v, at] of views) {
    if (at.invoker || !exposed.has(schemaOf(v))) continue;
    ctx.report({
      rule: "migration-view-rls",
      file: at.file,
      line: at.line,
      subject: v,
      message: `${v} runs as its owner, so it reads past row level security; create it "with (security_invoker = true)" or add "alter view ${v} set (security_invoker = true);"`,
    });
  }
}

/** `migration-definer-search-path`: a security definer function pins its search_path. Functions are keyed by name and argument types. */
function checkDefinerSearchPath(ctx: DoctorContext, migrations: Migration[]): void {
  const fns = new Map<string, { definer: boolean; searchPath: boolean; file: string; line: number }>();
  /** Keys a statement names: one overload with an argument list, every overload without one. */
  const keysFor = (sql: string, nameEnd: number, fnName: string): string[] => {
    const rest = sql.slice(nameEnd).trimStart();
    if (rest.startsWith("(")) {
      const { inner } = parenthesized(rest, 0);
      return [`${fnName}(${argTypes(inner).join(",")})`];
    }
    return [...fns.keys()].filter((k) => k.startsWith(`${fnName}(`));
  };
  for (const { file, statements } of migrations) {
    for (const { sql, line } of statements) {
      const create = /^create (?:or replace )?(?:function|procedure) ([\w$.]+)\s*/.exec(sql);
      if (create) {
        const [key] = keysFor(sql, create[0].length, qualify(create[1]));
        fns.set(key, { definer: /\bsecurity definer\b/.test(sql), searchPath: /\bset search_path\b/.test(sql), file, line });
        continue;
      }
      const alter = /^alter (?:function|procedure|routine) ([\w$.]+)\s*/.exec(sql);
      if (alter) {
        const fnName = qualify(alter[1]);
        const keys = keysFor(sql, alter[0].length, fnName);
        const rename = / rename to ([\w$]+)$/.exec(sql);
        const move = / set schema ([\w$]+)$/.exec(sql);
        for (const key of keys) {
          const state = fns.get(key);
          if (rename || move) {
            if (!state) continue;
            fns.delete(key);
            const newName = rename ? `${schemaOf(fnName)}.${rename[1]}` : `${move![1]}.${fnName.split(".")[1]}`;
            fns.set(newName + key.slice(fnName.length), state);
            continue;
          }
          // A function created outside the migrations: only what this alter says is known.
          const next = state ?? { definer: false, searchPath: false, file, line };
          if (/\bsecurity definer\b/.test(sql)) Object.assign(next, { definer: true, file, line });
          if (/\bsecurity invoker\b/.test(sql)) next.definer = false;
          if (/\bset search_path\b/.test(sql)) next.searchPath = true;
          if (/\breset (?:search_path|all)\b/.test(sql)) Object.assign(next, { searchPath: false, file, line });
          fns.set(key, next);
        }
        continue;
      }
      const drop = /^drop (?:function|procedure|routine) (?:if exists )?(.+?)(?: cascade| restrict)?$/.exec(sql);
      if (drop) {
        for (const part of splitTop(drop[1])) {
          const m = /^([\w$.]+)\s*/.exec(part);
          if (m) for (const key of keysFor(part, m[0].length, qualify(m[1]))) fns.delete(key);
        }
      }
    }
  }
  for (const [key, at] of fns) {
    if (!at.definer || at.searchPath) continue;
    ctx.report({
      rule: "migration-definer-search-path",
      file: at.file,
      line: at.line,
      subject: key,
      message: `${key} is security definer without "set search_path"; add set search_path = '' and schema-qualify the names in its body, so a caller's objects can't stand in for yours`,
    });
  }
}
