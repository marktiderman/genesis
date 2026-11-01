/**
 * scripts/check-lockfile-downgrades.mjs: a dependent moved to an older compatible version is a
 * downgrade, an older copy beside a newer one is reported apart, and raising every copy, a new
 * major, a copy left behind by a dependent's new major, or a newer version is fine.
 */
import { describe, expect, it } from "vitest";
import {
  compare,
  lockedEdges,
  lockfileDowngrades,
  lockedVersions,
} from "../check-lockfile-downgrades.mjs";

const quote = (key) => (key.startsWith("@") ? `'${key}'` : key);

/**
 * A pnpm 9 lockfile from `dependent → { dependency: version }`: a dependent with an `@` version
 * is a package in `snapshots`, any other a workspace path in `importers`. Every resolved version,
 * and each of `extra`, is listed under `packages`.
 */
const lock = (graph, extra = []) => {
  const importers = Object.entries(graph).filter(([d]) => !d.includes("@", 1));
  const snapshots = Object.entries(graph).filter(([d]) => d.includes("@", 1));
  const keys = new Set([
    ...Object.values(graph).flatMap((deps) =>
      Object.entries(deps)
        .filter(([, v]) => /^\d/.test(v))
        .map(([name, v]) => `${name}@${v.split("(")[0]}`),
    ),
    ...extra,
  ]);
  return [
    "lockfileVersion: '9.0'",
    "",
    "importers:",
    "",
    ...importers.flatMap(([path, deps]) => [
      `  ${path}:`,
      "    dependencies:",
      ...Object.entries(deps).flatMap(([name, v]) => [
        `      ${quote(name)}:`,
        `        specifier: ^${v.split("(")[0]}`,
        `        version: ${v}`,
      ]),
      "",
    ]),
    "packages:",
    "",
    ...[...keys].flatMap((k) => [
      `  ${quote(k)}:`,
      "    resolution: {integrity: x}",
      "",
    ]),
    "snapshots:",
    "",
    ...snapshots.flatMap(([key, deps]) => [
      `  ${quote(key)}:`,
      "    dependencies:",
      ...Object.entries(deps).map(([name, v]) => `      ${quote(name)}: ${v}`),
      "",
    ]),
  ].join("\n");
};

const none = { downgrades: [], copies: [] };

describe("check-lockfile-downgrades", () => {
  it("reads scoped, quoted and prerelease keys from the packages section only", () => {
    const versions = lockedVersions(
      lock({ "ignored@9.9.9": { other: "1.0.0" } }, [
        "@hookform/resolvers@6.0.2",
        "postcss@8.5.32",
        "next@16.0.0-rc.1",
      ]),
    );
    expect([...versions.keys()]).toEqual([
      "other",
      "@hookform/resolvers",
      "postcss",
      "next",
    ]);
    expect([...versions.get("next")]).toEqual(["16.0.0-rc.1"]);
  });

  it("reads what each dependent resolves, without peers, links or alias names", () => {
    const edges = lockedEdges(
      lock({
        "apps/sample": {
          "@hookform/resolvers": "6.0.2(react-hook-form@7.0.0)",
          "@acme/core": "link:../../packages/core",
        },
        "cliui@8.0.1(peer@1.0.0)": { "string-width-cjs": "string-width@4.2.3" },
      }),
    );
    expect(edges).toEqual(
      new Map([
        ["apps/sample", new Map([["@hookform/resolvers", new Set(["6.0.2"])]])],
        ["cliui@8.0.1", new Map([["string-width", new Set(["4.2.3"])]])],
      ]),
    );
  });

  it("tells a dependent moved back from an added older copy in the same range", () => {
    const base = lock({
      "apps/sample": { "@hookform/resolvers": "6.0.2(react-hook-form@7.0.0)" },
      "vite@8.3.5": { postcss: "8.5.32" },
    });
    const head = lock({
      "apps/sample": { "@hookform/resolvers": "6.0.0(react-hook-form@7.0.0)" },
      "vite@8.3.5": { postcss: "8.5.32" },
      "postcss-nested@6.2.0": { postcss: "8.5.31" },
    });
    expect(lockfileDowngrades(base, head)).toEqual({
      downgrades: [
        "@hookform/resolvers: replaces 6.0.2 with 6.0.0, an older release, for apps/sample",
      ],
      copies: ["postcss: adds 8.5.31, older than 8.5.32 on the base branch"],
    });
  });

  it("allows upgrades, an older major a dependency needs, a 0.x minor apart, and any 0.0.x", () => {
    const base = lock({
      ".": {
        recharts: "2.15.4",
        eventemitter3: "5.0.1",
        zod: "0.4.2",
        nav: "0.0.8",
      },
    });
    const head = lock({
      ".": {
        recharts: "3.10.1",
        eventemitter3: "5.0.1",
        zod: "0.3.9",
        nav: "0.0.5",
      },
      "http-proxy@1.18.1": { eventemitter3: "4.0.7" },
    });
    expect(lockfileDowngrades(base, head)).toEqual(none);
  });

  it("allows a security bump that raises every copy, though a raised one sits below another's base", () => {
    const base = lock({
      "express@4.22.2": { qs: "6.15.3" },
      "body-parser@1.20.9": { qs: "6.16.1" },
    });
    const head = lock({
      "express@4.22.2": { qs: "6.15.4" },
      "body-parser@1.20.9": { qs: "6.16.2" },
      ".": { qs: "6.17.0" },
    });
    expect(lockfileDowngrades(base, head)).toEqual(none);
  });

  it("fails when the newer of two copies goes and its dependent gets the older one", () => {
    const base = lock({
      ".": { foo: "1.2.3" },
      "bar@2.0.0": { foo: "1.2.0" },
    });
    const head = lock({
      ".": { foo: "1.2.0" },
      "bar@2.0.0": { foo: "1.2.0" },
    });
    expect(lockfileDowngrades(base, head)).toEqual({
      downgrades: ["foo: replaces 1.2.3 with 1.2.0, an older release, for ."],
      copies: [],
    });
  });

  it("allows an older pinned copy left behind when the newer one's dependent takes a new major", () => {
    // express 4 → 5 takes finalhandler 2; connect still pins finalhandler 1.1.2.
    const base = lock({
      "express@4.22.2": { finalhandler: "1.3.2" },
      "connect@3.7.0": { finalhandler: "1.1.2" },
      "finalhandler@1.1.2": { "on-finished": "2.3.0" },
      "finalhandler@1.3.2": { "on-finished": "2.4.1" },
    });
    const head = lock({
      "express@5.3.0": { finalhandler: "2.1.1" },
      "connect@3.7.0": { finalhandler: "1.1.2" },
      "finalhandler@1.1.2": { "on-finished": "2.3.0" },
      "finalhandler@2.1.1": { "on-finished": "2.4.1" },
    });
    expect(lockfileDowngrades(base, head)).toEqual(none);
  });

  it("ignores a peer's version when one of a package's peer variants goes", () => {
    const raw = (variants) =>
      [
        "lockfileVersion: '9.0'",
        "",
        "packages:",
        "",
        "  core@1.10.0:",
        "    resolution: {integrity: x}",
        "",
        "  core@1.11.0:",
        "    resolution: {integrity: x}",
        "",
        "  wasm@1.2.2:",
        "    resolution: {integrity: x}",
        "    peerDependencies:",
        "      core: ^1.7.1",
        "",
        "snapshots:",
        "",
        "  core@1.10.0: {}",
        "",
        "  core@1.11.0: {}",
        "",
        ...variants.flatMap((v) => [
          `  wasm@1.2.2(core@${v}):`,
          "    dependencies:",
          `      core: ${v}`,
          "",
        ]),
      ].join("\n");
    expect(
      lockfileDowngrades(raw(["1.10.0", "1.11.0"]), raw(["1.10.0"])),
    ).toEqual({ downgrades: [], copies: [] });
  });

  it("orders prereleases by semver precedence, not as text", () => {
    expect(compare("1.0.0-rc.9", "1.0.0-rc.10")).toBeLessThan(0);
    expect(compare("1.0.0-beta.2", "1.0.0-beta.11")).toBeLessThan(0);
    expect(compare("1.0.0-1", "1.0.0-alpha")).toBeLessThan(0);
    expect(compare("1.0.0-alpha", "1.0.0-alpha.1")).toBeLessThan(0);
    expect(compare("1.0.0-rc.1", "1.0.0")).toBeLessThan(0);
    // Everything after the first "-" is the prerelease; "+build" metadata never counts.
    expect(compare("1.0.0-x-y.2", "1.0.0-x-y.10")).toBeLessThan(0);
    expect(compare("1.0.0+b2", "1.0.0+b1")).toBe(0);
    expect(compare("1.0.1+b1", "1.0.0+b2")).toBeGreaterThan(0);
    const base = lock({ ".": { next: "16.0.0-rc.9", react: "19.0.0-beta.2" } });
    const head = lock({
      ".": { next: "16.0.0-rc.10", react: "19.0.0-beta.11" },
    });
    expect(lockfileDowngrades(base, head)).toEqual(none);
  });
});
