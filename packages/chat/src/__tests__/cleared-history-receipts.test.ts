/** @feat:chat */
// Read receipts and history deleted for me (chat migration 0008): the client reads members' read
// places from the server's `member_reads`, which stops someone's place before what they deleted
// unread, so a receipt never says "Read" for a message they were never shown.
import { describe, expect, it } from "vitest";
import { createChatClient, type ChatSupabase } from "../core/client";
import type { ThreadItem } from "../core/thread";
import type { ChatMessage } from "../core/types";
import { lastSentReceipt } from "../native/receipts";

const ME = "me";

/** A supabase-js stand-in whose rpc answers `member_reads` with these rows. */
function fakeSupabase(rows: Record<string, unknown>[]) {
  const calls: { name: string; args: unknown }[] = [];
  const supabase = {
    schema: () => ({
      rpc: async (name: string, args: unknown) => {
        calls.push({ name, args });
        return { data: name === "member_reads" ? rows : null, error: null };
      },
      from: () => {
        throw new Error("members() reads member_reads, not the members table");
      },
    }),
  } as unknown as ChatSupabase;
  return { supabase, calls };
}

const row = (user_id: string, last_read_seq: number, last_read_at: string | null = null) => ({
  conversation_id: "g",
  user_id,
  role: "member",
  last_read_seq,
  last_read_at,
  joined_at: "2026-11-01T00:00:00Z",
});

function mine(seq: number): ThreadItem {
  return {
    type: "message",
    message: { id: `m${seq}`, seq, clientId: `c${seq}`, senderId: ME, kind: "text", body: "the plan", createdAt: "2026-11-25T09:00:00Z", deletedAt: null, attachments: [], reactions: [] } as unknown as ChatMessage,
  };
}

describe("members() reads the server's read places (member_reads)", () => {
  it("asks member_reads for the conversation and maps its rows", async () => {
    const { supabase, calls } = fakeSupabase([row(ME, 9), row("sam", 7, "2026-11-25T09:41:00Z")]);
    const members = await createChatClient(supabase).members("g");
    expect(calls).toEqual([{ name: "member_reads", args: { p_conversation_id: "g" } }]);
    expect(members[1]).toEqual({ conversationId: "g", userId: "sam", role: "member", lastReadSeq: 7, lastReadAt: "2026-11-25T09:41:00Z", joinedAt: "2026-11-01T00:00:00Z" });
  });

  it("reads none for a conversation you can't see", async () => {
    const { supabase } = fakeSupabase(null as unknown as Record<string, unknown>[]);
    expect(await createChatClient(supabase).members("g")).toEqual([]);
  });
});

describe("a group's receipt when one reader deleted your message unread", () => {
  // Your message is seq 5. Lee read it; Kim deleted the conversation unread and has posted since
  // (her own place is 8), so the server gives you her place from before what she deleted (3); Ana
  // read it after deleting history before it.
  const rows = [row(ME, 8), row("lee", 6, "2026-11-25T09:10:00Z"), row("kim", 3), row("ana", 8, "2026-11-25T09:20:00Z")];

  it("counts only who was shown it: Read by 2, not everyone", async () => {
    const { supabase } = fakeSupabase(rows);
    const members = await createChatClient(supabase).members("g");
    expect(lastSentReceipt([mine(5)], { me: ME, members, group: true })?.receipt).toEqual({ state: "read-by", readers: ["lee", "ana"], everyone: false });
  });

  it("and in a direct conversation it stays Delivered", async () => {
    const { supabase } = fakeSupabase([row(ME, 8), row("kim", 3)]);
    const members = await createChatClient(supabase).members("d");
    expect(lastSentReceipt([mine(5)], { me: ME, members, group: false })?.receipt).toEqual({ state: "delivered" });
  });
});
