/**
 * Unsent chat messages on this phone, per person, and forgetting them: the
 * saved copy under `genesis-chat:outbox:<userId>` and, while Messages has been
 * opened, the live outbox (`useChat().clearOutbox()`). No React Native here,
 * so the starter's vitest runs it; `chat.tsx` passes AsyncStorage.
 */

export const OUTBOX_PREFIX = "genesis-chat:outbox:";

export const outboxKey = (userId: string) => `${OUTBOX_PREFIX}${userId}`;

/** The AsyncStorage calls this needs. */
export interface OutboxKeyStorage {
  getAllKeys(): Promise<readonly string[]>;
  removeItem(key: string): Promise<void>;
  multiRemove(keys: readonly string[]): Promise<void>;
}

export interface ChatOutboxes {
  /** The live outbox's `clearOutbox`, kept past the Messages screens' unmount (sign-out unmounts them first). */
  register(userId: string, clearOutbox: () => Promise<void>): void;
  /** Forgets one person's unsent messages: the live outbox if there is one, and the saved copy. */
  clear(userId: string): Promise<void>;
  /** Forgets everyone else's (on sign-in: a session that ended while the app was closed, or a switch). */
  clearOthers(userId: string): Promise<void>;
}

export function createChatOutboxes(storage: OutboxKeyStorage): ChatOutboxes {
  const clearers = new Map<string, () => Promise<void>>();
  const live = async (userId: string) => {
    const clear = clearers.get(userId);
    clearers.delete(userId);
    // Emptied in memory too, so a send still in flight saves an empty queue, not the old one.
    if (clear) await clear();
  };
  return {
    register(userId, clearOutbox) {
      clearers.set(userId, clearOutbox);
    },
    async clear(userId) {
      await live(userId);
      await storage.removeItem(outboxKey(userId));
    },
    async clearOthers(userId) {
      for (const other of [...clearers.keys()]) if (other !== userId) await live(other);
      const keys = (await storage.getAllKeys()).filter((k) => k.startsWith(OUTBOX_PREFIX) && k !== outboxKey(userId));
      if (keys.length) await storage.multiRemove(keys);
    },
  };
}
