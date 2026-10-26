import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { resourceKeys } from "../../query-keys";
import { listCouldChange, patchCachedRow } from "../live-cache";

const k = resourceKeys("tasks");

describe("patchCachedRow", () => {
  it("patches the fields cached rows already have, in records read whole, lists and infinite lists", () => {
    const qc = new QueryClient();
    qc.setQueryData(k.detail("t1"), { id: "t1", title: "old", status: "open" });
    qc.setQueryData(k.detail("t1", "id,title"), { id: "t1", title: "old" });
    qc.setQueryData(k.list({}), { data: [{ id: "t1", title: "old" }, { id: "t2", title: "other" }], total: 2 });
    qc.setQueryData(k.infinite({}), { pages: [{ data: [{ id: "t1", title: "old" }], total: 1 }], pageParams: [null] });

    patchCachedRow(qc, "tasks", { id: "t1", title: "new", status: "done", secret: "x" });

    expect(qc.getQueryData(k.detail("t1"))).toEqual({ id: "t1", title: "new", status: "done" });
    // A record read with a projection may have joins the payload lacks: left for the refetch.
    expect(qc.getQueryData(k.detail("t1", "id,title"))).toEqual({ id: "t1", title: "old" });
    expect(qc.getQueryData<{ data: unknown[] }>(k.list({}))?.data).toEqual([{ id: "t1", title: "new" }, { id: "t2", title: "other" }]);
    expect(qc.getQueryData<{ pages: { data: unknown[] }[] }>(k.infinite({}))?.pages[0]!.data).toEqual([{ id: "t1", title: "new" }]);
  });

  it("never adds a column a cached row didn't ask for, and leaves unchanged data as it was", () => {
    const qc = new QueryClient();
    const list = { data: [{ id: "t1", title: "same" }], total: 1 };
    qc.setQueryData(k.list({}), list);
    patchCachedRow(qc, "tasks", { id: "t1", title: "same", secret: "x" });
    expect(qc.getQueryData(k.list({}))).toBe(list);
  });

  it("does nothing without an id", () => {
    const qc = new QueryClient();
    qc.setQueryData(k.detail("t1"), { id: "t1", title: "old" });
    patchCachedRow(qc, "tasks", { title: "new" });
    expect(qc.getQueryData(k.detail("t1"))).toEqual({ id: "t1", title: "old" });
  });
});

describe("listCouldChange", () => {
  function query(qc: QueryClient, key: readonly unknown[]) {
    return qc.getQueryCache().find({ queryKey: key, exact: true })!;
  }

  it("a list filtered to another person can't be changed by this row, unless the row is in it", () => {
    const qc = new QueryClient();
    const mine = k.list({ filters: [{ field: "person_id", operator: "eq", value: "p1" }] });
    const theirs = k.list({ filters: [{ field: "person_id", operator: "eq", value: "p2" }] });
    const all = k.list({});
    qc.setQueryData(mine, { data: [], total: 0 });
    qc.setQueryData(theirs, { data: [{ id: "t1", person_id: "p2" }], total: 1 });
    qc.setQueryData(all, { data: [], total: 0 });
    const moved = { id: "t1", person_id: "p1" };
    expect(listCouldChange(query(qc, mine), [moved])).toBe(true); // it matches now
    expect(listCouldChange(query(qc, theirs), [moved])).toBe(true); // it was there and may leave
    expect(listCouldChange(query(qc, all), [moved])).toBe(true); // no filters

    const elsewhere = k.list({ filters: [{ field: "person_id", operator: "eq", value: "p3" }] });
    qc.setQueryData(elsewhere, { data: [], total: 0 });
    expect(listCouldChange(query(qc, elsewhere), [moved])).toBe(false);
  });

  it("reads eq, neq, in and null filters; any other filter, or a field the row lacks, counts as a match", () => {
    const qc = new QueryClient();
    const row = { id: "t9", status: "done", due_on: null };
    const cases: [unknown[], boolean][] = [
      [[{ field: "status", operator: "neq", value: "done" }], false],
      [[{ field: "status", operator: "in", value: ["open", "done"] }], true],
      [[{ field: "due_on", operator: "is_not_null" }], false],
      [[{ field: "title", operator: "contains", value: "x" }], true],
      [[{ field: "missing", operator: "eq", value: "x" }], true],
    ];
    for (const [filters, expected] of cases) {
      const key = k.list({ filters } as never);
      qc.setQueryData(key, { data: [], total: 0 });
      expect(listCouldChange(query(qc, key), [row])).toBe(expected);
    }
  });

  it("records and other reads could always change", () => {
    const qc = new QueryClient();
    qc.setQueryData(k.detail("t1"), { id: "t1" });
    expect(listCouldChange(query(qc, k.detail("t1")), [{ id: "t2" }])).toBe(true);
  });
});
