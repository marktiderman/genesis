// =====================================================================
// AirtableAdapter — Level L2 (Middle).
//
// Persistent, human-editable, NO migration governance. This is the layer a
// non-engineer curates in the Airtable UI while the app keeps reading a
// stable canonical shape. Hardened with the patterns that survive a real
// Airtable integration:
//
//   • FIELD IDs, not names. We map canonical field-name → Airtable fldXXX and
//     request `returnFieldsByFieldId=true`, so a human RENAMING a column in
//     the Airtable UI never breaks the app (IDs are immutable; names aren't).
//   • TTL CACHE. list/get/query share a short-lived per-resource cache so a
//     burst of reads is one network call. Tunable; 0 disables.
//   • CAPPED 429 RETRY. Airtable returns 429 at 5 req/s/base; we retry with
//     exponential backoff capped at `maxRetries`, honoring Retry-After.
//   • STALE-WHILE-ERROR. If a refresh fails but we hold a previous (even
//     expired) snapshot, we serve the stale rows rather than throw — the
//     middle layer degrades gracefully instead of taking the app down.
//
// Provider-agnostic in/out: callers see canonical field NAMES; the wire uses
// field IDs. The field map is the single translation seam.
// =====================================================================

import type { Adapter } from "./adapter";
import { UnknownResourceError } from "./adapter";
import { introspectFields } from "../introspect";
import { markStale, propagateStale } from "../staleness";
import type { DataRow, DescribeResult, Level, ProviderKind, QueryOptions, ResourceContract } from "../types";

/** Minimal `fetch` shape so this compiles on Node 18+, Deno, and RN. */
export type FetchLike = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    /** Abort signal — adapters bound each call with a request timeout via this. */
    signal?: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

/**
 * Per-resource Airtable mapping: which table, and canonical-field → fldXXX.
 * `idField` names the canonical field that carries the Airtable record id
 * (recXXX) so it survives round-trips and can serve as the resolver `key`.
 */
export interface AirtableResourceMap {
  readonly table: string; // tblXXX
  /** canonical field name → Airtable field id (fldXXX). */
  readonly fields: Readonly<Record<string, string>>;
  /**
   * Canonical field that receives the Airtable record id. Defaults to "id".
   * Set this to the resource's `key` when identity == Airtable record id.
   */
  readonly idField?: string;
}

export interface AirtableAdapterConfig {
  readonly apiKey: string;
  readonly baseId: string; // appXXX
  /** resource-name → table + field map. */
  readonly maps: Readonly<Record<string, AirtableResourceMap>>;
  /** Cache TTL in ms. 0 disables. Default 5_000. */
  readonly ttlMs?: number;
  /** Max 429/5xx retries. Default 4. */
  readonly maxRetries?: number;
  /** Injected fetch (defaults to global). Tests pass a mock. */
  readonly fetch?: FetchLike;
  /** Injected sleep (tests pass a no-op to avoid real backoff waits). */
  readonly sleep?: (ms: number) => Promise<void>;
  /** Base URL override (default https://api.airtable.com/v0). */
  readonly baseUrl?: string;
}

interface CacheEntry {
  readonly rows: DataRow[];
  readonly expiresAt: number;
}

const DEFAULT_TTL_MS = 5_000;
const DEFAULT_MAX_RETRIES = 4;
const DEFAULT_BASE_URL = "https://api.airtable.com/v0";

export class AirtableAdapter implements Adapter {
  readonly kind: ProviderKind = "airtable";
  readonly level: Level = "L2";

  private readonly cfg: Required<Omit<AirtableAdapterConfig, "fetch" | "sleep" | "baseUrl">> & {
    fetch: FetchLike;
    sleep: (ms: number) => Promise<void>;
    baseUrl: string;
  };

  private readonly cache = new Map<string, CacheEntry>();
  /** Last-known-good snapshot per resource for stale-while-error. */
  private readonly lastGood = new Map<string, DataRow[]>();

  constructor(config: AirtableAdapterConfig) {
    const resolvedFetch = config.fetch ?? (globalThis.fetch as unknown as FetchLike | undefined);
    if (!resolvedFetch) {
      throw new Error("AirtableAdapter: no fetch available — pass `fetch` in config (Node <18 / no global).");
    }
    this.cfg = {
      apiKey: config.apiKey,
      baseId: config.baseId,
      maps: config.maps,
      ttlMs: config.ttlMs ?? DEFAULT_TTL_MS,
      maxRetries: config.maxRetries ?? DEFAULT_MAX_RETRIES,
      fetch: resolvedFetch,
      sleep: config.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms))),
      baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
    };
  }

  private map(contract: ResourceContract): AirtableResourceMap {
    const m = this.cfg.maps[contract.name];
    if (!m) throw new UnknownResourceError(this.kind, contract.name);
    return m;
  }

  // -- field id <-> canonical name translation --------------------------
  private toCanonical(map: AirtableResourceMap, record: { id: string; fields: Record<string, unknown> }): DataRow {
    const out: DataRow = {};
    const byId: Record<string, string> = {};
    for (const [name, fid] of Object.entries(map.fields)) byId[fid] = name;
    for (const [fid, value] of Object.entries(record.fields)) {
      const name = byId[fid];
      if (name) out[name] = value;
    }
    out[map.idField ?? "id"] = record.id; // recXXX survives round-trips.
    return out;
  }

  private toFieldIdPayload(map: AirtableResourceMap, row: Partial<DataRow>): Record<string, unknown> {
    const fields: Record<string, unknown> = {};
    const idField = map.idField ?? "id";
    for (const [name, value] of Object.entries(row)) {
      if (name === idField) continue; // never write the record id as a field.
      const fid = map.fields[name];
      if (fid) fields[fid] = value;
    }
    return fields;
  }

  // -- the hardened request core: capped 429/5xx retry w/ Retry-After ---
  private async request(path: string, init?: { method?: string; body?: unknown }): Promise<unknown> {
    const url = `${this.cfg.baseUrl}/${this.cfg.baseId}/${path}`;
    let attempt = 0;
    // Bounded retry loop: every path either returns (2xx) or throws (non-
    // retryable, or retries exhausted), so the loop always terminates.
    for (;;) {
      const res = await this.cfg.fetch(url, {
        method: init?.method ?? "GET",
        headers: {
          Authorization: `Bearer ${this.cfg.apiKey}`,
          "Content-Type": "application/json",
        },
        body: init?.body != null ? JSON.stringify(init.body) : undefined,
      });

      if (res.ok) return res.json();

      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && attempt < this.cfg.maxRetries) {
        const retryAfter = Number(res.headers.get("Retry-After"));
        const backoff =
          Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : Math.min(2 ** attempt * 250, 8_000); // capped exp backoff
        attempt += 1;
        await this.cfg.sleep(backoff);
        continue;
      }

      const body = await res.text().catch(() => "");
      throw new Error(`Airtable ${res.status} on ${path}${body ? `: ${body.slice(0, 300)}` : ""}`);
    }
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
        this.cache.set(contract.name, {
          rows,
          expiresAt: now + this.cfg.ttlMs,
        });
      }
      this.lastGood.set(contract.name, rows);
      return rows;
    } catch (err) {
      // Stale-while-error: degrade to last-known-good rather than fail hard —
      // but NEVER silently. The failure (revoked key, deleted table, exhausted
      // retries, network) is LOGGED with a correlation id + context, and the
      // served rows are STAMPED stale so reconcile/driftReport/promote refuse
      // to treat them as authoritative (CMT-1742-002, no-ducttape).
      const stale = this.lastGood.get(contract.name);
      if (stale) {
        const errorId = `swb-stale-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        const message = err instanceof Error ? err.message : String(err);
        // eslint-disable-next-line no-console -- degraded-read observability is required, not optional.
        console.error(
          `[data-switchboard] Airtable refresh FAILED for resource "${contract.name}" ` +
            `(errorId=${errorId}); serving ${stale.length} STALE last-known-good row(s). ` +
            `Reads are flagged degraded; driftReport/promote will refuse to treat them as authoritative. Cause: ${message}`,
          err,
        );
        // Return a fresh array (don't mutate the stored lastGood) stamped stale.
        return markStale(
          stale.map((r) => ({ ...r })),
          { errorId, resource: contract.name, message, at: Date.now() },
        );
      }
      throw err;
    }
  }

  private async fetchAllPages(contract: ResourceContract, map: AirtableResourceMap): Promise<DataRow[]> {
    const rows: DataRow[] = [];
    let offset: string | undefined;
    do {
      const params = new URLSearchParams();
      params.set("returnFieldsByFieldId", "true"); // rename-proof reads.
      params.set("pageSize", "100");
      if (offset) params.set("offset", offset);
      const json = (await this.request(`${map.table}?${params.toString()}`)) as {
        records?: { id: string; fields: Record<string, unknown> }[];
        offset?: string;
      };
      for (const rec of json.records ?? []) {
        rows.push(this.toCanonical(map, rec));
      }
      offset = json.offset;
    } while (offset);
    return rows;
  }

  async list(contract: ResourceContract): Promise<DataRow[]> {
    const rows = await this.listFresh(contract);
    // Re-stamp staleness onto the defensive clone (the array-level symbol does
    // not survive `.map(...)`), so a degraded read stays flagged downstream.
    return propagateStale(rows, rows.map((r) => ({ ...r })));
  }

  async get(contract: ResourceContract, key: string): Promise<DataRow | null> {
    const rows = await this.listFresh(contract);
    const hit = rows.find((r) => String(r[contract.key]) === key);
    return hit ? { ...hit } : null;
  }

  async query(contract: ResourceContract, opts: QueryOptions): Promise<DataRow[]> {
    // Filter client-side off the cached snapshot — keeps the hardened cache /
    // stale path as the single network seam and avoids per-query formula bugs.
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
        // Null/undefined sort LAST, stably — independent of `dir` (so a missing
        // orderBy value never lands ahead of real data on a desc sort).
        if (av == null) return 1;
        if (bv == null) return -1;
        return (av < bv ? -1 : 1) * dir;
      });
    }
    if (typeof opts.offset === "number") {
      if (typeof opts.limit !== "number") {
        throw new Error(
          `AirtableAdapter: offset requires limit on "${contract.name}" — an unbounded "skip N, take the rest" is not a supported QueryOptions shape.`,
        );
      }
      out = out.slice(opts.offset, opts.offset + opts.limit);
    } else if (typeof opts.limit === "number") {
      out = out.slice(0, opts.limit);
    }
    // Preserve the degraded-read flag across the filter/sort/slice rebuild.
    return propagateStale(source, out);
  }

  async describe(contract: ResourceContract, rows?: DataRow[]): Promise<DescribeResult> {
    // INTROSPECT the live records (WC46.015) — derive the schema from the
    // canonical fields that ACTUALLY appear in the records, not a static
    // contract echo filtered by the map. A curator adding a (mapped) column's
    // first value surfaces it in drift WITHOUT a contract edit. Airtable's
    // Metadata API is gated, so the map remains the name↔id translation seam:
    // unmapped Airtable columns never become canonical rows and stay invisible
    // by design. Empty table ⇒ fall back to the declared contract fields. A
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
    const json = (await this.request(map.table, {
      method: "POST",
      body: {
        fields: this.toFieldIdPayload(map, row),
        returnFieldsByFieldId: true,
        typecast: true,
      },
    })) as { id: string; fields: Record<string, unknown> };
    this.invalidate(contract.name);
    return this.toCanonical(map, json);
  }

  async update(contract: ResourceContract, key: string, patch: Partial<DataRow>): Promise<DataRow> {
    const map = this.map(contract);
    const recordId = await this.resolveRecordId(contract, map, key);
    const json = (await this.request(`${map.table}/${recordId}`, {
      method: "PATCH",
      body: {
        fields: this.toFieldIdPayload(map, patch),
        returnFieldsByFieldId: true,
        typecast: true,
      },
    })) as { id: string; fields: Record<string, unknown> };
    this.invalidate(contract.name);
    return this.toCanonical(map, json);
  }

  async delete(contract: ResourceContract, key: string): Promise<void> {
    const map = this.map(contract);
    const recordId = await this.resolveRecordId(contract, map, key);
    await this.request(`${map.table}/${recordId}`, { method: "DELETE" });
    this.invalidate(contract.name);
  }

  /** Map a canonical `key` value back to its Airtable record id (recXXX). */
  private async resolveRecordId(contract: ResourceContract, map: AirtableResourceMap, key: string): Promise<string> {
    const idField = map.idField ?? "id";
    // Fast path: identity IS the record id.
    if (contract.key === idField && key.startsWith("rec")) return key;
    const rows = await this.listFresh(contract);
    const hit = rows.find((r) => String(r[contract.key]) === key);
    const rec = hit?.[idField];
    if (typeof rec !== "string") {
      throw new Error(`AirtableAdapter: cannot resolve record id for "${contract.name}" ${contract.key}="${key}".`);
    }
    return rec;
  }
}
