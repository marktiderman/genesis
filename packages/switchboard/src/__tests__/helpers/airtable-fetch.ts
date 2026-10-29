// =====================================================================
// Mock Airtable REST endpoint — network is mocked, but the MAP is real.
//
// Implements just enough of the Airtable Web API for the adapter's hardened
// paths: returnFieldsByFieldId reads, pagination via `offset`, record CRUD,
// and an optional scripted 429 sequence (to prove capped retry). Records are
// stored keyed by field ID (as Airtable does), so the adapter's name↔id
// translation is exercised for real.
// =====================================================================

import type { FetchLike } from "../../adapters/airtable";

export interface MockRecord {
  id: string;
  fields: Record<string, unknown>;
}

export interface MockAirtableOptions {
  /**
   * Number of leading 429 responses to emit before succeeding (per process).
   * Proves the capped-retry path. Default 0.
   */
  throttleFirst?: number;
  /** Include a Retry-After header (seconds) on the 429s. */
  retryAfterSeconds?: number;
}

type Tables = Record<string, MockRecord[]>;

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

let recCounter = 0;

/**
 * Build a FetchLike backed by an in-memory table store keyed by Airtable
 * field IDs. The returned fetch mutates the store on POST/PATCH/DELETE so
 * round-trip tests see their writes.
 */
export function makeAirtableFetch(initial: Tables, opts: MockAirtableOptions = {}): FetchLike {
  const tables: Tables = {};
  for (const [t, recs] of Object.entries(initial)) {
    tables[t] = recs.map((r) => ({ id: r.id, fields: { ...r.fields } }));
  }
  let throttleRemaining = opts.throttleFirst ?? 0;

  const fetchImpl: FetchLike = async (url, init) => {
    if (throttleRemaining > 0) {
      throttleRemaining -= 1;
      const headers: Record<string, string> = {};
      if (opts.retryAfterSeconds != null) {
        headers["retry-after"] = String(opts.retryAfterSeconds);
      }
      return jsonResponse(429, { error: "RATE_LIMIT" }, headers);
    }

    const u = new URL(url);
    // Path: /v0/{baseId}/{table}[/{recordId}]
    const parts = u.pathname.split("/").filter(Boolean);
    // [..., v0, base, table, (recordId)]
    const tableIdx = parts.findIndex((p) => p.startsWith("tbl"));
    const table = parts[tableIdx];
    const recordId = parts[tableIdx + 1];
    const method = (init?.method ?? "GET").toUpperCase();

    if (!table || !(table in tables)) {
      return jsonResponse(404, { error: "TABLE_NOT_FOUND" });
    }
    const store = tables[table]!;

    if (method === "GET" && !recordId) {
      // List with pagination — one record per page to exercise the offset loop.
      const offsetParam = u.searchParams.get("offset");
      const start = offsetParam ? Number(offsetParam) : 0;
      const pageSize = 1;
      const page = store.slice(start, start + pageSize);
      const next = start + pageSize;
      const body: { records: MockRecord[]; offset?: string } = {
        records: page.map((r) => ({ id: r.id, fields: { ...r.fields } })),
      };
      if (next < store.length) body.offset = String(next);
      return jsonResponse(200, body);
    }

    if (method === "POST") {
      const payload = JSON.parse(init?.body ?? "{}") as {
        fields?: Record<string, unknown>;
      };
      const rec: MockRecord = {
        id: `rec_mock_${++recCounter}`,
        fields: { ...(payload.fields ?? {}) },
      };
      store.push(rec);
      return jsonResponse(200, { id: rec.id, fields: { ...rec.fields } });
    }

    if (method === "PATCH" && recordId) {
      const payload = JSON.parse(init?.body ?? "{}") as {
        fields?: Record<string, unknown>;
      };
      const rec = store.find((r) => r.id === recordId);
      if (!rec) return jsonResponse(404, { error: "NOT_FOUND" });
      Object.assign(rec.fields, payload.fields ?? {});
      return jsonResponse(200, { id: rec.id, fields: { ...rec.fields } });
    }

    if (method === "DELETE" && recordId) {
      const idx = store.findIndex((r) => r.id === recordId);
      if (idx !== -1) store.splice(idx, 1);
      return jsonResponse(200, { id: recordId, deleted: true });
    }

    return jsonResponse(400, { error: "BAD_REQUEST" });
  };

  return fetchImpl;
}
