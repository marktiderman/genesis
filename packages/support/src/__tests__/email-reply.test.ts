// @feat:support-email
import { describe, expect, it } from "vitest";
import { claimsFromAddresses, createReplyToken, REPLY_MARKER, replyAddress, replyKey, stripReply, verifyReplyToken } from "../email";

const ticketId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";

describe("reply addresses", () => {
  const key = replyKey("secret");

  it("round-trip a ticket and recipient, the same every time, within 64 characters", () => {
    const token = createReplyToken(key, { ticketId, userId });
    expect(token).toHaveLength(64);
    expect(createReplyToken(key, { ticketId, userId })).toBe(token);
    expect(verifyReplyToken(key, token.toUpperCase())).toEqual({ ticketId, userId });
  });

  it("refuse another key, a changed character and a malformed token", () => {
    const token = createReplyToken(key, { ticketId, userId });
    expect(verifyReplyToken(replyKey("other"), token)).toBeNull();
    const flipped = token.slice(0, 10) + (token[10] === "a" ? "b" : "a") + token.slice(11);
    expect(verifyReplyToken(key, flipped)).toBeNull();
    expect(verifyReplyToken(key, "nope")).toBeNull();
    expect(() => createReplyToken(key, { ticketId: "x", userId })).toThrow();
  });

  it("find the reply address among the recipients, on the reply domain only", () => {
    const address = replyAddress(key, "Reply.Acme.test", { ticketId, userId });
    expect(address.endsWith("@reply.acme.test")).toBe(true);
    expect(claimsFromAddresses(key, "reply.acme.test", ["support@acme.test", address])).toEqual({ ticketId, userId });
    expect(claimsFromAddresses(key, "other.test", [address])).toBeNull();
  });
});

describe("stripReply", () => {
  it("keeps what was written above the quoted history and the signature", () => {
    const text = ["Thanks, that fixed it.", "", "Sent from my iPhone", "", "On Mon, 13 Nov 2026 at 10:02, Acme <s@acme.test>", "wrote:", "> earlier"].join("\n");
    expect(stripReply(text)).toBe("Thanks, that fixed it.");
  });

  it("stops at the marker and at Outlook's header block", () => {
    expect(stripReply(`Yes please\n\n> ${REPLY_MARKER}\n> old`)).toBe("Yes please");
    expect(stripReply("Still broken\n\nFrom: Acme Support <s@acme.test>\nSent: Monday\nTo: me")).toBe("Still broken");
  });

  it("reads an HTML-only reply without its quote block", () => {
    expect(stripReply("", "<p>Works now</p><div class=\"gmail_quote\">On … wrote: old</div>")).toBe("Works now");
  });
});
