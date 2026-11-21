#!/usr/bin/env node
// Checks that what Release says it published is really on npm, and that main and npm agree.
//
// A publish can report success and still not be there: on 2026-11-21 four of sixteen
// "Successfully published" versions were missing from the registry for over ten minutes, and one
// package was published while its `latest` dist-tag stayed on the previous version. This script
// reads the registry itself, so nobody has to check by hand.
//
//   node scripts/verify-npm-publish.mjs published [--local] [--timeout <minutes>] [--issue]
//     Each package changesets/action published (PUBLISHED_PACKAGES, its `publishedPackages`
//     output: JSON [{ name, version }]), plus with --local every public package's version on this
//     checkout (the "Publish versions already on main" path, which changesets/action doesn't see).
//     Polls until every version exists and, when it is the package's highest non-prerelease,
//     `latest` points at it. Default timeout 30 minutes, with backoff.
//
//   node scripts/verify-npm-publish.mjs drift [--timeout <minutes>] [--issue]
//     Every public package's version on this checkout against npm: the version exists and
//     `latest` is it. One pass by default.
//
//   --packages '<json>'  instead of PUBLISHED_PACKAGES.
//   --issue              on a problem, open (or update) one GitHub issue labelled `release`; on a
//                        clean drift run, close it. Needs GITHUB_TOKEN (issues: write) and
//                        GITHUB_REPOSITORY.
//
// Writes a table to GITHUB_STEP_SUMMARY when set. Exits 1 when anything is missing or mistagged.
// Read-only against npm; no dependencies.
import { readdirSync, readFileSync, appendFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const REGISTRY = "https://registry.npmjs.org";
export const ISSUE_MARKER = "<!-- verify-npm-publish -->";
export const ISSUE_LABEL = "release";
export const ISSUE_TITLE = "npm: released packages missing or mistagged";
const FETCH_TIMEOUT_MS = 15_000;

// ── semver, just enough ────────────────────────────────────────────────────────

/** Parses x.y.z[-pre][+build]; null when it isn't one. */
export function parseVersion(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(String(v).trim());
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] ? m[4].split(".") : [] };
}

export function isPrerelease(v) {
  const p = parseVersion(v);
  return !p || p.pre.length > 0;
}

/** Negative, zero or positive, like a sort comparator. Unparseable versions sort lowest. */
export function compareVersions(a, b) {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return (x ? 1 : 0) - (y ? 1 : 0);
  for (const k of ["major", "minor", "patch"]) if (x[k] !== y[k]) return x[k] - y[k];
  if (!x.pre.length || !y.pre.length) return (x.pre.length ? -1 : 0) - (y.pre.length ? -1 : 0);
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    if (x.pre[i] === undefined) return -1;
    if (y.pre[i] === undefined) return 1;
    const an = /^\d+$/.test(x.pre[i]);
    const bn = /^\d+$/.test(y.pre[i]);
    if (an && bn && +x.pre[i] !== +y.pre[i]) return +x.pre[i] - +y.pre[i];
    if (an !== bn) return an ? -1 : 1;
    if (x.pre[i] !== y.pre[i]) return x.pre[i] < y.pre[i] ? -1 : 1;
  }
  return 0;
}

/** The highest non-prerelease version in the list, or null. */
export function highestStable(versions) {
  return versions.filter((v) => !isPrerelease(v)).sort(compareVersions).at(-1) ?? null;
}

// ── inputs ─────────────────────────────────────────────────────────────────────

/** changesets/action's publishedPackages output (JSON [{ name, version }]); "" or missing is []. */
export function parsePublished(text) {
  if (text === undefined || text === null || String(text).trim() === "") return [];
  const list = JSON.parse(text);
  if (!Array.isArray(list)) throw new Error("publishedPackages is not a JSON array");
  return list.map((p) => {
    if (!p || typeof p.name !== "string" || typeof p.version !== "string") {
      throw new Error(`publishedPackages entry without a name and version: ${JSON.stringify(p)}`);
    }
    return { name: p.name, version: p.version };
  });
}

/** Every public packages/<dir>/package.json as { name, version }. */
export function localPackages(root) {
  const dir = join(root, "packages");
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = join(dir, entry.name, "package.json");
    if (!existsSync(file)) continue;
    const pkg = JSON.parse(readFileSync(file, "utf8"));
    if (pkg.private === true || !pkg.name || !pkg.version) continue;
    out.push({ name: pkg.name, version: pkg.version });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** One entry per name@version, in first-seen order. */
export function dedupe(list) {
  const seen = new Set();
  return list.filter((p) => {
    const key = `${p.name}@${p.version}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── the registry ───────────────────────────────────────────────────────────────

const escapeName = (name) => name.replace("/", "%2f");

async function getJson(fetchImpl, url, accept) {
  const res = await fetchImpl(url, {
    headers: { accept: accept ?? "application/json", "cache-control": "no-cache" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (res.status === 404) return { status: 404, body: null };
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return { status: res.status, body: await res.json() };
}

/**
 * What npm says about one package version: does it exist, what is `latest`, and every version
 * npm has. `error` is set when the registry couldn't be read (worth retrying, not evidence).
 */
export async function readRegistry(fetchImpl, { name, version }) {
  try {
    const [doc, packument] = await Promise.all([
      getJson(fetchImpl, `${REGISTRY}/${escapeName(name)}/${encodeURIComponent(version)}`),
      // The abbreviated document: versions and dist-tags without every readme.
      getJson(fetchImpl, `${REGISTRY}/${escapeName(name)}`, "application/vnd.npm.install-v1+json"),
    ]);
    const versions = packument.body?.versions ? Object.keys(packument.body.versions) : [];
    return {
      exists: doc.status !== 404 && doc.body?.version === version,
      latest: packument.body?.["dist-tags"]?.latest ?? null,
      versions,
      error: null,
    };
  } catch (error) {
    return { exists: false, latest: null, versions: [], error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * The problem with one package, or null when it's fine.
 * published: the version exists; when it is the highest non-prerelease, `latest` is it.
 * drift: the version exists; unless it's a prerelease, `latest` is it.
 */
export function judge(mode, pkg, reg) {
  if (reg.error) return `couldn't read the registry (${reg.error})`;
  if (!reg.exists) return `${pkg.version} is not on npm`;
  if (isPrerelease(pkg.version)) return null;
  const mustBeLatest = mode === "drift" || highestStable([...reg.versions, pkg.version]) === pkg.version;
  if (mustBeLatest && reg.latest !== pkg.version) {
    return `latest is ${reg.latest ?? "unset"}, not ${pkg.version}`;
  }
  return null;
}

/** Delays between polls: 15s, 30s, 60s, then every 2 minutes. */
export function backoff(attempt) {
  return Math.min(15_000 * 2 ** attempt, 120_000);
}

/**
 * Checks every package, re-checking the ones with a problem until they pass or the time is up.
 * Returns [{ name, version, latest, problem }] in input order (problem null when fine).
 */
export async function verify(packages, { mode, timeoutMs, fetchImpl = fetch, sleep, now = Date.now, log = () => {} }) {
  const wait = sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const deadline = now() + timeoutMs;
  const results = new Map();
  let pending = packages;
  for (let attempt = 0; ; attempt++) {
    const round = await Promise.all(pending.map(async (pkg) => {
      const reg = await readRegistry(fetchImpl, pkg);
      return { pkg, reg, problem: judge(mode, pkg, reg) };
    }));
    for (const { pkg, reg, problem } of round) {
      results.set(`${pkg.name}@${pkg.version}`, { name: pkg.name, version: pkg.version, latest: reg.latest, problem });
    }
    pending = round.filter((r) => r.problem).map((r) => r.pkg);
    if (pending.length === 0) break;
    const delay = backoff(attempt);
    if (now() + delay > deadline) break;
    log(`${pending.length} not right yet (${pending.map((p) => `${p.name}@${p.version}`).join(", ")}); checking again in ${delay / 1000}s`);
    await wait(delay);
  }
  return packages.map((p) => results.get(`${p.name}@${p.version}`));
}

// ── reporting ──────────────────────────────────────────────────────────────────

const cell = (s) => String(s ?? "").replace(/\|/g, "\\|");

/** A Markdown table of every package checked, problems first. */
export function summaryTable(results) {
  const rows = [...results].sort((a, b) => (b.problem ? 1 : 0) - (a.problem ? 1 : 0));
  return [
    "| package | version | npm latest | result |",
    "|---|---|---|---|",
    ...rows.map((r) => `| ${cell(r.name)} | ${cell(r.version)} | ${cell(r.latest ?? "—")} | ${r.problem ? `**${cell(r.problem)}**` : "ok"} |`),
  ].join("\n");
}

export function issueBody({ mode, results, runUrl }) {
  const bad = results.filter((r) => r.problem);
  const what = mode === "drift"
    ? "The daily check found main and npm disagreeing"
    : "Release published these packages, but npm doesn't have them right";
  return [
    ISSUE_MARKER,
    `${what} (${runUrl ? `[run](${runUrl})` : "local run"}):`,
    "",
    "| package | version | problem |",
    "|---|---|---|",
    ...bad.map((r) => `| ${cell(r.name)} | ${cell(r.version)} | ${cell(r.problem)} |`),
    "",
    "What to do: docs/RELEASING.md, \"When the npm publish check fails\". This issue closes itself on the next clean daily drift check (Actions → npm drift → Run workflow to check now).",
  ].join("\n");
}

/** Opens, updates or closes the one open `release` issue this script owns. */
export async function syncIssue({ fetchImpl = fetch, token, repo, mode, results, runUrl }) {
  const api = `https://api.github.com/repos/${repo}`;
  const call = async (method, path, body) => {
    const res = await fetchImpl(`${api}${path}`, {
      method,
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "x-github-api-version": "2022-11-28",
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const text = await res.text();
    return { status: res.status, ok: res.ok, body: text ? JSON.parse(text) : null };
  };
  const list = await call("GET", `/issues?state=open&labels=${ISSUE_LABEL}&per_page=100`);
  if (!list.ok) throw new Error(`listing issues answered ${list.status}`);
  const open = (list.body ?? []).find((i) => !i.pull_request && String(i.body ?? "").includes(ISSUE_MARKER));
  const bad = results.filter((r) => r.problem);

  if (bad.length === 0) {
    // Only drift checks every package, so only a clean drift run may close the issue.
    if (!open || mode !== "drift") return { action: "none" };
    await call("POST", `/issues/${open.number}/comments`, { body: `Every package checks out now (${runUrl ?? "local run"}). Closing.` });
    const closed = await call("PATCH", `/issues/${open.number}`, { state: "closed", state_reason: "completed" });
    if (!closed.ok) throw new Error(`closing issue #${open.number} answered ${closed.status}`);
    return { action: "closed", number: open.number };
  }

  const body = issueBody({ mode, results, runUrl });
  if (open) {
    const patched = await call("PATCH", `/issues/${open.number}`, { body });
    if (!patched.ok) throw new Error(`updating issue #${open.number} answered ${patched.status}`);
    await call("POST", `/issues/${open.number}/comments`, { body: `Still wrong on ${runUrl ?? "a local run"}:\n\n${body.replace(ISSUE_MARKER, "")}` });
    return { action: "updated", number: open.number };
  }
  // The label may not exist yet; 422 means it does.
  await call("POST", "/labels", { name: ISSUE_LABEL, color: "d93f0b", description: "Publishing to npm" });
  const created = await call("POST", "/issues", { title: ISSUE_TITLE, body, labels: [ISSUE_LABEL] });
  if (!created.ok) throw new Error(`creating the issue answered ${created.status}`);
  return { action: "created", number: created.body.number };
}

// ── CLI ────────────────────────────────────────────────────────────────────────

export function parseArgs(argv) {
  const [mode, ...rest] = argv;
  if (mode !== "published" && mode !== "drift") {
    throw new Error("usage: verify-npm-publish.mjs <published|drift> [--local] [--packages <json>] [--timeout <minutes>] [--issue]");
  }
  const opts = { mode, local: mode === "drift", issue: false, packages: undefined, timeoutMinutes: mode === "drift" ? 0 : 30 };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--local") opts.local = true;
    else if (a === "--issue") opts.issue = true;
    else if (a === "--packages") opts.packages = rest[++i];
    else if (a === "--timeout") {
      opts.timeoutMinutes = Number(rest[++i]);
      if (!Number.isFinite(opts.timeoutMinutes) || opts.timeoutMinutes < 0) throw new Error("--timeout takes minutes");
    } else throw new Error(`unknown argument ${a}`);
  }
  return opts;
}

async function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const opts = parseArgs(process.argv.slice(2));
  const packages = dedupe([
    ...(opts.mode === "published" ? parsePublished(opts.packages ?? process.env.PUBLISHED_PACKAGES) : []),
    ...(opts.local ? localPackages(root) : []),
  ]);
  if (packages.length === 0) {
    console.log("Nothing to check: no packages were published.");
    return;
  }
  console.log(`Checking ${packages.length} package(s) on npm (${opts.mode}, up to ${opts.timeoutMinutes} min).`);
  const results = await verify(packages, { mode: opts.mode, timeoutMs: opts.timeoutMinutes * 60_000, log: console.log });
  for (const r of results) console.log(`${r.problem ? "FAIL" : "ok  "}  ${r.name}@${r.version}  latest=${r.latest ?? "-"}${r.problem ? `  ${r.problem}` : ""}`);

  const bad = results.filter((r) => r.problem);
  const { GITHUB_STEP_SUMMARY, GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID, GITHUB_TOKEN } = process.env;
  const runUrl = GITHUB_SERVER_URL && GITHUB_REPOSITORY && GITHUB_RUN_ID
    ? `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`
    : null;
  if (GITHUB_STEP_SUMMARY) {
    const head = bad.length
      ? `### npm ${opts.mode} check: ${bad.length} of ${results.length} not right`
      : `### npm ${opts.mode} check: all ${results.length} on npm and tagged`;
    appendFileSync(GITHUB_STEP_SUMMARY, `${head}\n\n${summaryTable(results)}\n`);
  }
  if (opts.issue) {
    if (!GITHUB_TOKEN || !GITHUB_REPOSITORY) throw new Error("--issue needs GITHUB_TOKEN and GITHUB_REPOSITORY");
    const done = await syncIssue({ token: GITHUB_TOKEN, repo: GITHUB_REPOSITORY, mode: opts.mode, results, runUrl });
    if (done.action !== "none") console.log(`Issue #${done.number} ${done.action}.`);
  }
  if (bad.length) {
    for (const r of bad) console.log(`::error title=npm ${opts.mode}::${r.name}@${r.version}: ${r.problem}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
