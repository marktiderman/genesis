// @feat:supabase-provider
/**
 * Sorting by several columns: the keyset spelled out one column at a time,
 * with Postgres's default null placement, checked against the order itself.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createSupabaseProvider, keysetClauses } from "../supabase-provider";
import { isDataReadError } from "../../schema/read-outcome";
import type { ListParams, SortParam } from "../types";

// ---------------------------------------------------------------------------
// A small evaluator for the filters keysetClauses writes: `or` lists of
// `and(…)`, `col.gt|lt|eq."v"` and `col.is.null` / `col.not.is.null`.
// ---------------------------------------------------------------------------

type Row = Record<string, string | null>;

function splitTop(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quoted = false;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === "\\") i++;
      else if (c === '"') quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === "," && depth === 0) {
      out.push(text.slice(start, i));
      start = i + 1;
    }
  }
  out.push(text.slice(start));
  return out;
}

const unquote = (v: string) => v.slice(1, -1).replace(/\\(.)/g, "$1");

function holds(term: string, row: Row): boolean {
  if (term.startsWith("and(")) return splitTop(term.slice(4, -1)).every((t) => holds(t, row));
  if (term.startsWith("or(")) return splitTop(term.slice(3, -1)).some((t) => holds(t, row));
  let m = /^(\w+)\.(not\.)?is\.null$/.exec(term);
  if (m) return (row[m[1]!] === null) !== !!m[2];
  m = /^(\w+)\.(gt|lt|eq)\.(".*")$/.exec(term);
  if (!m) throw new Error(`can't read ${term}`);
  const have = row[m[1]!];
  const want = unquote(m[3]!);
  // SQL: a comparison with null is never true.
  if (have === null || have === undefined) return false;
  return m[2] === "gt" ? have > want : m[2] === "lt" ? have < want : have === want;
}

const matches = (clauses: string, row: Row) => splitTop(clauses).some((t) => holds(t, row));

/** Postgres's order: each column (asc: nulls last; desc: nulls first), then the key ascending. */
function compare(sorts: SortParam[], a: Row, b: Row): number {
  for (const { field, order } of sorts) {
    const x = a[field] ?? null;
    const y = b[field] ?? null;
    if (x === y) continue;
    const nullsLast = order === "asc";
    if (x === null) return nullsLast ? 1 : -1;
    if (y === null) return nullsLast ? -1 : 1;
    const cmp = x < y ? -1 : 1;
    return order === "asc" ? cmp : -cmp;
  }
  return a.id! < b.id! ? -1 : a.id! > b.id! ? 1 : 0;
}

/** Deterministic pseudo-random numbers. */
function random(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

const cursorFor = (sorts: SortParam[], row: Row, d?: "b") => ({
  s: null,
  o: "asc" as const,
  k: "id",
  c: sorts.map((s) => ({ s: s.field, o: s.order ?? ("asc" as const) })),
  vs: sorts.map((s) => row[s.field] ?? null),
  id: row.id!,
  ...(d ? { d } : {}),
});

describe("keysetClauses with several columns", () => {
  it("spells out each column, ties by the key, nulls where each order puts them", () => {
    const state = cursorFor(
      [
        { field: "group", order: "asc" },
        { field: "position", order: "desc" },
      ],
      { id: "7", group: "b", position: "3" },
    );
    expect(keysetClauses(state)).toBe(
      'group.gt."b",and(group.eq."b",position.lt."3"),and(group.eq."b",position.eq."3",id.gt."7"),group.is.null',
    );
  });

  it("a null in the middle: later columns compare within the nulls", () => {
    const state = cursorFor(
      [
        { field: "group", order: "desc" },
        { field: "position", order: "asc" },
      ],
      { id: "7", group: null, position: "3" },
    );
    expect(keysetClauses(state)).toBe(
      'group.not.is.null,and(group.is.null,position.gt."3"),and(group.is.null,position.eq."3",id.gt."7"),and(group.is.null,position.is.null)',
    );
  });

  const orders: SortParam[][] = [
    [{ field: "a", order: "asc" }, { field: "b", order: "asc" }],
    [{ field: "a", order: "asc" }, { field: "b", order: "desc" }],
    [{ field: "a", order: "desc" }, { field: "b", order: "asc" }],
    [{ field: "a", order: "desc" }, { field: "b", order: "desc" }],
    [{ field: "a", order: "asc" }, { field: "b", order: "desc" }, { field: "c", order: "asc" }],
    [{ field: "c", order: "desc" }, { field: "a", order: "asc" }, { field: "b", order: "desc" }],
  ];

  for (const sorts of orders) {
    const label = sorts.map((s) => `${s.field} ${s.order}`).join(", ");
    it(`pages forward and back through every row once, in order: ${label}`, () => {
      for (let seed = 1; seed <= 20; seed++) {
        const rand = random(seed);
        const pick = () => (rand() < 0.25 ? null : ["x", "y", "z"][Math.floor(rand() * 3)]!);
        const rows: Row[] = Array.from({ length: 30 }, (_, i) => ({
          id: String(i).padStart(3, "0"),
          a: pick(),
          b: pick(),
          c: pick(),
        }));
        const ordered = [...rows].sort((x, y) => compare(sorts, x, y));
        // Forward, one row at a time from each row's cursor: exactly the rows after it.
        for (let i = 0; i < ordered.length; i++) {
          const after = rows.filter((r) => matches(keysetClauses(cursorFor(sorts, ordered[i]!)), r));
          expect(after.sort((x, y) => compare(sorts, x, y))).toEqual(ordered.slice(i + 1));
          const before = rows.filter((r) => matches(keysetClauses(cursorFor(sorts, ordered[i]!, "b")), r));
          expect(before.sort((x, y) => compare(sorts, x, y))).toEqual(ordered.slice(0, i));
        }
      }
    });
  }
});

// ---------------------------------------------------------------------------
// getList with `sorts`
// ---------------------------------------------------------------------------

type Response = { data: unknown; error: { message: string; code?: string } | null; count?: number };
let queue: Response[] = [];
let calls: { method: string; args: unknown[] }[] = [];

function builder(): unknown {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "order", "range", "or", "is", "not", "gte", "lte"]) {
    b[m] = (...args: unknown[]) => {
      calls.push({ method: m, args });
      return b;
    };
  }
  b["then"] = (resolve: (r: Response) => unknown) => Promise.resolve(queue.shift()!).then(resolve);
  return b;
}

const provider = () => createSupabaseProvider({ from: () => builder() });
const callsOf = (method: string) => calls.filter((c) => c.method === method).map((c) => c.args);

async function page(params: ListParams, response: Response) {
  calls = [];
  queue.push(response);
  return provider().getList("tasks", params);
}

beforeEach(() => {
  queue = [];
  calls = [];
});

const grouped: SortParam[] = [
  { field: "group", order: "asc" },
  { field: "position", order: "desc" },
];

describe("getList with sorts", () => {
  it("reports multiSort", async () => {
    expect((await provider().capabilities!("tasks")).multiSort).toBe(true);
  });

  it("offset pages order by each column, then the key", async () => {
    await page({ pagination: { page: 1, perPage: 2 }, sorts: grouped, sort: grouped[0] }, { data: [], error: null, count: 0 });
    expect(callsOf("order")).toEqual([
      ["group", { ascending: true }],
      ["position", { ascending: false }],
      ["id", { ascending: true }],
    ]);
  });

  it("cursor pages order by each column with pinned nulls, and the next cursor continues after the last row", async () => {
    const first = await page(
      { pagination: { page: 1, perPage: 2, cursor: null }, sorts: grouped },
      { data: [{ id: "1", group: "a", position: 9 }, { id: "2", group: "a", position: 5 }, { id: "3", group: "b", position: 1 }], error: null, count: 3 },
    );
    expect(callsOf("order")).toEqual([
      ["group", { ascending: true, nullsFirst: false }],
      ["position", { ascending: false, nullsFirst: true }],
      ["id", { ascending: true }],
    ]);
    expect(first.nextCursor).toBeTruthy();
    await page({ pagination: { page: 2, perPage: 2, cursor: first.nextCursor! }, sorts: grouped }, { data: [], error: null });
    expect(callsOf("or")).toEqual([['group.gt."a",and(group.eq."a",position.lt."5"),and(group.eq."a",position.eq."5",id.gt."2"),group.is.null']]);
  });

  it("going back reverses every column and the key", async () => {
    const first = await page(
      { pagination: { page: 1, perPage: 1, cursor: null }, sorts: grouped },
      { data: [{ id: "1", group: "a", position: 9 }, { id: "2", group: "a", position: 5 }], error: null, count: 2 },
    );
    const second = await page(
      { pagination: { page: 2, perPage: 1, cursor: first.nextCursor! }, sorts: grouped },
      { data: [{ id: "2", group: "a", position: 5 }], error: null },
    );
    await page({ pagination: { page: 1, perPage: 1, cursor: second.prevCursor! }, sorts: grouped }, { data: [], error: null });
    expect(callsOf("order")).toEqual([
      ["group", { ascending: false, nullsFirst: true }],
      ["position", { ascending: true, nullsFirst: false }],
      ["id", { ascending: false }],
    ]);
  });

  it("refuses a cursor made for other sorts", async () => {
    const first = await page(
      { pagination: { page: 1, perPage: 1, cursor: null }, sorts: grouped },
      { data: [{ id: "1", group: "a", position: 9 }, { id: "2", group: "a", position: 5 }], error: null, count: 2 },
    );
    const other: SortParam[] = [grouped[0]!, { field: "position", order: "asc" }];
    await expect(page({ pagination: { page: 2, perPage: 1, cursor: first.nextCursor! }, sorts: other }, { data: [], error: null })).rejects.toSatisfy(
      (e: unknown) => isDataReadError(e) && /different sort/.test(String((e.cause as Error).message)),
    );
  });

  it("refuses when the selected columns leave out a sort column", async () => {
    await expect(
      page({ pagination: { page: 1, perPage: 1, cursor: null }, sorts: grouped }, { data: [{ id: "1", group: "a" }, { id: "2", group: "a" }], error: null, count: 2 }),
    ).rejects.toSatisfy((e: unknown) => isDataReadError(e) && /"id", "group" and "position"/.test(String((e.cause as Error).message)));
  });

  it("stops at a sort on the key, which sets the key's order", async () => {
    await page(
      { pagination: { page: 1, perPage: 2, cursor: null }, sorts: [{ field: "group", order: "asc" }, { field: "id", order: "desc" }, { field: "position", order: "asc" }] },
      { data: [], error: null, count: 0 },
    );
    expect(callsOf("order")).toEqual([
      ["group", { ascending: true, nullsFirst: false }],
      ["id", { ascending: false }],
    ]);
  });
});
