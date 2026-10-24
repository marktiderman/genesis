/**
 * The pieces of a submit endpoint's rate limit that aren't storage: the client's
 * address, the part of it that names one client, a key that never holds the address,
 * and a check that fails open. The counter itself is the app's (`RateLimitStore`), so
 * every server instance can share it (a row in Postgres, a key in Redis).
 *
 * Web Crypto only. Moved up from the host app's src/lib/feedback/rate-limit.server.ts;
 * keys made here equal the ones it made, so a deploy doesn't reset anyone's count.
 */

/**
 * The headers a proxy reports the client's address in, most trusted first. Trust only
 * headers your proxy sets (and overwrites): a client can send any of them itself.
 */
export const DEFAULT_TRUSTED_IP_HEADERS: readonly string[] = ["x-vercel-forwarded-for", "x-forwarded-for", "x-real-ip"];

/**
 * How many submits, saves as they go and photo uploads one client may make per scope
 * (a practice, an account) in a window.
 *
 * - submit: 60 responses per 10 minutes: a class at one gym's Wi-Fi fits.
 * - progress: saving answers as they go. A visit counts once, against `submit`, at its
 *   first save; its later saves (each Next, the send, a reload picking up where it was)
 *   count here, in the same window: 60 people answering 10 questions each on one Wi-Fi fit.
 * - upload: 120 photos per 10 minutes: that class, a couple of photos each.
 */
export const RATE_LIMIT_DEFAULTS = {
  submit: { limit: 60, windowSeconds: 600 },
  progress: { limit: 900, windowSeconds: 600 },
  upload: { limit: 120, windowSeconds: 600 },
} as const satisfies Record<string, { limit: number; windowSeconds: number }>;

/**
 * The client's address as the proxy reports it, used only as a rate-limit key: the first
 * entry of the first of `trusted` that is set, trimmed, else `"unknown"`.
 */
export function clientIp(headers: Pick<Headers, "get">, trusted: readonly string[] = DEFAULT_TRUSTED_IP_HEADERS): string {
  for (const name of trusted) {
    const first = headers.get(name)?.split(",")[0]?.trim();
    if (first) return first;
  }
  return "unknown";
}

/** The part of an address that names one client: an IPv4 address whole, an IPv6 address by its /64. */
export function addressPrefix(ip: string): string {
  const bare = ip
    .replace(/^\[|\](:\d+)?$/g, "")
    .split("%")[0]!
    .toLowerCase();
  if (!bare.includes(":")) return bare;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(bare);
  if (mapped) return mapped[1]!;
  const [head = "", tail = ""] = bare.split("::");
  const left = head ? head.split(":") : [];
  const right = bare.includes("::") && tail ? tail.split(":") : [];
  const groups = bare.includes("::")
    ? [...left, ...Array<string>(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right]
    : left;
  return `${groups
    .slice(0, 4)
    .map((g) => (g || "0").replace(/^0+(?=.)/, ""))
    .join(":")}::/64`;
}

/**
 * The stored key, `<kind>:<scope>:<hex HMAC-SHA256 of the address prefix>`: what is
 * counted (such as `submit`, `progress`, `upload`), whose count it is (a practice id),
 * and the client, which is never stored as its address. `secret` is a server secret.
 */
export async function rateLimitKey(input: { kind: string; scope: string; ip: string; secret: string }): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(input.secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(addressPrefix(input.ip))));
  let hex = "";
  for (const b of mac) hex += b.toString(16).padStart(2, "0");
  return `${input.kind}:${input.scope}:${hex}`;
}

/** The app's shared counter. */
export interface RateLimitStore {
  /**
   * Count one hit on `key` in its current `windowSeconds` window: true while the count is
   * within `limit`, false past it, null when it could not count.
   */
  hit(key: string, limit: number, windowSeconds: number): Promise<boolean | null>;
}

/**
 * True when the request may go on. Fails open: when the store can't count (it answers
 * null or throws) the request goes on and `log` says so with `message`.
 */
export async function allow(
  store: RateLimitStore,
  check: { key: string; limit: number; windowSeconds: number },
  options: { log?: ((message: string) => void) | undefined; message?: string | undefined } = {},
): Promise<boolean> {
  let allowed: boolean | null;
  try {
    allowed = await store.hit(check.key, check.limit, check.windowSeconds);
  } catch {
    allowed = null;
  }
  if (allowed !== null) return allowed;
  (options.log ?? ((m: string) => console.warn(m)))(
    options.message ?? "The rate limit could not be checked; letting the request through.",
  );
  return true;
}
