import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifyError,
  defaultErrorReporter,
  errorMessages,
  getErrorReporter,
  reportError,
  setErrorReporter,
} from "../errors";
import { DataWriteError } from "../schema/write-outcome";
import { DataReadError } from "../schema/read-outcome";
import * as root from "../index";

describe("reportError", () => {
  let restore: (() => void) | undefined;
  afterEach(() => {
    restore?.();
    restore = undefined;
    vi.restoreAllMocks();
  });

  it("goes to the registered reporter, with a string context read as the source", () => {
    const reporter = vi.fn();
    restore = setErrorReporter(reporter);
    const error = new Error("boom");
    reportError(error, "chat:attachment-action");
    reportError(error, { source: "forms-native:draft-save", tags: { step: "flush" } });
    expect(reporter).toHaveBeenNthCalledWith(1, error, { source: "chat:attachment-action" });
    expect(reporter).toHaveBeenNthCalledWith(2, error, { source: "forms-native:draft-save", tags: { step: "flush" } });
  });

  it("never throws when the reporter does", () => {
    restore = setErrorReporter(() => {
      throw new Error("reporter broke");
    });
    expect(() => reportError(new Error("x"), "a:b")).not.toThrow();
  });

  it("restores the previous reporter, and null puts the default back", () => {
    const first = vi.fn();
    const undoFirst = setErrorReporter(first);
    const undoNull = setErrorReporter(null);
    expect(getErrorReporter()).toBe(defaultErrorReporter);
    undoNull();
    expect(getErrorReporter()).toBe(first);
    undoFirst();
    expect(getErrorReporter()).toBe(defaultErrorReporter);
  });

  it("writes to console.warn in development by default", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    reportError(new Error("x"), "a:b");
    expect(warn).toHaveBeenCalledWith("[genesis] a:b:", expect.any(Error));
  });

  it("drops reports in production by default", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("NODE_ENV", "production");
    try {
      reportError(new Error("x"), "a:b");
    } finally {
      vi.unstubAllEnvs();
    }
    expect(warn).not.toHaveBeenCalled();
  });

  it("is exported from the package root", () => {
    expect(root.reportError).toBe(reportError);
    expect(root.classifyError).toBe(classifyError);
  });
});

describe("classifyError", () => {
  it.each([
    ["conflict", "conflict", false],
    ["duplicate", "conflict", false],
    ["gone", "not-found", false],
    ["forbidden", "forbidden", false],
    ["invalid", "invalid", false],
    ["unauthenticated", "unauthenticated", false],
    ["audit_failed", "unexpected", true],
    ["error", "unexpected", true],
  ] as const)("a write that was %s is %s (report %s)", (outcome, kind, report) => {
    const result = classifyError(new DataWriteError(outcome, "raw store text with a@b.co"));
    expect(result).toEqual({ kind, report, message: errorMessages[kind] });
  });

  it.each([
    ["unauthenticated", "unauthenticated", false],
    ["forbidden", "forbidden", false],
    ["gone", "not-found", false],
    ["invalid", "invalid", true],
    ["error", "unexpected", true],
  ] as const)("a read that was %s is %s (report %s)", (outcome, kind, report) => {
    expect(classifyError(new DataReadError(outcome, "x"))).toMatchObject({ kind, report });
  });

  it("reads a failed write whose cause is a network failure as offline", () => {
    const write = new DataWriteError("error", "x", { cause: new TypeError("Network request failed") });
    expect(classifyError(write)).toMatchObject({ kind: "offline", report: false });
  });

  it.each(["Network request failed", "Failed to fetch", "Load failed", "NetworkError when attempting to fetch resource."])(
    "reads fetch's %j as offline",
    (message) => {
      expect(classifyError(new TypeError(message))).toMatchObject({ kind: "offline", report: false });
    },
  );

  it("reads Supabase's retryable fetch error as offline", () => {
    const error = Object.assign(new Error("fetch failed"), { name: "AuthRetryableFetchError" });
    expect(classifyError(error).kind).toBe("offline");
  });

  it.each([
    ["42501", "forbidden", false],
    ["PGRST116", "not-found", false],
    ["PGRST301", "unauthenticated", false],
    ["23505", "conflict", false],
    ["23502", "invalid", false],
    ["42703", "invalid", true],
    ["PGRST100", "invalid", true],
    ["XX000", "unexpected", true],
  ] as const)("reads the store code %s as %s (report %s)", (code, kind, report) => {
    expect(classifyError({ code, message: "raw" })).toMatchObject({ kind, report });
  });

  it.each([
    [401, "unauthenticated"],
    [403, "forbidden"],
    [404, "not-found"],
    [409, "conflict"],
    [422, "invalid"],
    [500, "unexpected"],
  ] as const)("reads HTTP status %s as %s", (status, kind) => {
    expect(classifyError(Object.assign(new Error("x"), { status })).kind).toBe(kind);
  });

  it("reads a missing auth session as unauthenticated", () => {
    expect(classifyError(Object.assign(new Error("Auth session missing!"), { name: "AuthSessionMissingError" })).kind).toBe("unauthenticated");
  });

  it("reads anything else as unexpected, and offline when the device says so", () => {
    expect(classifyError(new Error("undefined is not a function"))).toEqual({ kind: "unexpected", report: true, message: errorMessages.unexpected });
    expect(classifyError(new Error("x"), { isOffline: () => true })).toMatchObject({ kind: "offline", report: false });
    expect(classifyError("a string")).toMatchObject({ kind: "unexpected" });
    expect(classifyError(null)).toMatchObject({ kind: "unexpected" });
  });

  it("never shows the error's own text, and takes reworded messages", () => {
    const result = classifyError(new Error("token=abc person@example.com"));
    expect(result.message).not.toContain("example.com");
    expect(classifyError(new DataWriteError("forbidden", "x"), { messages: { forbidden: "Nope." } }).message).toBe("Nope.");
  });

  it("never throws on a value whose getters throw", () => {
    const hostile = new Proxy({}, { get: () => { throw new Error("getter"); } });
    expect(classifyError(hostile)).toMatchObject({ kind: "unexpected", report: true });
  });
});
