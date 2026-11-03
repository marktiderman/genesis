/**
 * The overlay itself. Only `devtools.ts` imports this file, behind a
 * condition Metro folds, so production bundles never include it. Open it
 * with a three-finger hold, "Open devtools" in the dev menu, or Settings >
 * About > Developer tools.
 */
import * as Application from "expo-application";
import { DevSettings } from "react-native";
import { createDevtools } from "@marktiderman/genesis-native/devtools";
import starter from "../../starter.config";
import { offlineCache } from "./offline";
import { env } from "./env";
import { observability } from "./observability";
import { supabase } from "./supabase";
import { updatesBlock } from "./updates";

/** The variants (withGenesis bundle id suffixes) that may open the overlay. */
const TEST_BUILD = /\.(dev|preview)$/;


export function createStarterDevtools() {
  return createDevtools({
    enabled: __DEV__ || TEST_BUILD.test(Application.applicationId ?? ""),
    updates: updatesBlock,
    observability,
    baseUrl: env.supabaseUrl,
    flags: starter.features,
    devSettings: __DEV__ ? DevSettings : undefined,
    // The device cache (`persistOffline`'s, in app.ts), every person's.
    clearCache: () => offlineCache().clear(),
    signOut: () => supabase.auth.signOut(),
  });
}
