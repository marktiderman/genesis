// @feat:forms-engine
import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { addressPrefix, allow, clientIp, RATE_LIMIT_DEFAULTS, rateLimitKey, type RateLimitStore } from "../server";

const SECRET = "a-server-secret";

// The app's src/test/feedback-store.test.ts "Rate-limit addresses", moved with the code.
describe("addressPrefix", () => {
  it("keeps an IPv4 address whole and an IPv6 address by its /64", () => {
    expect(addressPrefix("203.0.113.7")).toBe("203.0.113.7");
    expect(addressPrefix("2001:db8:1:2:aaaa::1")).toBe("2001:db8:1:2::/64");
    expect(addressPrefix("2001:0db8:0001:0002:ffff:ffff:ffff:ffff")).toBe("2001:db8:1:2::/64");
    expect(addressPrefix("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(addressPrefix("[2001:db8:1:2::5]:443")).toBe("2001:db8:1:2::/64");
    expect(addressPrefix("::ffff:198.51.100.4")).toBe("198.51.100.4");
    expect(addressPrefix("fe80::1%eth0")).toBe("fe80:0:0:0::/64");
  });
});

describe("rateLimitKey", () => {
  it("is the key the app made: kind, scope and a hex HMAC-SHA256 of the address prefix", async () => {
    for (const ip of [
      "203.0.113.7",
      "2001:db8:1:2:aaaa::1",
      "2001:0db8:0001:0002:ffff:ffff:ffff:ffff",
      "[2001:db8:1:2::5]:443",
      "::ffff:198.51.100.4",
      "fe80::1%eth0",
      "unknown",
    ]) {
      // The app's rateLimitKey: createHmac("sha256", secret).update(addressPrefix(ip)).digest("hex").
      const hex = createHmac("sha256", SECRET).update(addressPrefix(ip)).digest("hex");
      expect(await rateLimitKey({ kind: "submit", scope: "practice-1", ip, secret: SECRET })).toBe(
        `submit:practice-1:${hex}`,
      );
    }
  });

  it("counts one /64 as one client, and never holds the address", async () => {
    const a = await rateLimitKey({ kind: "upload", scope: "p", ip: "2001:db8:1:2::1", secret: SECRET });
    const b = await rateLimitKey({ kind: "upload", scope: "p", ip: "2001:db8:1:2:ffff::9", secret: SECRET });
    expect(a).toBe(b);
    expect(a).not.toContain("2001");
    expect(await rateLimitKey({ kind: "upload", scope: "p", ip: "2001:db8:1:3::1", secret: SECRET })).not.toBe(a);
  });
});

describe("clientIp", () => {
  it("takes the first trusted header that is set, its first entry, trimmed", () => {
    expect(clientIp(new Headers({ "x-vercel-forwarded-for": " 203.0.113.7 , 10.0.0.1", "x-forwarded-for": "198.51.100.1" }))).toBe(
      "203.0.113.7",
    );
    expect(clientIp(new Headers({ "x-forwarded-for": "198.51.100.1, 10.0.0.1" }))).toBe("198.51.100.1");
    expect(clientIp(new Headers({ "x-real-ip": " 192.0.2.5 " }))).toBe("192.0.2.5");
    expect(clientIp(new Headers({ "x-vercel-forwarded-for": " ", "x-real-ip": "192.0.2.5" }))).toBe("192.0.2.5");
    expect(clientIp(new Headers())).toBe("unknown");
  });

  it("trusts only the headers it is given", () => {
    const headers = new Headers({ "x-forwarded-for": "198.51.100.1", "cf-connecting-ip": "192.0.2.9" });
    expect(clientIp(headers, ["cf-connecting-ip"])).toBe("192.0.2.9");
    expect(clientIp(headers, ["fly-client-ip"])).toBe("unknown");
  });
});

describe("allow", () => {
  const check = { key: "submit:p:abc", ...RATE_LIMIT_DEFAULTS.submit };

  it("asks the store with the key, limit and window, and follows its answer", async () => {
    const hit = vi.fn<RateLimitStore["hit"]>().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const log = vi.fn();
    expect(await allow({ hit }, check, { log })).toBe(true);
    expect(await allow({ hit }, check, { log })).toBe(false);
    expect(hit).toHaveBeenCalledWith("submit:p:abc", 60, 600);
    expect(log).not.toHaveBeenCalled();
  });

  it("fails open, and says so, when the store can't count", async () => {
    const log = vi.fn();
    expect(await allow({ hit: async () => null }, check, { log })).toBe(true);
    expect(await allow({ hit: () => Promise.reject(new Error("db down")) }, check, { log, message: "Letting the upload through." })).toBe(
      true,
    );
    expect(log.mock.calls).toEqual([
      ["The rate limit could not be checked; letting the request through."],
      ["Letting the upload through."],
    ]);
  });

  it("keeps the app's limits", () => {
    expect(RATE_LIMIT_DEFAULTS).toEqual({
      submit: { limit: 60, windowSeconds: 600 },
      progress: { limit: 900, windowSeconds: 600 },
      upload: { limit: 120, windowSeconds: 600 },
    });
  });
});
