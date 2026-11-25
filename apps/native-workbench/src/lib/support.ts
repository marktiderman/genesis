/**
 * The support block (`features.support`): "Send feedback" and "Help" in
 * Settings, the feedback screen with a screenshot (shake the phone to capture
 * the screen you're on and mark it up), your reports with staff replies, and
 * the idea board with votes, on Supabase's `support_*` tables and the private
 * `genesis-support` bucket (migrations in `supabase/migrations`). `app.ts`
 * passes it to GenesisNativeApp's `blocks`; it also fills the devtools overlay's
 * "Send feedback" and "Send diagnostics".
 *
 * Zero config: every screen comes from `SupportRoute` (two one-line route files), the
 * context dump goes with every report and every shake, and Genesis settings
 * (watched live: `settings.ts`) switch parts on and off; with
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
import { createDiagnostics, healthChecksSection, supabaseTransport } from "@marktiderman/genesis-support";
import { createSupport, nativeSections, observabilitySection } from "@marktiderman/genesis-support/native";
import starter from "../../starter.config";
import buildMetadata from "../../build-metadata.json";
import { copy } from "@/copy";
import { env } from "./env";
import { healthChecks } from "./health";
import { observability } from "./observability";
import { starterSettings } from "./settings";
import { supabase } from "./supabase";

/** Where the support screens live: `src/app/(app)/settings/support/`. */
export const supportBasePath = "/settings/support";

const warn = (where: string) => (error: unknown) => console.warn(`[support] ${where}: ${error instanceof Error ? error.message : String(error)}`);

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
    appSettings: starterSettings.current,
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
    appSettings: starterSettings.current,
    onError: (error, where) => console.warn(`[support] ${where}: ${error.message}`),
  });
}

/** The support block, or `undefined` with `features.support` off. */
export const support = starter.features.support ? createStarterSupport() : undefined;
