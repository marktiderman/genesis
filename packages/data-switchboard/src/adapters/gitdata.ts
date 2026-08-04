// =====================================================================
// GitdataAdapter — Level L2 (Middle), ProviderKind "gitdata".
//
// Backs resources as markdown files under a data root (docs-as-data /
// GITDATA): folder = table, file = row. One adapter instance serves ANY
// number of tables — wire once, add a dir map per resource.
//
// Node / Deno filesystem only. Browser apps reach gitdata through a
// server route that calls this adapter (see dashboard api.gitdata).
// =====================================================================

import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, join, normalize, resolve, sep } from "node:path";

import type { Adapter } from "./adapter";
import { UnknownResourceError } from "./adapter";
import { introspectFields } from "../introspect";
import type { DataRow, DescribeResult, Level, ProviderKind, QueryOptions, ResourceContract } from "../types";
import { PROVIDER_LEVEL } from "../types";
import { gitdataMdContract, gitdataResourceName } from "../gitdata-names";

export { gitdataMdContract, gitdataResourceName };

/** How one resource maps onto a folder of markdown rows. */
export interface GitdataResourceMap {
  /** Directory under `dataRoot`, e.g. `"features"`. */
  readonly dir: string;
  /**
   * Filename template for creates. Default `"{id}--{slug}.md"`.
   * Updates keep the existing path unless `slug` changes (then rename).
   */
  readonly filename?: string;
}

export interface GitdataAdapterConfig {
  /** Absolute path to the gitdata root (the repo's `data/` folder). */
  readonly dataRoot: string;
  /**
   * resource-name → folder map. Resource names are app-facing
   * (e.g. `gitdata_features`); dirs are table folders under dataRoot.
   */
  readonly resources: Readonly<Record<string, GitdataResourceMap>>;
}

const PATH_KEY = "_path";
const TITLE_KEY = "title";
const BODY_KEY = "body";

// -- frontmatter helpers (YAML subset: scalars, null, string arrays) ----

function parseFmValue(raw: string): unknown {
  const v = (raw.split("#", 1)[0] ?? "").trim();
  if (v === "" || v === "null" || v === "~") return null;
  if (v === "true") return true;
  if (v === "false") return false;
  if (v === "[]") return [];
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    try {
      return JSON.parse(v.startsWith("'") ? `"${v.slice(1, -1).replace(/"/g, '\\"')}"` : v);
    } catch {
      return v.slice(1, -1);
    }
  }
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

function parseFrontmatter(text: string): { fm: Record<string, unknown>; body: string } {
  if (!text.startsWith("---")) return { fm: {}, body: text };
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m || m[1] === undefined || m[2] === undefined) return { fm: {}, body: text };
  const block = m[1];
  const body = m[2];
  const fm: Record<string, unknown> = {};
  const lines = block.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (!line.trim() || line.trim().startsWith("#")) {
      i += 1;
      continue;
    }
    const listItem = line.match(/^\s+-\s+(.*)$/);
    if (listItem) {
      i += 1;
      continue;
    }
    const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!kv || kv[1] === undefined || kv[2] === undefined) {
      i += 1;
      continue;
    }
    const key = kv[1];
    const rest = kv[2].split("#", 1)[0]?.trim() ?? "";
    // Folded / literal block scalars (`>` / `|`) — read indented continuation lines.
    if (rest === ">" || rest === "|") {
      const chunks: string[] = [];
      let j = i + 1;
      while (j < lines.length) {
        const raw = lines[j] ?? "";
        if (raw === "" || /^\s/.test(raw)) {
          chunks.push(raw.replace(/^\s{2}/, ""));
          j += 1;
          continue;
        }
        break;
      }
      const joined = chunks.join("\n").replace(/\n+$/, "");
      fm[key] = rest === ">" ? joined.replace(/\n/g, " ").trim() : joined;
      i = j;
      continue;
    }
    if (rest === "" || rest === "[]") {
      const items: unknown[] = [];
      let j = i + 1;
      while (j < lines.length) {
        const raw = lines[j] ?? "";
        const li = raw.match(/^\s+-\s+(.*)$/);
        if (!li || li[1] === undefined) break;
        items.push(parseFmValue(li[1]));
        j += 1;
      }
      fm[key] = items;
      i = j;
      continue;
    }
    fm[key] = parseFmValue(rest);
    i += 1;
  }
  return { fm, body };
}

function formatFmValue(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    if (value === "") return '""';
    if (/[:#\n\r]|^\s|\s$/.test(value) || value.includes('"')) {
      return JSON.stringify(value);
    }
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return ""; // block form handled by caller
  }
  return JSON.stringify(value);
}

function serializeFrontmatter(fm: Record<string, unknown>): string {
  const skip = new Set([PATH_KEY, TITLE_KEY, BODY_KEY, "job"]);
  const lines: string[] = [];
  for (const [key, value] of Object.entries(fm)) {
    if (skip.has(key)) continue;
    if (!/^[A-Za-z0-9_]+$/.test(key)) {
      throw new Error(`GitdataAdapter: invalid frontmatter key ${JSON.stringify(key)}`);
    }
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`);
      } else {
        lines.push(`${key}:`);
        for (const item of value) {
          lines.push(`  - ${formatFmValue(item)}`);
        }
      }
      continue;
    }
    lines.push(`${key}: ${formatFmValue(value)}`);
  }
  return lines.join("\n");
}

function extractTitleAndJob(body: string): { title: string; job: string; restBody: string } {
  let title = "";
  const titleMatch = body.match(/^#\s+(.+)\s*$/m);
  if (titleMatch?.[1]) title = titleMatch[1].trim();

  let job = "";
  // JS has no Perl `\Z`. Prefer an explicit next-heading cut; if "## The job" is the
  // final section, take through EOF.
  const jobStart = body.search(/^## The job\b/m);
  if (jobStart >= 0) {
    const afterNl = body.indexOf("\n", jobStart);
    if (afterNl >= 0) {
      const rest = body.slice(afterNl + 1);
      const nextHeading = rest.search(/^## /m);
      const section = nextHeading < 0 ? rest : rest.slice(0, nextHeading);
      job = section
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("("))
        .join(" ")
        .slice(0, 2000);
    }
  }
  return { title, job, restBody: body };
}

function applyTitleAndJob(body: string, title?: string, job?: string): string {
  let next = body;
  if (typeof title === "string" && title.length > 0) {
    if (/^#\s+.+/m.test(next)) {
      next = next.replace(/^#\s+.+$/m, `# ${title}`);
    } else {
      next = `# ${title}\n\n${next}`;
    }
  }
  if (typeof job === "string") {
    const section = `## The job\n${job.trim()}\n`;
    const jobStart = next.search(/^## The job\b/m);
    if (jobStart >= 0) {
      const afterNl = next.indexOf("\n", jobStart);
      const head = next.slice(0, jobStart);
      if (afterNl < 0) {
        next = `${head}${section}`;
      } else {
        const rest = next.slice(afterNl + 1);
        const nextHeading = rest.search(/^## /m);
        const tail = nextHeading < 0 ? "" : rest.slice(nextHeading);
        next = `${head}${section}\n${tail}`;
      }
    } else if (/^#\s+.+$/m.test(next)) {
      next = next.replace(/^(#\s+.+$)/m, `$1\n\n${section}`);
    } else {
      next = `${section}\n${next}`;
    }
  }
  return next;
}

/** Reject path separators / traversal in id or slug before joining under the table dir. */
function safePathToken(raw: string, label: string): string {
  if (!raw || raw.includes("\0")) {
    throw new Error(`GitdataAdapter: invalid ${label}`);
  }
  if (raw.includes("/") || raw.includes("\\") || raw.includes("..")) {
    throw new Error(`GitdataAdapter: ${label} must not contain path separators or ".."`);
  }
  if (raw !== basename(raw)) {
    throw new Error(`GitdataAdapter: invalid ${label}`);
  }
  return raw;
}

/** Resolve a filename under the table dir; throw if it escapes the directory. */
function resolveUnderDir(dirAbs: string, fileName: string): string {
  const abs = resolve(dirAbs, fileName);
  const root = resolve(dirAbs) + sep;
  if (abs !== resolve(dirAbs) && !abs.startsWith(root)) {
    throw new Error(`GitdataAdapter: path escapes table directory: ${fileName}`);
  }
  // Also reject odd normalize cases (e.g. nested dirs via template abuse)
  if (normalize(fileName).includes("..") || fileName.includes(sep) || fileName.includes("/")) {
    throw new Error(`GitdataAdapter: filename must be a single path segment: ${fileName}`);
  }
  return abs;
}

function rowFromFile(absPath: string, relPath: string): DataRow {
  const text = readFileSync(absPath, "utf8");
  const { fm, body } = parseFrontmatter(text);
  const { title, job } = extractTitleAndJob(body);
  return {
    ...fm,
    [TITLE_KEY]: title || (typeof fm.slug === "string" ? fm.slug : ""),
    job,
    [BODY_KEY]: body,
    [PATH_KEY]: relPath,
  };
}

function writeRow(absPath: string, row: DataRow): void {
  const fm: Record<string, unknown> = { ...row };
  const title = typeof fm[TITLE_KEY] === "string" ? (fm[TITLE_KEY] as string) : undefined;
  const job = typeof fm.job === "string" ? (fm.job as string) : undefined;
  let body = typeof fm[BODY_KEY] === "string" ? (fm[BODY_KEY] as string) : "";
  body = applyTitleAndJob(body || `# ${title ?? "Untitled"}\n`, title, job);
  const serialized = `---\n${serializeFrontmatter(fm)}\n---\n${body.startsWith("\n") ? body : `\n${body}`}`;
  writeFileSync(absPath, serialized.endsWith("\n") ? serialized : `${serialized}\n`, "utf8");
}

export class GitdataAdapter implements Adapter {
  readonly kind: ProviderKind = "gitdata";
  readonly level: Level = PROVIDER_LEVEL.gitdata;

  private readonly dataRoot: string;
  private readonly resources: Readonly<Record<string, GitdataResourceMap>>;

  constructor(opts: GitdataAdapterConfig) {
    this.dataRoot = opts.dataRoot;
    this.resources = opts.resources;
  }

  private mapFor(contract: ResourceContract): GitdataResourceMap {
    const map = this.resources[contract.name];
    if (!map) throw new UnknownResourceError(this.kind, contract.name);
    return map;
  }

  private dirAbs(map: GitdataResourceMap): string {
    return join(this.dataRoot, map.dir);
  }

  private listFiles(map: GitdataResourceMap): string[] {
    const dir = this.dirAbs(map);
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((n: string) => n.endsWith(".md") && !n.startsWith("_") && !n.startsWith("."))
      .map((n: string) => join(dir, n))
      .sort();
  }

  private relPath(abs: string): string {
    const prefix = this.dataRoot.endsWith("/") ? this.dataRoot : `${this.dataRoot}/`;
    return abs.startsWith(prefix) ? abs.slice(prefix.length) : abs;
  }

  async list(contract: ResourceContract): Promise<DataRow[]> {
    const map = this.mapFor(contract);
    return this.listFiles(map).map((abs) => rowFromFile(abs, this.relPath(abs)));
  }

  async get(contract: ResourceContract, key: string): Promise<DataRow | null> {
    const rows = await this.list(contract);
    return rows.find((r) => String(r[contract.key]) === key) ?? null;
  }

  async query(contract: ResourceContract, opts: QueryOptions): Promise<DataRow[]> {
    let out = await this.list(contract);
    if (opts.where) {
      const entries = Object.entries(opts.where);
      out = out.filter((r) => entries.every(([k, v]) => r[k] === v));
    }
    if (opts.whereIn) {
      const entries = Object.entries(opts.whereIn);
      out = out.filter((r) => entries.every(([k, values]) => values.includes(r[k])));
    }
    if (opts.orderBy) {
      const field = opts.orderBy;
      const dir = opts.direction === "desc" ? -1 : 1;
      out.sort((a, b) => {
        const av = a[field];
        const bv = b[field];
        if (av === bv) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return (av < bv ? -1 : 1) * dir;
      });
    }
    if (typeof opts.offset === "number") {
      if (typeof opts.limit !== "number") {
        throw new Error(
          `GitdataAdapter: offset requires limit on "${contract.name}" — an unbounded "skip N, take the rest" is not a supported QueryOptions shape.`,
        );
      }
      out = out.slice(opts.offset, opts.offset + opts.limit);
    } else if (typeof opts.limit === "number") {
      out = out.slice(0, opts.limit);
    }
    return out;
  }

  async describe(contract: ResourceContract, rows?: DataRow[]): Promise<DescribeResult> {
    const snapshot = rows ?? (await this.list(contract));
    return {
      resource: contract.name,
      provider: this.kind,
      level: this.level,
      fields: introspectFields(snapshot, contract),
    };
  }

  async create(contract: ResourceContract, row: DataRow): Promise<DataRow> {
    const map = this.mapFor(contract);
    const id = safePathToken(String(row[contract.key] ?? ""), contract.key);
    const slug = safePathToken(String(row.slug ?? id.toLowerCase()), "slug");
    if (!id) throw new Error(`GitdataAdapter: create requires ${contract.key}`);
    const template = map.filename ?? "{id}--{slug}.md";
    const fileName = template.replace("{id}", id).replace("{slug}", slug);
    const abs = resolveUnderDir(this.dirAbs(map), fileName);
    if (existsSync(abs)) {
      throw new Error(`GitdataAdapter: file already exists for ${id}: ${fileName}`);
    }
    const next = { ...row, [contract.key]: id, slug, [PATH_KEY]: this.relPath(abs) };
    writeRow(abs, next);
    return rowFromFile(abs, this.relPath(abs));
  }

  async update(contract: ResourceContract, key: string, patch: Partial<DataRow>): Promise<DataRow> {
    const existing = await this.get(contract, key);
    if (!existing) {
      throw new Error(`GitdataAdapter: no "${contract.name}" row with ${contract.key}="${key}".`);
    }
    const prevPath = String(existing[PATH_KEY] ?? "");
    const absOld = join(this.dataRoot, prevPath);
    const merged: DataRow = { ...existing, ...patch, [contract.key]: key };
    // Never let clients clobber path incorrectly before rename logic
    merged[PATH_KEY] = prevPath;

    const map = this.mapFor(contract);
    const safeKey = safePathToken(key, contract.key);
    const slugRaw = String(
      merged.slug ?? basename(prevPath).replace(/\.md$/, "").split("--").slice(1).join("--"),
    );
    const slug = safePathToken(slugRaw, "slug");
    const template = map.filename ?? "{id}--{slug}.md";
    const fileName = template.replace("{id}", safeKey).replace("{slug}", slug);
    const absNew = resolveUnderDir(this.dirAbs(map), fileName);

    if (absNew !== absOld && existsSync(absNew)) {
      throw new Error(
        `GitdataAdapter: refusing overwrite — target already exists for ${safeKey}: ${fileName}`,
      );
    }

    writeRow(absNew, { ...merged, [PATH_KEY]: this.relPath(absNew) });
    if (absNew !== absOld && existsSync(absOld)) {
      unlinkSync(absOld);
    }
    return rowFromFile(absNew, this.relPath(absNew));
  }

  async delete(contract: ResourceContract, key: string): Promise<void> {
    const existing = await this.get(contract, key);
    if (!existing) return;
    const abs = join(this.dataRoot, String(existing[PATH_KEY]));
    if (existsSync(abs)) unlinkSync(abs);
  }
}
