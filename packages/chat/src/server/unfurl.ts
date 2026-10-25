// @feat:chat
/**
 * Link previews without letting a message aim the server at its own network.
 *
 *   - https only, port 443, no user:password@; at most 3 redirects, each hop
 *     checked again (redirects are followed by hand, never by fetch);
 *   - the host must not be, or resolve to, a private, loopback, link-local,
 *     carrier-grade NAT, multicast, documentation or metadata address
 *     (169.254.169.254, fd00:ec2::254), nor an IPv6 form that carries one
 *     (::ffff:0:0/96 mapped and translated, NAT64, 6to4 2002::/16, Teredo),
 *     nor `localhost`, `*.localhost`, `*.local`, `*.internal` or a single-label
 *     name;
 *   - no URL whose query carries what looks like a credential (`token=`,
 *     `sig=`, `code=`, `X-Amz-Signature=` ...): fetching it could use up a
 *     one-time link;
 *   - HTML only (`text/html`, `application/xhtml+xml`), read up to `maxBytes`
 *     and no further; nothing is executed;
 *   - og:title, og:description, og:image (https only, resolved against the
 *     page, and its host held to the same address rules, else dropped),
 *     og:site_name, with twitter:* and <title> / meta description as
 *     fallbacks; entities decoded, whitespace collapsed, lengths capped to the
 *     columns of `link_previews`.
 *
 * DNS: the host is resolved first (Node's `node:dns`, Deno's `Deno.resolveDns`,
 * or a `resolve` you pass), within the timeout, and refused if any address is
 * private. Where nothing can resolve (some edge runtimes), every host that is
 * not an IP literal is refused (`blocked`, logged once) unless you pass
 * `allowUnresolved: true`, accepting that a public name pointing at a private
 * address gets through.
 *
 * Rebinding: fetch resolves the name again, so a host that changes its answer
 * between the check and the connection is not caught by the check alone. On
 * Node, close that gap by connecting through the checked lookup: pass
 * `dispatcher: new Agent({ connect: { lookup: guardedLookup } })` (`Agent` from
 * `undici`), which refuses a private address at connect time. Elsewhere, run
 * the runner where outbound traffic to private ranges is firewalled.
 */
import type { LinkPreview, LinkUnfurler } from "./types";

export interface LinkUnfurlerOptions {
  fetch?: typeof fetch | undefined;
  /** For the whole fetch, redirects included (default 5000). */
  timeoutMs?: number | undefined;
  /** Bytes of HTML read at most (default 512 KiB). */
  maxBytes?: number | undefined;
  /** At most this many redirects (default 3). */
  maxRedirects?: number | undefined;
  /**
   * The host's addresses. Default: `node:dns` or `Deno.resolveDns` where
   * present; `null` means "can't resolve here" and only literal and local
   * hosts are refused. Throwing means the name doesn't resolve: `failed`.
   */
  resolve?: ((hostname: string) => Promise<string[] | null>) | undefined;
  /**
   * Fetch a name even when nothing here can resolve it (default false: such a
   * name is `blocked`). Only for a runner behind an egress firewall.
   */
  allowUnresolved?: boolean | undefined;
  /**
   * Passed to fetch as `dispatcher` (Node, undici): `new Agent({ connect: {
   * lookup: guardedLookup } })` pins each connection to an address checked at
   * connect time, which closes DNS rebinding.
   */
  dispatcher?: unknown;
  /** Where a misconfiguration is reported (no resolver). Default `console.warn`. */
  log?: ((line: string) => void) | undefined;
  userAgent?: string | undefined;
}

const CAPS = { title: 300, description: 600, siteName: 120, url: 2000 };

// ── Addresses ────────────────────────────────────────────────────────────────

function ipv4Parts(ip: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  return parts.every((n) => n >= 0 && n <= 255) ? parts : null;
}

function privateIpv4([a, b, c]: number[]): boolean {
  return (
    a === 0 || // this network
    a === 10 ||
    a === 127 ||
    (a === 100 && b! >= 64 && b! <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, cloud metadata
    (a === 172 && b! >= 16 && b! <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) || // IETF protocol, TEST-NET-1
    (a === 192 && b === 88 && c === 99) || // 6to4 relay anycast
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    (a === 198 && b === 51 && c === 100) || // TEST-NET-2
    (a === 203 && b === 0 && c === 113) || // TEST-NET-3
    a! >= 224 // multicast, reserved, broadcast
  );
}

/** An IPv6 address as eight 16-bit groups, or null. */
function ipv6Groups(ip: string): number[] | null {
  let s = ip.toLowerCase();
  const zone = s.indexOf("%");
  if (zone >= 0) s = s.slice(0, zone);
  let tail: number[] = [];
  const lastColon = s.lastIndexOf(":");
  const v4 = ipv4Parts(s.slice(lastColon + 1));
  if (v4) {
    tail = [(v4[0]! << 8) | v4[1]!, (v4[2]! << 8) | v4[3]!];
    s = s.slice(0, lastColon + 1) + "0:0";
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const parse = (part: string) => (part === "" ? [] : part.split(":"));
  const head = parse(halves[0]!);
  const rest = halves.length === 2 ? parse(halves[1]!) : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const all = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...rest];
  if (all.length !== 8 || !all.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null;
  const groups = all.map((g) => parseInt(g, 16));
  if (tail.length) groups.splice(6, 2, ...tail);
  return groups;
}

function privateIpv6(g: number[]): boolean {
  const zeroUntil = (n: number) => g.slice(0, n).every((x) => x === 0);
  if (zeroUntil(8)) return true; // ::
  if (zeroUntil(7) && g[7] === 1) return true; // ::1
  // IPv4-mapped (::ffff:a.b.c.d), IPv4-compatible (::a.b.c.d), IPv4-translated
  // (::ffff:0:a.b.c.d) and NAT64 (64:ff9b::/96): judge the IPv4 inside.
  const embedded = [g[6]! >> 8, g[6]! & 255, g[7]! >> 8, g[7]! & 255];
  if (zeroUntil(5) && (g[5] === 0xffff || g[5] === 0)) return privateIpv4(embedded);
  if (zeroUntil(4) && g[4] === 0xffff && g[5] === 0) return privateIpv4(embedded);
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return privateIpv4(embedded);
  // 6to4 (2002:a.b.c.d::/48): judge the IPv4 in groups 1 and 2.
  if (g[0] === 0x2002) return privateIpv4([g[1]! >> 8, g[1]! & 255, g[2]! >> 8, g[2]! & 255]);
  const first = g[0]!;
  return (
    (first === 0x64 && g[1] === 0xff9b && g[2] === 1) || // local-use NAT64 64:ff9b:1::/48
    (first === 0x2001 && g[1]! < 0x0200) || // IETF protocol assignments 2001::/23 (Teredo 2001::/32 among them)
    (first === 0x3fff && g[1]! < 0x1000) || // documentation 3fff::/20

    (first & 0xfe00) === 0xfc00 || // unique local fc00::/7 (fd00:ec2::254 among them)
    (first & 0xffc0) === 0xfe80 || // link-local
    (first & 0xffc0) === 0xfec0 || // site-local (deprecated)
    (first & 0xff00) === 0xff00 || // multicast
    (first === 0x2001 && g[1] === 0x0db8) || // documentation
    (first === 0x0100 && g[1] === 0 && g[2] === 0 && g[3] === 0) // discard 100::/64
  );
}

/** True when `ip` (v4 or v6, brackets allowed) is not a public unicast address. Unparseable counts as private. */
export function isPrivateAddress(ip: string): boolean {
  const bare = ip.replace(/^\[|\]$/g, "");
  const v4 = ipv4Parts(bare);
  if (v4) return privateIpv4(v4);
  const v6 = ipv6Groups(bare);
  return v6 ? privateIpv6(v6) : true;
}

function isIpLiteral(hostname: string): boolean {
  const bare = hostname.replace(/^\[|\]$/g, "");
  return ipv4Parts(bare) !== null || bare.includes(":");
}

function localName(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  return !h.includes(".") || h === "localhost" || /\.(localhost|local|internal|home\.arpa|lan)$/.test(h);
}

type Resolve = (hostname: string) => Promise<string[] | null>;

/** Query parameters that carry a credential: a link holding one is never fetched. */
const CREDENTIAL_PARAM =
  /[?&#;](access_token|id_token|refresh_token|token|auth|code|key|api_key|apikey|sig|signature|x-amz-signature|x-amz-credential|x-goog-signature|x-goog-credential|otp|secret|password|session|sessionid)=/i;

/** True when the URL's query or fragment carries what looks like a credential (exported for tests). */
export function carriesCredential(url: string): boolean {
  return CREDENTIAL_PARAM.test(url);
}

type LookupAddress = { address: string; family: number };
type LookupCallback = (error: Error | null, address?: string | LookupAddress[], family?: number) => void;
type NodeDns = { lookup(hostname: string, options: Record<string, unknown>, callback: (e: Error | null, a: LookupAddress[]) => void): void };
let nodeDns: Promise<NodeDns> | null = null;

/**
 * A `dns.lookup` for Node's socket `connect.lookup` (undici `Agent({ connect: { lookup } })`):
 * resolves the name and refuses it when any address is private, so the connection
 * goes only to an address that was checked. That closes DNS rebinding.
 */
export function guardedLookup(hostname: string, options: { all?: boolean; family?: number } | number | undefined, callback: LookupCallback): void {
  const opts = typeof options === "number" ? { family: options } : (options ?? {});
  // A variable specifier keeps bundlers for edge runtimes from resolving it.
  const specifier = "node:dns";
  nodeDns ??= import(/* @vite-ignore */ specifier) as Promise<NodeDns>;
  nodeDns
    .then((dns) =>
      dns.lookup(hostname, { ...opts, all: true, verbatim: true }, (error, addresses) => {
        if (error) return callback(error);
        if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
          return callback(Object.assign(new Error(`genesis-chat: ${hostname} resolves to a private address`), { code: "EADDRNOTAVAIL" }));
        }
        if (opts.all) return callback(null, addresses);
        return callback(null, addresses[0]!.address, addresses[0]!.family);
      }),
    )
    .catch((e: unknown) => callback(e instanceof Error ? e : new Error(String(e))));
}

/** `promise`, or a rejection once `signal` aborts (a lookup can hang past fetch's timeout). */
function withSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new Error("timed out"));
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new Error("timed out"));
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (v) => (signal.removeEventListener("abort", abort), resolve(v)),
      (e: unknown) => (signal.removeEventListener("abort", abort), reject(e instanceof Error ? e : new Error(String(e)))),
    );
  });
}

/** Node's or Deno's resolver, or null where neither is there. */
async function runtimeResolver(): Promise<Resolve | null> {
  const deno = (globalThis as { Deno?: { resolveDns?: (h: string, t: "A" | "AAAA") => Promise<string[]> } }).Deno;
  if (deno?.resolveDns) {
    const resolveDns = deno.resolveDns;
    return async (h) => {
      const [a, aaaa] = await Promise.all([resolveDns(h, "A").catch(() => []), resolveDns(h, "AAAA").catch(() => [])]);
      if (a.length + aaaa.length === 0) throw new Error("no addresses");
      return [...a, ...aaaa];
    };
  }
  try {
    // A variable specifier keeps bundlers for edge runtimes from resolving it.
    const specifier = "node:dns";
    const dns = (await import(/* @vite-ignore */ specifier)) as {
      promises?: { lookup(h: string, o: { all: true; verbatim: boolean }): Promise<{ address: string }[]> };
    };
    const lookup = dns.promises?.lookup;
    if (!lookup) return null;
    return async (h) => (await lookup.call(dns.promises, h, { all: true, verbatim: true })).map((r) => r.address);
  } catch {
    return null;
  }
}

// ── HTML ─────────────────────────────────────────────────────────────────────

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", copy: "©", reg: "®", trade: "™" };

/** Decodes HTML entities (named, decimal, hex). */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi, (whole, ref: string) => {
    if (ref[0] === "#") {
      const code = ref[1] === "x" || ref[1] === "X" ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : "";
    }
    return NAMED[ref.toLowerCase()] ?? whole;
  });
}

function clean(value: string | undefined, cap: number): string | null {
  if (!value) return null;
  // eslint-disable-next-line no-control-regex
  const text = decodeEntities(value.replace(/<[^>]*>/g, " ")).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > cap ? `${text.slice(0, cap - 1).trimEnd()}…` : text;
}

function attributes(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g)) {
    const name = m[1]!.toLowerCase();
    if (!(name in out)) out[name] = m[2] ?? m[3] ?? m[4] ?? "";
  }
  return out;
}

/** Open Graph data from a page's HTML (exported for tests). `base` resolves a relative og:image. */
export function parseOpenGraph(html: string, base: string): Omit<LinkPreview, "url" | "status"> {
  const headEnd = html.search(/<\/head\s*>/i);
  const head = (headEnd >= 0 ? html.slice(0, headEnd) : html).replace(/<!--[\s\S]*?-->/g, "").replace(/<script\b[\s\S]*?<\/script\s*>/gi, "");
  const meta: Record<string, string> = {};
  for (const m of head.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attributes(m[0]);
    const key = (a.property ?? a.name ?? "").toLowerCase();
    if (key && a.content !== undefined && !(key in meta)) meta[key] = a.content;
  }
  const titleTag = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(head)?.[1];
  let imageUrl: string | null = null;
  const rawImage = meta["og:image:secure_url"] ?? meta["og:image"] ?? meta["og:image:url"] ?? meta["twitter:image"];
  if (rawImage) {
    try {
      const resolved = new URL(decodeEntities(rawImage.trim()), base);
      if (resolved.protocol === "https:" && resolved.href.length <= CAPS.url && !resolved.username && !resolved.password) imageUrl = resolved.href;
    } catch {
      imageUrl = null;
    }
  }
  return {
    title: clean(meta["og:title"] ?? meta["twitter:title"] ?? titleTag, CAPS.title),
    description: clean(meta["og:description"] ?? meta["twitter:description"] ?? meta.description, CAPS.description),
    imageUrl,
    siteName: clean(meta["og:site_name"], CAPS.siteName),
  };
}

// ── Fetching ─────────────────────────────────────────────────────────────────

async function readCapped(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    const room = maxBytes - total;
    chunks.push(value.byteLength > room ? value.subarray(0, room) : value);
    total += Math.min(value.byteLength, room);
  }
  await reader.cancel().catch(() => {});
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

export function createLinkUnfurler(options: LinkUnfurlerOptions = {}): LinkUnfurler {
  const fetchFn = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 5000;
  const maxBytes = options.maxBytes ?? 512 * 1024;
  const maxRedirects = options.maxRedirects ?? 3;
  const allowUnresolved = options.allowUnresolved === true;
  const log = options.log ?? ((line: string) => console.warn(line));
  let warned = false;
  let resolver: Promise<Resolve | null> | null = options.resolve ? Promise.resolve(options.resolve) : null;

  /** A name nothing here could resolve: refused unless the app opted in. */
  function unresolved(): "blocked" | null {
    if (allowUnresolved) return null;
    if (!warned) {
      warned = true;
      log("genesis-chat: link previews can't resolve DNS here, so every named host is blocked; pass `resolve`, or `allowUnresolved: true` behind an egress firewall");
    }
    return "blocked";
  }

  /** null when the URL may be fetched; otherwise why not. */
  async function refuse(url: URL, signal: AbortSignal): Promise<"blocked" | "failed" | null> {
    if (url.protocol !== "https:" || url.username || url.password) return "blocked";
    if (url.port && url.port !== "443") return "blocked";
    const host = url.hostname;
    if (isIpLiteral(host)) return isPrivateAddress(host) ? "blocked" : null;
    if (localName(host)) return "blocked";
    resolver ??= runtimeResolver();
    const resolve = await resolver;
    if (!resolve) return unresolved();
    let addresses: string[] | null;
    try {
      addresses = await withSignal(resolve(host), signal);
    } catch {
      return "failed";
    }
    if (addresses === null) return unresolved();
    if (addresses.length === 0) return "failed";
    return addresses.some(isPrivateAddress) ? "blocked" : null;
  }

  return {
    async unfurl(input) {
      const result = (status: LinkPreview["status"]): LinkPreview => ({ url: input, status });
      let url: URL;
      try {
        url = new URL(input);
      } catch {
        return result("blocked");
      }
      const signal = AbortSignal.timeout(timeoutMs);
      try {
        for (let hop = 0; ; hop++) {
          if (carriesCredential(url.href)) return result("blocked");
          const refused = await refuse(url, signal);
          if (refused) return result(refused);
          const response = await fetchFn(url.href, {
            redirect: "manual",
            signal,
            ...(options.dispatcher ? ({ dispatcher: options.dispatcher } as RequestInit) : {}),
            headers: {
              accept: "text/html,application/xhtml+xml;q=0.9",
              "user-agent": options.userAgent ?? "GenesisChat-LinkPreview/1.0",
            },
          });
          if (response.status >= 300 && response.status < 400) {
            await response.body?.cancel().catch(() => {});
            const location = response.headers.get("location");
            if (!location || hop >= maxRedirects) return result("failed");
            try {
              url = new URL(location, url);
            } catch {
              return result("failed");
            }
            continue;
          }
          if (!response.ok) {
            await response.body?.cancel().catch(() => {});
            return result("failed");
          }
          const type = (response.headers.get("content-type") ?? "").toLowerCase();
          if (!/^\s*(text\/html|application\/xhtml\+xml)\b/.test(type)) {
            await response.body?.cancel().catch(() => {});
            return result("failed");
          }
          const declared = Number(response.headers.get("content-length") ?? "");
          if (Number.isFinite(declared) && declared > maxBytes) {
            await response.body?.cancel().catch(() => {});
            return result("failed");
          }
          const html = await readCapped(response, maxBytes);
          const og = parseOpenGraph(html, url.href);
          // Every recipient's device loads the image: hold its host to the same rules, or drop it.
          if (og.imageUrl && (await refuse(new URL(og.imageUrl), signal))) og.imageUrl = null;
          if (!og.title && !og.description && !og.imageUrl) return result("failed");
          return { url: input, status: "ok", ...og };
        }
      } catch {
        // Timeouts, resets, TLS errors: the page isn't there for us.
        return result("failed");
      }
    },
  };
}
