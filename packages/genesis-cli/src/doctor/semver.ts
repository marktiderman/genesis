/**
 * Enough of semver's range grammar to check a peer range against an installed
 * version, without a dependency: `||` alternatives, hyphen ranges, `^`, `~`,
 * comparators (`>= <= > < =`), `x` / `*` wildcards and partial versions.
 * Prereleases follow node-semver: `1.2.0-beta.1` only satisfies a comparator
 * on 1.2.0 that has a prerelease itself.
 */

interface Version {
  major: number;
  minor: number;
  patch: number;
  pre: string[];
}

const VERSION = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

export function parseVersion(v: string): Version | null {
  const m = VERSION.exec(v.trim());
  return m ? { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] ? m[4].split(".") : [] } : null;
}

export function compareVersions(a: Version, b: Version): number {
  for (const k of ["major", "minor", "patch"] as const) if (a[k] !== b[k]) return a[k] < b[k] ? -1 : 1;
  if (!a.pre.length || !b.pre.length) return a.pre.length ? -1 : b.pre.length ? 1 : 0;
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const x = a.pre[i];
    const y = b.pre[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    const nx = /^\d+$/.test(x);
    const ny = /^\d+$/.test(y);
    if (nx && ny) return +x < +y ? -1 : 1;
    if (nx !== ny) return nx ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return 0;
}

type Op = ">=" | "<=" | ">" | "<" | "=";
interface Comparator {
  op: Op;
  v: Version;
  /** The range itself named a prerelease here (not one of the internal `-0` bounds). */
  pre?: boolean;
}

/** A partial version (`1`, `1.2`, `1.x`, `*`): the numbers given, null from the first wildcard on. */
function partial(s: string): { nums: Array<number | null>; pre: string[] } | null {
  const m = /^v?(\d+|[xX*])(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(s);
  if (!m) return null;
  const nums: Array<number | null> = [];
  let wild = false;
  for (const part of [m[1], m[2], m[3]]) {
    if (wild || part === undefined || /^[xX*]$/.test(part)) {
      wild = true;
      nums.push(null);
    } else nums.push(+part);
  }
  return { nums, pre: m[4] && !wild ? m[4].split(".") : [] };
}

const ver = (major: number, minor: number, patch: number, pre: string[] = []): Version => ({ major, minor, patch, pre });

/** One space-separated piece of a range, as comparators. Null when it isn't valid semver. */
function comparators(token: string): Comparator[] | null {
  const m = /^(\^|~>?|>=|<=|>|<|=)?\s*(.+)$/.exec(token);
  if (!m) return null;
  const op = m[1] ?? "";
  const p = partial(m[2]);
  if (!p) return null;
  const [major, mi, pa] = p.nums;
  if (major === null) return op === "<" || op === ">" ? [{ op: "<", v: ver(0, 0, 0, ["0"]) }] : [];
  const M: number = major;
  const lo = ver(M, mi ?? 0, pa ?? 0, p.pre);
  const next = (kind: "major" | "minor" | "patch"): Version =>
    kind === "major" ? ver(M + 1, 0, 0, ["0"]) : kind === "minor" ? ver(M, (mi ?? 0) + 1, 0, ["0"]) : ver(M, mi ?? 0, (pa ?? 0) + 1, ["0"]);
  // The exclusive upper bound of a partial version (`1.2` → <1.3.0-0).
  const upper = mi === null ? next("major") : pa === null ? next("minor") : null;
  const out = switchOp();
  if (p.pre.length) for (const c of out) if (c.v === lo) c.pre = true;
  return out;
  function switchOp(): Comparator[] {
    switch (op) {
      case "^": {
        const bound = M > 0 || mi === null ? next("major") : (mi ?? 0) > 0 || pa === null ? next("minor") : next("patch");
        return [
          { op: ">=", v: lo },
          { op: "<", v: bound },
        ];
      }
      case "~":
      case "~>":
        return [
          { op: ">=", v: lo },
          { op: "<", v: mi === null ? next("major") : next("minor") },
        ];
      case ">":
        return upper ? [{ op: ">=", v: upper }] : [{ op: ">", v: lo }];
      case ">=":
        return [{ op: ">=", v: lo }];
      case "<":
        return [{ op: "<", v: lo.pre.length ? lo : ver(M, mi ?? 0, pa ?? 0, ["0"]) }];
      case "<=":
        return upper ? [{ op: "<", v: upper }] : [{ op: "<=", v: lo }];
      default:
        return upper
          ? [
              { op: ">=", v: lo },
              { op: "<", v: upper },
            ]
          : [{ op: "=", v: lo }];
    }
  }
}

function test(c: Comparator, v: Version): boolean {
  const d = compareVersions(v, c.v);
  return c.op === ">=" ? d >= 0 : c.op === "<=" ? d <= 0 : c.op === ">" ? d > 0 : c.op === "<" ? d < 0 : d === 0;
}

/** The range as alternatives of comparator sets, or null when it isn't a semver range (`workspace:*`, a URL, a tag). */
export function parseRange(range: string): Comparator[][] | null {
  const alts: Comparator[][] = [];
  for (const raw of range.trim().split("||")) {
    const alt = raw.trim();
    const hyphen = /^(\S+)\s+-\s+(\S+)$/.exec(alt);
    if (hyphen) {
      const from = comparators(`>=${hyphen[1]}`);
      const to = comparators(`<=${hyphen[2]}`);
      if (!from || !to) return null;
      alts.push([...from, ...to]);
      continue;
    }
    const set: Comparator[] = [];
    // `>= 1.2.0` with a space is one comparator.
    for (const token of alt
      .replace(/(\^|~>?|>=|<=|>|<|=)\s+/g, "$1")
      .split(/\s+/)
      .filter(Boolean)) {
      const cs = comparators(token);
      if (!cs) return null;
      set.push(...cs);
    }
    alts.push(set);
  }
  return alts;
}

/**
 * Whether `version` satisfies `range`; null when either isn't semver (the caller
 * can't judge it). A prerelease satisfies a set only if one of its comparators
 * names the same major.minor.patch with a prerelease.
 */
export function satisfies(version: string, range: string): boolean | null {
  const v = parseVersion(version);
  const alts = parseRange(range);
  if (!v || !alts) return null;
  return alts.some(
    (set) =>
      set.every((c) => test(c, v)) &&
      (!v.pre.length || set.some((c) => c.pre && c.v.major === v.major && c.v.minor === v.minor && c.v.patch === v.patch)),
  );
}
