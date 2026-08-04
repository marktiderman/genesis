import type {
  DataProvider,
  ListParams,
  FilterParam,
} from "./types";

// ---------------------------------------------------------------------------
// Mock DataProvider — operates on in-memory arrays, deep-cloned on creation
// ---------------------------------------------------------------------------

export interface MockProviderOptions {
  /** Simulated latency in ms (default 0). */
  delay?: number;
}

type Row = Record<string, unknown>;

export function createMockProvider(
  datasets: Record<string, Row[]>,
  options: MockProviderOptions = {},
): DataProvider {
  const { delay = 0 } = options;

  // Deep clone so mutations don't affect the original data.
  const store: Record<string, Row[]> = JSON.parse(JSON.stringify(datasets));

  // Instance-scoped ID counter (NOT module-level).
  let nextId = 1;

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function getTable(resource: string): Row[] {
    if (!store[resource]) {
      store[resource] = [];
    }
    return store[resource];
  }

  async function withDelay<T>(value: T): Promise<T> {
    if (delay > 0) {
      await new Promise((r) => setTimeout(r, delay));
    }
    return value;
  }

  function matchesFilter(row: Row, filter: FilterParam): boolean {
    const val = row[filter.field];

    switch (filter.operator) {
      case "eq":
        return val === filter.value;
      case "neq":
        return val !== filter.value;
      case "gt":
        return (val as number) > (filter.value as number);
      case "lt":
        return (val as number) < (filter.value as number);
      case "gte":
        return (val as number) >= (filter.value as number);
      case "lte":
        return (val as number) <= (filter.value as number);
      case "contains":
        return typeof val === "string" &&
          val.toLowerCase().includes(String(filter.value).toLowerCase());
      case "in":
        return filter.value.includes(val as string | number | boolean);
      case "is_null":
        return val === null || val === undefined;
      case "is_not_null":
        return val !== null && val !== undefined;
      case "between": {
        const [lo, hi] = filter.value;
        return (val as number) >= (lo as number) && (val as number) <= (hi as number);
      }
    }
  }

  function matchesSearch(
    row: Row,
    search: { query: string; fields: string[] },
  ): boolean {
    const q = search.query.toLowerCase();
    return search.fields.some((field) => {
      const val = row[field];
      return typeof val === "string" && val.toLowerCase().includes(q);
    });
  }

  function compareValues(a: unknown, b: unknown): number {
    if (typeof a === "string" && typeof b === "string") {
      return a.localeCompare(b, undefined, { numeric: true });
    }
    if (typeof a === "number" && typeof b === "number") {
      return a - b;
    }
    // Fallback: coerce to string.
    return String(a ?? "").localeCompare(String(b ?? ""), undefined, {
      numeric: true,
    });
  }

  function applyListParams(table: Row[], params: ListParams): { data: Row[]; total: number } {
    let rows = [...table];

    // Filters (AND).
    if (params.filters) {
      for (const f of params.filters) {
        rows = rows.filter((r) => matchesFilter(r, f));
      }
    }

    // Search (OR across fields, AND with filters).
    if (params.search && params.search.query) {
      rows = rows.filter((r) => matchesSearch(r, params.search!));
    }

    const total = rows.length;

    // Sort.
    if (params.sort) {
      const { field, order } = params.sort;
      rows.sort((a, b) => {
        const cmp = compareValues(a[field], b[field]);
        return order === "desc" ? -cmp : cmp;
      });
    }

    // Pagination (offset-based).
    if (params.pagination) {
      const { page, perPage } = params.pagination;
      const start = (page - 1) * perPage;
      rows = rows.slice(start, start + perPage);
    }

    return { data: rows, total };
  }

  // ---------------------------------------------------------------------------
  // DataProvider implementation
  // ---------------------------------------------------------------------------

  const provider: DataProvider = {
    async getList(_resource, params) {
      const table = getTable(_resource);
      const result = applyListParams(table, params);
      return withDelay(result) as never;
    },

    async getOne(_resource, params) {
      const table = getTable(_resource);
      const row = table.find((r) => String(r.id) === String(params.id));
      if (!row) {
        throw new Error(
          `[MockProvider] Record not found: ${_resource}#${params.id}`,
        );
      }
      return withDelay({ data: JSON.parse(JSON.stringify(row)) }) as never;
    },

    async getMany(_resource, params) {
      const table = getTable(_resource);
      const idSet = new Set(params.ids.map(String));
      const rows = table.filter((r) => idSet.has(String(r.id)));
      return withDelay({ data: JSON.parse(JSON.stringify(rows)) }) as never;
    },

    async create(_resource, params) {
      const table = getTable(_resource);
      const id = String(nextId++);
      const row = { id, ...params.data } as Row;
      table.push(row);
      return withDelay({ data: JSON.parse(JSON.stringify(row)) }) as never;
    },

    async update(_resource, params) {
      const table = getTable(_resource);
      const idx = table.findIndex((r) => String(r.id) === String(params.id));
      if (idx === -1) {
        throw new Error(
          `[MockProvider] Record not found: ${_resource}#${params.id}`,
        );
      }
      table[idx] = { ...table[idx], ...params.data };
      return withDelay({ data: JSON.parse(JSON.stringify(table[idx])) }) as never;
    },

    async deleteOne(_resource, params) {
      const table = getTable(_resource);
      const idx = table.findIndex((r) => String(r.id) === String(params.id));
      if (idx === -1) {
        throw new Error(
          `[MockProvider] Record not found: ${_resource}#${params.id}`,
        );
      }
      table.splice(idx, 1);
      return withDelay({ data: { id: params.id } });
    },
  };

  return provider;
}
