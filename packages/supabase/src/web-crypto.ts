/**
 * The two WebCrypto calls supabase-js's PKCE flow needs, for runtimes that
 * lack them (Hermes in React Native has no `crypto.subtle`).
 *
 * supabase-js makes the PKCE code verifier with `crypto.getRandomValues` and
 * the S256 code challenge with `crypto.subtle.digest("SHA-256", …)`. When
 * `crypto.subtle` is missing it warns and sends the verifier itself as a
 * "plain" challenge; when `crypto` is missing altogether it also makes the
 * verifier with `Math.random`. Either way an intercepted redirect is enough to
 * finish someone else's sign-in. This installs both calls on `globalThis.crypto`
 * from `expo-crypto`, which hashes and draws random bytes natively.
 *
 * Platform-neutral: nothing here imports Expo. Pass the module in.
 */

/** The parts of `expo-crypto` the polyfill uses: `import * as ExpoCrypto from "expo-crypto"`. */
export interface ExpoCryptoLike {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getRandomValues(typedArray: any): any;
  /** `algorithm` is `CryptoDigestAlgorithm`, whose SHA-256 member is the string `"SHA-256"`. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  digest(algorithm: any, data: BufferSource): Promise<ArrayBuffer>;
}

/** What {@link installWebCrypto} found: real WebCrypto left alone, or the polyfill in place. */
export type WebCryptoSource = "native" | "polyfill";

interface CryptoLike {
  getRandomValues?: (array: ArrayBufferView) => ArrayBufferView;
  subtle?: { digest?: (algorithm: AlgorithmIdentifier, data: BufferSource) => Promise<ArrayBuffer> };
}

const POLYFILL = Symbol.for("genesis.webCryptoPolyfill");

/** WebCrypto's quota for one `getRandomValues` call. */
const MAX_RANDOM_BYTES = 65536;

function algorithmName(algorithm: AlgorithmIdentifier): string {
  const name = typeof algorithm === "string" ? algorithm : (algorithm as { name?: unknown } | null)?.name;
  return typeof name === "string" ? name.toUpperCase() : "";
}

const INTEGER_ARRAYS = ["Int8Array", "Uint8Array", "Uint8ClampedArray", "Int16Array", "Uint16Array", "Int32Array", "Uint32Array", "BigInt64Array", "BigUint64Array"];

function isIntegerArray(value: unknown): value is ArrayBufferView {
  return ArrayBuffer.isView(value) && INTEGER_ARRAYS.includes(Object.prototype.toString.call(value).slice(8, -1));
}

function cryptoOf(target: object): CryptoLike | undefined {
  return (target as { crypto?: CryptoLike }).crypto;
}

/**
 * True when `target` has everything supabase-js needs for an S256 PKCE
 * challenge made from secure random bytes.
 *
 * @stability Beta
 */
export function hasPkceCrypto(target: object = globalThis): boolean {
  const g = target as { TextEncoder?: unknown; btoa?: unknown };
  const crypto = cryptoOf(target);
  return (
    typeof crypto?.getRandomValues === "function" &&
    typeof crypto?.subtle?.digest === "function" &&
    typeof g.TextEncoder === "function" &&
    typeof g.btoa === "function"
  );
}

/**
 * Give `globalThis.crypto` a `getRandomValues` and a SHA-256
 * `subtle.digest`, backed by `expo-crypto`, when the runtime has none. Real
 * WebCrypto is never replaced: a `crypto` that has one of the two keeps it.
 * Only SHA-256 is offered: `subtle.digest` rejects any other algorithm, and no
 * other `subtle` method is added, so a library that needs more fails instead
 * of getting a stand-in. Safe to call more than once.
 *
 * `createGenesisSupabase({ platform: "native", crypto })` calls this for you.
 *
 * @stability Beta
 */
export function installWebCrypto(expoCrypto: ExpoCryptoLike, target: object = globalThis): WebCryptoSource {
  if (typeof expoCrypto?.getRandomValues !== "function" || typeof expoCrypto?.digest !== "function") {
    throw new TypeError('installWebCrypto needs expo-crypto: pass `import * as ExpoCrypto from "expo-crypto"`.');
  }
  const existing = cryptoOf(target);
  const realRandom = existing?.getRandomValues;
  const realSubtle = existing?.subtle;
  if (typeof realRandom === "function" && typeof realSubtle?.digest === "function") {
    return (existing as Record<symbol, unknown>)[POLYFILL] ? "polyfill" : "native";
  }

  const getRandomValues =
    typeof realRandom === "function"
      ? realRandom.bind(existing)
      : <T extends ArrayBufferView>(array: T): T => {
          if (!isIntegerArray(array)) throw new TypeError("crypto.getRandomValues: expected an integer TypedArray.");
          if (array.byteLength > MAX_RANDOM_BYTES) {
            throw new RangeError(`crypto.getRandomValues: ${array.byteLength} bytes is over the ${MAX_RANDOM_BYTES}-byte quota.`);
          }
          // Through a byte view, so every element of any TypedArray gets random bits in every byte.
          const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
          const filled: unknown = expoCrypto.getRandomValues(bytes);
          if (filled !== bytes) {
            if (!(filled instanceof Uint8Array) || filled.byteLength !== bytes.byteLength) {
              throw new Error("crypto.getRandomValues: expo-crypto returned no random bytes.");
            }
            bytes.set(filled);
          }
          return array;
        };

  const digest = async (algorithm: AlgorithmIdentifier, data: BufferSource): Promise<ArrayBuffer> => {
    const name = algorithmName(algorithm);
    if (name !== "SHA-256") throw new Error(`crypto.subtle.digest: only SHA-256 is polyfilled, not ${name || String(algorithm)}.`);
    let bytes: Uint8Array;
    if (ArrayBuffer.isView(data)) bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    else if (data instanceof ArrayBuffer) bytes = new Uint8Array(data);
    else throw new TypeError("crypto.subtle.digest: expected an ArrayBuffer or a TypedArray.");
    // A copy, so the hash reads these bytes even if the caller reuses its buffer.
    return expoCrypto.digest("SHA-256", bytes.slice());
  };
  // A runtime's own `subtle` (without digest) stays the prototype, so none of its methods are lost.
  const subtle = typeof realSubtle?.digest === "function" ? realSubtle : Object.assign(Object.create(realSubtle ?? Object.prototype) as object, { digest });

  const crypto = Object.assign(Object.create(existing ?? Object.prototype) as object, { getRandomValues, subtle, [POLYFILL]: true });
  Object.defineProperty(target, "crypto", { value: crypto, configurable: true, enumerable: false, writable: true });
  return "polyfill";
}

/**
 * True when `globalThis.crypto.subtle` is this polyfill's digest-only stand-in
 * (no `importKey` or `verify`), which supabase-js's `getClaims` can't use.
 */
export function isDigestOnlyPolyfill(target: object = globalThis): boolean {
  const crypto = cryptoOf(target) as (CryptoLike & Record<symbol, unknown>) | undefined;
  return Boolean(crypto?.[POLYFILL]) && typeof (crypto?.subtle as { importKey?: unknown } | undefined)?.importKey !== "function";
}

/** The parts of supabase-js's auth client that {@link claimsViaServer} uses. */
export interface ClaimsAuthClient {
  getSession(): Promise<{ data: { session: { access_token: string } | null }; error: unknown }>;
  getUser(jwt?: string): Promise<{ error: unknown }>;
}

/** A JWT's three parts, decoded (header and payload as JSON, the signature as bytes). */
function decodeJwt(token: string): { header: Record<string, unknown>; payload: Record<string, unknown>; signature: Uint8Array } | null {
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((p) => !/^[A-Za-z0-9_-]*$/.test(p))) return null;
  const bytes = (part: string) => {
    const binary = atob(part.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((part.length + 3) % 4));
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  };
  try {
    const json = (part: string) => JSON.parse(new TextDecoder().decode(bytes(part))) as Record<string, unknown>;
    return { header: json(parts[0]!), payload: json(parts[1]!), signature: bytes(parts[2]!) };
  } catch {
    return null;
  }
}

/**
 * `auth.getClaims` for a runtime whose `crypto.subtle` is the digest-only
 * polyfill. supabase-js verifies an asymmetric JWT locally whenever
 * `crypto.subtle` exists, and would throw on the missing `importKey`; this
 * always takes supabase-js's own fallback instead: the server checks the
 * token (`getUser`), and the claims are returned only if it accepts it.
 * Same result shape as `getClaims`.
 */
export function claimsViaServer(auth: ClaimsAuthClient, invalidJwt: (message: string) => Error) {
  return async (jwt?: string, options: { allowExpired?: boolean } = {}) => {
    let token = jwt;
    if (!token) {
      const { data, error } = await auth.getSession();
      if (error || !data.session) return { data: null, error: error ?? null };
      token = data.session.access_token;
    }
    const decoded = decodeJwt(token);
    if (!decoded) return { data: null, error: invalidJwt("Invalid JWT structure") };
    if (!options.allowExpired) {
      const exp = decoded.payload.exp;
      if (typeof exp !== "number") return { data: null, error: invalidJwt("Missing exp claim") };
      if (exp <= Math.floor(Date.now() / 1000)) return { data: null, error: invalidJwt("JWT has expired") };
    }
    const { error } = await auth.getUser(token);
    if (error) return { data: null, error };
    return { data: { claims: decoded.payload, header: decoded.header, signature: decoded.signature }, error: null };
  };
}

declare const __DEV__: boolean | undefined;

function isDev(): boolean {
  if (typeof __DEV__ !== "undefined") return Boolean(__DEV__);
  return typeof process !== "undefined" && process.env?.NODE_ENV !== "production";
}

/**
 * Fail loudly when PKCE would fall back to "plain": throws in development,
 * logs an error in a release build (a crash at launch helps no one there).
 *
 * @stability Beta
 */
export function assertPkceCrypto(target: object = globalThis): void {
  if (hasPkceCrypto(target)) return;
  const message =
    'Genesis Supabase: this runtime has no WebCrypto (crypto.getRandomValues and crypto.subtle.digest), so supabase-js would send PKCE challenges as "plain". ' +
    'Pass expo-crypto: createGenesisSupabase({ platform: "native", crypto: ExpoCrypto, … }) with `import * as ExpoCrypto from "expo-crypto"`.';
  if (isDev()) throw new Error(message);
  console.error(message);
}
