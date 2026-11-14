// @feat:view-inbox
import { describe, expect, it } from "vitest";
import { defineResource } from "@marktiderman/genesis-core";
import { defineView } from "@marktiderman/genesis-core/resource-view";
import { conversationInbox } from "../core/inbox";

const conversations = defineResource<Record<string, unknown>>()({
  name: "genesis_chat.inbox",
  key: "conversation_id",
  fields: [
    { name: "conversation_id", type: "string" },
    { name: "title", type: "string", optional: true },
    { name: "other_user_id", type: "string", optional: true },
    { name: "unread", type: "number" },
    { name: "last_message_at", type: "datetime", optional: true },
    { name: "last_message", type: "json", optional: true },
  ],
});

describe("conversationInbox", () => {
  const view = defineView(conversations, {
    inbox: conversationInbox({ resolveUser: (id) => ({ name: id === "u-2" ? "Sam Rivera" : "Someone" }) }),
    types: ["inbox"],
  });

  it("names a direct conversation after the other member, and previews the latest message", () => {
    const row = view.inboxRow({
      conversation_id: "c-1",
      title: null,
      other_user_id: "u-2",
      unread: 3,
      last_message_at: "2026-11-01T10:00:00Z",
      last_message: { body: "See you **at nine**", attachment: null, deleted: false },
    });
    expect(row).toMatchObject({ id: "c-1", title: "Sam Rivera", preview: "See you at nine", unread: true, time: "2026-11-01T10:00:00Z" });
  });

  it("keeps a group's own title, says what a message without text carries, and falls back", () => {
    expect(view.inboxRow({ conversation_id: "c-2", title: "Launch", unread: 0, last_message: { body: "", attachment: "image" } })).toMatchObject({
      title: "Launch",
      preview: "Photo",
      unread: false,
    });
    expect(view.inboxRow({ conversation_id: "c-3", title: null, unread: 0, last_message: { body: "x", deleted: true } })).toMatchObject({
      title: "Conversation",
      preview: "Message deleted",
    });
    const plain = defineView(conversations, { inbox: conversationInbox({ fallbackTitle: "Chat" }) });
    const row = plain.inboxRow({ conversation_id: "c-4", other_user_id: "u-9", unread: 0, last_message: null });
    expect(row.title).toBe("Chat");
    expect(row.preview).toBeUndefined();
  });
});
