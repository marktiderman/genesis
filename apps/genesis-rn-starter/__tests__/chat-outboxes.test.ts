// @feat:chat
/**
 * Unsent chat messages never outlive the person who wrote them on this phone
 * (`src/lib/chat-outboxes.ts`, used by `useClearChatOnSignOut`).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createChatOutboxes, outboxKey, type OutboxKeyStorage } from "../src/lib/chat-outboxes";

function memory(entries: Record<string, string>): OutboxKeyStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(entries));
  return {
    data,
    getAllKeys: async () => [...data.keys()],
    removeItem: async (k) => void data.delete(k),
    multiRemove: async (keys) => keys.forEach((k) => data.delete(k)),
  };
}

describe("chat outboxes", () => {
  it("sign-out empties that person's live outbox and its saved copy, even after Messages unmounted", async () => {
    const storage = memory({ [outboxKey("a")]: "[1]", [outboxKey("b")]: "[2]", "genesis-chat:drafts:a:c1": "{}" });
    const outboxes = createChatOutboxes(storage);
    const clearA = vi.fn(async () => undefined);
    outboxes.register("a", clearA);
    await outboxes.clear("a");
    expect(clearA).toHaveBeenCalledTimes(1);
    expect(storage.data.has(outboxKey("a"))).toBe(false);
    expect(storage.data.get(outboxKey("b"))).toBe("[2]");
    // Drafts are clearDrafts' job.
    expect(storage.data.has("genesis-chat:drafts:a:c1")).toBe(true);
    // Used once: signing out again doesn't clear a later outbox through a stale handle.
    await outboxes.clear("a");
    expect(clearA).toHaveBeenCalledTimes(1);
  });

  it("clears the saved copy when Messages was never opened", async () => {
    const storage = memory({ [outboxKey("a")]: "[1]" });
    await createChatOutboxes(storage).clear("a");
    expect(storage.data.size).toBe(0);
  });

  it("sign-in forgets everyone else's, live and saved, and keeps your own", async () => {
    const storage = memory({ [outboxKey("a")]: "[1]", [outboxKey("b")]: "[2]", [outboxKey("c")]: "[3]", other: "x" });
    const outboxes = createChatOutboxes(storage);
    const clearA = vi.fn(async () => undefined);
    const clearB = vi.fn(async () => undefined);
    outboxes.register("a", clearA);
    outboxes.register("b", clearB);
    await outboxes.clearOthers("b");
    expect(clearA).toHaveBeenCalled();
    expect(clearB).not.toHaveBeenCalled();
    expect([...storage.data.keys()].sort()).toEqual([outboxKey("b"), "other"]);
  });

  it("is what the signed-in layout's hook uses on sign-out and sign-in", () => {
    const chat = readFileSync(join(__dirname, "..", "src/lib/chat.tsx"), "utf8");
    expect(chat).toMatch(/outboxes\.clear\(who\)/);
    expect(chat).toMatch(/outboxes\.clearOthers\(userId\)/);
    expect(chat).toMatch(/outboxes\.register\(userId, clearOutbox\)/);
    expect(chat).toContain("forgetRecentEmoji(who)");
  });
});
