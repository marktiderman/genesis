import { describe, expect, it } from "vitest";
import * as new_index from "@marktiderman/genesis-data";
import * as old_index from "./index";

describe("@marktiderman/genesis-studio (deprecated alias)", () => {
  it.each([
    ["root", old_index, new_index],
  ] as const)("%s re-exports exactly what @marktiderman/genesis-data exports, as the same values", (_, alias, current) => {
    expect(Object.keys(alias).sort()).toEqual(Object.keys(current).sort());
    for (const key of Object.keys(current)) expect((alias as Record<string, unknown>)[key]).toBe((current as Record<string, unknown>)[key]);
  });
});
