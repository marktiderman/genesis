/**
 * The support block (`features.support`): "Send feedback" and "Help" in
 * Settings, the feedback screen with a screenshot (shake the phone to capture
 * the screen you're on and mark it up), your reports with staff replies, and
 * the idea board with votes, on Supabase's `support_*` tables and the private
 * `genesis-support` bucket (migrations in `supabase/migrations`). `app.ts`
 * passes it to GenesisNativeApp's `blocks`; it also fills the devtools overlay's
 * "Send feedback" and "Send diagnostics".
 *
 * Zero config: every screen comes from `SupportRoute` (`support-route.tsx`), the
 * context dump goes with every report and every shake, and Genesis settings
 * (Supabase's `genesis_settings` and the tenant and person layers, watched live) switch parts on and off; with
 * none stored, everything is on.
 *
 * Staff: the people in `public.genesis_platform_admins` (support's staff-admin-list
 * migration), or your own `private.genesis_support_staff(person)` when you add one.
 * The list starts empty: add the first admin with the SQL in the platform-admins
 * migration's header (`genesis doctor` reports it as `platform-admin-missing`).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import * as Application from "expo-application";
import Constants from "expo-constants";
import { Accelerometer } from "expo-sensors";
import { Stack, router, useLocalSearchParams, usePathname, type Href } from "expo-router";
import * as Updates from "expo-updates";
import { AppState, Platform } from "react-native";
import * as ViewShot from "react-native-view-shot";
import { versionSignature } from "@marktiderman/genesis-native/updates";
import { watchAppSettings, type WatchAppSettingsOptions } from "@marktiderman/genesis-supabase";
import {
  createDiagnostics,
  healthChecks,
  healthChecksSection,
  supabaseHealthChecks,
  supabaseTransport,
  supportSettingsCatalogue,
} from "@marktiderman/genesis-support";
import { createSupport, nativeSections, observabilitySection } from "@marktiderman/genesis-support/native";
import starter from "../../starter.config";
import buildMetadata from "../../build-metadata.json";
import { copy } from "@/copy";
import { env } from "./env";
import { observability } from "./observability";
import { supabase } from "./supabase";

/** Where the support screens live: `src/app/(app)/settings/support/`. */
export const supportBasePath = "/settings/support";

/** Supabase reachable and a session on this device: the devtools overlay runs them, the dump carries them. */
healthChecks.register(...supabaseHealthChecks(supabase));

const warn = (where: string) => (error: unknown) => console.warn(`[support] ${where}: ${error instanceof Error ? error.message : String(error)}`);

/**
 * Genesis settings, as last read: `undefined` until the first read answers (the `max` preset
 * meanwhile). Kept current by `watchStarterSettings`; support and the dump read it each time.
 */
let appSettings: Parameters<WatchAppSettingsOptions["onChange"]>[0] | undefined;

/**
 * Follows Genesis settings for whoever is signed in (their own values too), re-reading on every
 * change the settings migrations broadcast. Without the table or Realtime, it warns and support keeps the
 * `max` preset. Returns the stop.
 */
export function watchStarterSettings(): () => void {
  const catalogue = supportSettingsCatalogue();
  let person: string | null | undefined;
  let stop: (() => void) | undefined;
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    const next = session?.user.id ?? null;
    if (next === person) return;
    person = next;
    stop?.();
    stop = watchAppSettings(supabase, catalogue, {
      ...(next ? { personId: next } : {}),
      onChange: (settings) => {
        appSettings = settings;
      },
      onError: warn("settings"),
    });
  });
  return () => {
    stop?.();
    data.subscription.unsubscribe();
  };
}

/** The context dump: the phone's sections, Sentry's last event, the health checks, the person's id. */
export function createStarterDiagnostics() {
  return createDiagnostics({
    app: { id: Application.applicationId ?? starter.app.slug, name: Constants.expoConfig?.name ?? starter.app.name, platform: Platform.OS },
    transport: supabaseTransport(supabase),
    sections: [
      ...nativeSections({ application: Application, updates: Updates, netInfo: NetInfo, appState: AppState, buildMetadata, flags: () => starter.features, server: { baseUrl: env.supabaseUrl } }),
      observability && observabilitySection(observability),
      healthChecksSection(healthChecks),
    ],
    user: async () => ({ id: (await supabase.auth.getSession()).data.session?.user.id ?? null }),
    // A dump that can't go now waits on the phone and goes when the app is back online.
    offline: { storage: AsyncStorage },
    appSettings: () => appSettings,
    onProblem: warn("diagnostics"),
  });
}

export function createStarterSupport() {
  return createSupport({
    supabase,
    navigate: (href) => router.push(href as Href),
    platform: Platform.OS,
    appVersion: () => versionSignature({ application: Application, updates: Updates, platform: Platform.OS, buildMetadata }).short,
    useCurrentRoute: usePathname,
    router: { Screen: Stack.Screen, useSearchParams: useLocalSearchParams },
    viewShot: ViewShot,
    accelerometer: Accelerometer,
    basePath: supportBasePath,
    copy: copy.support,
    diagnostics: createStarterDiagnostics(),
    appState: AppState,
    netInfo: NetInfo,
    appSettings: () => appSettings,
    onError: (error, where) => console.warn(`[support] ${where}: ${error.message}`),
  });
}

/** The support block, or `undefined` with `features.support` off. */
export const support = starter.features.support ? createStarterSupport() : undefined;

if (support) watchStarterSettings();
