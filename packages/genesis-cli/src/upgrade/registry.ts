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
 * The answer is cached in `node_modules/.cache/genesis/behind.json` for 24 hours. The network is
 * injected and off unless asked for: the CLI turns it on, the Vite plugin, tests and `--offline`
 * don't, and then only the cache is read.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { installedGenesis } from "../blocks/discover.js";
import { readReleaseManifest, UMBRELLA_PACKAGE } from "../doctor/versions.js";
import { compareVersions, parseVersion } from "../doctor/semver.js";
import { runTool } from "../exec/run.js";

export const BEHIND_CACHE = "node_modules/.cache/genesis/behind.json";
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
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
}

interface CacheFile {
  checkedAt: string;
  installed: string;
  packages: Record<string, string>;
  latest: string | null;
  firstNewerAt: string | null;
  advisories: Advisory[];
}

function npmJson(args: string[], cwd: string): unknown {
  const out = execFileSync("npm", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30_000 }).trim();
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
export async function bulkAdvisories(packages: Record<string, string>, doFetch: typeof fetch): Promise<Advisory[]> {
  const body = Object.fromEntries(Object.entries(packages).map(([name, v]) => [name, [v]]));
  const res = await doFetch(ADVISORY_BULK_URL, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
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

/** GitHub's advisory database, one package at a time (`gh api /advisories?affects=<name>@<version>`). */
export async function ghAdvisories(packages: Record<string, string>, gh: (args: string[]) => Promise<string | null>): Promise<Advisory[]> {
  const out: Advisory[] = [];
  for (const [name, version] of Object.entries(packages)) {
    const text = await gh(["api", "-X", "GET", "/advisories", "-f", "ecosystem=npm", "-f", `affects=${name}@${version}`]);
    if (text === null) throw new Error("gh api /advisories failed (is gh installed and signed in?)");
    const list = JSON.parse(text) as Array<{ ghsa_id?: unknown; summary?: unknown; severity?: unknown; html_url?: unknown; vulnerabilities?: Array<{ package?: { name?: unknown }; vulnerable_version_range?: unknown }> }>;
    for (const a of Array.isArray(list) ? list : []) {
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

const defaultGh = (root: string) => async (args: string[]) => {
  try {
    const r = await runTool("gh", args, { cwd: root, passEnv: ["GH_TOKEN", "GITHUB_TOKEN", "GH_HOST"], timeoutMs: 30_000 });
    return r.code === 0 ? r.stdout : null;
  } catch {
    return null;
  }
};

function readCache(file: string): CacheFile | null {
  try {
    const c = JSON.parse(readFileSync(file, "utf8")) as CacheFile;
    return typeof c.checkedAt === "string" && typeof c.installed === "string" ? c : null;
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
  const now = (deps.now ?? (() => new Date()))();
  const cacheFile = deps.cacheFile ?? path.join(root, BEHIND_CACHE);
  const cache = readCache(cacheFile);
  const packages = installedVersions(root);
  const fresh = cache && cache.installed === manifest.version && sameVersions(cache.packages, packages) && now.getTime() - Date.parse(cache.checkedAt) < CACHE_TTL_MS;
  const fromCache = (offlineReason?: string): UpgradeStatus | null =>
    cache
      ? {
          installed: manifest.version,
          packages,
          latest: cache.latest,
          firstNewerAt: cache.installed === manifest.version ? cache.firstNewerAt : null,
          advisories: sameVersions(cache.packages, packages) ? cache.advisories : [],
          checkedAt: cache.checkedAt,
          source: "cache",
          ...(fresh ? {} : { stale: true }),
          ...(offlineReason ? { offlineReason } : {}),
        }
      : null;
  // Offline, the cache is only ever a note (the doctor never fails on it), fresh or not.
  if (!deps.network) return fromCache("the network is off");
  if (fresh) return fromCache();

  let latest: string | null;
  let times: Record<string, string> | null;
  try {
    // The upgrade's own lookup (loaded only when the network is used: it's the heavy module).
    latest = (deps.latest ?? (await import("./index.js")).npmLookup(root).latest)(UMBRELLA_PACKAGE);
    if (latest === null && !deps.latest) throw new Error(`npm view ${UMBRELLA_PACKAGE} gave no version`);
    times = (deps.times ?? ((n) => npmJson(["view", n, "time", "--json"], root) as Record<string, string> | null))(UMBRELLA_PACKAGE);
  } catch (err) {
    return fromCache(`npm couldn't be read: ${(err as Error).message.split("\n")[0]}`);
  }
  let advisories: Advisory[];
  try {
    advisories = await bulkAdvisories(packages, deps.fetch ?? fetch);
  } catch (bulkErr) {
    try {
      advisories = await ghAdvisories(packages, deps.gh ?? defaultGh(root));
    } catch (ghErr) {
      return fromCache(`no advisory source answered (${(bulkErr as Error).message}; ${(ghErr as Error).message})`);
    }
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
