// @feat:support-email
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { claimsFromAddresses, createReplyToken, htmlToText, REPLY_MARKER, replyAddress, replyKey, replyKeyring, stripReply, verifyReplyToken } from "../email";

const ticketId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const WEEK = 7 * 24 * 3600 * 1000;
const now = 1_800_000_000_000;

describe("reply addresses", () => {
  const ring = replyKeyring(replyKey("a-long-enough-secret"));

  it("round-trip a ticket and recipient, the same within a week, in 64 characters", () => {
    const token = createReplyToken(ring, { ticketId, userId }, { now });
    expect(token).toHaveLength(64);
    expect(createReplyToken(ring, { ticketId, userId }, { now: now + 1000 })).toBe(token);
    expect(verifyReplyToken(ring, token.toUpperCase(), { now })).toEqual({ ticketId, userId });
  });

  it("refuse another key, a changed character, a malformed token and a short secret", () => {
    const token = createReplyToken(ring, { ticketId, userId }, { now });
    expect(verifyReplyToken(replyKeyring(replyKey("another-long-secret!")), token, { now })).toBeNull();
    const flipped = token.slice(0, 10) + (token[10] === "a" ? "b" : "a") + token.slice(11);
    expect(verifyReplyToken(ring, flipped, { now })).toBeNull();
    expect(verifyReplyToken(ring, "nope", { now })).toBeNull();
    expect(() => createReplyToken(ring, { ticketId: "x", userId })).toThrow();
    expect(() => replyKey("")).toThrow();
    expect(() => replyKey("short")).toThrow();
  });

  it("expire after maxAgeWeeks", () => {
    const token = createReplyToken(ring, { ticketId, userId }, { now });
    expect(verifyReplyToken(ring, token, { now: now + 20 * WEEK })).not.toBeNull();
    expect(verifyReplyToken(ring, token, { now: now + 30 * WEEK })).toBeNull();
    expect(verifyReplyToken(ring, token, { now: now + 30 * WEEK, maxAgeWeeks: 52 })).not.toBeNull();
  });

  it("rotate: a new current key signs, an old one still verifies until it's removed", () => {
    const oldKey = replyKey("the-old-secret-value");
    const old = createReplyToken(replyKeyring(oldKey, "a"), { ticketId, userId }, { now });
    const both = { current: "b", keys: { a: oldKey, b: replyKey("the-new-secret-value") } };
    expect(createReplyToken(both, { ticketId, userId }, { now })[0]).toBe("b");
    expect(verifyReplyToken(both, old, { now })).toEqual({ ticketId, userId });
    expect(verifyReplyToken({ current: "b", keys: { b: both.keys.b } }, old, { now })).toBeNull();
  });

  it("find the reply address among the recipients, named or bare, on the reply domain only", () => {
    const address = replyAddress(ring, "Reply.Acme.test", { ticketId, userId }, { now });
    expect(address.endsWith("@reply.acme.test")).toBe(true);
    expect(claimsFromAddresses(ring, "reply.acme.test", ["support@acme.test", `Acme Support <${address}>`], { now })).toEqual({ ticketId, userId });
    expect(claimsFromAddresses(ring, "other.test", [address], { now })).toBeNull();
  });
});

describe("stripReply", () => {
  it("keeps what was written above the quoted history and the signature", () => {
    const text = ["Thanks, that fixed it.", "", "Sent from my iPhone", "", "On Mon, 13 Nov 2026 at 10:02, Acme <s@acme.test>", "wrote:", "> earlier"].join("\n");
    expect(stripReply(text)).toBe("Thanks, that fixed it.");
  });

  it("stops at an attribution wrapped over three lines", () => {
    expect(stripReply(["Fine now", "On Mon, 13 Nov 2026 at 10:02,", "Acme Support <s@acme.test>", "wrote:", "> old"].join("\n"))).toBe("Fine now");
  });

  it("stops at the marker and at Outlook's header block", () => {
    expect(stripReply(`Yes please\n\n> ${REPLY_MARKER}\n> old`)).toBe("Yes please");
    expect(stripReply("Still broken\n\nFrom: Acme Support <s@acme.test>\nSent: Monday\nTo: me")).toBe("Still broken");
  });

  it("reads an HTML-only reply without its quote block or styles", () => {
    expect(stripReply("", "<style>p{}</style><p>Works now</p><div class=\"gmail_quote\">On … wrote: old</div>")).toBe("Works now");
  });

  it("stays fast on a hostile 500 KB body", () => {
    const hostile = "<div class=\"" + "gmail_quot ".repeat(25_000) + "<style>" + "<".repeat(200_000);
    const lines = ("on " + "x".repeat(3000) + "\n").repeat(150);
    const started = performance.now();
    htmlToText(hostile);
    stripReply("", hostile);
    stripReply(lines);
    expect(performance.now() - started).toBeLessThan(1000);
  });
});

describe("addresses made before adoption", () => {
  // The earlier format, as an app made it: its own key label, ticket ‖ login ‖ 7-byte MAC, no week.
  const LABEL = "acme/support-reply-address/v1";
  const ALPHA = "abcdefghijklmnopqrstuvwxyz234567";
  function legacyToken(secret: string): string {
    const key = createHmac("sha256", secret).update(LABEL).digest();
    const mac = createHmac("sha256", key).update(`${ticketId}:${userId}`).digest().subarray(0, 7);
    const bytes = Buffer.concat([Buffer.from(ticketId.replace(/-/g, ""), "hex"), Buffer.from(userId.replace(/-/g, ""), "hex"), mac]);
    let out = "";
    let bits = 0;
    let value = 0;
    for (const b of bytes) {
      value = ((value << 8) | b) & 0xffff;
      bits += 8;
      while (bits >= 5) {
        out += ALPHA[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }
    if (bits > 0) out += ALPHA[(value << (5 - bits)) & 31];
    return `a${out}`;
  }

  it("still verify with the app's old label as a legacy key, and never expire", () => {
    const secret = "the-apps-existing-secret";
    const ring = { current: "b", keys: { b: replyKey(secret) }, legacy: { a: replyKey(secret, { label: LABEL }) } };
    const old = legacyToken(secret);
    expect(verifyReplyToken(ring, old, { now: now + 300 * WEEK })).toEqual({ ticketId, userId });
    expect(verifyReplyToken({ current: "b", keys: ring.keys }, old, { now })).toBeNull();
    expect(createReplyToken(ring, { ticketId, userId }, { now })[0]).toBe("b");
    expect(() => replyKey(secret, { label: "" })).toThrow();
  });
});
