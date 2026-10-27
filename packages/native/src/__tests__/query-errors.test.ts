// @feat:native-app-shell @feat:observability
import { describe, expect, it, vi } from "vitest";
import { DataWriteError } from "@marktiderman/genesis-core/provider";
import { createNativeQueryClient, queryKeyName, reportQueryErrors } from "../query";

function client() {
  return createNativeQueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

describe("reportQueryErrors", () => {
  it("reports a query that failed unexpectedly, non-fatal, tagged with its key's first segment only", async () => {
    const c = client();
    const report = vi.fn();
    reportQueryErrors(c, report, { isOffline: () => false });
    await c.fetchQuery({ queryKey: ["tasks", "3f2a9c1b-0000-4000-8000-000000000000"], queryFn: () => Promise.reject(new Error("boom")) }).catch(() => {});
    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ message: "boom" }), { fatal: false, source: "query", tags: { "query.key": "tasks" } });
  });

  it("reports a mutation that failed unexpectedly, with its key name", async () => {
    const c = client();
    const report = vi.fn();
    reportQueryErrors(c, report, { isOffline: () => false });
    await c
      .getMutationCache()
      .build(c, { mutationKey: ["tasks.save"], mutationFn: () => Promise.reject(new Error("server fell over")) })
      .execute(undefined)
      .catch(() => {});
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ message: "server fell over" }), { fatal: false, source: "mutation", tags: { "mutation.key": "tasks.save" } });
  });

  it.each([
    ["offline", new TypeError("Network request failed")],
    ["signed out", new DataWriteError("unauthenticated", "x")],
    ["gone", new DataWriteError("gone", "x")],
    ["refused", new DataWriteError("forbidden", "x")],
    ["a conflict", new DataWriteError("conflict", "x")],
    ["a rejected value", new DataWriteError("invalid", "x")],
  ])("leaves %s to the screen", async (_what, error) => {
    const c = client();
    const report = vi.fn();
    reportQueryErrors(c, report, { isOffline: () => false });
    await c.fetchQuery({ queryKey: ["tasks"], queryFn: () => Promise.reject(error) }).catch(() => {});
    expect(report).not.toHaveBeenCalled();
  });

  it("reports nothing while the device says it is offline", async () => {
    const c = client();
    const report = vi.fn();
    reportQueryErrors(c, report, { isOffline: () => true });
    await c.fetchQuery({ queryKey: ["tasks"], queryFn: () => Promise.reject(new Error("timeout")) }).catch(() => {});
    expect(report).not.toHaveBeenCalled();
  });

  it("skips a query or mutation that opts out with meta.reportErrors: false", async () => {
    const c = client();
    const report = vi.fn();
    reportQueryErrors(c, report, { isOffline: () => false });
    await c.fetchQuery({ queryKey: ["probe"], meta: { reportErrors: false }, queryFn: () => Promise.reject(new Error("x")) }).catch(() => {});
    await c
      .getMutationCache()
      .build(c, { meta: { reportErrors: false }, mutationFn: () => Promise.reject(new Error("y")) })
      .execute(undefined)
      .catch(() => {});
    expect(report).not.toHaveBeenCalled();
  });

  it("stops after unsubscribing, and a throwing reporter never breaks the cache", async () => {
    const c = client();
    const stop = reportQueryErrors(c, () => {
      throw new Error("reporter");
    }, { isOffline: () => false });
    await expect(c.fetchQuery({ queryKey: ["a"], queryFn: () => Promise.reject(new Error("x")) })).rejects.toThrow("x");
    stop();
    const report = vi.fn();
    const stop2 = reportQueryErrors(c, report, { isOffline: () => false });
    stop2();
    await c.fetchQuery({ queryKey: ["b"], queryFn: () => Promise.reject(new Error("x")) }).catch(() => {});
    expect(report).not.toHaveBeenCalled();
  });
});

describe("queryKeyName", () => {
  it("keeps a name and drops ids and anything that isn't a plain name", () => {
    expect(queryKeyName(["tasks", 42])).toBe("tasks");
    expect(queryKeyName(["3f2a9c1b-0000-4000-8000-000000000000"])).toBeUndefined();
    expect(queryKeyName(["12345"])).toBeUndefined();
    expect(queryKeyName([{ resource: "tasks" }])).toBeUndefined();
    expect(queryKeyName(["has spaces in it"])).toBeUndefined();
    expect(queryKeyName(undefined)).toBeUndefined();
  });
});
