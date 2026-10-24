/**
 * The push block (`features.push`): this device's Expo push token on sign-in
 * (once permission is granted) and off on sign-out, taps routed through the
 * deep-link map, the badge, the soft prompt and the Notification settings
 * screen, on Supabase's `push_devices` and `notification_preferences`
 * (migration in `supabase/migrations`). `app.ts` passes it to GenesisNativeApp.
 *
 * The sender is the `genesis-push-send` Edge Function in `supabase/functions`;
 * the app never sends a push itself. Without an EAS project id
 * (`starter.config.ts` `app.easProjectId`) there is no push token: the block
 * says so once in the console and Settings says so on screen.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Application from "expo-application";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { router, type Href } from "expo-router";
import { AppState, Linking, Platform } from "react-native";
import { createPush, supabasePushBackend } from "@marktiderman/genesis-native/push";
import { copy } from "@/copy";
import { links } from "./links";
import { supabase } from "./supabase";

/** The kinds of notification the app sends: a switch each in Settings, an Android channel each. Add yours. */
export const pushCategories = [{ id: "activity", title: copy.push.activityTitle, description: copy.push.activityDescription }];

export function createStarterPush() {
  return createPush({
    notifications: Notifications,
    platform: Platform.OS,
    projectId: (Constants.expoConfig?.extra?.eas?.projectId as string | undefined) ?? Constants.easConfig?.projectId ?? null,
    appVersion: Application.nativeApplicationVersion,
    backend: supabasePushBackend(supabase),
    categories: pushCategories,
    storage: AsyncStorage,
    appState: AppState,
    openSettings: Linking.openSettings,
    links,
    onOpen: (path) => router.push(path as Href),
    onError: (error, source) => console.warn(`[push] ${source}: ${error.message}`),
  });
}
