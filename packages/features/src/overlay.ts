/**
 * The overlay marker: `genesis.overlay` in the package.json of an app's local
 * copy of a published Genesis package (an "overlay"), which shadows that
 * package by name while the app changes it:
 *
 *   "genesis": {
 *     …the package's own genesis key…,
 *     "overlay": {
 *       "upstream": "@marktiderman/genesis-support@0.2.6",
 *       "since": "2026-10-30",
 *       "owner": "web team",
 *       "reason": "support inbox filters, to promote upstream"
 *     }
 *   }
 *
 * `upstream` is the package and the exact release it was copied from; `since`
 * is the day it was made (an ISO date); `owner` and `reason` say who answers
 * for it and why it exists. The doctor reads the marker (genesis-cli,
 * `overlay-*` rules).
 */

/**
 * A validated `genesis.overlay` marker.
 *
 * @stability Beta
 */
export interface OverlayMarker {
  /** `@marktiderman/genesis-<name>@<semver>`: the package and release the overlay was copied from. */
  upstream: string;
  /** The day the overlay was made, `YYYY-MM-DD`. */
  since: string;
  /** Who answers for it: a person, a team or a handle. */
  owner: string;
  /** Why it exists, in a sentence. */
  reason: string;
}

const OVERLAY_KEYS = new Set(["upstream", "since", "owner", "reason", "$comment"]);
/** A Genesis package name at an exact semver release (a prerelease or build tag allowed). */
const UPSTREAM = /^(@marktiderman\/genesis(?:-[a-z0-9-]+)?)@(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

/** A real calendar day written `YYYY-MM-DD`. */
function isIsoDate(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const m = ISO_DATE.exec(v);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

/**
 * A package's `genesis.overlay` marker, or null when it doesn't validate.
 * Problems go in `problems`, each prefixed with the package name.
 *
 * @stability Beta
 */
export function readOverlayMarker(name: string, raw: unknown, problems: string[] = []): OverlayMarker | null {
  const at = `${name} genesis.overlay`;
  if (!isObject(raw)) {
    problems.push(`${at}: must be an object { "upstream", "since", "owner", "reason" }`);
    return null;
  }
  const before = problems.length;
  for (const key of Object.keys(raw)) {
    if (!OVERLAY_KEYS.has(key)) problems.push(`${at}: unknown key "${key}" (known: upstream, since, owner, reason)`);
  }
  const m = typeof raw.upstream === "string" ? UPSTREAM.exec(raw.upstream) : null;
  if (!m) problems.push(`${at}.upstream: must be "@marktiderman/genesis-<name>@<version>", the package and release it was copied from, not ${JSON.stringify(raw.upstream)}`);
  else if (m[1] !== name) problems.push(`${at}.upstream: names ${m[1]}, but the package is ${name}; an overlay keeps the name it shadows`);
  if (!isIsoDate(raw.since)) problems.push(`${at}.since: must be the day it was made, as YYYY-MM-DD, not ${JSON.stringify(raw.since)}`);
  if (!isText(raw.owner)) problems.push(`${at}.owner: say who answers for the overlay`);
  if (!isText(raw.reason)) problems.push(`${at}.reason: say why the overlay exists`);
  return problems.length === before ? { upstream: raw.upstream as string, since: raw.since as string, owner: raw.owner as string, reason: raw.reason as string } : null;
}

/**
 * The upstream package name and version of a marker: `{ name, version }`.
 *
 * @stability Beta
 */
export function overlayUpstream(marker: Pick<OverlayMarker, "upstream">): { name: string; version: string } {
  const at = marker.upstream.lastIndexOf("@");
  return { name: marker.upstream.slice(0, at), version: marker.upstream.slice(at + 1) };
}
