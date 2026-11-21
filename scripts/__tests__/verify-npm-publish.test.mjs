import { describe, expect, it } from "vitest";
import { join } from "node:path";
import {
  ISSUE_MARKER,
  backoff,
  compareVersions,
  dedupe,
  highestStable,
  issueBody,
  judge,
  localPackages,
  parseArgs,
  parsePublished,
  summaryTable,
  syncIssue,
  verify,
} from "../verify-npm-publish.mjs";

/** A fake registry: { name: { versions: [...], latest } }, read through fetch's shape. */
function fakeRegistry(state) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const path = decodeURIComponent(new URL(url).pathname.slice(1));
    const json = (status, body) => ({ status, ok: status < 400, json: async () => body });
    for (const [name, pkg] of Object.entries(state)) {
      if (pkg.throws) throw new Error("socket hang up");
      if (path === name) {
        return json(200, { "dist-tags": { latest: pkg.latest }, versions: Object.fromEntries(pkg.versions.map((v) => [v, {}])) });
      }
      if (path.startsWith(`${name}/`)) {
        const v = path.slice(name.length + 1);
        return pkg.versions.includes(v) ? json(200, { name, version: v }) : json(404, { error: "not found" });
      }
    }
    return json(404, { error: "not found" });
  };
  return { fetchImpl, calls };
}

const clock = () => {
  let t = 0;
  return { now: () => t, sleep: async (ms) => { t += ms; } };
};

describe("versions", () => {
  it("orders releases, prereleases below their release", () => {
    expect(["1.10.0", "1.2.0", "1.2.0-beta.2", "1.2.0-beta.10", "0.9.9"].sort(compareVersions)).toEqual([
      "0.9.9", "1.2.0-beta.2", "1.2.0-beta.10", "1.2.0", "1.10.0",
    ]);
  });

  it("finds the highest non-prerelease, ignoring 0.0.0-stage", () => {
    expect(highestStable(["0.0.0-stage", "0.6.0", "0.7.0", "0.8.0-next.1"])).toBe("0.7.0");
    expect(highestStable(["1.0.0-rc.1"])).toBeNull();
  });
});

describe("inputs", () => {
  it("reads changesets/action's publishedPackages", () => {
    expect(parsePublished('[{"name":"@a/b","version":"1.0.0"}]')).toEqual([{ name: "@a/b", version: "1.0.0" }]);
    expect(parsePublished("")).toEqual([]);
    expect(parsePublished(undefined)).toEqual([]);
    expect(() => parsePublished('[{"name":"@a/b"}]')).toThrow(/without a name and version/);
    expect(() => parsePublished('{"name":"@a/b"}')).toThrow(/not a JSON array/);
  });

  it("lists this repo's public packages", () => {
    const local = localPackages(join(import.meta.dirname, "../.."));
    expect(local.length).toBeGreaterThan(10);
    expect(local.find((p) => p.name === "@marktiderman/genesis-cli")?.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("drops repeats", () => {
    expect(dedupe([{ name: "a", version: "1" }, { name: "a", version: "1" }, { name: "a", version: "2" }])).toHaveLength(2);
  });

  it("parses modes and flags", () => {
    expect(parseArgs(["published"])).toMatchObject({ mode: "published", local: false, timeoutMinutes: 30, issue: false });
    expect(parseArgs(["drift", "--timeout", "5", "--issue"])).toMatchObject({ mode: "drift", local: true, timeoutMinutes: 5, issue: true });
    expect(() => parseArgs(["nope"])).toThrow(/usage/);
    expect(() => parseArgs(["published", "--timeout", "x"])).toThrow(/minutes/);
  });
});

describe("judge", () => {
  const pkg = { name: "@a/b", version: "0.7.0" };
  it("flags a version npm doesn't have", () => {
    expect(judge("published", pkg, { exists: false, latest: "0.6.0", versions: ["0.6.0"], error: null })).toBe("0.7.0 is not on npm");
  });
  it("flags latest left behind on the highest version", () => {
    expect(judge("published", pkg, { exists: true, latest: "0.6.0", versions: ["0.6.0", "0.7.0"], error: null })).toBe("latest is 0.6.0, not 0.7.0");
  });
  it("doesn't need latest for an older line's patch when publishing", () => {
    expect(judge("published", { name: "@a/b", version: "0.6.1" }, { exists: true, latest: "0.7.0", versions: ["0.6.1", "0.7.0"], error: null })).toBeNull();
  });
  it("needs latest to be main's version when checking drift", () => {
    expect(judge("drift", { name: "@a/b", version: "0.6.1" }, { exists: true, latest: "0.7.0", versions: ["0.6.1", "0.7.0"], error: null })).toBe("latest is 0.7.0, not 0.6.1");
  });
  it("doesn't need latest for a prerelease", () => {
    expect(judge("drift", { name: "@a/b", version: "1.0.0-rc.1" }, { exists: true, latest: "0.7.0", versions: ["1.0.0-rc.1"], error: null })).toBeNull();
  });
  it("reports a registry it couldn't read", () => {
    expect(judge("published", pkg, { exists: false, latest: null, versions: [], error: "timeout" })).toMatch(/couldn't read the registry/);
  });
});

describe("verify", () => {
  it("passes at once when everything is there", async () => {
    const { fetchImpl } = fakeRegistry({ "@a/one": { versions: ["1.0.0", "1.1.0"], latest: "1.1.0" } });
    const results = await verify([{ name: "@a/one", version: "1.1.0" }], { mode: "published", timeoutMs: 60_000, fetchImpl, ...clock() });
    expect(results).toEqual([{ name: "@a/one", version: "1.1.0", latest: "1.1.0", problem: null }]);
  });

  it("waits for a lagging version and only re-reads the ones still wrong", async () => {
    const state = { "@a/slow": { versions: ["1.0.0"], latest: "1.0.0" }, "@a/fast": { versions: ["2.0.0"], latest: "2.0.0" } };
    const { fetchImpl, calls } = fakeRegistry(state);
    const c = clock();
    const sleep = async (ms) => {
      await c.sleep(ms);
      if (c.now() >= 45_000) Object.assign(state["@a/slow"], { versions: ["1.0.0", "1.1.0"], latest: "1.1.0" });
    };
    const results = await verify(
      [{ name: "@a/slow", version: "1.1.0" }, { name: "@a/fast", version: "2.0.0" }],
      { mode: "published", timeoutMs: 30 * 60_000, fetchImpl, now: c.now, sleep },
    );
    expect(results.every((r) => r.problem === null)).toBe(true);
    expect(c.now()).toBe(45_000); // 15s, then 30s
    expect(calls.filter((u) => u.includes("fast")).length).toBe(2); // one round only
  });

  it("gives up at the deadline and names what is still wrong", async () => {
    const { fetchImpl } = fakeRegistry({
      "@a/cli": { versions: ["1.31.0"], latest: "1.31.0" },
      "@a/server": { versions: ["0.6.0", "0.7.0"], latest: "0.6.0" },
      "@a/ok": { versions: ["0.5.0"], latest: "0.5.0" },
    });
    const c = clock();
    const results = await verify(
      [{ name: "@a/cli", version: "1.32.0" }, { name: "@a/server", version: "0.7.0" }, { name: "@a/ok", version: "0.5.0" }],
      { mode: "published", timeoutMs: 30 * 60_000, fetchImpl, ...c },
    );
    expect(results.map((r) => r.problem)).toEqual(["1.32.0 is not on npm", "latest is 0.6.0, not 0.7.0", null]);
    expect(c.now()).toBeLessThanOrEqual(30 * 60_000);
    expect(c.now()).toBeGreaterThan(25 * 60_000);
  });

  it("treats a network failure as worth retrying, and reports it at the end", async () => {
    const { fetchImpl } = fakeRegistry({ "@a/x": { versions: [], latest: null, throws: true } });
    const results = await verify([{ name: "@a/x", version: "1.0.0" }], { mode: "drift", timeoutMs: 0, fetchImpl, ...clock() });
    expect(results[0].problem).toMatch(/couldn't read the registry \(socket hang up\)/);
  });

  it("backs off to two minutes", () => {
    expect([0, 1, 2, 3, 4, 9].map(backoff)).toEqual([15_000, 30_000, 60_000, 120_000, 120_000, 120_000]);
  });
});

describe("reporting", () => {
  const results = [
    { name: "@a/ok", version: "1.0.0", latest: "1.0.0", problem: null },
    { name: "@a/cli", version: "1.32.0", latest: "1.31.0", problem: "1.32.0 is not on npm" },
  ];

  it("puts problems first in the summary", () => {
    const table = summaryTable(results).split("\n");
    expect(table[2]).toContain("@a/cli");
    expect(table[2]).toContain("**1.32.0 is not on npm**");
    expect(table[3]).toContain("| ok |");
  });

  it("writes an issue body with the marker, each problem and the run", () => {
    const body = issueBody({ mode: "published", results, runUrl: "https://github.com/o/r/actions/runs/1" });
    expect(body.startsWith(ISSUE_MARKER)).toBe(true);
    expect(body).toContain("| @a/cli | 1.32.0 | 1.32.0 is not on npm |");
    expect(body).not.toContain("@a/ok");
    expect(body).toContain("actions/runs/1");
  });
});

describe("syncIssue", () => {
  function fakeGitHub(openIssues) {
    const calls = [];
    const fetchImpl = async (url, init) => {
      const path = new URL(url).pathname.replace("/repos/o/r", "");
      calls.push({ method: init.method, path, body: init.body ? JSON.parse(init.body) : undefined });
      const reply = (status, body) => ({ status, ok: status < 400, text: async () => JSON.stringify(body) });
      if (init.method === "GET") return reply(200, openIssues);
      if (path === "/labels") return reply(422, {});
      if (path === "/issues") return reply(201, { number: 42 });
      return reply(200, {});
    };
    return { fetchImpl, calls };
  }
  const bad = [{ name: "@a/cli", version: "1.32.0", latest: "1.31.0", problem: "1.32.0 is not on npm" }];
  const good = [{ name: "@a/cli", version: "1.32.0", latest: "1.32.0", problem: null }];

  it("opens a labelled issue when none is open", async () => {
    const { fetchImpl, calls } = fakeGitHub([]);
    expect(await syncIssue({ fetchImpl, token: "t", repo: "o/r", mode: "published", results: bad, runUrl: "u" })).toEqual({ action: "created", number: 42 });
    const create = calls.find((c) => c.method === "POST" && c.path === "/issues");
    expect(create.body.labels).toEqual(["release"]);
    expect(create.body.body).toContain("@a/cli");
  });

  it("updates the open one instead of opening another, ignoring other release issues and PRs", async () => {
    const { fetchImpl, calls } = fakeGitHub([
      { number: 3, body: "someone else's release issue" },
      { number: 4, body: ISSUE_MARKER, pull_request: {} },
      { number: 7, body: `${ISSUE_MARKER}\nold` },
    ]);
    expect(await syncIssue({ fetchImpl, token: "t", repo: "o/r", mode: "drift", results: bad, runUrl: "u" })).toEqual({ action: "updated", number: 7 });
    expect(calls.some((c) => c.method === "POST" && c.path === "/issues")).toBe(false);
    expect(calls.find((c) => c.method === "PATCH").path).toBe("/issues/7");
  });

  it("leaves it open after a clean publish check, which saw only some packages", async () => {
    const { fetchImpl, calls } = fakeGitHub([{ number: 7, body: ISSUE_MARKER }]);
    expect(await syncIssue({ fetchImpl, token: "t", repo: "o/r", mode: "published", results: good, runUrl: "u" })).toEqual({ action: "none" });
    expect(calls.filter((c) => c.method !== "GET")).toEqual([]);
  });

  it("closes the open one on a clean drift run, and does nothing when there is none", async () => {
    const open = fakeGitHub([{ number: 7, body: ISSUE_MARKER }]);
    expect(await syncIssue({ fetchImpl: open.fetchImpl, token: "t", repo: "o/r", mode: "drift", results: good, runUrl: "u" })).toEqual({ action: "closed", number: 7 });
    expect(open.calls.find((c) => c.method === "PATCH").body.state).toBe("closed");
    const none = fakeGitHub([]);
    expect(await syncIssue({ fetchImpl: none.fetchImpl, token: "t", repo: "o/r", mode: "drift", results: good, runUrl: "u" })).toEqual({ action: "none" });
  });
});

describe("an empty published list after a publish", () => {
  it("parses --expect-some", () => {
    expect(parseArgs(["published", "--expect-some"]).expectSome).toBe(true);
    expect(parseArgs(["published"]).expectSome).toBeUndefined();
  });

  it("fails instead of passing with nothing checked", async () => {
    const { spawnSync } = await import("node:child_process");
    const script = join(import.meta.dirname, "..", "verify-npm-publish.mjs");
    const env = { ...process.env, PUBLISHED_PACKAGES: "", GITHUB_STEP_SUMMARY: "", GITHUB_TOKEN: "" };
    const strict = spawnSync(process.execPath, [script, "published", "--timeout", "0", "--expect-some"], { env, encoding: "utf8" });
    expect(strict.status).toBe(1);
    expect(strict.stdout + strict.stderr).toMatch(/refusing to pass/);
    const lenient = spawnSync(process.execPath, [script, "published", "--timeout", "0"], { env, encoding: "utf8" });
    expect(lenient.status).toBe(0);
  });
});
