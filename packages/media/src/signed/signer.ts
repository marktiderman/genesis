/**
 * Signing and checking media links: an HMAC-SHA256 over a versioned message
 * (the format, the key id, the scope and the expiry), on WebCrypto only
 * (Node 20+ and Workers).
 *
 * Server-side only. The same secret signs and verifies, so it must never
 * reach a browser: a browser only ever receives finished signed URLs.
 */
import { scopeFilename, scopeKind, type MediaScope, type MediaScopeKind } from "./scope";

const utf8 = new TextEncoder();

/** Seconds (`7200`) or a count with a unit: `"30m"`, `"2h"`, `"7d"`. Between one minute and 30 days. */
export type MediaTtl = number | `${number}${"s" | "m" | "h" | "d"}`;

/** The shortest link, in seconds: one minute. */
export const MIN_MEDIA_TTL = 60;
/** The longest link, in seconds: 30 days (a lab or video provider fetching over days). */
export const MAX_MEDIA_TTL = 30 * 86_400;

/** How long a link of each scope lasts when `sign` isn't told: two hours for every kind. */
export const DEFAULT_MEDIA_TTL: Readonly<Record<MediaScopeKind, MediaTtl>> = { item: "2h", file: "2h", download: "2h", bundle: "2h" };

/** @stability Experimental */
export interface MediaSignOptions {
  /** How long this link lasts, from one minute to 30 days. Default the signer's `ttl` for the scope's kind. */
  ttl?: MediaTtl | undefined;
  /**
   * `"hour"`: expire at the end of the hour that `now + ttl` falls in, so
   * every link signed for the same scope within one hour is the same URL
   * (and caches as one). The link then lasts between `ttl` and `ttl` plus an
   * hour. Without it the link expires exactly `ttl` from now. Default the
   * signer's `align`.
   */
  align?: "hour" | "none" | undefined;
}

/**
 * A signature, as the URL carries it: `e`, the expiry in Unix seconds; `s`,
 * the signature (`v1.` and base64url); and `k`, the id of the key that
 * signed it (absent with a single `secret`).
 */
export interface MediaToken {
  e: number;
  s: string;
  k?: string;
}

/** The raw query values a handler hands to `verify`. */
export interface MediaTokenInput {
  e: number | string | null | undefined;
  s: string | null | undefined;
  k?: string | null | undefined;
}

/** A secret: text or bytes, at least 32 bytes (`openssl rand -base64 32`). */
export type MediaSecret = string | Uint8Array;

/** @stability Experimental */
export type MediaSignerOptions = (
  | {
      /** One signing secret. Its tokens carry no key id. */
      secret: MediaSecret;
      keys?: undefined;
    }
  | {
      secret?: undefined;
      /**
       * Several secrets by id, for rotation: links are signed with `current`
       * and carry its id (`k`); a link verifies with whichever listed key
       * its id names. A link with no id (made with a single `secret`)
       * verifies with any listed key, so moving from `secret` to `keys`
       * keeps old links working. Retire a key once its links have expired.
       */
      keys: { current: string; secrets: Record<string, MediaSecret> };
    }
) & {
  /**
   * How long links last, per scope kind, from one minute to 30 days: hours
   * for viewing (`item`, `file`), days for a lab or a video provider fetching
   * an original (`download: "7d"`). Kinds left out keep `DEFAULT_MEDIA_TTL`.
   * A `sign` call's own `ttl` wins.
   */
  ttl?: Partial<Record<MediaScopeKind, MediaTtl>> | undefined;
  /** The default alignment: `"hour"` (links cache within the hour) or `"none"`. Default `"none"`. */
  align?: "hour" | "none" | undefined;
  /** The time, in Unix seconds. Default the clock. */
  now?: (() => number) | undefined;
};

/** @stability Experimental */
export interface MediaSigner {
  /** Signs `scope` until its TTL from now (the call's, else the signer's for the scope's kind). */
  sign(scope: MediaScope, options?: MediaSignOptions): Promise<MediaToken>;
  /**
   * True when `token` was signed for exactly `scope` by one of this signer's
   * keys and hasn't expired. Takes the raw query values (strings or null).
   * Never throws for a bad token or scope: it answers false.
   */
  verify(scope: MediaScope, token: MediaTokenInput): Promise<boolean>;
  /**
   * `base` plus `path` (plain text, each segment percent-encoded here) plus
   * `?e=…&s=…`, `&k=<key id>` when the signer has `keys`, and
   * `&d=<filename>` for a `download` scope, so the handler can rebuild the
   * scope it checks.
   */
  signMediaUrl(base: string | URL, path: string, scope: MediaScope, options?: MediaSignOptions): Promise<string>;
}

/**
 * A signature format: the text the HMAC covers. A new format gets a new
 * version and is added beside the old ones, so links already handed out
 * keep verifying until they expire.
 *
 * @internal
 */
export type SignatureFormat = (input: { scope: string; e: number; k: string | undefined }) => string;

/** The formats this code verifies, and the one it signs with. A scope never holds a newline. @internal */
export const SIGNATURE_FORMATS = {
  v1: ({ scope, e, k }) => `v1:genesis-media\n${k ?? ""}\n${scope}\n${e}`,
} satisfies Record<string, SignatureFormat>;

const UNITS = { s: 1, m: 60, h: 3600, d: 86_400 } as const;

function ttlSeconds(ttl: MediaTtl): number {
  const m = typeof ttl === "number" ? null : /^(\d+(?:\.\d+)?)([smhd])$/.exec(ttl);
  const seconds = typeof ttl === "number" ? ttl : m ? Number(m[1]) * UNITS[m[2] as keyof typeof UNITS] : NaN;
  if (!Number.isFinite(seconds) || seconds < MIN_MEDIA_TTL || seconds > MAX_MEDIA_TTL) {
    throw new RangeError(`createMediaSigner: ttl must be between one minute and 30 days ("30m", "2h", "7d" or seconds), not ${String(ttl)}.`);
  }
  return Math.ceil(seconds);
}

function base64url(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Compares two byte strings in time that depends only on their lengths. */
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length && i < b.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

const KEY_ID = /^[A-Za-z0-9_-]{1,32}$/;

function secretBytes(secret: MediaSecret, label: string): Uint8Array<ArrayBuffer> {
  const raw = typeof secret === "string" ? utf8.encode(secret) : secret;
  if (!(raw instanceof Uint8Array) || raw.byteLength < 32) throw new TypeError(`createMediaSigner: ${label} must be at least 32 bytes.`);
  return new Uint8Array(raw);
}

function checkScope(scope: MediaScope): void {
  if (!scopeKind(scope)) throw new TypeError("createMediaSigner: scope must come from mediaScope.");
}

type CryptoKeyLike = Awaited<ReturnType<typeof crypto.subtle.importKey>>;

/**
 * `createMediaSigner` with the formats it knows given (tests add a future
 * format through this). Not exported from the package.
 *
 * @internal
 */
export function createMediaSignerWithFormats(
  options: MediaSignerOptions,
  formats: Record<string, SignatureFormat>,
  signWith: string,
): MediaSigner {
  // A cheap tripwire for a signer bundled into a page: the secret would ship with it.
  if (typeof (globalThis as { document?: unknown }).document !== "undefined") {
    throw new Error("createMediaSigner runs on a server only: its secret must never reach a browser.");
  }
  // Key id undefined: the single-secret shorthand, whose tokens carry no `k`.
  const secrets = new Map<string | undefined, Uint8Array<ArrayBuffer>>();
  let current: string | undefined;
  if (options.keys) {
    current = options.keys.current;
    for (const [id, secret] of Object.entries(options.keys.secrets)) {
      if (!KEY_ID.test(id)) throw new TypeError(`createMediaSigner: key id "${id}" must be 1 to 32 letters, digits, "-" or "_".`);
      secrets.set(id, secretBytes(secret, `keys.secrets.${id}`));
    }
    if (!secrets.has(current)) throw new TypeError(`createMediaSigner: keys.current "${current}" isn't in keys.secrets.`);
  } else {
    secrets.set(undefined, secretBytes(options.secret, "the secret"));
  }
  const format = formats[signWith];
  if (!format) throw new TypeError(`createMediaSigner: no signature format ${signWith}.`);
  const now = options.now ?? (() => Date.now() / 1000);
  const ttls: Record<MediaScopeKind, number> = { item: 0, file: 0, download: 0, bundle: 0 };
  for (const kind of Object.keys(ttls) as MediaScopeKind[]) ttls[kind] = ttlSeconds(options.ttl?.[kind] ?? DEFAULT_MEDIA_TTL[kind]);
  const defaultAlign = options.align ?? "none";

  const imported = new Map<string | undefined, Promise<CryptoKeyLike>>();
  const mac = async (k: string | undefined, version: string, text: string) => {
    let key = imported.get(k);
    if (!key) {
      key = crypto.subtle.importKey("raw", secrets.get(k)!, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      imported.set(k, key);
    }
    return `${version}.${base64url(new Uint8Array(await crypto.subtle.sign("HMAC", await key, utf8.encode(text))))}`;
  };

  const sign: MediaSigner["sign"] = async (scope, opts = {}) => {
    checkScope(scope);
    const ttl = opts.ttl === undefined ? ttls[scopeKind(scope)!] : ttlSeconds(opts.ttl);
    const end = Math.floor(now()) + ttl;
    const e = (opts.align ?? defaultAlign) === "hour" ? (Math.floor(end / 3600) + 1) * 3600 : end;
    const s = await mac(current, signWith, format({ scope, e, k: current }));
    return current === undefined ? { e, s } : { e, s, k: current };
  };

  return {
    sign,
    async verify(scope, token) {
      // A malformed scope (not from mediaScope) is a refusal, not a throw, so a handler answers 403.
      if (!scopeKind(scope)) return false;
      const eText = typeof token?.e === "number" ? String(token.e) : token?.e;
      const s = token?.s;
      // Unix seconds as written by sign: digits, no sign, no leading zero.
      if (typeof eText !== "string" || !/^[1-9]\d{0,11}$/.test(eText) || typeof s !== "string") return false;
      const e = Number(eText);
      if (e <= now()) return false;
      // The version is read explicitly: `v1x.…` or `v01.…` is no version, never v1.
      const parsed = /^(v[1-9]\d{0,3})\.[A-Za-z0-9_-]{1,128}$/.exec(s);
      const version = parsed?.[1];
      const versionFormat = version !== undefined && Object.hasOwn(formats, version) ? formats[version] : undefined;
      if (!versionFormat || version === undefined) return false;
      const k = token.k ?? undefined;
      // A token naming a key is checked with that key only; one with no id, with every key.
      const candidates = k !== undefined ? (KEY_ID.test(k) && secrets.has(k) ? [k] : []) : [...secrets.keys()];
      let ok = false;
      for (const id of candidates) {
        // The id the token was signed under is the one it carries: none for a single-secret token.
        const want = await mac(id, version, versionFormat({ scope, e, k }));
        // Compared as text, so only the one canonical encoding of the signature passes.
        ok = sameBytes(utf8.encode(s), utf8.encode(want)) || ok;
      }
      return ok;
    },
    async signMediaUrl(base, path, scope, opts) {
      const { e, s, k } = await sign(scope, opts);
      const url = new URL(String(base));
      const segments = path.split("/").filter(Boolean).map(encodeURIComponent).join("/");
      url.pathname = `${url.pathname.replace(/\/+$/, "")}/${segments}`;
      url.search = "";
      url.searchParams.set("e", String(e));
      url.searchParams.set("s", s);
      if (k !== undefined) url.searchParams.set("k", k);
      const filename = scopeFilename(scope);
      if (filename !== undefined) url.searchParams.set("d", filename);
      return url.href;
    },
  };
}

/**
 * The signer for media links. **Server-side only** (Node 20+ and Workers):
 * the secret both signs and verifies, so it must never reach a browser,
 * which only ever receives finished signed URLs. It never decides who may
 * see what: the app checks the person first, then signs.
 *
 * ```ts
 * const signer = createMediaSigner({ secret: env.MEDIA_SIGNING_SECRET });
 * const url = await signer.signMediaUrl("https://media.example.com", "photos/a1/poster.jpg",
 *   mediaScope.file("photos", "a1", "poster"), { ttl: "2h", align: "hour" });
 * ```
 *
 * @stability Experimental
 */
export function createMediaSigner(options: MediaSignerOptions): MediaSigner {
  return createMediaSignerWithFormats(options, SIGNATURE_FORMATS, "v1");
}
