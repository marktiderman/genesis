/**
 * How far the app's Genesis is behind, and whether a published advisory affects it: what the
 * doctor's `genesis-behind` rule and the upgrade fix read.
 *
 * - **Installed:** the umbrella's `dist/versions.json` (`readReleaseManifest`) and every installed
 *   `@marktiderman/genesis*` package's own version.
 * - **Latest:** `npm view` (`npmLookup`, so the app's `.npmrc` and registry apply), and the
 *   umbrella's publish times (`npm view … time`) for how long the app has been behind.
 * - **Advisories:** npm's bulk advisory endpoint for every installed Genesis package; when that
 *   can't be reached, GitHub's advisory database through `gh api`.
 *
 * The answer is cached in `node_modules/.cache/genesis/behind.json` for 24 hours, and a failed
 * check for an hour, so a registry that is down isn't asked on every run. The whole check has one
 * deadline of about 20 seconds (each step still gets at least a second, and `gh auth status` up to 5). The network is injected and off unless asked for: the CLI turns
 * it on; the Vite plugin, tests, `--offline` and `doctor.network: false` don't, and then only the
 * cache is read.
 *
 * What leaves the machine: the names and installed versions of the `@marktiderman/genesis*`
 * packages only (npm view of the umbrella; the advisory endpoint's request body; gh's query). When
 * `.npmrc` or `npm_config_registry` points the scope or the default registry somewhere other than
 * registry.npmjs.org, the bulk endpoint isn't called (it would be the public registry's), and only
 * gh is asked.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import * as path from "node:path";
import { installedGenesis } from "../blocks/discover.js";
import { readReleaseManifest, UMBRELLA_PACKAGE } from "../doctor/versions.js";
import { compareVersions, parseVersion } from "../doctor/semver.js";
import { runTool } from "../exec/run.js";

export const BEHIND_CACHE = "node_modules/.cache/genesis/behind.json";
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
/** A failed check isn't retried for this long. */
export const FAILURE_TTL_MS = 60 * 60 * 1000;
/** The whole check, every call included. */
export const DEADLINE_MS = 20_000;
export const ADVISORY_BULK_URL = "https://registry.npmjs.org/-/npm/v1/security/advisories/bulk";

export interface Advisory {
  /** The GHSA id when there is one, else the registry's id. */
  id: string;
  package: string;
  /** The installed version it affects. */
  version: string;
  title: string;
  severity: string;
  url?: string;
  /** The affected range. */
  vulnerable?: string;
}

/** What was read, when, and from where. */
export interface UpgradeStatus {
  /** The umbrella version installed. */
  installed: string;
  /** Every installed Genesis package and its version. */
  packages: Record<string, string>;
  /** npm's `latest` of the umbrella, or null when it couldn't be read. */
  latest: string | null;
  /** When the first release after the installed one was published (ISO), when known. */
  firstNewerAt: string | null;
  advisories: Advisory[];
  checkedAt: string;
  /** `network`: read just now; `cache`: from behind.json (fresh, or the network was off or failed). */
  source: "network" | "cache";
  /** The cache is older than 24 hours or for other installed versions (only when source is `cache`). */
  stale?: boolean;
  /** Why the network wasn't used or failed, when it wasn't. */
  offlineReason?: string;
}

export interface RegistryDeps {
  /** Reach npm and the advisory endpoints. Default false. */
  network?: boolean;
  now?: () => Date;
  /** npm `latest` of a package (default: `npm view <name>@latest version`, as npmLookup). */
  latest?: (name: string) => string | null;
  /** A package's publish times, version → ISO date (default: `npm view <name> time --json`). */
  times?: (name: string) => Record<string, string> | null;
  /** For the bulk advisory endpoint (default: global fetch). */
  fetch?: typeof fetch;
  /** `gh api` for the fallback: the JSON it prints, or null (default: gh through src/exec/run.ts). */
  gh?: (args: string[]) => Promise<string | null>;
  /** Where the cache lives (default: the app's node_modules/.cache/genesis/behind.json). */
  cacheFile?: string;
  /** The whole check's deadline in ms (default 20 000). */
  deadlineMs?: number;
  /** The registry the app installs Genesis from (default: read from .npmrc and npm_config_registry); null for npm's. */
  registry?: string | null;
  /** Running in CI (default: `CI` is set): genesis-behind's distance findings never fail a run there. */
  ci?: boolean;
}

interface CacheFile {
  /** Absent in a file that only records a failure. */
  checkedAt: string;
  /** The last check that failed, and why: not retried for an hour. */
  failedAt?: string;
  failure?: string;
  installed: string;
  packages: Record<string, string>;
  latest: string | null;
  firstNewerAt: string | null;
  advisories: Advisory[];
}

function npmJson(args: string[], cwd: string, timeout: number): unknown {
  const out = execFileSync("npm", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout }).trim();
  return out ? JSON.parse(out) : null;
}

/** The installed Genesis packages and their versions. */
export function installedVersions(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, dir] of installedGenesis(root)) {
    try {
      const v = (JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")) as { version?: unknown }).version;
      if (typeof v === "string") out[name] = v;
    } catch {
      // A package.json that can't be read: the doctor's install checks report it.
    }
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

/** The earliest publish time of a stable version newer than `installed`. */
export function firstNewerAt(times: Record<string, string> | null, installed: string): string | null {
  const from = parseVersion(installed);
  if (!times || !from) return null;
  let first: string | null = null;
  for (const [version, at] of Object.entries(times)) {
    const v = parseVersion(version);
    if (!v || v.pre.length || compareVersions(v, from) <= 0) continue;
    if (first === null || at < first) first = at;
  }
  return first;
}

/** npm's bulk advisory endpoint: the advisories affecting these exact versions. */
export async function bulkAdvisories(packages: Record<string, string>, doFetch: typeof fetch, timeoutMs = 15_000): Promise<Advisory[]> {
  const body = Object.fromEntries(Object.entries(packages).map(([name, v]) => [name, [v]]));
  const res = await doFetch(ADVISORY_BULK_URL, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`the advisory endpoint answered HTTP ${res.status}`);
  const json = (await res.json()) as Record<string, Array<{ id?: unknown; url?: unknown; title?: unknown; severity?: unknown; vulnerable_versions?: unknown }>>;
  const out: Advisory[] = [];
  for (const [name, list] of Object.entries(json ?? {})) {
    if (!(name in packages) || !Array.isArray(list)) continue;
    for (const a of list) {
      const url = typeof a.url === "string" ? a.url : undefined;
      const ghsa = url ? /GHSA-[\w-]+/.exec(url)?.[0] : undefined;
      out.push({
        id: ghsa ?? String(a.id ?? "unknown"),
        package: name,
        version: packages[name]!,
        title: typeof a.title === "string" ? a.title : "a published advisory",
        severity: typeof a.severity === "string" ? a.severity : "unknown",
        ...(url ? { url } : {}),
        ...(typeof a.vulnerable_versions === "string" ? { vulnerable: a.vulnerable_versions } : {}),
      });
    }
  }
  return out;
}

/** GitHub's advisory database (`gh api /advisories?affects=<name>@<version>`), every package at once; withdrawn advisories left out. */
export async function ghAdvisories(packages: Record<string, string>, gh: (args: string[]) => Promise<string | null>): Promise<Advisory[]> {
  const lists = await Promise.all(
    Object.entries(packages).map(async ([name, version]) => {
      const text = await gh(["api", "-X", "GET", "/advisories", "-f", "ecosystem=npm", "-f", `affects=${name}@${version}`]);
      if (text === null) throw new Error("gh api /advisories failed");
      return { name, version, list: JSON.parse(text) as unknown };
    }),
  );
  const out: Advisory[] = [];
  for (const { name, version, list } of lists) {
    type GhAdvisory = { ghsa_id?: unknown; summary?: unknown; severity?: unknown; html_url?: unknown; withdrawn_at?: unknown; vulnerabilities?: Array<{ package?: { name?: unknown }; vulnerable_version_range?: unknown }> };
    for (const a of (Array.isArray(list) ? list : []) as GhAdvisory[]) {
      if (a.withdrawn_at) continue;
      const range = a.vulnerabilities?.find((v) => v.package?.name === name)?.vulnerable_version_range;
      out.push({
        id: typeof a.ghsa_id === "string" ? a.ghsa_id : "unknown",
        package: name,
        version,
        title: typeof a.summary === "string" ? a.summary : "a published advisory",
        severity: typeof a.severity === "string" ? a.severity : "unknown",
        ...(typeof a.html_url === "string" ? { url: a.html_url } : {}),
        ...(typeof range === "string" ? { vulnerable: range } : {}),
      });
    }
  }
  return out;
}

/** gh through the runner: null when it fails. Checks `gh auth status` once first, and gives up when gh isn't signed in. */
const defaultGh = (root: string, timeoutMs: () => number) => {
  let signedIn: Promise<boolean> | null = null;
  const env = { passEnv: ["GH_TOKEN", "GITHUB_TOKEN", "GH_HOST", "GH_ENTERPRISE_TOKEN"] };
  return async (args: string[]) => {
    signedIn ??= runTool("gh", ["auth", "status"], { cwd: root, ...env, timeoutMs: Math.min(5_000, timeoutMs()) }).then((r) => r.code === 0, () => false);
    if (!(await signedIn)) throw new Error("gh isn't installed or signed in");
    try {
      const r = await runTool("gh", args, { cwd: root, ...env, timeoutMs: timeoutMs() });
      return r.code === 0 ? r.stdout : null;
    } catch {
      return null;
    }
  };
};

/**
 * The registries a bunfig.toml sets: `[install] registry` (a URL, or `{ url = … }`) and the
 * `@marktiderman` scope under `[install.scopes]`. A small reader for those keys, not a TOML parser.
 */
export function bunfigRegistries(text: string): string[] {
  const out: string[] = [];
  let section = "";
  const urlOf = (value: string) => /^\s*"([^"]+)"/.exec(value)?.[1] ?? /\burl\s*=\s*"([^"]+)"/.exec(value)?.[1] ?? null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, "").trim();
    if (!line || line.startsWith("#")) continue;
    const header = /^\[\s*([^\]]+?)\s*\]$/.exec(line);
    if (header) {
      section = header[1]!.replace(/\s/g, "");
      continue;
    }
    const kv = /^("?[@\w.-]+"?)\s*=\s*(.+)$/.exec(line);
    if (!kv) continue;
    const key = kv[1]!.replace(/"/g, "");
    const url =
      section === "install" && key === "registry" ? urlOf(kv[2]!)
      : section === "install.scopes" && (key === "marktiderman" || key === "@marktiderman") ? urlOf(kv[2]!)
      : section === "install" && (key === "scopes.marktiderman" || key === "scopes.@marktiderman") ? urlOf(kv[2]!)
      : null;
    if (url) out.push(url);
  }
  return out;
}

/** The registry the app installs `@marktiderman/*` from, when it isn't npm's: the scope's or the default registry in the app's or the home .npmrc and bunfig.toml, or npm_config_registry. */
export function customRegistry(root: string, env: NodeJS.ProcessEnv = process.env, home = homedir()): string | null {
  const found: string[] = [];
  // npm reads its environment settings in any case (NPM_CONFIG_REGISTRY too).
  for (const [key, value] of Object.entries(env)) {
    const k = key.toLowerCase();
    if (value && (k === "npm_config_registry" || k === "npm_config_@marktiderman:registry")) found.push(value);
  }
  for (const file of [path.join(root, ".npmrc"), path.join(home, ".npmrc")]) {
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const m of text.matchAll(/^\s*(?:@marktiderman:)?registry\s*=\s*(\S+)/gm)) found.push(m[1]!);
  }
  for (const file of [path.join(root, "bunfig.toml"), path.join(home, ".bunfig.toml"), ...(env.XDG_CONFIG_HOME ? [path.join(env.XDG_CONFIG_HOME, ".bunfig.toml")] : [])]) {
    try {
      found.push(...bunfigRegistries(readFileSync(file, "utf8")));
    } catch {
      // No bunfig there.
    }
  }
  return found.find((url) => !/^https?:\/\/registry\.npmjs\.org\/?$/.test(url.trim())) ?? null;
}

function readCache(file: string): CacheFile | null {
  try {
    const c = JSON.parse(readFileSync(file, "utf8")) as CacheFile;
    return typeof c.installed === "string" || typeof c.failedAt === "string" ? c : null;
  } catch {
    return null;
  }
}

const sameVersions = (a: Record<string, string>, b: Record<string, string>) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The app's upgrade status: null when the app has no umbrella (nothing to compare), or when the
 * network is off and nothing is cached. Never throws for the network: a failure falls back to the
 * cache with `offlineReason`.
 */
export async function readUpgradeStatus(root: string, deps: RegistryDeps = {}): Promise<UpgradeStatus | null> {
  const manifest = readReleaseManifest(root);
  if (!manifest) return null;
  const started = Date.now();
  const left = () => Math.max(1_000, (deps.deadlineMs ?? DEADLINE_MS) - (Date.now() - started));
  const now = (deps.now ?? (() => new Date()))();
  const cacheFile = deps.cacheFile ?? path.join(root, BEHIND_CACHE);
  const cache = readCache(cacheFile);
  const good = cache && typeof cache.checkedAt === "string" && typeof cache.installed === "string" ? cache : null;
  const packages = installedVersions(root);
  const fresh = good && good.installed === manifest.version && sameVersions(good.packages, packages) && now.getTime() - Date.parse(good.checkedAt) < CACHE_TTL_MS;
  const fromCache = (offlineReason?: string): UpgradeStatus | null =>
    good
      ? {
          installed: manifest.version,
          packages,
          latest: good.latest,
          firstNewerAt: good.installed === manifest.version ? good.firstNewerAt : null,
          advisories: sameVersions(good.packages, packages) ? good.advisories : [],
          checkedAt: good.checkedAt,
          source: "cache",
          ...(fresh ? {} : { stale: true }),
          ...(offlineReason ? { offlineReason } : {}),
        }
      : null;
  // Offline, the cache is only ever a note (the doctor never fails on it), fresh or not.
  if (!deps.network) return fromCache("the network is off");
  if (fresh) return fromCache();
  if (cache?.failedAt && now.getTime() - Date.parse(cache.failedAt) < FAILURE_TTL_MS) return fromCache(`the last check, at ${cache.failedAt.slice(11, 16)} UTC, failed (${cache.failure ?? "unknown"}); it's tried again an hour later`);

  const fail = (reason: string) => {
    try {
      mkdirSync(path.dirname(cacheFile), { recursive: true });
      writeFileSync(cacheFile, `${JSON.stringify({ ...(good ?? {}), failedAt: now.toISOString(), failure: reason }, null, 2)}\n`);
    } catch {
      // A read-only node_modules: the next run asks again.
    }
    return fromCache(reason);
  };
  let latest: string | null = null;
  let times: Record<string, string> | null = null;
  // npm failing doesn't skip the advisories: they are asked for all the same, below.
  let npmFailure: string | undefined;
  try {
    // The upgrade's own lookup (loaded only when the network is used: it's the heavy module).
    latest = (deps.latest ?? (await import("./index.js")).npmLookup(root, { timeoutMs: left() }).latest)(UMBRELLA_PACKAGE);
    if (latest === null && !deps.latest) throw new Error(`npm view ${UMBRELLA_PACKAGE} gave no version`);
    times = (deps.times ?? ((n) => npmJson(["view", n, "time", "--json"], root, left()) as Record<string, string> | null))(UMBRELLA_PACKAGE);
  } catch (err) {
    npmFailure = `npm couldn't be read: ${(err as Error).message.split("\n")[0]}`;
  }
  const registry = deps.registry !== undefined ? deps.registry : customRegistry(root);
  const gh = deps.gh ?? defaultGh(root, left);
  let advisories: Advisory[];
  try {
    if (registry) throw new Error(`Genesis installs from ${registry}, so npm's public advisory endpoint wasn't asked`);
    advisories = await bulkAdvisories(packages, deps.fetch ?? fetch, left());
  } catch (bulkErr) {
    try {
      advisories = await withDeadline(ghAdvisories(packages, gh), left());
    } catch (ghErr) {
      const reason = `no advisory source answered (${(bulkErr as Error).message}; ${(ghErr as Error).message})`;
      return fail(npmFailure ? `${npmFailure}; ${reason}` : reason);
    }
  }
  if (npmFailure) {
    // The release distance comes from the cache (if any); the advisories are this run's.
    const cached = fail(npmFailure);
    return cached
      ? { ...cached, advisories }
      : { installed: manifest.version, packages, latest: null, firstNewerAt: null, advisories, checkedAt: now.toISOString(), source: "network", offlineReason: npmFailure };
  }
  const status: UpgradeStatus = { installed: manifest.version, packages, latest, firstNewerAt: firstNewerAt(times, manifest.version), advisories, checkedAt: now.toISOString(), source: "network" };
  try {
    mkdirSync(path.dirname(cacheFile), { recursive: true });
    const record: CacheFile = { checkedAt: status.checkedAt, installed: status.installed, packages, latest, firstNewerAt: status.firstNewerAt, advisories };
    writeFileSync(cacheFile, `${JSON.stringify(record, null, 2)}\n`);
  } catch {
    // A read-only node_modules: the next run asks again.
  }
  return status;
}

function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  return Promise.race([work, new Promise<T>((_, reject) => (timer = setTimeout(() => reject(new Error(`no answer within ${Math.round(ms / 1000)}s`)), ms)))]).finally(() => clearTimeout(timer));
}

/** Whether the cache file exists (for messages). */
export const hasBehindCache = (root: string) => existsSync(path.join(root, BEHIND_CACHE));

export type Distance = { kind: "current" } | { kind: "patch" } | { kind: "minor"; minors: number } | { kind: "major"; majors: number };

/** How far `installed` is behind `latest`. */
export function distance(installed: string, latest: string): Distance {
  const a = parseVersion(installed);
  const b = parseVersion(latest);
  if (!a || !b || compareVersions(a, b) >= 0) return { kind: "current" };
  if (b.major > a.major) return { kind: "major", majors: b.major - a.major };
  if (b.minor > a.minor) return { kind: "minor", minors: b.minor - a.minor };
  return { kind: "patch" };
}
