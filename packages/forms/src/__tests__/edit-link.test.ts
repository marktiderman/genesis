// @feat:forms-engine
import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  createEditSecretReader,
  EDIT_LINK_TTL_SECONDS,
  editLinkUrl,
  isEditLinkRequest,
  isUsableEditSecret,
  signEditToken,
  verifyEditToken,
  withEditLinkHeaders,
  withEditToken,
} from "../server";

const ID = "0b9e6a52-3c1d-4e8f-9a7b-5d2c1e0f4a6b";
const NONCE = "5f0c2a8e-71d4-4b39-a6e2-9c3d8b1f0e7a";
const SECRET = "a-long-random-server-secret-of-at-least-32-bytes";
const NOW = Date.UTC(2026, 9, 22, 12, 0, 0);
const at = { now: NOW };
const DAY = 24 * 60 * 60 * 1000;

/**
 * The host app's signer and verifier (src/lib/forms/edit-link.ts), copied as they were
 * when they moved here, so a link either side signs keeps working on the other.
 */
const app = (() => {
  const EDIT_LINK_TTL_SECONDS = 30 * 24 * 60 * 60;
  const MIN_EDIT_SECRET_BYTES = 32;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const NONCE = /^[A-Za-z0-9_-]{16,64}$/;
  const EXPIRES = /^[1-9][0-9]{0,11}$/;
  const SIG = /^[A-Za-z0-9_-]{43}$/;
  const DOMAIN = "edit-link:v2:";
  const encoder = new TextEncoder();
  function toBase64Url(bytes: Uint8Array): string {
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
    const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  function isUsableEditSecret(secret: string | null | undefined): secret is string {
    return (
      typeof secret === "string" &&
      secret.trim().length > 0 &&
      encoder.encode(secret).length >= MIN_EDIT_SECRET_BYTES
    );
  }
  function hmacKey(secret: string, usage: "sign" | "verify") {
    return crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      [usage],
    );
  }
  interface EditLinkOptions {
    now?: number;
    ttlSeconds?: number;
  }
  const payload = (id: string, nonce: string, expiresAt: number) =>
    encoder.encode(`${DOMAIN}${id}.${nonce}.${expiresAt}`);
  async function signEditToken(
    link: { id: string; nonce: string },
    secret: string | null | undefined,
    options: EditLinkOptions = {},
  ): Promise<string | null> {
    if (!isUsableEditSecret(secret) || !UUID.test(link.id) || !NONCE.test(link.nonce)) return null;
    const ttl = options.ttlSeconds ?? EDIT_LINK_TTL_SECONDS;
    if (!Number.isFinite(ttl) || ttl <= 0) return null;
    const id = link.id.toLowerCase();
    const expiresAt = Math.floor((options.now ?? Date.now()) / 1000) + Math.floor(ttl);
    const sig = await crypto.subtle.sign(
      "HMAC",
      await hmacKey(secret, "sign"),
      payload(id, link.nonce, expiresAt),
    );
    return `${id}.${link.nonce}.${expiresAt}.${toBase64Url(new Uint8Array(sig))}`;
  }
  async function verifyEditToken(
    token: string | null | undefined,
    secret: string | null | undefined,
    options: EditLinkOptions = {},
  ): Promise<{ id: string; nonce: string; expiresAt: number } | null> {
    if (!isUsableEditSecret(secret) || typeof token !== "string" || token.length > 300) return null;
    const parts = token.split(".");
    if (parts.length !== 4) return null;
    const [id, nonce, expires, sig] = parts as [string, string, string, string];
    if (!UUID.test(id) || id !== id.toLowerCase() || !NONCE.test(nonce) || !EXPIRES.test(expires))
      return null;
    if (!SIG.test(sig)) return null;
    const expiresAt = Number(expires);
    const now = Math.floor((options.now ?? Date.now()) / 1000);
    const ttl = options.ttlSeconds ?? EDIT_LINK_TTL_SECONDS;
    if (expiresAt <= now || expiresAt > now + ttl) return null;
    let bytes: Uint8Array<ArrayBuffer>;
    try {
      bytes = fromBase64Url(sig);
    } catch {
      return null;
    }
    const ok = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret, "verify"),
      bytes,
      payload(id, nonce, expiresAt),
    );
    return ok ? { id, nonce, expiresAt } : null;
  }
  return { signEditToken, verifyEditToken };
})();

describe("edit links: compatibility with the app's links", () => {
  it("signs exactly what the app signed, and each verifies the other's", async () => {
    const ours = await signEditToken({ id: ID, nonce: NONCE }, SECRET, at);
    const theirs = await app.signEditToken({ id: ID, nonce: NONCE }, SECRET, at);
    expect(ours).not.toBeNull();
    expect(ours).toBe(theirs);
    const claims = { id: ID, nonce: NONCE, expiresAt: NOW / 1000 + EDIT_LINK_TTL_SECONDS };
    expect(await verifyEditToken(theirs, SECRET, at)).toEqual(claims);
    expect(await app.verifyEditToken(ours, SECRET, at)).toEqual(claims);
  });

  it("agrees with the app across ids, nonces, lifetimes and secrets", async () => {
    const cases = [
      { id: ID.toUpperCase(), nonce: "abcdefghijklmnop", ttlSeconds: 60 },
      { id: "1c0f7b63-4d2e-4f90-8b8c-6e3d2f1a5b7c", nonce: "_-".repeat(32), ttlSeconds: 7 * 86_400 },
      { id: ID, nonce: NONCE, ttlSeconds: undefined },
    ];
    for (const secret of [SECRET, "é".repeat(16), "x".repeat(32)]) {
      for (const { ttlSeconds, ...link } of cases) {
        const options = { now: NOW, ttlSeconds };
        const ours = await signEditToken(link, secret, options);
        expect(ours).toBe(await app.signEditToken(link, secret, ttlSeconds ? { now: NOW, ttlSeconds } : at));
        expect(await app.verifyEditToken(ours, secret, ttlSeconds ? { now: NOW, ttlSeconds } : at)).not.toBeNull();
      }
    }
  });

  it("matches an independent HMAC-SHA256 of the versioned payload", async () => {
    const expires = NOW / 1000 + EDIT_LINK_TTL_SECONDS;
    const expected = createHmac("sha256", SECRET).update(`edit-link:v2:${ID}.${NONCE}.${expires}`).digest("base64url");
    expect(await signEditToken({ id: ID, nonce: NONCE }, SECRET, at)).toBe(`${ID}.${NONCE}.${expires}.${expected}`);
    expect(await verifyEditToken(`${ID}.${NONCE}.${expires}.${expected}`, SECRET, at)).not.toBeNull();
  });
});

// The app's own tests (src/test/forms-edit-link.test.ts), moved with the code.
describe("edit links", () => {
  it("signs the id, nonce and expiry as <id>.<nonce>.<expires>.<base64url HMAC-SHA256>", async () => {
    const token = await signEditToken({ id: ID, nonce: NONCE }, SECRET, at);
    const expires = NOW / 1000 + EDIT_LINK_TTL_SECONDS;
    expect(token).toMatch(new RegExp(`^${ID}\\.${NONCE}\\.${expires}\\.[A-Za-z0-9_-]{43}$`));
    expect(await verifyEditToken(token, SECRET, at)).toEqual({ id: ID, nonce: NONCE, expiresAt: expires });
    // Ids are compared in lower case.
    expect(await signEditToken({ id: ID.toUpperCase(), nonce: NONCE }, SECRET, at)).toBe(token);
  });

  it("works for about 30 days, then never again", async () => {
    const token = await signEditToken({ id: ID, nonce: NONCE }, SECRET, at);
    expect(await verifyEditToken(token, SECRET, { now: NOW + 29 * DAY })).not.toBeNull();
    expect(await verifyEditToken(token, SECRET, { now: NOW + 30 * DAY })).toBeNull();
    expect(await verifyEditToken(token, SECRET, { now: NOW + 60 * DAY })).toBeNull();
    // A shorter life when asked for.
    const short = await signEditToken({ id: ID, nonce: NONCE }, SECRET, { now: NOW, ttlSeconds: 60 });
    expect(await verifyEditToken(short, SECRET, { now: NOW + 61_000 })).toBeNull();
  });

  it("refuses a link that claims to last longer than the policy allows", async () => {
    const long = await signEditToken({ id: ID, nonce: NONCE }, SECRET, { now: NOW, ttlSeconds: 365 * 24 * 60 * 60 });
    expect(await verifyEditToken(long, SECRET, at)).toBeNull();
  });

  it("refuses a changed id, nonce or expiry, a tampered signature, or another secret", async () => {
    const token = (await signEditToken({ id: ID, nonce: NONCE }, SECRET, at))!;
    const [, , expires, sig] = token.split(".") as [string, string, string, string];
    const flipped = (sig[0] === "A" ? "B" : "A") + sig.slice(1);
    expect(await verifyEditToken(`${ID}.${NONCE}.${expires}.${flipped}`, SECRET, at)).toBeNull();
    const other = "1c0f7b63-4d2e-4f90-8b8c-6e3d2f1a5b7c";
    expect(await verifyEditToken(`${other}.${NONCE}.${expires}.${sig}`, SECRET, at)).toBeNull();
    expect(await verifyEditToken(`${ID}.${other}.${expires}.${sig}`, SECRET, at)).toBeNull();
    expect(await verifyEditToken(`${ID}.${NONCE}.${Number(expires) + 1}.${sig}`, SECRET, at)).toBeNull();
    expect(await verifyEditToken(token, `${SECRET}-but-another`, at)).toBeNull();
  });

  it("refuses malformed tokens, and the old id.sig ones", async () => {
    const sig = "A".repeat(43);
    for (const bad of [
      null,
      undefined,
      "",
      ID,
      `${ID}.${sig}`,
      `${ID}.${NONCE}.${sig}`,
      `${ID}.${NONCE}.0.${sig}`,
      `${ID}.${NONCE}.-5.${sig}`,
      `${ID}.short.1800000000.${sig}`,
      `${ID}.${NONCE}.1800000000.${sig}x`,
      `${ID.toUpperCase()}.${NONCE}.1800000000.${sig}`,
      `${ID}.${NONCE}.1800000000.${sig}.extra`,
      "x".repeat(500),
    ]) {
      expect(await verifyEditToken(bad, SECRET, at)).toBeNull();
    }
  });

  it("needs a secret of at least 32 bytes: without one, no links, and none accepted", async () => {
    const token = (await signEditToken({ id: ID, nonce: NONCE }, SECRET, at))!;
    for (const secret of [undefined, null, "", "   ", "short-secret", "x".repeat(31), " ".repeat(40)]) {
      expect(isUsableEditSecret(secret)).toBe(false);
      expect(await signEditToken({ id: ID, nonce: NONCE }, secret, at)).toBeNull();
      expect(await verifyEditToken(token, secret, at)).toBeNull();
    }
    expect(isUsableEditSecret("x".repeat(32))).toBe(true);
    // Bytes, not characters: 16 two-byte characters are 32 bytes.
    expect(isUsableEditSecret("é".repeat(16))).toBe(true);
    expect(await signEditToken({ id: "not-a-uuid", nonce: NONCE }, SECRET, at)).toBeNull();
    expect(await signEditToken({ id: ID, nonce: "bad nonce" }, SECRET, at)).toBeNull();
  });

  it("adds the token to a form link with or without a query", () => {
    expect(withEditToken("https://gym.test/f/after-class", "t.s")).toBe("https://gym.test/f/after-class?edit=t.s");
    expect(withEditToken("/f/after-class?practice=riverside", "t.s")).toBe("/f/after-class?practice=riverside&edit=t.s");
    expect(withEditToken("/f/after-class", "t.s", "change")).toBe("/f/after-class?change=t.s");
  });

  it("signs and adds the token in one step, or gives no link without a secret", async () => {
    const token = await signEditToken({ id: ID, nonce: NONCE }, SECRET, at);
    expect(await editLinkUrl("/f/after-class?practice=riverside", { id: ID, nonce: NONCE }, SECRET, at)).toBe(
      `/f/after-class?practice=riverside&edit=${token}`,
    );
    expect(await editLinkUrl("/f/a", { id: ID, nonce: NONCE }, SECRET, { now: NOW, param: "e" })).toBe(`/f/a?e=${token}`);
    expect(await editLinkUrl("/f/a", { id: ID, nonce: NONCE }, undefined, at)).toBeNull();
  });
});

// The app's src/test/feedback-edit.test.ts checks for the warning, moved with the reader.
describe("createEditSecretReader", () => {
  it("reads the secret, and treats one shorter than 32 bytes as none, warning once without it", () => {
    const read = createEditSecretReader({ variable: "FEEDBACK_EDIT_SECRET" });
    const log = vi.fn();
    expect(read({ FEEDBACK_EDIT_SECRET: "x".repeat(31) }, log)).toBeNull();
    expect(read({ FEEDBACK_EDIT_SECRET: "x".repeat(31) }, log)).toBeNull();
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith("FEEDBACK_EDIT_SECRET is shorter than 32 bytes: edit links are off.");
    expect(String(log.mock.calls[0]![0])).not.toContain("x".repeat(31));
    expect(read({ FEEDBACK_EDIT_SECRET: SECRET }, log)).toBe(SECRET);
  });

  it("says when it is not set, again after reset, through the reader's log by default", () => {
    const log = vi.fn();
    const read = createEditSecretReader({ variable: "FORM_EDIT_SECRET", log });
    expect(read({})).toBeNull();
    expect(read({ FORM_EDIT_SECRET: "" })).toBeNull();
    expect(log.mock.calls).toEqual([["FORM_EDIT_SECRET is not set: edit links are off."]]);
    read.reset();
    expect(read({})).toBeNull();
    expect(log).toHaveBeenCalledTimes(2);
  });

  it("keeps each reader's warning to itself", () => {
    const log = vi.fn();
    createEditSecretReader({ variable: "A_SECRET", log })({});
    createEditSecretReader({ variable: "B_SECRET", log })({});
    expect(log).toHaveBeenCalledTimes(2);
  });
});

// The app's src/test/feedback-edit-headers.test.ts, with its form-page pattern passed in.
describe("edit link response headers", () => {
  const FORM_PAGE = /^\/f\/[^/]+(\/[^/]+)?\/?$/;
  const isFormPage = (url: URL) => FORM_PAGE.test(url.pathname);
  const page = () =>
    new Response("<html></html>", {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60" },
    });

  it("sends Referrer-Policy: no-referrer and no-store on /f/<slug>?edit=", async () => {
    const res = withEditLinkHeaders(new Request("https://forms.example.com/f/after-class?edit=a.b.c.d"), page(), {
      isFormPage,
    });
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("<html></html>");
  });

  it("also with ?practice and an empty edit value, and a trailing slash", () => {
    const opts = { isFormPage };
    expect(isEditLinkRequest(new URL("https://x.test/f/after-class?practice=riverside&edit=t"), opts)).toBe(true);
    expect(isEditLinkRequest(new URL("https://x.test/f/after-class/?edit="), opts)).toBe(true);
    // A default link names the practice in its path.
    expect(isEditLinkRequest(new URL("https://app.x.test/f/riverside/after-class?edit=t"), opts)).toBe(true);
  });

  it("leaves every other response alone", () => {
    for (const url of [
      "https://x.test/f/after-class",
      "https://x.test/f/after-class?practice=riverside",
      "https://x.test/api/feedback/after-class?edit=t",
      "https://x.test/f/riverside/after-class/poster?edit=t",
      "https://x.test/?edit=t",
    ]) {
      const original = page();
      expect(withEditLinkHeaders(new Request(url), original, { isFormPage })).toBe(original);
    }
  });

  it("treats every page as a form page by default, and takes another parameter name", () => {
    expect(isEditLinkRequest(new URL("https://x.test/anything?edit=t"))).toBe(true);
    expect(isEditLinkRequest(new URL("https://x.test/anything?change=t"))).toBe(false);
    expect(isEditLinkRequest(new URL("https://x.test/anything?change=t"), { param: "change" })).toBe(true);
  });
});
