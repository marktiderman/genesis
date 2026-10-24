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
  const subtle = typeof realSubtle?.digest === "function" ? realSubtle : { ...(realSubtle ?? {}), digest };

  const crypto = Object.assign(Object.create(existing ?? Object.prototype) as object, { getRandomValues, subtle, [POLYFILL]: true });
  Object.defineProperty(target, "crypto", { value: crypto, configurable: true, enumerable: false, writable: true });
  return "polyfill";
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
