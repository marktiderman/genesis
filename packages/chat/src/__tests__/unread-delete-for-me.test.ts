/** @feat:chat */
import { describe, expect, it } from "vitest";
import { createChatClient, type ChatSupabase } from "../core/client";
import { createMemoryChatClient } from "../web/memory-client";

/** A supabase-js stand-in that records every rpc. */
function fakeSupabase() {
  const calls: { name: string; args: unknown }[] = [];
  const supabase = {
    schema: () => ({
      rpc: async (name: string, args: unknown) => {
        calls.push({ name, args });
        return { data: null, error: null };
      },
    }),
  } as unknown as ChatSupabase;
  return { supabase, calls };
}

describe("Mark as Unread and Delete for me (0007) on the core client", () => {
  it("sends the place you saw when you give one, and nothing extra when you don't", async () => {
    const { supabase, calls } = fakeSupabase();
    const chat = createChatClient(supabase);
    await chat.deleteConversationForMe("c", 7);
    await chat.deleteConversationForMe("c");
    expect(calls).toEqual([
      { name: "delete_conversation_for_me", args: { p_conversation_id: "c", p_seq: 7 } },
      { name: "delete_conversation_for_me", args: { p_conversation_id: "c" } },
    ]);
  });

  it("sends markedUnread only when given, and clears a mute with mutedUntil: null", async () => {
    const { supabase, calls } = fakeSupabase();
    const chat = createChatClient(supabase);
    await chat.setMySettings("c", { markedUnread: true });
    await chat.setMySettings("c", { mutedUntil: null });
    expect(calls[0]!.args).toMatchObject({ p_conversation_id: "c", p_marked_unread: true });
    expect(calls[1]!.args).toMatchObject({ p_clear_mute: true });
    expect(calls[1]!.args).not.toHaveProperty("p_marked_unread");
  });
});

describe("Delete for me on the memory client, as the database does it", () => {
  const ME = "me";
  const LEE = "lee";
  const make = () =>
    createMemoryChatClient({
      me: ME,
      conversations: [
        {
          id: "c1",
          members: [{ userId: ME, lastReadSeq: 2 }, { userId: LEE }],
          messages: [
            { id: "m1", seq: 1, senderId: LEE, body: "hi" },
            { id: "m2", seq: 2, senderId: LEE, body: "how are you?" },
          ],
          pins: ["m1"],
        },
      ],
    });

  it("leaves the inbox and the pins until a message you can read arrives", async () => {
    const chat = make();
    await chat.deleteConversationForMe("c1");
    expect(await chat.inbox()).toHaveLength(0);
    expect(await chat.pins("c1")).toEqual([]);
    chat.receive("c1", LEE, "a reply in the old thread", { threadRootId: "m1" });
    expect(await chat.inbox()).toHaveLength(0);
    chat.receive("c1", LEE, "are you there?");
    const inbox = await chat.inbox();
    expect(inbox).toHaveLength(1);
    expect(inbox[0]!.unread).toBe(1);
  });

  it("keeps a message that came in after what you saw", async () => {
    const chat = make();
    chat.receive("c1", LEE, "sent while you looked");
    await chat.deleteConversationForMe("c1", 2);
    expect(await chat.inbox()).toHaveLength(1);
    expect((await chat.messages("c1")).messages.map((m) => m.body)).toEqual(["sent while you looked"]);
    await chat.deleteConversationForMe("c1", 1);
    expect((await chat.messages("c1")).messages).toHaveLength(1);
  });
});
