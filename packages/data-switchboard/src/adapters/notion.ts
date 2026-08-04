// =====================================================================
// NotionAdapter — Level L2 (Middle), the second human-curation backing
// alongside Airtable (WC46.016).
//
// Notion databases are persistent, human-editable, and migration-free — the
// same L2 profile as Airtable, for resources a team curates as Notion pages
// rather than Airtable rows. The interface ALREADY accommodated a Notion
// provider (ProviderKind "notion", PROVIDER_LEVEL.notion = "L2"); this is the
// concrete adapter, hardened with the SAME patterns that survive a real
// integration:
//
//   • PROPERTY MAP, not raw shapes. Notion property values are deeply nested
//     (`title: [{ text: { content } }]`, `select: { name }`, …). The map names
//     each canonical field's Notion property + its property TYPE, and the
//     adapter encodes/decodes through that single seam — callers only ever see
//     flat canonical values.
//   • TTL CACHE. list/get/query share a short-lived per-resource cache so a
//     read burst is one query. 0 disables.
//   • CAPPED 429 RETRY. Notion rate-limits (~3 req/s); we retry with capped
//     exponential backoff, honoring Retry-After.
//   • STALE-WHILE-ERROR. A failed refresh degrades to last-known-good rows,
//     STAMPED stale (never laundered into authoritative data).
//   • INTROSPECTIVE describe() (WC46.015) — schema derived from live pages.
//
// `delete` ARCHIVES the page (`archived: true`) — Notion's non-destructive
// delete, reversible in the UI.
// =====================================================================

import type { Adapter } from "./adapter";
import { UnknownResourceError } from "./adapter";
import type { FetchLike } from "./airtable";
import { introspectFields } from "../introspect";
import { markStale, propagateStale } from "../staleness";
import type { DataRow, DescribeResult, Level, ProviderKind, QueryOptions, ResourceContract } from "../types";

/** The Notion property types this adapter encodes/decodes. */
export type NotionPropertyType =
  | "title"
  | "rich_text"
  | "number"
  | "checkbox"
  | "select"
  | "multi_select"
  | "date"
  | "url"
  | "email"
  | "phone_number";

/** Maps a canonical field to a Notion property + its type. */
export interface NotionPropertyMap {
  /** Notion property NAME (as it appears in the database). */
  readonly property: string;
  readonly type: NotionPropertyType;
}

/**
 * Per-resource Notion mapping: which database, and canonical-field → property.
 * `idField` names the canonical field that carries the Notion page id so it
 * survives round-trips and can serve as the resolver `key`. Defaults to "id".
 */
export interface NotionResourceMap {
  readonly database: string; // Notion database_id
  readonly fields: Readonly<Record<string, NotionPropertyMap>>;
  readonly idField?: string;
}

export interface NotionAdapterConfig {
  readonly apiKey: string;
  /** resource-name → database + property map. */
  readonly maps: Readonly<Record<string, NotionResourceMap>>;
  /** Cache TTL in ms. 0 disables. Default 5_000. */
  readonly ttlMs?: number;
  /** Max 429/5xx retries. Default 4. */
  readonly maxRetries?: number;
  /** Injected fetch (defaults to global). Tests pass a mock. */
  readonly fetch?: FetchLike;
  /** Injected sleep (tests pass a no-op to avoid real backoff waits). */
  readonly sleep?: (ms: number) => Promise<void>;
  /** Base URL override (default https://api.notion.com/v1). */
  readonly baseUrl?: string;
  /**
   * Notion API version header. Default `2022-06-28` — a DELIBERATE pin to the stable
   * legacy-database contract (`/databases/{id}/query`, `database_id`, `archived`). Notion's
   * versioned-API guarantee keeps that contract working under the pinned header. To opt into
   * the newer data-source contract (`/data_sources/{id}/query`, `in_trash`; version
   * `2026-03-11`+) a caller sets this — but the request shapes below are written for the
   * pinned legacy contract, so a version bump alone is NOT sufficient; the data-source
   * migration is tracked in SWITCHBOARD.md Follow-ups.
   */
  readonly notionVersion?: string;
  /**
   * Per-request timeout in ms. Default 30_000. Each HTTP attempt is aborted past this bound
   * and the timeout flows through the SAME capped-retry/stale path as a 429/5xx, so a stalled
   * Notion request can never hang `list/get/query/create/update/delete`. 0 disables.
   */
  readonly timeoutMs?: number;
}

interface CacheEntry {
  readonly rows: DataRow[];
  readonly expiresAt: number;
}

interface NotionPage {
  readonly id: string;
  readonly properties: Record<string, unknown>;
}

const DEFAULT_TTL_MS = 5_000;
const DEFAULT_MAX_RETRIES = 4;
const DEFAULT_BASE_URL = "https://api.notion.com/v1";
const DEFAULT_NOTION_VERSION = "2022-06-28";
const DEFAULT_TIMEOUT_MS = 30_000;

export class NotionAdapter implements Adapter {
  readonly kind: ProviderKind = "notion";
  readonly level: Level = "L2";

  private readonly cfg: Required<Omit<NotionAdapterConfig, "fetch" | "sleep" | "baseUrl" | "notionVersion">> & {
    fetch: FetchLike;
    sleep: (ms: number) => Promise<void>;
    baseUrl: string;
    notionVersion: string;
    timeoutMs: number;
  };

  private readonly cache = new Map<string, CacheEntry>();
  private readonly lastGood = new Map<string, DataRow[]>();

  constructor(config: NotionAdapterConfig) {
    const resolvedFetch = config.fetch ?? (globalThis.fetch as unknown as FetchLike | undefined);
    if (!resolvedFetch) {
      throw new Error("NotionAdapter: no fetch available — pass `fetch` in config (Node <18 / no global).");
    }
    this.cfg = {
      apiKey: config.apiKey,
      maps: config.maps,
      ttlMs: config.ttlMs ?? DEFAULT_TTL_MS,
      maxRetries: config.maxRetries ?? DEFAULT_MAX_RETRIES,
      fetch: resolvedFetch,
      sleep: config.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms))),
      baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
      notionVersion: config.notionVersion ?? DEFAULT_NOTION_VERSION,
      timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    };
  }

  private map(contract: ResourceContract): NotionResourceMap {
    const m = this.cfg.maps[contract.name];
    if (!m) throw new UnknownResourceError(this.kind, contract.name);
    return m;
  }

  // -- property <-> canonical value translation ------------------------
  private decodeProperty(type: NotionPropertyType, value: unknown): unknown {
    if (value == null) return undefined;
    const v = value as Record<string, unknown>;
    switch (type) {
      case "title":
      case "rich_text": {
        // Notion adds `plain_text` on READ; a freshly-written echo carries only
        // `text.content`. Read either so a create/update round-trip decodes.
        const parts = (v[type] as { plain_text?: string; text?: { content?: string } }[] | undefined) ?? [];
        return parts.map((p) => p.plain_text ?? p.text?.content ?? "").join("");
      }
      case "number":
        return (v.number as number | null) ?? undefined;
      case "checkbox":
        return Boolean(v.checkbox);
      case "select":
        return (v.select as { name?: string } | null)?.name ?? undefined;
      case "multi_select":
        return ((v.multi_select as { name?: string }[] | undefined) ?? []).map((o) => o.name ?? "");
      case "date":
        return (v.date as { start?: string } | null)?.start ?? undefined;
      case "url":
      case "email":
      case "phone_number":
        return (v[type] as string | null) ?? undefined;
      default:
        return undefined;
    }
  }

  private encodeProperty(type: NotionPropertyType, value: unknown): unknown {
    switch (type) {
      case "title":
        return { title: [{ text: { content: value == null ? "" : String(value) } }] };
      case "rich_text":
        return { rich_text: [{ text: { content: value == null ? "" : String(value) } }] };
      case "number":
        return { number: value == null ? null : Number(value) };
      case "checkbox":
        return { checkbox: Boolean(value) };
      case "select":
        return { select: value == null ? null : { name: String(value) } };
      case "multi_select":
        return {
          multi_select: (Array.isArray(value) ? value : value == null ? [] : [value]).map((n) => ({
            name: String(n),
          })),
        };
      case "date":
        return { date: value == null ? null : { start: String(value) } };
      case "url":
      case "email":
      case "phone_number":
        return { [type]: value == null ? null : String(value) };
      default:
        return undefined;
    }
  }

  private toCanonical(map: NotionResourceMap, page: NotionPage): DataRow {
    const out: DataRow = {};
    for (const [name, prop] of Object.entries(map.fields)) {
      const raw = page.properties[prop.property];
      const decoded = this.decodeProperty(prop.type, raw);
      if (decoded !== undefined) out[name] = decoded;
    }
    out[map.idField ?? "id"] = page.id; // page id survives round-trips.
    return out;
  }

  private toPropertiesPayload(map: NotionResourceMap, row: Partial<DataRow>): Record<string, unknown> {
    const properties: Record<string, unknown> = {};
    const idField = map.idField ?? "id";
    for (const [name, value] of Object.entries(row)) {
      if (name === idField) continue; // never write the page id as a property.
      const prop = map.fields[name];
      if (prop) properties[prop.property] = this.encodeProperty(prop.type, value);
    }
    return properties;
  }

  // -- hardened request core: capped 429/5xx retry w/ Retry-After ------
  private async request(path: string, init?: { method?: string; body?: unknown }): Promise<unknown> {
    const url = `${this.cfg.baseUrl}/${path}`;
    let attempt = 0;
    for (;;) {
      // Bound each attempt with a timeout: abort past `timeoutMs` so a stalled socket can't
      // hang the call forever. A timeout is treated like a retryable 5xx — same capped-retry
      // and stale-while-error path — so it never leaks a half-open request.
      const controller = this.cfg.timeoutMs > 0 ? new AbortController() : undefined;
      const timer =
        controller && this.cfg.timeoutMs > 0
          ? setTimeout(() => controller.abort(), this.cfg.timeoutMs)
          : undefined;
      let res: Awaited<ReturnType<FetchLike>>;
      try {
        res = await this.cfg.fetch(url, {
          method: init?.method ?? "GET",
          headers: {
            Authorization: `Bearer ${this.cfg.apiKey}`,
            "Content-Type": "application/json",
            "Notion-Version": this.cfg.notionVersion,
          },
          body: init?.body != null ? JSON.stringify(init.body) : undefined,
          signal: controller?.signal,
        });
      } catch (err) {
        // A timeout aborts the fetch → retry within the cap, else surface as a timeout error
        // through the caller's existing stale/error handling. Other fetch rejections (DNS/TLS)
        // propagate unchanged so behavior outside the timeout case is preserved.
        const timedOut = controller?.signal.aborted ?? false;
        if (timedOut && attempt < this.cfg.maxRetries) {
          attempt += 1;
          await this.cfg.sleep(Math.min(2 ** attempt * 250, 8_000));
          continue;
        }
        throw timedOut ? new Error(`Notion request timed out after ${this.cfg.timeoutMs}ms on ${path}`) : err;
      } finally {
        if (timer) clearTimeout(timer);
      }

      if (res.ok) return res.json();

      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && attempt < this.cfg.maxRetries) {
        const retryAfter = Number(res.headers.get("Retry-After"));
        const backoff =
          Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : Math.min(2 ** attempt * 250, 8_000);
        attempt += 1;
        await this.cfg.sleep(backoff);
        continue;
      }

      const body = await res.text().catch(() => "");
      throw new Error(`Notion ${res.status} on ${path}${body ? `: ${body.slice(0, 300)}` : ""}`);
    }
  }

  private async fetchAllPages(contract: ResourceContract, map: NotionResourceMap): Promise<DataRow[]> {
    const rows: DataRow[] = [];
    let cursor: string | undefined;
    do {
      const body: { start_cursor?: string; page_size: number } = { page_size: 100 };
      if (cursor) body.start_cursor = cursor;
      const json = (await this.request(`databases/${map.database}/query`, {
        method: "POST",
        body,
      })) as { results?: NotionPage[]; next_cursor?: string | null; has_more?: boolean };
      for (const page of json.results ?? []) rows.push(this.toCanonical(map, page));
      cursor = json.has_more ? (json.next_cursor ?? undefined) : undefined;
    } while (cursor);
    return rows;
  }

  // -- list with TTL cache + stale-while-error -------------------------
  private async listFresh(contract: ResourceContract): Promise<DataRow[]> {
    const map = this.map(contract);
    const now = Date.now();
    const cached = this.cache.get(contract.name);
    if (cached && cached.expiresAt > now) return cached.rows;

    try {
      const rows = await this.fetchAllPages(contract, map);
      if (this.cfg.ttlMs > 0) {
        this.cache.set(contract.name, { rows, expiresAt: now + this.cfg.ttlMs });
      }
      this.lastGood.set(contract.name, rows);
      return rows;
    } catch (err) {
      // Stale-while-error — degrade to last-known-good, but NEVER silently: log
      // with a correlation id and STAMP the rows stale so reconcile/promote
      // refuse to treat them as authoritative.
      const stale = this.lastGood.get(contract.name);
      if (stale) {
        const errorId = `swb-stale-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        const message = err instanceof Error ? err.message : String(err);
        // eslint-disable-next-line no-console -- degraded-read observability is required, not optional.
        console.error(
          `[data-switchboard] Notion refresh FAILED for resource "${contract.name}" ` +
            `(errorId=${errorId}); serving ${stale.length} STALE last-known-good row(s). ` +
            `Reads are flagged degraded; driftReport/promote will refuse to treat them as authoritative. Cause: ${message}`,
          err,
        );
        return markStale(
          stale.map((r) => ({ ...r })),
          { errorId, resource: contract.name, message, at: Date.now() },
        );
      }
      throw err;
    }
  }

  async list(contract: ResourceContract): Promise<DataRow[]> {
    const rows = await this.listFresh(contract);
    return propagateStale(
      rows,
      rows.map((r) => ({ ...r })),
    );
  }

  async get(contract: ResourceContract, key: string): Promise<DataRow | null> {
    const rows = await this.listFresh(contract);
    const hit = rows.find((r) => String(r[contract.key]) === key);
    return hit ? { ...hit } : null;
  }

  async query(contract: ResourceContract, opts: QueryOptions): Promise<DataRow[]> {
    // Filter client-side off the cached snapshot — keeps the hardened cache /
    // stale path as the single network seam (mirrors the AirtableAdapter).
    const source = await this.listFresh(contract);
    let out = source.map((r) => ({ ...r }));
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
          `NotionAdapter: offset requires limit on "${contract.name}" — an unbounded "skip N, take the rest" is not a supported QueryOptions shape.`,
        );
      }
      out = out.slice(opts.offset, opts.offset + opts.limit);
    } else if (typeof opts.limit === "number") {
      out = out.slice(0, opts.limit);
    }
    return propagateStale(source, out);
  }

  async describe(contract: ResourceContract, rows?: DataRow[]): Promise<DescribeResult> {
    // INTROSPECT the live pages (WC46.015) — schema from the canonical fields
    // that actually appear, not a static echo. The property map is the
    // translation seam; unmapped Notion properties stay invisible by design. A
    // caller may pass its already-fetched snapshot to share one read.
    const snapshot = rows ?? (await this.listFresh(contract));
    return {
      resource: contract.name,
      provider: this.kind,
      level: this.level,
      fields: introspectFields(snapshot, contract),
    };
  }

  private invalidate(resource: string): void {
    this.cache.delete(resource);
  }

  async create(contract: ResourceContract, row: DataRow): Promise<DataRow> {
    const map = this.map(contract);
    const json = (await this.request("pages", {
      method: "POST",
      body: {
        parent: { database_id: map.database },
        properties: this.toPropertiesPayload(map, row),
      },
    })) as NotionPage;
    this.invalidate(contract.name);
    return this.toCanonical(map, json);
  }

  async update(contract: ResourceContract, key: string, patch: Partial<DataRow>): Promise<DataRow> {
    const map = this.map(contract);
    const pageId = await this.resolvePageId(contract, map, key);
    const json = (await this.request(`pages/${pageId}`, {
      method: "PATCH",
      body: { properties: this.toPropertiesPayload(map, patch) },
    })) as NotionPage;
    this.invalidate(contract.name);
    return this.toCanonical(map, json);
  }

  async delete(contract: ResourceContract, key: string): Promise<void> {
    const map = this.map(contract);
    const pageId = await this.resolvePageId(contract, map, key);
    // Notion has no hard delete — ARCHIVE the page (reversible in the UI).
    await this.request(`pages/${pageId}`, { method: "PATCH", body: { archived: true } });
    this.invalidate(contract.name);
  }

  /** Map a canonical `key` value back to its Notion page id. */
  private async resolvePageId(contract: ResourceContract, map: NotionResourceMap, key: string): Promise<string> {
    const idField = map.idField ?? "id";
    if (contract.key === idField) return key; // identity IS the page id.
    const rows = await this.listFresh(contract);
    const hit = rows.find((r) => String(r[contract.key]) === key);
    const id = hit?.[idField];
    if (typeof id !== "string") {
      throw new Error(`NotionAdapter: cannot resolve page id for "${contract.name}" ${contract.key}="${key}".`);
    }
    return id;
  }
}
