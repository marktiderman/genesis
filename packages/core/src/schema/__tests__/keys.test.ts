import { describe, expect, it } from "vitest";
import { decodeRecordKey, encodeRecordKey, keyFields } from "../keys";
import { DataWriteError, isDataWriteError } from "../write-outcome";

describe("keyFields", () => {
  it("reads a single key and a composite key as a list", () => {
    expect(keyFields({ key: "id" })).toEqual(["id"]);
    expect(keyFields({ key: ["coach_id", "client_id"] })).toEqual(["coach_id", "client_id"]);
  });
});

describe("encodeRecordKey / decodeRecordKey", () => {
  it("passes a single key through unchanged", () => {
    expect(encodeRecordKey({ key: "id" }, { id: 7, name: "x" })).toBe(7);
    expect(encodeRecordKey({ key: "id" }, { id: "a-1" })).toBe("a-1");
    expect(decodeRecordKey({ key: "id" }, 7)).toEqual({ id: 7 });
  });

  it("round-trips a composite key in key order", () => {
    const contract = { key: ["coach_id", "client_id"] as const };
    const id = encodeRecordKey(contract, { client_id: 2, coach_id: "c-1", note: "n" });
    expect(id).toBe('["c-1",2]');
    expect(decodeRecordKey(contract, id)).toEqual({ coach_id: "c-1", client_id: 2 });
  });

  it("refuses a null key value instead of addressing the wrong row", () => {
    expect(() => encodeRecordKey({ key: ["a", "b"] }, { a: 1, b: null })).toThrow(/null/);
  });

  it("refuses an id that does not fit the key", () => {
    const contract = { key: ["a", "b"] };
    expect(() => decodeRecordKey(contract, "7")).toThrow(/not a composite key/);
    expect(() => decodeRecordKey(contract, '["only-one"]')).toThrow(/not a composite key/);
    expect(() => decodeRecordKey(contract, "{nope")).toThrow(/not a composite key/);
  });

  it("refuses a resource with no key", () => {
    expect(() => encodeRecordKey({ key: [] }, {})).toThrow(/no key/);
  });
});

describe("isDataWriteError", () => {
  it("recognises the error by shape, so a second copy of core still matches", () => {
    expect(isDataWriteError(new DataWriteError("conflict", "changed"))).toBe(true);
    const foreign = Object.assign(new Error("x"), { name: "DataWriteError", outcome: "gone" });
    expect(isDataWriteError(foreign)).toBe(true);
    expect(isDataWriteError(new Error("plain"))).toBe(false);
  });
});
