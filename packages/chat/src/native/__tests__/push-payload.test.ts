// @feat:chat
import { describe, expect, it } from "vitest";
import { chatPushPayload, conversationIdFromData } from "../push";

const CONV = "6F1D2C3B-4A59-4E8F-9A7B-1C2D3E4F5A6B";
const conv = CONV.toLowerCase();
const sender = { id: "user-1", name: "Ana Lima", avatarUrl: "https://cdn.example.com/a.jpg" };

describe("chatPushPayload", () => {
  it("is a messages push the service extension runs on, with the sender, group and photo", () => {
    const p = chatPushPayload({ conversationId: CONV, messageId: "m1", seq: 7, sender, groupName: "Cohort 3", imageUrl: "https://cdn.example.com/p.png" });
    expect(p).toEqual({
      categoryId: "messages",
      threadId: conv,
      mutableContent: true,
      data: {
        url: `/messages/${conv}`,
        conversationId: conv,
        messageId: "m1",
        seq: 7,
        senderId: "user-1",
        senderName: "Ana Lima",
        senderAvatar: "https://cdn.example.com/a.jpg",
        groupName: "Cohort 3",
        image: "https://cdn.example.com/p.png",
      },
    });
    // The tap still routes to the thread.
    expect(conversationIdFromData(p.data)).toBe(conv);
  });

  it("a direct conversation has no group name", () => {
    const p = chatPushPayload({ conversationId: CONV, messageId: "m1", sender });
    expect(p.data).not.toHaveProperty("groupName");
    expect(p.data).not.toHaveProperty("seq");
  });

  it("hidden previews carry the link and ids only, and the extension doesn't run", () => {
    const p = chatPushPayload({ conversationId: CONV, messageId: "m1", seq: 2, sender, groupName: "Cohort 3", imageUrl: "https://cdn.example.com/p.png", hidePreview: true });
    expect(p).toEqual({ categoryId: "messages", threadId: conv, mutableContent: false, data: { url: `/messages/${conv}`, conversationId: conv, messageId: "m1", seq: 2 } });
  });

  it.each(["http://cdn.example.com/a.jpg", "file:///etc/passwd", "https://user:pw@cdn.example.com/a.jpg", "not a url", `https://cdn.example.com/${"a".repeat(2050)}`])(
    "leaves out an image that isn't a plain https URL: %s",
    (url) => {
      const p = chatPushPayload({ conversationId: CONV, messageId: "m1", sender: { ...sender, avatarUrl: url }, imageUrl: url });
      expect(p.data).not.toHaveProperty("senderAvatar");
      expect(p.data).not.toHaveProperty("image");
      expect(p.data.senderName).toBe("Ana Lima");
    },
  );

  it("leaves the sender out without both an id and a name", () => {
    expect(chatPushPayload({ conversationId: CONV, messageId: "m1", sender: { id: "u", name: "  " } }).data).not.toHaveProperty("senderId");
    expect(chatPushPayload({ conversationId: CONV, messageId: "m1", sender: { id: "", name: "Ana" } }).data).not.toHaveProperty("senderName");
  });

  it("data is flat strings and numbers (what genesis-notifications' PushMessage.data takes)", () => {
    const p = chatPushPayload({ conversationId: CONV, messageId: "m1", seq: 1, sender, groupName: "G", imageUrl: "https://x.example/i.jpg" });
    expect(Object.values(p.data).every((v) => typeof v === "string" || typeof v === "number")).toBe(true);
  });

  it("refuses a conversation id that isn't a uuid", () => {
    expect(() => chatPushPayload({ conversationId: "../etc", messageId: "m1" })).toThrow(/uuid/);
  });
});
