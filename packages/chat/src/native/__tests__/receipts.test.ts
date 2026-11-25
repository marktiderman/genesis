// @feat:chat
import { describe, expect, it } from "vitest";
import type { ThreadItem } from "../../core/thread";
import type { ChatMember, ChatMessage, PendingMessage } from "../../core/types";
import { chatNativeCopy } from "../copy";
import { lastSentReceipt, readWhen, receiptText } from "../receipts";

const ME = "me";
const SAM = "sam";
const LEE = "lee";
const KIM = "kim";

function msg(seq: number, senderId: string, extra: Partial<ChatMessage> = {}): ThreadItem {
  return {
    type: "message",
    message: { id: `m${seq}`, seq, clientId: `c${seq}`, senderId, kind: "text", body: `b${seq}`, createdAt: "2026-11-22T09:00:00Z", deletedAt: null, attachments: [], reactions: [], ...extra } as ChatMessage,
  };
}

function pending(clientId: string, status: PendingMessage["status"], extra: Record<string, unknown> = {}): ThreadItem {
  return { type: "pending", pending: { clientId, input: { conversationId: "conv", clientId, body: "x" }, senderId: ME, createdAt: "2026-11-22T09:05:00Z", status, ...extra } as PendingMessage };
}

function member(userId: string, lastReadSeq: number, lastReadAt: string | null = null, role: ChatMember["role"] = "member"): ChatMember {
  return { conversationId: "conv", userId, role, lastReadSeq, lastReadAt, joinedAt: "2026-11-01T00:00:00Z" };
}

const direct = (samRead: number, at: string | null = null) => ({ me: ME, members: [member(ME, 99), member(SAM, samRead, at)], group: false });

describe("lastSentReceipt", () => {
  it("is Sending… while the last message you sent is still on its way", () => {
    expect(lastSentReceipt([msg(1, SAM), pending("p1", "sending")], direct(0))).toEqual({ key: "c:p1", receipt: { state: "sending" } });
  });

  it("is Sent once it is posted but the outbox still holds it (a video still uploading)", () => {
    expect(lastSentReceipt([pending("p1", "sending", { sentMessageId: "m9" })], direct(0))?.receipt).toEqual({ state: "sent" });
    expect(lastSentReceipt([msg(2, ME)], { ...direct(0), queued: new Set(["c2"]) })?.receipt).toEqual({ state: "sent" });
  });

  it("is Delivered when the server has it and the other person hasn't read that far", () => {
    expect(lastSentReceipt([msg(1, SAM), msg(2, ME)], direct(1))).toEqual({ key: "c:c2", receipt: { state: "delivered" } });
  });

  it("is Read, with the server's read time, once their lastReadSeq reaches it", () => {
    expect(lastSentReceipt([msg(2, ME)], direct(2, "2026-11-22T09:41:00Z"))?.receipt).toEqual({ state: "read", at: "2026-11-22T09:41:00Z" });
  });

  it("is Read with no time when the server records none (before chat 0006)", () => {
    expect(lastSentReceipt([msg(2, ME)], direct(5))?.receipt).toEqual({ state: "read", at: null });
  });

  it("goes under your last message, even with replies after it, and skips deleted and system ones", () => {
    const items = [msg(1, ME), msg(2, ME, { deletedAt: "2026-11-22T09:10:00Z" }), msg(3, null as unknown as string, { kind: "system" }), msg(4, SAM)];
    expect(lastSentReceipt(items, direct(4))?.key).toBe("c:c1");
  });

  it("shows nothing for a failed send (its bubble keeps the failure and Retry), or with none of yours", () => {
    expect(lastSentReceipt([msg(1, ME), pending("p1", "failed")], direct(9))).toBeNull();
    expect(lastSentReceipt([msg(1, SAM)], direct(9))).toBeNull();
  });

  it("shows nothing when receipts are hidden", () => {
    expect(lastSentReceipt([msg(1, ME)], { ...direct(9), receipts: "hide" })).toBeNull();
  });

  describe("in a group", () => {
    const members = [member(ME, 9), member(SAM, 5), member(LEE, 3), member(KIM, 2), member("obs", 9, null, "observer")];
    it("counts the others who have read it, observers aside", () => {
      expect(lastSentReceipt([msg(3, ME)], { me: ME, members, group: true })?.receipt).toEqual({ state: "read-by", readers: [SAM, LEE], everyone: false });
    });
    it("is Read by everyone when every other member has", () => {
      expect(lastSentReceipt([msg(2, ME)], { me: ME, members, group: true })?.receipt).toEqual({ state: "read-by", readers: [SAM, LEE, KIM], everyone: true });
    });
    it("is Delivered when nobody has yet", () => {
      expect(lastSentReceipt([msg(6, ME)], { me: ME, members, group: true })?.receipt).toEqual({ state: "delivered" });
    });
  });

  // Chat 0008: someone deletes the conversation for themselves (Delete for me) without reading your
  // message, then posts. Their read place (lastReadSeq) moves past your message; their receipt
  // place (receiptSeq) doesn't.
  describe("after the other person deleted your message unread", () => {
    const deletedUnread = (userId: string, receiptSeq: number) => ({ ...member(userId, 2), receiptSeq });
    it("isn't Read in a direct conversation, though their read place passed it", () => {
      const members = [member(ME, 2), deletedUnread(SAM, 0)];
      expect(lastSentReceipt([msg(1, ME), msg(2, SAM)], { me: ME, members, group: false })?.receipt).toEqual({ state: "delivered" });
    });
    it("doesn't count them in a group's Read by N", () => {
      const members = [member(ME, 2), deletedUnread(SAM, 0), member(LEE, 2)];
      expect(lastSentReceipt([msg(1, ME), msg(2, SAM)], { me: ME, members, group: true })?.receipt).toEqual({ state: "read-by", readers: [LEE], everyone: false });
      expect(lastSentReceipt([msg(1, ME), msg(2, SAM)], { me: ME, members: [member(ME, 2), deletedUnread(SAM, 0), deletedUnread(LEE, 0)], group: true })?.receipt).toEqual({ state: "delivered" });
    });
    it("is Read once their receipt place reaches it", () => {
      const members = [member(ME, 3), { ...member(SAM, 4, "2026-11-22T09:41:00Z"), receiptSeq: 4 }];
      expect(lastSentReceipt([msg(3, ME), msg(4, SAM)], { me: ME, members, group: false })?.receipt).toEqual({ state: "read", at: "2026-11-22T09:41:00Z" });
    });
  });
});

describe("receiptText", () => {
  const now = new Date("2026-11-22T12:00:00");
  it("says each state", () => {
    expect(receiptText({ state: "sending" }, chatNativeCopy)).toBe("Sending…");
    expect(receiptText({ state: "sent" }, chatNativeCopy)).toBe("Sent");
    expect(receiptText({ state: "delivered" }, chatNativeCopy)).toBe("Delivered");
    expect(receiptText({ state: "read", at: null }, chatNativeCopy)).toBe("Read");
    expect(receiptText({ state: "read-by", readers: ["a", "b"], everyone: false }, chatNativeCopy)).toBe("Read by 2");
    expect(receiptText({ state: "read-by", readers: ["a"], everyone: true }, chatNativeCopy)).toBe("Read by everyone");
  });
  it("gives the time read today, and the day before that", () => {
    const today = new Date("2026-11-22T09:41:00").toISOString();
    expect(receiptText({ state: "read", at: today }, chatNativeCopy, now, "en-US")).toBe(`Read ${new Date(today).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`);
    expect(readWhen(new Date("2026-11-21T20:00:00").toISOString(), now)).toBe("Yesterday");
  });
});
