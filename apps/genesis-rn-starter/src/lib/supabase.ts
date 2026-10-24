/**
 * The app's one Supabase client: PKCE sign-in, the session in the Keychain,
 * refreshed only while the app is in front, and wiped after a reinstall.
 */
import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ExpoCrypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { AppState } from "react-native";
import { createGenesisSupabase, type SessionStorage } from "@marktiderman/genesis-supabase";
import { keychainStorage, refreshWhileActive, wipeSessionOnReinstall } from "@marktiderman/genesis-supabase/native";
import starter from "../../starter.config";
import { env } from "./env";

const { features } = starter;
const sessionKey = `${starter.app.slug}-auth-token`;
const keychain = keychainStorage(SecureStore);

let wipe: Promise<unknown> | undefined;

/**
 * Settles once a session left by an earlier install is gone. The first call
 * starts the wipe; later calls share it. A failed wipe is forgotten, so the
 * next call (the fatal screen's "Try again", or the next storage read) runs it
 * again instead of failing for the rest of the process. The boot waits for it
 * (`steps` in `app.ts`), so a failure shows the fatal screen.
 */
export function sessionReady(): Promise<unknown> {
  if (!features.wipeSessionOnReinstall) return Promise.resolve(false);
  wipe ??= wipeSessionOnReinstall({ session: keychain, sessionKey, installMarker: AsyncStorage }).catch((error: unknown) => {
    wipe = undefined;
    throw error;
  });
  return wipe;
}

// supabase-js reads the stored session as soon as the client is created, so
// every read and write waits for the wipe. The wipe itself uses `keychain`
// directly, never this wrapper.
const storage: SessionStorage = {
  async getItem(key) {
    await sessionReady();
    return keychain.getItem(key);
  },
  async setItem(key, value) {
    await sessionReady();
    return keychain.setItem(key, value);
  },
  async removeItem(key) {
    await sessionReady();
    return keychain.removeItem(key);
  },
};

export const supabase = createGenesisSupabase({
  url: env.supabaseUrl,
  publishableKey: env.supabasePublishableKey,
  storage,
  platform: "native",
  // Hermes has no crypto.subtle: without this, supabase-js would send PKCE challenges as "plain".
  crypto: ExpoCrypto,
  options: { auth: { storageKey: sessionKey } },
});

if (features.refreshWhileActive) refreshWhileActive(supabase, AppState);
