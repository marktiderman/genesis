import { createHash, randomFillSync, webcrypto } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGenesisSupabase } from "../index";
import { assertPkceCrypto, hasPkceCrypto, installWebCrypto, type ExpoCryptoLike } from "../native";

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
  return { getItem: async (k: string) => m.get(k) ?? null, setItem: async (k: string, v: string) => void m.set(k, v), removeItem: async (k: string) => void m.delete(k) };
};

const nativeClient = (crypto?: ExpoCryptoLike) =>
  createGenesisSupabase({ url: "http://localhost:54321", publishableKey: "test", storage: memory(), platform: "native", crypto });

/** Hermes: no `crypto` global at all. */
function withoutWebCrypto() {
  vi.stubGlobal("crypto", undefined);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

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

  it("keeps a runtime's own getRandomValues when only subtle is missing", () => {
    const own = vi.fn((a: Uint8Array) => a);
    const target = { crypto: { getRandomValues: own } };
    installWebCrypto(fakeExpoCrypto().expo, target);
    target.crypto.getRandomValues(new Uint8Array(4));
    expect(own).toHaveBeenCalledOnce();
    expect(hasPkceCrypto(Object.assign(target, { TextEncoder, btoa }))).toBe(true);
  });

  it("throws without expo-crypto", () => {
    expect(() => installWebCrypto({} as ExpoCryptoLike, {})).toThrow(/expo-crypto/);
  });
});

describe("PKCE on native", () => {
  it("sends an S256 challenge, from expo-crypto, when the runtime has no WebCrypto", async () => {
    withoutWebCrypto();
    const warn = vi.spyOn(console, "warn");
    const { expo, calls } = fakeExpoCrypto();
    const client = nativeClient(expo);
    const { data, error } = await client.auth.signInWithOAuth({ provider: "google", options: { skipBrowserRedirect: true, redirectTo: "app://cb" } });
    expect(error).toBeNull();
    const url = new URL(data.url!);
    expect(url.searchParams.get("code_challenge_method")).toBe("s256");
    expect(url.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(calls.digest).toEqual(["SHA-256"]);
    expect(calls.random).toBeGreaterThan(0);
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining("WebCrypto API is not supported"));
  });

  it("fails loudly in development when there is neither WebCrypto nor expo-crypto", () => {
    withoutWebCrypto();
    expect(() => nativeClient()).toThrow(/PKCE challenges as "plain"/);
  });

  it("logs instead of throwing in a release build", () => {
    withoutWebCrypto();
    vi.stubGlobal("__DEV__", false);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => assertPkceCrypto()).not.toThrow();
    expect(error).toHaveBeenCalledWith(expect.stringContaining("expo-crypto"));
  });

  it("needs nothing extra where WebCrypto is real", () => {
    expect(() => nativeClient()).not.toThrow();
  });
});
