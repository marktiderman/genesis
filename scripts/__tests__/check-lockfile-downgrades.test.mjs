/**
 * scripts/check-lockfile-downgrades.mjs: a version replaced by an older compatible one is a
 * downgrade, an older copy beside it is reported apart, and a new major or newer version is fine.
 */
import { describe, expect, it } from "vitest";
import {
  lockfileDowngrades,
  lockedVersions,
} from "../check-lockfile-downgrades.mjs";

const lock = (...keys) =>
  [
    "lockfileVersion: '9.0'",
    "",
    "packages:",
    "",
    ...keys.flatMap((k) => [`  ${k}:`, "    resolution: {integrity: x}", ""]),
    "snapshots:",
    "",
    "  ignored@9.9.9:",
    "",
  ].join("\n");

describe("check-lockfile-downgrades", () => {
  it("reads scoped, quoted and prerelease keys from the packages section only", () => {
    const versions = lockedVersions(
      lock("'@hookform/resolvers@6.0.2'", "postcss@8.5.32", "next@16.0.0-rc.1"),
    );
    expect([...versions.keys()]).toEqual([
      "@hookform/resolvers",
      "postcss",
      "next",
    ]);
    expect([...versions.get("next")]).toEqual(["16.0.0-rc.1"]);
  });

  it("tells a replaced older version from an added older copy in the same range", () => {
    const base = lock("'@hookform/resolvers@6.0.2'", "postcss@8.5.32");
    const head = lock(
      "'@hookform/resolvers@6.0.0'",
      "postcss@8.5.31",
      "postcss@8.5.32",
    );
    expect(lockfileDowngrades(base, head)).toEqual({
      downgrades: [
        "@hookform/resolvers: adds 6.0.0, older than 6.0.2 on the base branch",
      ],
      copies: ["postcss: adds 8.5.31, older than 8.5.32 on the base branch"],
    });
  });

  it("allows upgrades, an older major a dependency needs, a 0.x minor apart, and any 0.0.x", () => {
    const base = lock(
      "recharts@2.15.4",
      "eventemitter3@5.0.1",
      "zod@0.4.2",
      "nav@0.0.8",
    );
    const head = lock(
      "recharts@3.10.1",
      "eventemitter3@4.0.7",
      "eventemitter3@5.0.1",
      "zod@0.3.9",
      "nav@0.0.5",
    );
    expect(lockfileDowngrades(base, head)).toEqual({
      downgrades: [],
      copies: [],
    });
  });
});
