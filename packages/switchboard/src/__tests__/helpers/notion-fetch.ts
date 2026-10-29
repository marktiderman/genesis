// =====================================================================
// Mock Notion REST endpoint — network is mocked, but the property SHAPES are
// real. Implements just enough of the Notion API for the adapter's hardened
// paths: database query with start_cursor pagination, page create/update,
// archive-on-delete, and an optional scripted 429 sequence (capped retry).
//
// Pages are stored with REAL Notion property value shapes (title arrays,
// select objects, …) keyed by property NAME, so the adapter's encode/decode
// seam is exercised for real.
// =====================================================================

import type { FetchLike } from "../../adapters/airtable";

export interface MockNotionPage {
  id: string;
  properties: Record<string, unknown>;
  archived?: boolean;
}

export interface MockNotionOptions {
  /** Leading 429 responses before succeeding (per process). Default 0. */
  throttleFirst?: number;
  /** Retry-After header (seconds) on the 429s. */
  retryAfterSeconds?: number;
}

type Databases = Record<string, MockNotionPage[]>;

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

let pageCounter = 0;

/**
 * Build a FetchLike backed by an in-memory database store. The returned fetch
 * mutates the store on create/update/archive so round-trip tests see writes.
 * Database query paginates ONE page at a time to exercise the cursor loop.
 */
export function makeNotionFetch(initial: Databases, opts: MockNotionOptions = {}): FetchLike {
  const databases: Databases = {};
  for (const [db, pages] of Object.entries(initial)) {
    databases[db] = pages.map((p) => ({ id: p.id, properties: { ...p.properties }, archived: p.archived ?? false }));
  }
  let throttleRemaining = opts.throttleFirst ?? 0;

  const fetchImpl: FetchLike = async (url, init) => {
    if (throttleRemaining > 0) {
      throttleRemaining -= 1;
      const headers: Record<string, string> = {};
      if (opts.retryAfterSeconds != null) headers["retry-after"] = String(opts.retryAfterSeconds);
      return jsonResponse(429, { object: "error", code: "rate_limited" }, headers);
    }

    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean); // [v1, databases, {id}, query] | [v1, pages, {id?}]
    const method = (init?.method ?? "GET").toUpperCase();
    const body = init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : {};

    // POST /v1/databases/{id}/query
    if (parts[1] === "databases" && parts[3] === "query" && method === "POST") {
      const dbId = parts[2]!;
      const store = (databases[dbId] ?? []).filter((p) => !p.archived);
      const start = body.start_cursor ? Number(body.start_cursor) : 0;
      const pageSize = 1; // one per page to exercise the cursor loop.
      const slice = store.slice(start, start + pageSize);
      const next = start + pageSize;
      const hasMore = next < store.length;
      return jsonResponse(200, {
        object: "list",
        results: slice.map((p) => ({ id: p.id, properties: { ...p.properties } })),
        next_cursor: hasMore ? String(next) : null,
        has_more: hasMore,
      });
    }

    // POST /v1/pages  (create)
    if (parts[1] === "pages" && parts.length === 2 && method === "POST") {
      const parent = body.parent as { database_id?: string } | undefined;
      const dbId = parent?.database_id;
      if (!dbId) return jsonResponse(400, { object: "error", code: "validation_error" });
      const page: MockNotionPage = {
        id: `page_mock_${++pageCounter}`,
        properties: { ...((body.properties as Record<string, unknown>) ?? {}) },
        archived: false,
      };
      (databases[dbId] ??= []).push(page);
      return jsonResponse(200, { id: page.id, properties: { ...page.properties } });
    }

    // PATCH /v1/pages/{id}  (update properties OR archive)
    if (parts[1] === "pages" && parts.length === 3 && method === "PATCH") {
      const pageId = parts[2]!;
      for (const pages of Object.values(databases)) {
        const page = pages.find((p) => p.id === pageId);
        if (page) {
          if (body.properties) Object.assign(page.properties, body.properties as Record<string, unknown>);
          if (typeof body.archived === "boolean") page.archived = body.archived;
          return jsonResponse(200, { id: page.id, properties: { ...page.properties }, archived: page.archived });
        }
      }
      return jsonResponse(404, { object: "error", code: "object_not_found" });
    }

    return jsonResponse(400, { object: "error", code: "bad_request" });
  };

  return fetchImpl;
}

// -- helpers to build REAL Notion property value shapes for fixtures -----
export const notionProp = {
  title: (s: string) => ({ title: [{ plain_text: s, text: { content: s } }] }),
  rich_text: (s: string) => ({ rich_text: [{ plain_text: s, text: { content: s } }] }),
  number: (n: number) => ({ number: n }),
  checkbox: (b: boolean) => ({ checkbox: b }),
  select: (name: string) => ({ select: { name } }),
  multi_select: (names: string[]) => ({ multi_select: names.map((name) => ({ name })) }),
  date: (start: string) => ({ date: { start } }),
  url: (s: string) => ({ url: s }),
};
