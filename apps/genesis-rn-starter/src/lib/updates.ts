/**
 * The updates block (`features.updates`): force upgrade and maintenance from
 * Supabase's `app_release_policy` row (migration in `supabase/migrations`),
 * the update banner, what's new once per version, and the version signature
 * Settings shows. `app.ts` passes it to `GenesisNativeApp`.
 *
 * Channel switching (`useUpdates().channels.switchTo("pr-42")`, a pull
 * request's preview update) is on only in development and in the
 * development and preview variants, told apart by the bundle id
 * `APP_VARIANT` gave the build (`.dev`, `.preview`): a fact of the binary,
 * so a build that has switched channels can switch again, and a production
 * build (no suffix) never can.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Application from "expo-application";
import * as Updates from "expo-updates";
import { AppState, Linking, Platform } from "react-native";
import { createUpdates, supabasePolicySource, useVersionSignature, versionSignature } from "@marktiderman/genesis-native/updates";
import starter from "../../starter.config";
import { supabase } from "./supabase";

/** The variants (withGenesis bundle id suffixes) that may switch to another channel's updates. */
const TEST_BUILD = /\.(dev|preview)$/;

export function createStarterUpdates() {
  return createUpdates({
    platform: Platform.OS,
    application: Application,
    updates: Updates,
    policy: supabasePolicySource(supabase),
    storage: AsyncStorage,
    appState: AppState,
    openURL: Linking.openURL,
    channels: { enabled: __DEV__ || TEST_BUILD.test(Application.applicationId ?? "") },
    // Settings > About shows the version itself (`useAppVersion`), with the block on or off.
    versionRow: false,
    onError: (error, source) => console.warn(`[updates] ${source}: ${error.message}`),
  });
}

function useBlockSignature(): string {
  return useVersionSignature().short;
}

function useModuleSignature(): string {
  return versionSignature({ application: Application, updates: Updates, platform: Platform.OS }).short;
}

/**
 * The About row's line, `1.4.0 (37) · preview · 3f2a9c1b`: from the block
 * (with a channel picked on this device) when `updates` is on, else read
 * from the modules directly.
 */
export const useAppVersion: () => string = starter.features.updates ? useBlockSignature : useModuleSignature;
