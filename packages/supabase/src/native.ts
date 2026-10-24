/**
 * React Native helpers for a Supabase session. Nothing here imports React
 * Native or Expo: pass in `expo-secure-store`, `AppState`,
 * `expo-apple-authentication` and a plain store, so the package stays light
 * and the helpers are easy to test.
 */
import type { SessionStorage } from "./index";

export {
  assertPkceCrypto,
  hasPkceCrypto,
  installWebCrypto,
  isDigestOnlyPolyfill,
  type ExpoCryptoLike,
  type WebCryptoSource,
} from "./web-crypto";

export {
  GenesisAuthError,
  completeOAuthRedirect,
  formatFullName,
  redirectParams,
  signInWithApple,
  type AppleAuthenticationLike,
  type AppleFullNameLike,
  type OAuthRedirectResult,
  type SignInClient,
  type SignInWithAppleOptions,
  type SignInWithAppleResult,
} from "./sign-in";

/** The parts of `expo-secure-store` the Keychain storage uses. */
export interface SecureStoreLike {
  getItemAsync(key: string, options?: Record<string, unknown>): Promise<string | null>;
  setItemAsync(key: string, value: string, options?: Record<string, unknown>): Promise<void>;
  deleteItemAsync(key: string, options?: Record<string, unknown>): Promise<void>;
  /** `SecureStore.AFTER_FIRST_UNLOCK`, when available. */
  AFTER_FIRST_UNLOCK?: unknown;
}

/** @stability Beta */
export interface KeychainStorageOptions {
  /** UTF-8 bytes per Keychain item. A Keychain item should stay under about 2 KB; a Supabase session is larger. Default 1800. */
  chunkSize?: number;
  /** Extra options for every SecureStore call. Default: readable after first unlock, so a background refresh works. */
  secureStoreOptions?: Record<string, unknown>;
}

/**
 * Session storage in the Keychain (iOS) or Keystore (Android).
 *
 * A value is split into numbered chunks. Each write goes to a new generation of
 * chunks, and one manifest item (`<key>.n` = `generation:count`) switches to it
 * only once every chunk is written, so a write cut short leaves the previous
 * session whole. Chunks split between characters (never inside one) and
 * stay under `chunkSize` UTF-8 bytes. A pending marker (`<key>.p`) names a
 * generation while it is being written, so chunks left by a write that was
 * cut short or crashed are swept on the next write or remove. Writes to the
 * same key run one at a time, so two token refreshes can't interleave.
 *
 * @stability Beta
 */
export function keychainStorage(secureStore: SecureStoreLike, options: KeychainStorageOptions = {}): SessionStorage {
  const size = options.chunkSize ?? 1800;
  const opts = options.secureStoreOptions ?? (secureStore.AFTER_FIRST_UNLOCK !== undefined ? { keychainAccessible: secureStore.AFTER_FIRST_UNLOCK } : {});
  const chunkKey = (key: string, gen: string, i: number) => `${key}.${gen}.${i}`;
  let counter = 0;
  const queues = new Map<string, Promise<unknown>>();

  /** Run `task` after every earlier write to `key` has settled. */
  const serial = <T>(key: string, task: () => Promise<T>): Promise<T> => {
    const run = (queues.get(key) ?? Promise.resolve()).catch(() => undefined).then(task);
    queues.set(key, run);
    return run;
  };

  const parse = (raw: string | null) => {
    const [gen, count] = (raw ?? "").split(":");
    return gen && Number(count) > 0 ? { gen, count: Number(count) } : null;
  };
  const manifest = async (key: string) => parse(await secureStore.getItemAsync(`${key}.n`, opts));
  const pending = async (key: string) => parse(await secureStore.getItemAsync(`${key}.p`, opts));
  const drop = (key: string, gen: string, count: number) =>
    Promise.all(Array.from({ length: count }, (_, i) => secureStore.deleteItemAsync(chunkKey(key, gen, i), opts)));

  /** Remove chunks of a write that never completed (unless they are the current generation). */
  const sweepPending = async (key: string, current: string | undefined) => {
    const p = await pending(key);
    if (!p) return;
    if (p.gen !== current) await drop(key, p.gen, p.count);
    await secureStore.deleteItemAsync(`${key}.p`, opts);
  };

  return {
    getItem(key) {
      // Reads queue with writes, so a write can't swap the manifest and drop
      // the old chunks halfway through a read.
      return serial(key, async () => {
        const m = await manifest(key);
        if (!m) return null;
        const parts = await Promise.all(Array.from({ length: m.count }, (_, i) => secureStore.getItemAsync(chunkKey(key, m.gen, i), opts)));
        return parts.some((p) => p === null) ? null : parts.join("");
      });
    },
    setItem(key, value) {
      return serial(key, async () => {
        const before = await manifest(key);
        await sweepPending(key, before?.gen);
        const gen = `${Date.now().toString(36)}${(counter++).toString(36)}`;
        const parts = splitUtf8(value, size);
        await secureStore.setItemAsync(`${key}.p`, `${gen}:${parts.length}`, opts);
        // Let every chunk write settle before failing, so a late write can't land
        // after the next operation has swept this generation.
        const written = await Promise.allSettled(parts.map((p, i) => secureStore.setItemAsync(chunkKey(key, gen, i), p, opts)));
        const failed = written.find((r): r is PromiseRejectedResult => r.status === "rejected");
        if (failed) throw failed.reason;
        await secureStore.setItemAsync(`${key}.n`, `${gen}:${parts.length}`, opts);
        await secureStore.deleteItemAsync(`${key}.p`, opts);
        if (before) await drop(key, before.gen, before.count);
      });
    },
    removeItem(key) {
      return serial(key, async () => {
        const m = await manifest(key);
        await sweepPending(key, m?.gen);
        // Chunks first: the manifest is what finds them, so it goes last.
        if (m) await drop(key, m.gen, m.count);
        await secureStore.deleteItemAsync(`${key}.n`, opts);
      });
    },
  };
}

/** The parts of a Supabase client's auth the refresh helper uses. */
export interface AutoRefreshAuth {
  auth: { startAutoRefresh(): Promise<void> | void; stopAutoRefresh(): Promise<void> | void };
}

/** The parts of React Native's `AppState` the refresh helper uses. */
export interface AppStateLike {
  currentState?: string | null;
  addEventListener(type: "change", listener: (state: string) => void): { remove(): void };
}

/**
 * Refresh the session only while the app is in front, as Supabase recommends
 * for React Native. Returns the unsubscribe.
 *
 * @stability Beta
 */
export function refreshWhileActive(client: AutoRefreshAuth, appState: AppStateLike): () => void {
  const apply = (state: string | null | undefined) => {
    if (state === "active") void client.auth.startAutoRefresh();
    else void client.auth.stopAutoRefresh();
  };
  apply(appState.currentState ?? "active");
  const sub = appState.addEventListener("change", apply);
  return () => {
    sub.remove();
    void client.auth.stopAutoRefresh();
  };
}

/** @stability Beta */
export interface WipeOnReinstallOptions {
  /** The session storage (usually `keychainStorage`). */
  session: SessionStorage;
  /** The session's storage key. Supabase's default is `sb-<project ref>-auth-token`. */
  sessionKey: string;
  /** A store that an uninstall deletes, e.g. AsyncStorage. The Keychain survives an uninstall; this is how we notice one. */
  installMarker: SessionStorage;
  /** The marker's key. Default `genesis.installed`. */
  markerKey?: string;
}

/**
 * On iOS the Keychain outlives an uninstall, so a reinstalled app would sign
 * the last person back in. Call this before creating the client: on the first
 * launch after an install it removes any session left in the Keychain, then
 * sets a marker so later launches keep the session. Returns whether it wiped.
 *
 * @stability Beta
 */
export async function wipeSessionOnReinstall({ session, sessionKey, installMarker, markerKey = "genesis.installed" }: WipeOnReinstallOptions): Promise<boolean> {
  if ((await installMarker.getItem(markerKey)) !== null) return false;
  // The session, plus what supabase-js keeps beside it: the PKCE verifier (the
  // single legacy slot, each indexed flow's slot and the index) and, with
  // userStorage, the user.
  const indexKey = `${sessionKey}-flows-code-verifier`;
  for (const flowId of parseFlowIndex(await session.getItem(indexKey))) await session.removeItem(`${sessionKey}-flow-${flowId}-code-verifier`);
  for (const key of [sessionKey, `${sessionKey}-code-verifier`, indexKey, `${sessionKey}-user`]) await session.removeItem(key);
  await installMarker.setItem(markerKey, "1");
  return true;
}

/** UTF-8 byte length of one code point. */
const utf8Length = (codePoint: number) => (codePoint < 0x80 ? 1 : codePoint < 0x800 ? 2 : codePoint < 0x10000 ? 3 : 4);

/** Split text into pieces of at most `maxBytes` UTF-8 bytes, never inside a character. */
export function splitUtf8(text: string, maxBytes: number): string[] {
  if (text === "") return [""];
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of text) {
    const n = utf8Length(ch.codePointAt(0)!);
    if (bytes + n > maxBytes && current) {
      parts.push(current);
      current = "";
      bytes = 0;
    }
    current += ch;
    bytes += n;
  }
  parts.push(current);
  return parts;
}

/** supabase-js's PKCE flow index: a JSON array of flow ids. Anything else is ignored. */
function parseFlowIndex(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const ids: unknown = JSON.parse(raw);
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string" && /^[\w-]{1,128}$/.test(id)) : [];
  } catch {
    return [];
  }
}
