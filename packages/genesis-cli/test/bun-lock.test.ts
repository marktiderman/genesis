// @feat:cli-upgrade @feat:cli-doctor
// bun.lock edits: stale nested Genesis copies and deleted workspaces come out, nothing else moves.
import { describe, expect, it } from "vitest";
import { removeBunLockEntries, staleNestedEntries, workspaceEntries } from "../src/blocks/bun-lock.js";
import { bunLock } from "./bun-lock-helpers.js";

describe("bun.lock", () => {
  it("finds a nested Genesis copy the root's version satisfies", () => {
    expect(staleNestedEntries(bunLock())).toEqual([
      {
        key: "@marktiderman/genesis-native/@marktiderman/genesis-ui-native",
        name: "@marktiderman/genesis-ui-native",
        parent: "@marktiderman/genesis-native",
        version: "3.3.0",
        root: "3.5.0",
        range: "^3.3.0",
      },
    ]);
  });

  it("leaves a copy nested on purpose (the parent's range excludes the root's), and one matching the root", () => {
    expect(staleNestedEntries(bunLock({ uiNative: "4.0.0" }))).toEqual([]);
    expect(staleNestedEntries(bunLock({ nested: "3.5.0" }))).toEqual([]);
    expect(staleNestedEntries(bunLock({ nested: "" }))).toEqual([]);
  });

  it("judges against the version an upgrade moves the root to", () => {
    // The root is still 3.3.0 in the lock, but the release pins 3.5.0.
    expect(staleNestedEntries(bunLock({ uiNative: "3.3.0" }))).toEqual([]);
    expect(staleNestedEntries(bunLock({ uiNative: "3.3.0" }), (n) => (n === "@marktiderman/genesis-ui-native" ? "3.5.0" : null)).map((s) => s.root)).toEqual(["3.5.0"]);
  });

  it("removes only the stale line, byte for byte otherwise", () => {
    const text = bunLock();
    const after = removeBunLockEntries(text, { packages: staleNestedEntries(text).map((s) => s.key) });
    expect(after).toBe(bunLock({ nested: "" }));
    expect(staleNestedEntries(after)).toEqual([]);
  });

  it("removes a deleted overlay's workspace and its package entry", () => {
    const text = bunLock();
    const entries = workspaceEntries(text, "packages/fixture");
    expect(entries).toEqual({ workspaces: ["packages/fixture"], packages: ["@marktiderman/genesis-fixture"] });
    expect(removeBunLockEntries(text, entries)).toBe(bunLock({ overlay: false }));
    expect(workspaceEntries(text, "packages/other")).toEqual({ workspaces: [], packages: [] });
  });

  it("handles a last member with no trailing comma", () => {
    const text = '{\n  "packages": {\n    "a": ["a@1.0.0"],\n    "b": ["b@1.0.0"]\n  }\n}\n';
    expect(removeBunLockEntries(text, { packages: ["b"] })).toBe('{\n  "packages": {\n    "a": ["a@1.0.0"]\n  }\n}\n');
    expect(removeBunLockEntries(text, { packages: ["a"] })).toBe('{\n  "packages": {\n    "b": ["b@1.0.0"]\n  }\n}\n');
  });
});
