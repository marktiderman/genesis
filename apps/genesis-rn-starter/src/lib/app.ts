/**
 * Everything `<GenesisNativeApp>` is given, built from `starter.config.ts`,
 * so the root layout stays a few lines. A feature that is off is left out.
 */
// First: Sentry starts here, before the rest of the app loads.
import { observability } from "./observability";
import NetInfo from "@react-native-community/netinfo";
import Constants from "expo-constants";
import { router, type Href } from "expo-router";
import { AppState } from "react-native";
import { KeyboardAwareScrollView, KeyboardProvider, KeyboardToolbar } from "react-native-keyboard-controller";
import { genesisBrand } from "@marktiderman/genesis-design-system";
import type { GenesisNativeAppProps } from "@marktiderman/genesis-native";
import { persistOffline } from "@marktiderman/genesis-native/offline";
import starter from "../../starter.config";
import { assertEnv } from "./env";
import { linkHold } from "./links";
import { nativeModules } from "./native-modules";
import { offlineCache } from "./offline";
import { sessionReady, supabase } from "./supabase";
import { devtools } from "./devtools";
import { createStarterPush } from "./push";
import { support } from "./support";
import { updatesBlock } from "./updates";

const { features } = starter;

/**
 * The resources whose reads are kept on the phone when `queryPersistence` is on, so their lists
 * and records open at once. The starter has no resource lists yet, so nothing is kept: add yours
 * (`["projects"]`) as you add their views. Only what may sit on a phone unencrypted.
 */
export const persistedResources: readonly string[] = [];

export const shell: Omit<GenesisNativeAppProps, "children" | "splash"> = {
  brand: genesisBrand,
  supabase,
  steps: [
    { id: "starter:env", run: assertEnv },
    { id: "starter:session-storage", run: sessionReady },
  ],
  persist: features.queryPersistence
    ? persistOffline({
        cache: offlineCache(),
        resources: persistedResources,
        buster: Constants.expoConfig?.version ?? "0",
      })
    : undefined,
  lifecycle: features.queryLifecycle ? { appState: AppState, netInfo: NetInfo } : undefined,
  keyboardProvider: features.keyboardScroll ? KeyboardProvider : undefined,
  keyboardScroll: features.keyboardScroll ? KeyboardAwareScrollView : undefined,
  keyboardToolbar: features.keyboardScroll ? KeyboardToolbar : undefined,
  modules: nativeModules,
  links: features.deepLinks ? { hold: linkHold, onRelease: (path) => router.replace(path as Href) } : undefined,
  updates: updatesBlock,
  // The first block's root is the outermost: observability sees everything below it.
  blocks: [observability, features.push ? createStarterPush() : undefined, support, devtools].filter((block) => block !== undefined),
  // Support needs a signed-in person: the account feature (sign-in in AuthScreen) is the app's own, not a block.
  appFeatures: ["account"],
};
