/** @feat:chat */
import { describe, expect, it, vi } from "vitest";
import { createChatClient, type ChatSupabase } from "../core/client";

function fakeRealtime() {
  const order: string[] = [];
  let release!: () => void;
  const authed = new Promise<void>((r) => (release = r));
  const channel = {
    on: vi.fn(() => channel),
    subscribe: vi.fn(() => {
      order.push("subscribe");
      return channel;
    }),
    send: vi.fn(),
  };
  const supabase = {
    realtime: {
      setAuth: vi.fn(async () => {
        await authed;
        order.push("setAuth");
      }),
    },
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(),
    schema: vi.fn(),
  } as unknown as ChatSupabase;
  return { supabase, channel, order, release };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("joining private topics", () => {
  it("sets the user's token before joining, so a private join isn't refused", async () => {
    const f = fakeRealtime();
    createChatClient(f.supabase).subscribeConversation("c1", "me", { onSignal: () => {} });
    await tick();
    expect(f.channel.subscribe).not.toHaveBeenCalled();
    f.release();
    await tick();
    expect(f.order).toEqual(["setAuth", "subscribe"]);
  });

  it("never joins a channel left before its token was set", async () => {
    const f = fakeRealtime();
    const sub = createChatClient(f.supabase).subscribeInbox("me", () => {});
    sub.unsubscribe();
    f.release();
    await tick();
    expect(f.channel.subscribe).not.toHaveBeenCalled();
    expect(f.supabase.removeChannel).toHaveBeenCalled();
  });
});
