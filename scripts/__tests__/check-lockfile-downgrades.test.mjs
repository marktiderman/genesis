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
  manifestPins,
  specifierTakes,
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

  /**
   * A lockfile from `importer → { key: version }` plus `snapshot → { dependency: version }`. A
   * version like `foo@1.5.0` is an alias. The lockfile's own specifier is `override` when given
   * (what pnpm writes under an override), else `^version`.
   */
  const workspace = (importers, snapshots = {}, override = {}) =>
    [
      "lockfileVersion: '9.0'",
      "",
      "importers:",
      "",
      ...Object.entries(importers).flatMap(([dir, deps]) => [
        `  ${dir}:`,
        "    dependencies:",
        ...Object.entries(deps).flatMap(([key, version]) => [
          `      ${quote(key)}:`,
          `        specifier: ${override[key] ?? `^${version.replace(/^.*@/, "")}`}`,
          `        version: ${version}`,
        ]),
        "",
      ]),
      "packages:",
      "",
      ...[...Object.values(importers), ...Object.values(snapshots)]
        .flatMap((deps) => Object.entries(deps).map(([key, v]) => (v.includes("@") ? v : `${key}@${v}`)))
        .flatMap((k) => [`  ${quote(k)}:`, "    resolution: {integrity: x}", ""]),
      "snapshots:",
      "",
      ...Object.entries(snapshots).flatMap(([key, deps]) => [
        `  ${quote(key)}:`,
        "    dependencies:",
        ...Object.entries(deps).map(([name, v]) => `      ${quote(name)}: ${v}`),
        "",
      ]),
    ].join("\n");
  /** Each importer's package.json pins, as manifestPins reads them. */
  const pins = (byImporter) => new Map(Object.entries(byImporter).map(([dir, deps]) => [dir, new Map(Object.entries(deps))]));

  it("passes a downgrade the workspace package.json's own pin made in the same diff, and doesn't ask to dedupe it", () => {
    const base = workspace({ "apps/starter": { "@sentry/react-native": "8.35.0", "@shopify/flash-list": "2.3.3" }, "apps/web": { "@shopify/flash-list": "2.3.3" } });
    const head = workspace({ "apps/starter": { "@sentry/react-native": "8.28.1", "@shopify/flash-list": "2.3.2" }, "apps/web": { "@shopify/flash-list": "2.3.3" } });
    const result = lockfileDowngrades(base, head, {
      before: pins({ "apps/starter": { "@sentry/react-native": "~8.35.0", "@shopify/flash-list": "2.3.3" } }),
      after: pins({ "apps/starter": { "@sentry/react-native": "~8.28.0", "@shopify/flash-list": "2.3.2" } }),
    });
    expect(result).toEqual(none);
  });

  it("still fails every downgrade the pin change doesn't cover", () => {
    const failing = (base, head, before, after) => lockfileDowngrades(base, head, { before: pins(before), after: pins(after) }).downgrades;
    // Lockfile only: no pin changed.
    expect(failing(workspace({ "apps/starter": { zod: "4.2.0" } }), workspace({ "apps/starter": { zod: "4.1.0" } }), { "apps/starter": { zod: "^4.0.0" } }, { "apps/starter": { zod: "^4.0.0" } })).toEqual([
      "zod: replaces 4.2.0 with 4.1.0, an older release, for apps/starter",
    ]);
    // Without pins at all (the default): nothing is exempt.
    expect(lockfileDowngrades(workspace({ "apps/starter": { zod: "4.2.0" } }), workspace({ "apps/starter": { zod: "4.1.0" } })).downgrades).toHaveLength(1);
    // The pin changed but still admits the old version, or can't be judged.
    for (const now of ["^4.1.0", ">=4 <4.2"])
      expect(failing(workspace({ "apps/starter": { zod: "4.2.0" } }), workspace({ "apps/starter": { zod: "4.1.0" } }), { "apps/starter": { zod: "^4.0.0" } }, { "apps/starter": { zod: now } })).toHaveLength(1);
    // The pin changed and rejects the old version, but doesn't admit the new one: an override chose it.
    for (const now of ["2.0.0", "^1.3.0", "1.0.0"])
      expect(failing(workspace({ "apps/starter": { bar: "1.2.0" } }), workspace({ "apps/starter": { bar: "1.1.0" } }), { "apps/starter": { bar: "1.2.0" } }, { "apps/starter": { bar: now } })).toEqual([
        "bar: replaces 1.2.0 with 1.1.0, an older release, for apps/starter",
      ]);
    // Nor a prerelease the new pin's range wouldn't take.
    expect(failing(workspace({ "apps/starter": { bar: "1.2.0" } }), workspace({ "apps/starter": { bar: "1.1.5-beta.1" } }), { "apps/starter": { bar: "^1.2.0" } }, { "apps/starter": { bar: "~1.1.0" } })).toEqual([
      "bar: replaces 1.2.0 with 1.1.5-beta.1, an older release, for apps/starter",
    ]);
    // One importer's deliberate pin doesn't hide an even older copy another importer adds.
    expect(
      lockfileDowngrades(workspace({ "apps/starter": { bar: "1.2.0" }, "apps/web": { zod: "4.2.0" } }), workspace({ "apps/starter": { bar: "1.1.0" }, "apps/web": { zod: "4.2.0", bar: "1.0.0" } }), {
        before: pins({ "apps/starter": { bar: "1.2.0" } }),
        after: pins({ "apps/starter": { bar: "1.1.0" } }),
      }),
    ).toEqual({ downgrades: [], copies: ["bar: adds 1.0.0, older than 1.2.0 on the base branch"] });
    // Only an override changed (the lockfile's specifier moves, package.json doesn't).
    expect(
      lockfileDowngrades(workspace({ "apps/starter": { react: "19.3.0" } }, {}, { react: "19.3.0" }), workspace({ "apps/starter": { react: "19.2.0" } }, {}, { react: "19.2.0" }), {
        before: pins({ "apps/starter": { react: "^19.2.5" } }),
        after: pins({ "apps/starter": { react: "^19.2.5" } }),
      }).downgrades,
    ).toEqual(["react: replaces 19.3.0 with 19.2.0, an older release, for apps/starter"]);
    // A snapshot dependent and a second importer that move back beside an exempted pin.
    const base = workspace({ "apps/starter": { bar: "1.2.0" }, "apps/web": { bar: "1.2.0" } }, { "baz@1.0.0": { bar: "1.2.0" } });
    const head = workspace({ "apps/starter": { bar: "1.1.0" }, "apps/web": { bar: "1.1.0" } }, { "baz@1.0.0": { bar: "1.1.0" } });
    expect(failing(base, head, { "apps/starter": { bar: "1.2.0" }, "apps/web": { bar: "^1.0.0" } }, { "apps/starter": { bar: "1.1.0" }, "apps/web": { bar: "^1.0.0" } })).toEqual([
      "bar: replaces 1.2.0 with 1.1.0, an older release, for apps/web, baz@1.0.0",
    ]);
    // An alias edge isn't judged by the direct pin of the package it resolves to.
    expect(
      failing(
        workspace({ "apps/starter": { foo: "2.1.0", "foo-v1": "foo@1.5.0" } }),
        workspace({ "apps/starter": { foo: "2.0.0", "foo-v1": "foo@1.4.0" } }),
        { "apps/starter": { foo: "2.1.0", "foo-v1": "npm:foo@^1.4.0" } },
        { "apps/starter": { foo: "2.0.0", "foo-v1": "npm:foo@^1.4.0" } },
      ),
    ).toEqual(["foo: replaces 2.1.0 with 2.0.0, an older release, for apps/starter", "foo: replaces 1.5.0 with 1.4.0, an older release, for apps/starter"]);
  });

  it("reads each importer's package.json pins, and judges exact, ~ and ^ pins", () => {
    const files = { "package.json": '{"devDependencies":{"vitest":"^5.0.0"}}', "apps/starter/package.json": '{"dependencies":{"react-native":"0.88.1"}}' };
    const read = manifestPins(workspace({ ".": { vitest: "5.1.0" }, "apps/starter": { "react-native": "0.88.1" }, "apps/gone": { x: "1.0.0" } }), (f) => files[f] ?? null);
    expect(read).toEqual(new Map([[".", new Map([["vitest", "^5.0.0"]])], ["apps/starter", new Map([["react-native", "0.88.1"]])]]));
    // A name in two sections with different specs has no one pin, so its downgrade still fails.
    const lock2 = (v) => workspace({ "apps/starter": { bar: v } });
    const manifest = (deps) => (f) => (f === "apps/starter/package.json" ? JSON.stringify({ optionalDependencies: { bar: "^1.0.0" }, dependencies: { bar: deps } }) : null);
    expect(manifestPins(lock2("1.1.0"), manifest("1.1.0")).get("apps/starter").get("bar")).toBeNull();
    expect(
      lockfileDowngrades(lock2("1.2.0"), lock2("1.1.0"), { before: manifestPins(lock2("1.2.0"), manifest("^1.0.0")), after: manifestPins(lock2("1.1.0"), manifest("1.1.0")) }).downgrades,
    ).toEqual(["bar: replaces 1.2.0 with 1.1.0, an older release, for apps/starter"]);
    expect(specifierTakes("2.3.2", "2.3.3")).toBe(false);
    expect(specifierTakes("~8.28.0", "8.35.0")).toBe(false);
    expect(specifierTakes("~8.28.0", "8.28.4")).toBe(true);
    expect(specifierTakes("^4.1.0", "4.2.0")).toBe(true);
    expect(specifierTakes("^0.0.3", "0.0.3")).toBe(true);
    expect(specifierTakes("^0.0.3", "0.0.4")).toBe(false);
    expect(specifierTakes("workspace:^", "1.0.0")).toBeNull();
    // A prerelease only when the pin names one on the same x.y.z, as semver.
    expect(specifierTakes("~1.1.0", "1.1.5-beta.1")).toBe(false);
    expect(specifierTakes("^1.1.0", "1.3.0-rc.0")).toBe(false);
    expect(specifierTakes("^1.1.0-beta.1", "1.1.0-beta.2")).toBe(true);
    expect(specifierTakes("^1.1.0-beta.1", "1.2.0-beta.0")).toBe(false);
    expect(specifierTakes("^1.1.0-beta.1", "1.2.0")).toBe(true);
    expect(specifierTakes("^0.0.3-rc.1", "0.0.3")).toBe(true);
    expect(specifierTakes("^0.0.3-rc.1", "0.0.3-rc.2")).toBe(true);
    expect(specifierTakes("^0.0.3-rc.1", "0.0.4")).toBe(false);
  });
});
