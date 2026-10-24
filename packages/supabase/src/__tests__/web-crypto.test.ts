import { createHash, randomFillSync, webcrypto } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGenesisSupabase } from "../index";
import { assertPkceCrypto, hasPkceCrypto, installWebCrypto, isDigestOnlyPolyfill, type ExpoCryptoLike } from "../native";

/** expo-crypto's two calls, done by Node, counting how often each runs. */
function fakeExpoCrypto() {
  const calls = { random: 0, digest: [] as string[] };
  const expo: ExpoCryptoLike = {
    getRandomValues(array: Uint8Array) {
      calls.random++;
      return randomFillSync(array);
    },
    async digest(algorithm: string, data: BufferSource) {
      calls.digest.push(algorithm);
      const bytes = ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : new Uint8Array(data);
      const out = createHash("sha256").update(bytes).digest();
      return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
    },
  };
  return { expo, calls };
}

const memory = () => {
  const m = new Map<string, string>();
  return {
    items: m,
    getItem: async (k: string) => m.get(k) ?? null,
    setItem: async (k: string, v: string) => void m.set(k, v),
    removeItem: async (k: string) => void m.delete(k),
  };
};

const nativeClient = (crypto?: ExpoCryptoLike, extra: { storage?: ReturnType<typeof memory>; fetch?: typeof fetch } = {}) =>
  createGenesisSupabase({
    url: "http://localhost:54321",
    publishableKey: "test",
    storage: extra.storage ?? memory(),
    platform: "native",
    crypto,
    options: extra.fetch ? { global: { fetch: extra.fetch } } : {},
  });

// Hermes: no `crypto` global at all (not even `"crypto" in globalThis`).
const realCrypto = Object.getOwnPropertyDescriptor(globalThis, "crypto")!;
function withoutWebCrypto() {
  delete (globalThis as { crypto?: unknown }).crypto;
}

afterEach(() => {
  Object.defineProperty(globalThis, "crypto", realCrypto);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const base64url = (bytes: Uint8Array | Buffer) => Buffer.from(bytes).toString("base64url");

describe("installWebCrypto", () => {
  it("leaves real WebCrypto alone", () => {
    const { expo, calls } = fakeExpoCrypto();
    const target = { crypto: webcrypto };
    expect(installWebCrypto(expo, target)).toBe("native");
    expect(target.crypto).toBe(webcrypto);
    expect(calls.random).toBe(0);
  });

  it("installs getRandomValues and a SHA-256 digest that match WebCrypto", async () => {
    const { expo, calls } = fakeExpoCrypto();
    const target: { crypto?: Crypto } = {};
    expect(installWebCrypto(expo, target)).toBe("polyfill");
    expect(installWebCrypto(expo, target)).toBe("polyfill");

    const words = target.crypto!.getRandomValues(new Uint32Array(8));
    expect(words.some((w) => w !== 0)).toBe(true);
    expect(calls.random).toBe(1);

    const data = new TextEncoder().encode("a verifier");
    const ours = new Uint8Array(await target.crypto!.subtle.digest("SHA-256", data));
    const real = new Uint8Array(await webcrypto.subtle.digest("SHA-256", data));
    expect(ours).toEqual(real);
    expect(new Uint8Array(await target.crypto!.subtle.digest({ name: "sha-256" }, data.buffer))).toEqual(real);
    expect(calls.digest).toEqual(["SHA-256", "SHA-256"]);
  });

  it("refuses other algorithms, non-integer arrays and oversized requests", async () => {
    const target: { crypto?: Crypto } = {};
    installWebCrypto(fakeExpoCrypto().expo, target);
    await expect(target.crypto!.subtle.digest("SHA-1", new Uint8Array(1))).rejects.toThrow(/only SHA-256/);
    expect(() => target.crypto!.getRandomValues(new Float32Array(4) as unknown as Uint8Array)).toThrow(TypeError);
    expect(() => target.crypto!.getRandomValues(new Uint8Array(65537))).toThrow(RangeError);
  });

  it("keeps a runtime's own getRandomValues, and its own subtle's methods, when only digest is missing", () => {
    const own = vi.fn((a: Uint8Array) => a);
    class OwnSubtle {
      importKey() {
        return "own";
      }
    }
    const target = { crypto: { getRandomValues: own, subtle: new OwnSubtle() } };
    installWebCrypto(fakeExpoCrypto().expo, target);
    target.crypto.getRandomValues(new Uint8Array(4));
    expect(own).toHaveBeenCalledOnce();
    expect((target.crypto.subtle as OwnSubtle).importKey()).toBe("own");
    expect(hasPkceCrypto(Object.assign(target, { TextEncoder, btoa }))).toBe(true);
    expect(isDigestOnlyPolyfill(target)).toBe(false);
  });

  it("throws without expo-crypto", () => {
    expect(() => installWebCrypto({} as ExpoCryptoLike, {})).toThrow(/expo-crypto/);
  });
});

describe("PKCE on native", () => {
  it("sends the S256 hash of the stored verifier, made with expo-crypto, when the runtime has no WebCrypto", async () => {
    withoutWebCrypto();
    expect("crypto" in globalThis).toBe(false);
    const warn = vi.spyOn(console, "warn");
    const { expo, calls } = fakeExpoCrypto();
    const storage = memory();
    const client = nativeClient(expo, { storage });
    const { data, error } = await client.auth.signInWithOAuth({ provider: "google", options: { skipBrowserRedirect: true, redirectTo: "app://cb" } });
    expect(error).toBeNull();
    const url = new URL(data.url!);
    expect(url.searchParams.get("code_challenge_method")).toBe("s256");

    const [stored] = [...storage.items].filter(([key]) => /-flow-.+-code-verifier$/.test(key)).map(([, value]) => value);
    expect(stored).toBeDefined();
    const verifier = stored!.startsWith('"') ? (JSON.parse(stored!) as string) : stored!;
    expect(verifier).toMatch(/^[0-9a-f]{112}$/);
    expect(url.searchParams.get("code_challenge")).toBe(base64url(createHash("sha256").update(verifier).digest()));

    expect(calls.digest).toEqual(["SHA-256"]);
    expect(calls.random).toBeGreaterThan(0);
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining("WebCrypto API is not supported"));
  });

  it("checks an asymmetric JWT with the server in getClaims, since the polyfill can't verify", async () => {
    withoutWebCrypto();
    const urls: string[] = [];
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      if (url.endsWith("/auth/v1/user")) return new Response(JSON.stringify({ id: "u1", aud: "authenticated" }), { status: 200, headers: { "content-type": "application/json" } });
      return new Response("{}", { status: 404 });
    }) as unknown as typeof globalThis.fetch;
    const client = nativeClient(fakeExpoCrypto().expo, { fetch });
    const payload = { sub: "u1", exp: Math.floor(Date.now() / 1000) + 3600, role: "authenticated" };
    const jwt = [base64url(Buffer.from(JSON.stringify({ alg: "ES256", kid: "k1", typ: "JWT" }))), base64url(Buffer.from(JSON.stringify(payload))), base64url(randomFillSync(new Uint8Array(64)))].join(".");

    const { data, error } = await client.auth.getClaims(jwt);
    expect(error).toBeNull();
    expect(data?.claims).toMatchObject({ sub: "u1" });
    expect(urls.some((u) => u.endsWith("/auth/v1/user"))).toBe(true);
    expect(urls.some((u) => u.includes("jwks"))).toBe(false);

    const expired = [jwt.split(".")[0], base64url(Buffer.from(JSON.stringify({ ...payload, exp: 1 }))), jwt.split(".")[2]].join(".");
    expect((await client.auth.getClaims(expired)).error?.message).toMatch(/expired/);
    expect((await client.auth.getClaims("not-a-jwt")).error?.message).toMatch(/Invalid JWT/);
  });

  it("fails loudly in development when there is neither WebCrypto nor expo-crypto", () => {
    withoutWebCrypto();
    expect(() => nativeClient()).toThrow(/PKCE challenges as "plain"/);
  });

  it("checks on web too", () => {
    withoutWebCrypto();
    expect(() => createGenesisSupabase({ url: "http://localhost:54321", publishableKey: "test" })).toThrow(/plain/);
    expect(() =>
      createGenesisSupabase({ url: "http://localhost:54321", publishableKey: "test", options: { auth: { flowType: "implicit" } } }),
    ).not.toThrow();
  });

  it("logs instead of throwing in a release build", () => {
    withoutWebCrypto();
    vi.stubGlobal("__DEV__", false);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => assertPkceCrypto()).not.toThrow();
    expect(error).toHaveBeenCalledWith(expect.stringContaining("expo-crypto"));
  });

  it("needs nothing extra where WebCrypto is real, and leaves getClaims alone", () => {
    const client = nativeClient();
    expect(isDigestOnlyPolyfill()).toBe(false);
    expect(client.auth.getClaims.name).toBe("getClaims");
  });
});
