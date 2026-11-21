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
import buildMetadata from "../../build-metadata.json";
import { observability } from "./observability";
import { supabase } from "./supabase";

export function createStarterUpdates() {
  return createUpdates({
    platform: Platform.OS,
    application: Application,
    updates: Updates,
    // The commit and build time `genesis build-stamp` wrote (EAS runs it after install).
    buildMetadata,
    policy: supabasePolicySource(supabase),
    storage: AsyncStorage,
    appState: AppState,
    openURL: Linking.openURL,
    // Every build opens preview links (app/preview.tsx), store builds included: a preview is a
    // channel with an update for this runtime, and leaving it always works (the Preview banner).
    channels: { enabled: true },
    // Settings > About shows the version itself (`useAppVersion`), with the block on or off.
    versionRow: false,
    onError: (error, source) => {
      console.warn(`[updates] ${source}: ${error.message}`);
      observability?.captureError(error, { source: `updates:${source}` });
    },
  });
}

/** The app's one updates block (`features.updates`), shared by the shell and the devtools overlay. */
export const updatesBlock = starter.features.updates ? createStarterUpdates() : undefined;

function useBlockSignature(): string {
  return useVersionSignature().short;
}

function useModuleSignature(): string {
  return versionSignature({ application: Application, updates: Updates, platform: Platform.OS, buildMetadata }).short;
}

/**
 * The About row's line, `1.4.0 (37) · preview · 3f2a9c1b`: from the block
 * (with a channel picked on this device) when `updates` is on, else read
 * from the modules directly.
 */
export const useAppVersion: () => string = starter.features.updates ? useBlockSignature : useModuleSignature;
