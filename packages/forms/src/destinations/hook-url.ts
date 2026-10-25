/**
 * Where a Slack or webhook destination may post, checked against SSRF: https
 * only, on the default port, with no credentials in the address, and only to
 * a public host, never a private, loopback, link-local or otherwise internal
 * one. `parseHookUrl` checks the text (use it when someone adds the address);
 * `checkHookHost` checks every address the name resolves to right now (use it
 * before every request: what a name points to can change).
 *
 * A check before the request still leaves a short window in which the name
 * could be re-pointed (DNS rebinding). Where untrusted people choose URLs,
 * also send from a network that cannot reach internal services.
 */
import { DeliveryError } from "./types";

export type HookKind = "slack" | "webhook";

/** Resolves a host name to its addresses (IPv4 and IPv6), as the server's DNS sees them. In Node: `dns.promises.lookup(host, { all: true })` mapped to `.address`. */
export type ResolveHost = (host: string) => Promise<string[]>;

export const MAX_HOOK_URL_LENGTH = 2048;
/** The hosts a Slack incoming webhook lives on. */
export const SLACK_HOSTS: ReadonlySet<string> = new Set(["hooks.slack.com"]);

/** An address that can't be used, with a reason safe to show and to store (never the address). */
export class HookUrlError extends DeliveryError {
  override name = "HookUrlError";
}

const NOT_PUBLIC = "The address must be on the public internet.";

// Host names that only ever mean something internal.
const INTERNAL_SUFFIXES = [".localhost", ".local", ".internal", ".intranet", ".lan", ".home.arpa"];

/** IPv4 dotted quad to its 4 bytes, or null. */
function ipv4Bytes(ip: string): number[] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const bytes = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
  return bytes.every((b) => Number.isInteger(b) && b >= 0 && b <= 255) ? bytes : null;
}

function publicIpv4(b: number[]): boolean {
  const [a, c] = [b[0]!, b[1]!];
  if (a === 0 || a === 10 || a === 127) return false; // this network, private, loopback
  if (a === 100 && c >= 64 && c <= 127) return false; // carrier-grade NAT
  if (a === 169 && c === 254) return false; // link-local, cloud metadata
  if (a === 172 && c >= 16 && c <= 31) return false; // private
  if (a === 192 && c === 168) return false; // private
  if (a === 192 && c === 0 && (b[2] === 0 || b[2] === 2)) return false; // IETF, documentation
  if (a === 198 && (c === 18 || c === 19)) return false; // benchmarking
  if (a === 198 && c === 51 && b[2] === 100) return false; // documentation
  if (a === 203 && c === 0 && b[2] === 113) return false; // documentation
  if (a >= 224) return false; // multicast, reserved, broadcast
  return true;
}

/** IPv6 text to its 16 bytes, or null. Accepts `::`, brackets, a zone and a trailing dotted IPv4. */
function ipv6Bytes(ip: string): number[] | null {
  let text = ip.replace(/^\[|\]$/g, "").toLowerCase();
  const zone = text.indexOf("%");
  if (zone >= 0) text = text.slice(0, zone);
  let tail: number[] = [];
  const lastColon = text.lastIndexOf(":");
  if (text.slice(lastColon + 1).includes(".")) {
    const v4 = ipv4Bytes(text.slice(lastColon + 1));
    if (!v4) return null;
    tail = v4;
    text = text.slice(0, lastColon + 1) + "0:0";
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const groups = (s: string) => (s === "" ? [] : s.split(":"));
  const head = groups(halves[0]!);
  const rest = halves.length === 2 ? groups(halves[1]!) : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const all = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...rest];
  const bytes: number[] = [];
  for (const g of all) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    const n = parseInt(g, 16);
    bytes.push(n >> 8, n & 255);
  }
  if (tail.length) bytes.splice(12, 4, ...tail);
  return bytes;
}

function publicIpv6(b: number[]): boolean {
  const zeros = (from: number, to: number) => b.slice(from, to).every((x) => x === 0);
  if (zeros(0, 16)) return false; // ::
  if (zeros(0, 15) && b[15] === 1) return false; // ::1
  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d): the IPv4 address decides.
  if (zeros(0, 10) && b[10] === 0xff && b[11] === 0xff) return publicIpv4(b.slice(12));
  if (zeros(0, 12)) return publicIpv4(b.slice(12));
  // NAT64 (64:ff9b::/96): the embedded IPv4 address decides too.
  if (b[0] === 0 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b && zeros(4, 12)) return publicIpv4(b.slice(12));
  if ((b[0]! & 0xfe) === 0xfc) return false; // unique local fc00::/7
  if (b[0] === 0xfe && (b[1]! & 0xc0) === 0x80) return false; // link-local fe80::/10
  if (b[0] === 0xfe && (b[1]! & 0xc0) === 0xc0) return false; // site-local fec0::/10
  if (b[0] === 0xff) return false; // multicast
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x0d && b[3] === 0xb8) return false; // documentation
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0 && b[3] === 0) return false; // Teredo
  if (b[0] === 0x20 && b[1] === 0x02) return publicIpv4(b.slice(2, 6)); // 6to4
  if (b[0] === 0x01 && zeros(1, 8)) return false; // discard-only 100::/64
  return true;
}

/** Whether an IP address (v4 or v6) is a public one a hook may reach. Anything unparsable is not. */
export function isPublicAddress(ip: string): boolean {
  const v4 = ipv4Bytes(ip);
  if (v4) return publicIpv4(v4);
  const v6 = ipv6Bytes(ip);
  return v6 ? publicIpv6(v6) : false;
}

/** Whether a URL host (as `URL.hostname` gives it) is an IP literal rather than a name. */
function isIpLiteral(host: string): boolean {
  return ipv4Bytes(host) !== null || host.startsWith("[");
}

/**
 * The address as it will be used (its fragment dropped), or a `HookUrlError`
 * saying what is wrong with it. Checks the text only; `checkHookHost` checks
 * where the name resolves. A `"slack"` address must be a Slack incoming
 * webhook (`https://hooks.slack.com/services/…`).
 */
export function parseHookUrl(raw: string, kind: HookKind = "webhook"): URL {
  const text = raw.trim();
  if (!text) throw new HookUrlError("Paste the address to send responses to.");
  if (text.length > MAX_HOOK_URL_LENGTH) throw new HookUrlError("That address is too long.");
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new HookUrlError("That doesn't look like a web address.");
  }
  if (url.protocol !== "https:") throw new HookUrlError("The address must start with https://.");
  if (url.username || url.password) throw new HookUrlError("The address can't include a user name or password.");
  if (url.port && url.port !== "443") throw new HookUrlError("The address must use the standard https port.");
  url.hash = "";
  const host = url.hostname.replace(/\.$/, "");
  if (kind === "slack") {
    if (!SLACK_HOSTS.has(host) || !url.pathname.startsWith("/services/")) {
      throw new HookUrlError("Use a Slack incoming webhook address, which starts with https://hooks.slack.com/services/.");
    }
    return url;
  }
  if (isIpLiteral(host)) {
    if (!isPublicAddress(host)) throw new HookUrlError(NOT_PUBLIC);
    return url;
  }
  if (!host.includes(".") || host === "localhost" || INTERNAL_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    throw new HookUrlError(NOT_PUBLIC);
  }
  return url;
}

/**
 * Checks that every address the URL's host resolves to is public. A host
 * that resolves to nothing, or whose lookup fails, is refused too, as a
 * retryable failure (DNS may be briefly down); a private address is final.
 */
export async function checkHookHost(url: URL, resolve: ResolveHost): Promise<void> {
  const host = url.hostname.replace(/\.$/, "");
  if (isIpLiteral(host)) {
    if (!isPublicAddress(host)) throw new HookUrlError(NOT_PUBLIC);
    return;
  }
  let addresses: string[];
  try {
    addresses = await resolve(host);
  } catch {
    throw new HookUrlError(`${host} couldn't be found`, { retryable: true });
  }
  if (!addresses.length) throw new HookUrlError(`${host} couldn't be found`, { retryable: true });
  if (!addresses.every(isPublicAddress)) throw new HookUrlError(NOT_PUBLIC);
}

/** The host as a screen may show it (never the path: a Slack or webhook path can be the secret). */
export function hookHost(url: URL): string {
  return url.hostname.replace(/\.$/, "").toLowerCase();
}
