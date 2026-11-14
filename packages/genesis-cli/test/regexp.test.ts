import { describe, expect, it } from "vitest";
import { escapeRegExp } from "../src/regexp.js";

describe("escapeRegExp", () => {
  it("matches every special character literally, backslashes included", () => {
    const raw = String.raw`a\b$c.d*e+f?g^h{i}j(k)l|m[n]o`;
    expect(new RegExp(`^${escapeRegExp(raw)}$`).test(raw)).toBe(true);
    expect(new RegExp(escapeRegExp(String.raw`\d`)).test("5")).toBe(false);
  });
});
