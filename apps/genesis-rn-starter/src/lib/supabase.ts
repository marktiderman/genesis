/**
 * The app's one Supabase client: PKCE sign-in, the session in the Keychain,
 * refreshed only while the app is in front, and wiped after a reinstall.
 */
import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { AppState } from "react-native";
import { createGenesisSupabase, type SessionStorage } from "@marktiderman/genesis-supabase";
import { keychainStorage, refreshWhileActive, wipeSessionOnReinstall } from "@marktiderman/genesis-supabase/native";
import starter from "../../starter.config";
import { env } from "./env";

const { features } = starter;
const sessionKey = `${starter.app.slug}-auth-token`;
const keychain = keychainStorage(SecureStore);

/**
 * Settles once a session left by an earlier install is gone. It starts now,
 * before the client exists, and the boot waits for it (`steps` in `app.ts`),
 * so a failure shows the fatal screen.
 */
export const sessionReady: Promise<unknown> = features.wipeSessionOnReinstall
  ? wipeSessionOnReinstall({ session: keychain, sessionKey, installMarker: AsyncStorage })
  : Promise.resolve(false);
// The boot step reports a failure; this keeps it from also counting as unhandled.
sessionReady.catch(() => {});

// supabase-js reads the stored session as soon as the client is created, so
// every read and write waits for the wipe.
const storage: SessionStorage = {
  async getItem(key) {
    await sessionReady;
    return keychain.getItem(key);
  },
  async setItem(key, value) {
    await sessionReady;
    return keychain.setItem(key, value);
  },
  async removeItem(key) {
    await sessionReady;
    return keychain.removeItem(key);
  },
};

export const supabase = createGenesisSupabase({
  url: env.supabaseUrl,
  publishableKey: env.supabasePublishableKey,
  storage,
  platform: "native",
  options: { auth: { storageKey: sessionKey } },
});

if (features.refreshWhileActive) refreshWhileActive(supabase, AppState);
