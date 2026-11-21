import { describe, expect, it } from "vitest";
import * as new_index from "@marktiderman/genesis-data-server";
import * as old_index from "./index";
import * as new_client from "@marktiderman/genesis-data-server/client";
import * as old_client from "./client";
import * as new_auth from "@marktiderman/genesis-data-server/auth";
import * as old_auth from "./auth";

describe("@marktiderman/genesis-studio-server (deprecated alias)", () => {
  it.each([
    ["root", old_index, new_index],
    ["/client", old_client, new_client],
    ["/auth", old_auth, new_auth],
  ] as const)("%s re-exports exactly what @marktiderman/genesis-data-server exports, as the same values", (_, alias, current) => {
    expect(Object.keys(alias).sort()).toEqual(Object.keys(current).sort());
    for (const key of Object.keys(current)) expect((alias as Record<string, unknown>)[key]).toBe((current as Record<string, unknown>)[key]);
  });
});
