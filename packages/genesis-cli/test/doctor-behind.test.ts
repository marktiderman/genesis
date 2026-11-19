// @feat:doctor-fixes
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { BUILTIN_RULES, runDoctor } from "../src/doctor/index.js";
import { BEHIND_CACHE, customRegistry, distance, firstNewerAt, installedVersions, type RegistryDeps } from "../src/upgrade/registry.js";
import { cleanupApps, makeApp } from "./doctor-helpers.js";

afterAll(cleanupApps);

const UMBRELLA = "@marktiderman/genesis";
const NOW = new Date("2026-11-19T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

function app(installed = "2.3.0"): string {
  return makeApp(null, {
    "package.json": JSON.stringify({ name: "app", dependencies: { [UMBRELLA]: installed } }),
    [`node_modules/${UMBRELLA}/package.json`]: JSON.stringify({ name: UMBRELLA, version: installed }),
    [`node_modules/${UMBRELLA}/dist/versions.json`]: JSON.stringify({ version: installed, packages: {} }),
  });
}

/** The network, stood in: npm's latest and publish times, the bulk advisory endpoint, gh. */
function net(options: { latest: string; times?: Record<string, string>; advisories?: Record<string, unknown[]>; bulkFails?: boolean; gh?: string | null }) {
  const calls = { latest: 0, fetch: 0, gh: 0, bodies: [] as unknown[] };
  const deps: RegistryDeps = {
    now: () => NOW,
    registry: null,
    ci: false,
    latest: () => {
      calls.latest++;
      return options.latest;
    },
    times: () => options.times ?? {},
    fetch: (async (_url: string, init: { body: string }) => {
      calls.fetch++;
      calls.bodies.push(JSON.parse(init.body));
      if (options.bulkFails) return new Response("no", { status: 503 });
      return new Response(JSON.stringify(options.advisories ?? {}), { status: 200 });
    }) as unknown as typeof fetch,
    gh: async () => {
      calls.gh++;
      return options.gh ?? null;
    },
  };
  return { deps, calls };
}

async function behind(root: string, deps: RegistryDeps, extra: { strict?: boolean; network?: boolean } = {}) {
  const result = await runDoctor({ root, config: {}, network: extra.network ?? true, registry: deps, ...(extra.strict ? { strict: true } : {}) });
  return { result, found: result.findings.filter((f) => f.rule === "genesis-behind") };
}

describe("genesis-behind", () => {
  it("is a built-in rule", () => expect(BUILTIN_RULES).toContain("genesis-behind"));

  it("measures the distance", () => {
    expect(distance("2.3.0", "2.3.0")).toEqual({ kind: "current" });
    expect(distance("2.3.0", "2.3.4")).toEqual({ kind: "patch" });
    expect(distance("2.3.0", "2.5.1")).toEqual({ kind: "minor", minors: 2 });
    expect(distance("2.3.0", "3.0.0")).toEqual({ kind: "major", majors: 1 });
    expect(distance("2.4.0", "2.3.0")).toEqual({ kind: "current" });
    expect(firstNewerAt({ "2.3.0": daysAgo(200), "2.3.1": daysAgo(100), "2.4.0-beta.1": daysAgo(150), "2.4.0": daysAgo(10) }, "2.3.0")).toBe(daysAgo(100));
  });

  it("a patch behind is info", async () => {
    const { found, result } = await behind(app(), net({ latest: "2.3.2", times: { "2.3.1": daysAgo(5) } }).deps, { strict: true });
    expect(found.map((f) => [f.level, f.message])).toEqual([["info", expect.stringContaining("(a patch behind, behind for 5 days)")]]);
    expect(result.ok).toBe(true);
    expect(found[0]?.fix).toMatchObject({ id: "upgrade.release", kind: "auto" });
  });

  it("one or two minors behind warns, but never fails --strict", async () => {
    const deps = net({ latest: "2.5.0", times: { "2.4.0": daysAgo(20) } }).deps;
    expect((await behind(app(), deps)).found.map((f) => f.level)).toEqual(["warn"]);
    const strict = await behind(app(), deps, { strict: true });
    expect(strict.found.map((f) => f.level)).toEqual(["info"]);
    expect(strict.result.ok).toBe(true);
  });

  it.each([
    ["more than two minors", "2.6.0", { "2.4.0": daysAgo(20) }, /3 minor releases behind/],
    ["a major", "3.0.0", { "3.0.0": daysAgo(3) }, /1 major release behind/],
    ["a patch, but for 90 days", "2.3.1", { "2.3.1": daysAgo(95) }, /behind for 95 days/],
  ])("%s warns and fails --strict", async (_what, latest, times, message) => {
    const { found, result } = await behind(app(), net({ latest, times }).deps, { strict: true });
    expect(found.map((f) => f.level)).toEqual(["warn"]);
    expect(found[0]?.message).toMatch(message);
    expect(result.ok).toBe(false);
  });

  it("an advisory on an installed version is an error with its id, read from npm's bulk endpoint", async () => {
    const { deps, calls } = net({
      latest: "2.3.0",
      advisories: { [UMBRELLA]: [{ id: 1099, url: "https://github.com/advisories/GHSA-abcd-1234-wxyz", title: "Prototype pollution", severity: "high", vulnerable_versions: "<2.3.1" }] },
    });
    const { found, result } = await behind(app(), deps);
    expect(found.map((f) => [f.level, f.subject])).toEqual([["error", "GHSA-abcd-1234-wxyz"]]);
    expect(found[0]?.message).toContain(`${UMBRELLA}@2.3.0 is affected by GHSA-abcd-1234-wxyz (high): Prototype pollution`);
    expect(result.ok).toBe(false);
    // Every installed Genesis package is asked about, at its exact version.
    expect(calls.bodies[0]).toMatchObject({ [UMBRELLA]: ["2.3.0"], "@marktiderman/genesis-ui": [expect.any(String)] });
  });

  it("falls back to gh's advisory database when the bulk endpoint fails", async () => {
    const gh = JSON.stringify([{ ghsa_id: "GHSA-zzzz-0000-yyyy", summary: "Path traversal", severity: "moderate", html_url: "https://github.com/advisories/GHSA-zzzz-0000-yyyy", vulnerabilities: [{ package: { name: UMBRELLA }, vulnerable_version_range: "< 2.3.1" }] }]);
    const { deps, calls } = net({ latest: "2.3.0", bulkFails: true, gh });
    const { found } = await behind(app(), deps);
    expect(calls.gh).toBeGreaterThan(0);
    // Moderate: a warning; only high and critical advisories are errors.
    // (The stand-in answers the same for every installed package, and each is reported.)
    const hits = found.filter((f) => f.subject === "GHSA-zzzz-0000-yyyy");
    expect(hits.length).toBeGreaterThan(0);
    expect(new Set(hits.map((f) => f.level))).toEqual(new Set(["warn"]));
  });

  it("caches for 24 hours: a second run asks nothing and still reports at full level", async () => {
    const root = app();
    const first = net({ latest: "3.0.0", times: { "3.0.0": daysAgo(1) } });
    await behind(root, first.deps);
    expect(existsSync(path.join(root, BEHIND_CACHE))).toBe(true);
    const second = net({ latest: "9.9.9" });
    const { found } = await behind(root, second.deps);
    expect(second.calls).toMatchObject({ latest: 0, fetch: 0 });
    expect(found.map((f) => f.level)).toEqual(["warn"]);
    expect(found[0]?.message).toContain("the latest is 3.0.0");
    // A day later it asks again.
    const later = net({ latest: "3.0.1" });
    await behind(root, { ...later.deps, now: () => new Date(NOW.getTime() + 25 * 3_600_000) });
    expect(later.calls.latest).toBe(1);
  });

  it("offline: nothing without a cache; with one, a single info finding, never an error", async () => {
    const root = app();
    const { deps, calls } = net({ latest: "3.0.0" });
    expect((await behind(root, deps, { network: false })).found).toEqual([]);
    expect(calls.latest).toBe(0);
    mkdirSync(path.dirname(path.join(root, BEHIND_CACHE)), { recursive: true });
    const cache = { checkedAt: daysAgo(3), installed: "2.3.0", packages: installedVersions(root), latest: "3.0.0", firstNewerAt: daysAgo(100), advisories: [{ id: "GHSA-1", package: UMBRELLA, version: "2.3.0", title: "t", severity: "high" }] };
    writeFileSync(path.join(root, BEHIND_CACHE), JSON.stringify(cache));
    const { found, result } = await behind(root, deps, { network: false, strict: true });
    expect(found.map((f) => f.level)).toEqual(["info"]);
    expect(found[0]?.message).toMatch(/not checked now \(the network is off\); as of .*the latest was 3\.0\.0.*1 advisory affected the installed versions \(GHSA-1\)/);
    expect(result.ok).toBe(true);
  });

  it("the network failing falls back to the cache's info, never an error", async () => {
    const root = app();
    const deps: RegistryDeps = { now: () => NOW, registry: null, latest: () => {
      throw new Error("ENOTFOUND registry.npmjs.org");
    } };
    expect((await behind(root, deps)).found).toEqual([]);
  });

  it("is off by default (the Vite plugin, tests): no network call", async () => {
    const { deps, calls } = net({ latest: "3.0.0" });
    await runDoctor({ root: app(), config: {}, registry: deps });
    expect(calls).toMatchObject({ latest: 0, fetch: 0, gh: 0 });
  });

  it("an app without the umbrella isn't checked", async () => {
    const root = makeApp(null, { "package.json": JSON.stringify({ name: "app" }) });
    const { deps, calls } = net({ latest: "3.0.0" });
    expect((await behind(root, deps)).found).toEqual([]);
    expect(calls.latest).toBe(0);
  });

  it("in CI, a distance never fails a run, --strict included; advisories keep their levels", async () => {
    const far = net({ latest: "4.0.0", times: { "3.0.0": daysAgo(200) }, advisories: { [UMBRELLA]: [{ id: 7, url: "https://github.com/advisories/GHSA-crit-0000-0000", title: "RCE", severity: "critical" }] } });
    const { found, result } = await behind(app(), { ...far.deps, ci: true }, { strict: true });
    expect(found.map((f) => [f.level, f.subject])).toEqual([["error", "GHSA-crit-0000-0000"], ["info", UMBRELLA]]);
    expect(result.ok).toBe(false);
    const quiet = net({ latest: "4.0.0" });
    const ci = await behind(app(), { ...quiet.deps, ci: true }, { strict: true });
    expect(ci.result.ok).toBe(true);
    expect((await behind(app(), { ...quiet.deps, ci: true })).found.map((f) => f.level)).toEqual(["warn"]);
  });

  it("switched off (rules), or doctor.network: false, makes no call", async () => {
    const { deps, calls } = net({ latest: "3.0.0" });
    const off = await runDoctor({ root: app(), config: { rules: { "genesis-behind": "off" } }, network: true, registry: deps });
    expect(off.findings.filter((f) => f.rule === "genesis-behind")).toEqual([]);
    await runDoctor({ root: app(), config: { network: false }, network: true, registry: deps });
    expect(calls).toMatchObject({ latest: 0, fetch: 0, gh: 0 });
  });

  it("caches a failure for an hour", async () => {
    const root = app();
    let asked = 0;
    const failing: RegistryDeps = { now: () => NOW, registry: null, latest: () => {
      asked++;
      throw new Error("ETIMEDOUT");
    } };
    await behind(root, failing);
    await behind(root, failing);
    expect(asked).toBe(1);
    await behind(root, { ...failing, now: () => new Date(NOW.getTime() + 61 * 60_000) });
    expect(asked).toBe(2);
  });

  it("asks only gh when Genesis installs from another registry, and leaves out withdrawn advisories", async () => {
    const gh = JSON.stringify([
      { ghsa_id: "GHSA-live-0000-0000", summary: "x", severity: "high", withdrawn_at: null },
      { ghsa_id: "GHSA-gone-0000-0000", summary: "y", severity: "high", withdrawn_at: "2026-01-01T00:00:00Z" },
    ]);
    const { deps, calls } = net({ latest: "2.3.0", gh });
    const { found } = await behind(app(), { ...deps, registry: "https://npm.example.com/" });
    expect(calls.fetch).toBe(0);
    expect([...new Set(found.map((f) => f.subject))]).toEqual(["GHSA-live-0000-0000"]);
  });

  it("gives the whole check one deadline", async () => {
    const { deps } = net({ latest: "2.3.0", bulkFails: true });
    const started = Date.now();
    const { found } = await behind(app(), { ...deps, deadlineMs: 1_500, gh: () => new Promise(() => {}) });
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(found).toEqual([]);
  });

  it("reads the registry from .npmrc", () => {
    const root = makeApp(null, { ".npmrc": "@marktiderman:registry=https://npm.pkg.github.com\n" });
    expect(customRegistry(root, {}, "/nonexistent")).toBe("https://npm.pkg.github.com");
    expect(customRegistry(makeApp(null, { ".npmrc": "registry=https://registry.npmjs.org/\n" }), {}, "/nonexistent")).toBe(null);
  });
});
