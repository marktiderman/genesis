import { describe, expect, it } from "vitest";
import { FetchRefusedError, fetchGuarded, type Transport } from "./index";

function transport(routes: Record<string, { status?: number; body?: Uint8Array; location?: string }>): Transport {
  return async (url) => {
    const r = routes[url.href];
    if (!r) throw new Error(`unexpected ${url.href}`);
    return {
      status: r.status ?? 200,
      headers: r.location ? { location: r.location } : {},
      body: (async function* () {
        if (r.body) yield r.body;
      })(),
      cancel() {},
    };
  };
}

describe("fetchGuarded", () => {
  it("follows a checked redirect and returns the bytes and the final URL", async () => {
    const t = transport({ "https://a.example/x": { status: 301, location: "/y" }, "https://a.example/y": { body: new Uint8Array([1, 2, 3]) } });
    const res = await fetchGuarded("https://a.example/x", { transport: t });
    expect([...res.bytes]).toEqual([1, 2, 3]);
    expect(res.finalUrl.href).toBe("https://a.example/y");
  });

  it("refuses a private address, a downgrade, too many redirects and a body over the cap", async () => {
    await expect(fetchGuarded("http://127.0.0.1/x", { transport: transport({}) })).rejects.toBeInstanceOf(FetchRefusedError);
    await expect(fetchGuarded("https://a.example/d", { transport: transport({ "https://a.example/d": { status: 302, location: "http://a.example/d" } }) })).rejects.toThrow(/https to http/);
    const loop = transport({ "https://a.example/l": { status: 302, location: "/l" } });
    await expect(fetchGuarded("https://a.example/l", { transport: loop, maxRedirects: 2 })).rejects.toThrow(/more than 2 redirects/);
    await expect(fetchGuarded("https://a.example/b", { transport: transport({ "https://a.example/b": { body: new Uint8Array(10) } }), maxBytes: 5 })).rejects.toThrow(/5-byte limit/);
    await expect(fetchGuarded("https://a.example/" + "a".repeat(30), { transport: transport({}), maxUrlLength: 20 })).rejects.toThrow(/too long/);
  });
});
