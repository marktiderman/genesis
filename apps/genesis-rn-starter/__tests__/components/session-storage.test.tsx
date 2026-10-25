/**
 * The real `src/lib/supabase.ts` (every other file here swaps it for the fake): the reinstall
 * wipe that the boot waits for, and the session storage that waits for the wipe.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.unmock("@/lib/supabase");

type Storage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void>; removeItem(key: string): Promise<void> };
type Wipe = (options: object) => Promise<boolean>;

// jest.mock factories may only reach variables whose names start with `mock`.
const mockKeychain = {
  getItem: jest.fn(async (_key: string): Promise<string | null> => "stored-session"),
  setItem: jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
};
const mockWipe = jest.fn<Wipe>();
const mockCreated: { storage?: Storage } = {};

jest.mock("@marktiderman/genesis-supabase/native", () => ({
  keychainStorage: () => mockKeychain,
  refreshWhileActive: () => {},
  wipeSessionOnReinstall: (options: object) => mockWipe(options),
}));
jest.mock("@marktiderman/genesis-supabase", () => ({
  createGenesisSupabase: (options: { storage: Storage }) => {
    mockCreated.storage = options.storage;
    return { auth: {} };
  },
}));

/** A fresh copy of the module, so each test starts before any wipe. */
function load(): typeof import("@/lib/supabase") {
  let mod: typeof import("@/lib/supabase") | undefined;
  jest.isolateModules(() => {
    mod = jest.requireActual<typeof import("@/lib/supabase")>("@/lib/supabase");
  });
  if (!mod) throw new Error("src/lib/supabase.ts didn't load");
  return mod;
}

function storage(): Storage {
  if (!mockCreated.storage) throw new Error("createGenesisSupabase wasn't given a storage");
  return mockCreated.storage;
}

describe("session storage (src/lib/supabase.ts)", () => {
  beforeEach(() => {
    mockWipe.mockReset();
    mockKeychain.getItem.mockClear();
    mockCreated.storage = undefined;
  });

  it("runs the reinstall wipe once, and every caller shares it", async () => {
    mockWipe.mockResolvedValue(false);
    const { sessionReady } = load();
    await Promise.all([sessionReady(), sessionReady(), sessionReady()]);
    expect(mockWipe).toHaveBeenCalledTimes(1);
  });

  it("forgets a failed wipe, so the next call (the fatal screen's Try again) runs it again", async () => {
    mockWipe.mockRejectedValueOnce(new Error("keychain unavailable")).mockResolvedValue(true);
    const { sessionReady } = load();
    await expect(sessionReady()).rejects.toThrow("keychain unavailable");
    await expect(sessionReady()).resolves.toBe(true);
    expect(mockWipe).toHaveBeenCalledTimes(2);
  });

  it("reads no session from the Keychain until the wipe has finished", async () => {
    let finish: (wiped: boolean) => void = () => {};
    mockWipe.mockImplementation(() => new Promise<boolean>((resolve) => (finish = resolve)));
    load();
    const read = storage().getItem("genesis-rn-starter-auth-token");
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(mockKeychain.getItem).not.toHaveBeenCalled();
    finish(true);
    await expect(read).resolves.toBe("stored-session");
    expect(mockKeychain.getItem).toHaveBeenCalledWith("genesis-rn-starter-auth-token");
  });
});
