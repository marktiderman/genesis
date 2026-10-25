/**
 * The network guard for importing remote files: which addresses a server
 * may fetch from on an editor's say-so. Only public unicast addresses: no
 * loopback, private, link-local (cloud metadata lives at 169.254.169.254),
 * carrier-grade NAT, documentation, benchmark, multicast or reserved
 * ranges, and no IPv6 form that hides one of those (IPv4-mapped, NAT64,
 * 6to4, unique local, site-local).
 *
 * The check runs on every address a name resolves to, at the moment the
 * connection is made (`guardedLookup` is the socket's DNS lookup), so a name
 * that answers a public address to a first lookup and a private one to the
 * connection's (DNS rebinding) is still refused.
 */
import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from "node:dns";
import { isIP } from "node:net";

/** An IPv4 address as four numbers, or null. */
function v4(ip: string): [number, number, number, number] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const parts = m.slice(1).map(Number) as [number, number, number, number];
  return parts.every((n) => n <= 255) ? parts : null;
}

function v4IsPublic([a, b, c]: [number, number, number, number]): boolean {
  if (a === 0 || a === 10 || a === 127) return false; // this network, private, loopback
  if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
  if (a === 169 && b === 254) return false; // link-local (cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return false; // private
  if (a === 192 && b === 168) return false; // private
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false; // IETF protocol assignments, TEST-NET-1
  if (a === 192 && b === 88 && c === 99) return false; // 6to4 relay anycast
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a === 198 && b === 51 && c === 100) return false; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return false; // TEST-NET-3
  if (a >= 224) return false; // multicast, reserved, broadcast
  return true;
}

/** An IPv6 address as 16 bytes, or null. Accepts `::`, an embedded IPv4 tail and a zone (`%eth0`). */
function v6(input: string): number[] | null {
  let ip = input.replace(/^\[|\]$/g, "");
  const zone = ip.indexOf("%");
  if (zone >= 0) ip = ip.slice(0, zone);
  let tail: number[] = [];
  const lastColon = ip.lastIndexOf(":");
  const maybeV4 = ip.slice(lastColon + 1);
  if (maybeV4.includes(".")) {
    const quad = v4(maybeV4);
    if (!quad) return null;
    tail = quad;
    ip = `${ip.slice(0, lastColon + 1)}0:0`;
  }
  const halves = ip.split("::");
  if (halves.length > 2) return null;
  const groups = (s: string) => (s === "" ? [] : s.split(":"));
  const head = groups(halves[0]!);
  const rest = halves.length === 2 ? groups(halves[1]!) : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? head.length !== 8 : missing < 1) return null;
  const all = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...rest];
  const bytes: number[] = [];
  for (const g of all) {
    if (!/^[0-9a-f]{1,4}$/i.test(g)) return null;
    const n = parseInt(g, 16);
    bytes.push(n >> 8, n & 0xff);
  }
  if (tail.length) bytes.splice(12, 4, ...tail);
  return bytes.length === 16 ? bytes : null;
}

function v6IsPublic(b: number[]): boolean {
  const zeros = (from: number, to: number) => b.slice(from, to).every((x) => x === 0);
  const embedded = (at: number) => v4IsPublic(b.slice(at, at + 4) as [number, number, number, number]);
  if (zeros(0, 15) && (b[15] === 0 || b[15] === 1)) return false; // ::, ::1
  if (zeros(0, 10) && b[10] === 0xff && b[11] === 0xff) return embedded(12); // IPv4-mapped
  if (zeros(0, 12)) return embedded(12); // IPv4-compatible (deprecated)
  if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b) {
    if (zeros(4, 12)) return embedded(12); // NAT64 well-known prefix
    if (b[4] === 0x00 && b[5] === 0x01) return false; // local-use NAT64
  }
  if (b[0] === 0x01 && b[1] === 0x00 && zeros(2, 8)) return false; // discard-only
  if (b[0] === 0x20 && b[1] === 0x01 && b[2]! < 0x02) return false; // IETF special (Teredo and others)
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x0d && b[3] === 0xb8) return false; // documentation
  if (b[0] === 0x20 && b[1] === 0x02) return embedded(2); // 6to4
  if ((b[0]! & 0xfe) === 0xfc) return false; // unique local
  if (b[0] === 0xfe && (b[1]! & 0xc0) === 0x80) return false; // link-local
  if (b[0] === 0xfe && (b[1]! & 0xc0) === 0xc0) return false; // site-local (deprecated)
  if (b[0] === 0xff) return false; // multicast
  return (b[0]! & 0xe0) === 0x20; // global unicast is 2000::/3
}

/**
 * May a server connect to this address on an editor's say-so? True only for
 * a public unicast IPv4 or IPv6 address; false for anything else, including
 * text that isn't an address.
 */
export function isPublicAddress(ip: string): boolean {
  const four = v4(ip);
  if (four) return v4IsPublic(four);
  const six = v6(ip);
  return six ? v6IsPublic(six) : false;
}

export class BlockedAddressError extends Error {
  readonly code = "EGSBLOCKED";
  constructor(host: string, address: string) {
    super(`${host} resolves to ${address}, which isn't a public address.`);
    this.name = "BlockedAddressError";
  }
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/**
 * A DNS lookup for sockets (`http.request({ lookup })`) that refuses a name
 * if any address it resolves to isn't public. It runs when the connection
 * is made, so the address checked is the address connected to.
 */
export function guardedLookup(hostname: string, options: LookupOptions | number | LookupCallback, callback?: LookupCallback): void {
  const cb = (typeof options === "function" ? options : callback) as LookupCallback;
  const opts: LookupOptions = typeof options === "object" && options ? options : typeof options === "number" ? { family: options } : {};
  dnsLookup(hostname, { ...opts, all: true }, (err, addresses) => {
    if (err) return cb(err, "");
    const list = addresses as LookupAddress[];
    const bad = list.find((a) => !isPublicAddress(a.address));
    if (bad || list.length === 0) return cb(new BlockedAddressError(hostname, bad?.address ?? "nothing") as NodeJS.ErrnoException, "");
    if (opts.all) return cb(null, list);
    cb(null, list[0]!.address, list[0]!.family);
  });
}

/** Problems with a URL a server is asked to fetch, before any connection: empty when it may try. */
export function urlProblems(url: URL, allowedPorts: readonly number[]): string[] {
  const problems: string[] = [];
  if (url.protocol !== "http:" && url.protocol !== "https:") problems.push("Only http and https URLs are fetched.");
  if (url.username || url.password) problems.push("A URL with a user name or password isn't fetched.");
  const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  if (!allowedPorts.includes(port)) problems.push(`Port ${port} isn't fetched (only ${allowedPorts.join(", ")}).`);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!host) problems.push("The URL has no host.");
  // An address written as the host never goes through DNS, so it is checked here.
  if (isIP(host) && !isPublicAddress(host)) problems.push(`${host} isn't a public address.`);
  if (/^localhost$|\.localhost$|\.local$|\.internal$/i.test(host)) problems.push(`${host} is a local name.`);
  return problems;
}
