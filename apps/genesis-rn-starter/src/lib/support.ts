/**
 * The support block (`features.support`): "Send feedback" and "Help" in
 * Settings, the feedback screen with a screenshot (shake the phone to capture
 * the screen you're on and mark it up), your reports with staff replies, and
 * the idea board with votes, on Supabase's `support_*` tables and the private
 * `genesis-support` bucket (migration in `supabase/migrations`). `app.ts`
 * passes it to GenesisNativeApp's `blocks`.
 *
 * Staff: nobody is, until you add `private.genesis_support_staff(person uuid)`
 * in a migration of your own (see the migration's header).
 */
import * as Application from "expo-application";
import { Accelerometer } from "expo-sensors";
import { router, usePathname, type Href } from "expo-router";
import * as Updates from "expo-updates";
import { Platform } from "react-native";
import * as ViewShot from "react-native-view-shot";
import { versionSignature } from "@marktiderman/genesis-native/updates";
import { createSupport } from "@marktiderman/genesis-support/native";
import { copy } from "@/copy";
import { supabase } from "./supabase";

/** Where the support screens live: `src/app/(app)/settings/support/`. */
export const supportBasePath = "/settings/support";

export function createStarterSupport() {
  return createSupport({
    supabase,
    navigate: (href) => router.push(href as Href),
    platform: Platform.OS,
    appVersion: () => versionSignature({ application: Application, updates: Updates, platform: Platform.OS }).short,
    useCurrentRoute: usePathname,
    viewShot: ViewShot,
    accelerometer: Accelerometer,
    basePath: supportBasePath,
    copy: copy.support,
    onError: (error, where) => console.warn(`[support] ${where}: ${error.message}`),
  });
}
