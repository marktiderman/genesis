// =====================================================================
// FakeSupabaseClient — a tiny in-memory stand-in for the supabase-js query
// builder, matching the structural SupabaseClientLike the adapter relies on.
//
// Supports the chain the adapter uses: from(t).select('*').eq(c,v).order().
// limit().maybeSingle()/single()/then(). insert()/update()/delete() mutate the
// in-memory store. This keeps the SupabaseAdapter tests network-free while
// exercising the real query-builder semantics + column remap.
// =====================================================================

import type { SupabaseClientLike, SupabaseQueryBuilder } from "../../adapters/supabase";

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

interface Result {
  data: unknown;
  error: unknown;
}

class FakeQueryBuilder implements SupabaseQueryBuilder {
  private op: "select" | "insert" | "update" | "delete" = "select";
  private filters: [string, unknown][] = [];
  private inFilters: [string, readonly unknown[]][] = [];
  private orderCol?: string;
  private orderAsc = true;
  private limitN?: number;
  private rangeFrom?: number;
  private rangeTo?: number;
  private payload?: Row;

  constructor(private readonly store: Row[]) {}

  select(): this {
    if (this.op === "select" || this.op === "insert" || this.op === "update") {
      // select after insert/update is the "return representation" form.
    }
    return this;
  }
  insert(values: Row): this {
    this.op = "insert";
    this.payload = { ...values };
    return this;
  }
  update(values: Row): this {
    this.op = "update";
    this.payload = { ...values };
    return this;
  }
  delete(): this {
    this.op = "delete";
    return this;
  }
  eq(column: string, value: unknown): this {
    this.filters.push([column, value]);
    return this;
  }
  in(column: string, values: readonly unknown[]): this {
    this.inFilters.push([column, values]);
    return this;
  }
  order(column: string, opts?: { ascending?: boolean }): this {
    this.orderCol = column;
    this.orderAsc = opts?.ascending !== false;
    return this;
  }
  limit(count: number): this {
    this.limitN = count;
    return this;
  }
  range(from: number, to: number): this {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }

  private match(row: Row): boolean {
    return (
      this.filters.every(([c, v]) => row[c] === v) &&
      this.inFilters.every(([c, values]) => values.includes(row[c]))
    );
  }

  private run(): Result {
    try {
      if (this.op === "insert") {
        const rec = { ...this.payload };
        this.store.push(rec);
        return { data: [rec], error: null };
      }
      if (this.op === "update") {
        const updated: Row[] = [];
        for (const row of this.store) {
          if (this.match(row)) {
            Object.assign(row, this.payload);
            updated.push(row);
          }
        }
        return { data: updated, error: null };
      }
      if (this.op === "delete") {
        for (let i = this.store.length - 1; i >= 0; i--) {
          if (this.match(this.store[i]!)) this.store.splice(i, 1);
        }
        return { data: [], error: null };
      }
      // select
      let rows = this.store.filter((r) => this.match(r)).map((r) => ({ ...r }));
      if (this.orderCol) {
        const col = this.orderCol;
        rows.sort((a, b) => {
          const av = a[col];
          const bv = b[col];
          if (av === bv) return 0;
          return (av! < bv! ? -1 : 1) * (this.orderAsc ? 1 : -1);
        });
      }
      if (typeof this.rangeFrom === "number") {
        rows = rows.slice(this.rangeFrom, (this.rangeTo ?? this.rangeFrom) + 1);
      } else if (typeof this.limitN === "number") {
        rows = rows.slice(0, this.limitN);
      }
      return { data: rows, error: null };
    } catch (err) {
      return { data: null, error: { message: String(err) } };
    }
  }

  private rowsResult(): Result {
    return this.run();
  }

  async maybeSingle(): Promise<Result> {
    const { data, error } = this.run();
    if (error) return { data: null, error };
    const arr = data as Row[];
    return { data: arr[0] ?? null, error: null };
  }

  async single(): Promise<Result> {
    const { data, error } = this.run();
    if (error) return { data: null, error };
    const arr = data as Row[];
    if (arr.length === 0) {
      return { data: null, error: { message: "No rows", code: "PGRST116" } };
    }
    return { data: arr[0], error: null };
  }

  then<R>(onfulfilled: (value: Result) => R): Promise<R> {
    return Promise.resolve(onfulfilled(this.rowsResult()));
  }
}

export class FakeSupabaseClient implements SupabaseClientLike {
  private readonly tables: Tables = {};

  constructor(initial: Tables = {}) {
    for (const [t, rows] of Object.entries(initial)) {
      this.tables[t] = rows.map((r) => ({ ...r }));
    }
  }

  from(table: string): SupabaseQueryBuilder {
    if (!this.tables[table]) this.tables[table] = [];
    return new FakeQueryBuilder(this.tables[table]!);
  }

  /** Test helper: inspect raw stored rows. */
  rows(table: string): Row[] {
    return this.tables[table] ?? [];
  }
}
