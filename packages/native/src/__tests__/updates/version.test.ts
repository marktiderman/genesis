// @feat:app-updates
import { describe, expect, it } from "vitest";
import { compareVersions, isBelowMinimum, parseVersion } from "../../updates/version";

describe("version comparison", () => {
  it("compares parts as numbers, not text", () => {
    expect(compareVersions("1.10", "1.9")).toBe(1);
    expect(compareVersions("1.9.9", "1.10")).toBe(-1);
    expect(compareVersions("2", "10")).toBe(-1);
  });

  it("treats missing parts as zero and leading zeros as the number", () => {
    expect(compareVersions("1.2", "1.2.0")).toBe(0);
    expect(compareVersions("1.2.0.0", "1.2")).toBe(0);
    expect(compareVersions("01.02", "1.2")).toBe(0);
    expect(compareVersions(" 1.2.3 ", "1.2.3")).toBe(0);
  });

  it("has no answer for anything that isn't a plain dotted version", () => {
    for (const bad of ["", " ", "1..2", ".1", "1.", "1.2.3.4.5", "1.2-beta", "v1.2", "latest", "1.2.x", "١.٢", "99999999999999999999"]) {
      expect(parseVersion(bad), bad).toBeNull();
      expect(compareVersions(bad, "1.0"), bad).toBeNull();
    }
    expect(parseVersion(null)).toBeNull();
    expect(parseVersion(undefined)).toBeNull();
    expect(parseVersion(1.2)).toBeNull();
  });

  it("is below the minimum only when both parse and it is older (fails open)", () => {
    expect(isBelowMinimum("1.2.0", "1.3")).toBe(true);
    expect(isBelowMinimum("1.3", "1.3.0")).toBe(false);
    expect(isBelowMinimum("1.4", "1.3")).toBe(false);
    expect(isBelowMinimum("1.2.0", "garbage")).toBe(false);
    expect(isBelowMinimum("garbage", "9.9.9")).toBe(false);
    expect(isBelowMinimum(null, "9.9.9")).toBe(false);
    expect(isBelowMinimum("1.0", "")).toBe(false);
  });
});
