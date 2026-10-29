import { type Mock, vi } from "vitest";
import type { UpdatesModuleLike, UpdatesStorageLike } from "../../updates/modules";

export interface FakeUpdatesOptions {
  isEnabled?: boolean;
  /** What the server has: `null` for nothing newer. */
  next?: { id: string; runtimeVersion?: string } | null;
  runtimeVersion?: string;
  updateId?: string;
  channel?: string | null;
  checkError?: Error;
}

type Spied<T> = { [K in keyof T]: T[K] extends (...args: never[]) => unknown ? Mock<T[K]> & T[K] : T[K] };

/** An expo-updates stand-in whose calls are spies. */
export function fakeUpdates(options: FakeUpdatesOptions = {}): Spied<UpdatesModuleLike> {
  const { isEnabled = true, next = null, runtimeVersion = "1.0.0", updateId = "running-0000", channel = "production", checkError } = options;
  const manifest = next ? { id: next.id, runtimeVersion: next.runtimeVersion ?? runtimeVersion } : undefined;
  const updates = {
    isEnabled,
    updateId: isEnabled ? updateId : null,
    channel: isEnabled ? channel : null,
    runtimeVersion,
    isEmbeddedLaunch: false,
    isEmergencyLaunch: false,
    emergencyLaunchReason: null,
    checkForUpdateAsync: vi.fn(async () => {
      if (checkError) throw checkError;
      return next ? { isAvailable: true, isRollBackToEmbedded: false, manifest } : { isAvailable: false, isRollBackToEmbedded: false };
    }),
    fetchUpdateAsync: vi.fn(async () => (next ? { isNew: true, isRollBackToEmbedded: false, manifest } : { isNew: false, isRollBackToEmbedded: false })),
    reloadAsync: vi.fn(async () => {}),
    setUpdateRequestHeadersOverride: vi.fn(),
  } satisfies UpdatesModuleLike;
  return updates;
}

export function memoryStorage(initial: Record<string, string> = {}): UpdatesStorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: vi.fn(async (key: string) => data.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      data.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => {
      data.delete(key);
    }),
  };
}

/** A storage whose reads (or writes) fail, like a full or corrupt store. */
export function brokenStorage(): UpdatesStorageLike {
  return {
    getItem: async () => {
      throw new Error("storage unavailable");
    },
    setItem: async () => {
      throw new Error("storage unavailable");
    },
  };
}

export const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
export const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
export const never = <T>() => new Promise<T>(() => {});
