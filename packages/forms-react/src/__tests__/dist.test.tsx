// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Runs against the build (the test gate runs after `pnpm build:packages`).
describe("dist", () => {
  it('opens with "use client" so a server component can import the hooks', () => {
    const entry = fileURLToPath(new URL("../../dist/index.js", import.meta.url));
    expect(readFileSync(entry, "utf8").split("\n", 1)[0]).toBe('"use client";');
  });
});
