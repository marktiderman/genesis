/**
 * Everything `<GenesisNativeApp>` is given, built from `starter.config.ts`,
 * so the root layout stays a few lines. A feature that is off is left out.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import Constants from "expo-constants";
import { router, type Href } from "expo-router";
import { AppState } from "react-native";
import { KeyboardAwareScrollView, KeyboardProvider } from "react-native-keyboard-controller";
import { genesisBrand } from "@marktiderman/genesis-design-system";
import type { GenesisNativeAppProps } from "@marktiderman/genesis-native";
import { persistQueries } from "@marktiderman/genesis-native/persist";
import starter from "../../starter.config";
import { assertEnv } from "./env";
import { linkHold } from "./links";
import { sessionReady, supabase } from "./supabase";
import { createStarterPush } from "./push";
import { createStarterUpdates } from "./updates";

const { features } = starter;

/** The query-key roots saved to the phone when `queryPersistence` is on. Add yours: `["me", "projects"]`. */
export const persistedQueryKeys = ["me"] as const;

export const shell: Omit<GenesisNativeAppProps, "children" | "splash"> = {
  brand: genesisBrand,
  supabase,
  steps: [
    { id: "starter:env", run: assertEnv },
    { id: "starter:session-storage", run: sessionReady },
  ],
  persist: features.queryPersistence
    ? persistQueries({ storage: AsyncStorage, keys: persistedQueryKeys, buster: Constants.expoConfig?.version ?? "0" })
    : undefined,
  lifecycle: features.queryLifecycle ? { appState: AppState, netInfo: NetInfo } : undefined,
  keyboardProvider: features.keyboardScroll ? KeyboardProvider : undefined,
  keyboardScroll: features.keyboardScroll ? KeyboardAwareScrollView : undefined,
  links: features.deepLinks ? { hold: linkHold, onRelease: (path) => router.replace(path as Href) } : undefined,
  updates: features.updates ? createStarterUpdates() : undefined,
  blocks: features.push ? [createStarterPush()] : undefined,
};
