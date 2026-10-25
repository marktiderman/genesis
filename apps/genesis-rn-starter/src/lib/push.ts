/**
 * The push block (`features.push`): this device's Expo push token on sign-in
 * (once permission is granted) and off on sign-out, taps routed through the
 * deep-link map, the badge, the soft prompt and the Notification settings
 * screen, on Supabase's `push_devices` and `notification_preferences`
 * (migration in `supabase/migrations`). `app.ts` passes it to GenesisNativeApp's
 * `blocks`; it adds the Notifications row to Settings (`useBlockSettings`).
 *
 * The sender is the `genesis-push-send` Edge Function in `supabase/functions`;
 * the app never sends a push itself. Without an EAS project id
 * (`starter.config.ts` `app.easProjectId`) there is no push token: the block
 * says so once in the console and Settings says so on screen.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Application from "expo-application";
import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import * as Notifications from "expo-notifications";
import { router, type Href } from "expo-router";
import { AppState, Linking, Platform } from "react-native";
import { createPush } from "@marktiderman/genesis-native/push";
import { notificationsPushBackend, pushOptionsFrom } from "@marktiderman/genesis-notifications/native";
import starter from "../../starter.config";
import { chatPushCategory } from "@marktiderman/genesis-chat/native";
import { copy } from "@/copy";
import { onChatPushResponse } from "./chat";
import { linkHold, links } from "./links";
import { notifications } from "./notifications";
import { supabase } from "./supabase";

/**
 * The kinds of notification the app sends (an Android channel each) and the action buttons, from
 * the registry, plus chat's when it's on: its notifications carry Reply and Mark read (`chat.tsx`
 * registers them).
 */
const fromRegistry = pushOptionsFrom(notifications);
export const pushOptions = {
  ...fromRegistry,
  categories: [...(fromRegistry.categories ?? []), ...(starter.features.chat ? [chatPushCategory()] : [])],
};

export function createStarterPush() {
  return createPush({
    notifications: Notifications,
    platform: Platform.OS,
    projectId: (Constants.expoConfig?.extra?.eas?.projectId as string | undefined) ?? Constants.easConfig?.projectId ?? null,
    appVersion: Application.nativeApplicationVersion,
    backend: notificationsPushBackend(supabase),
    ...pushOptions,
    onResponse: onChatPushResponse,
    // This install's id: a token moves to another login only from this phone. Hermes has no crypto.randomUUID.
    randomUUID: Crypto.randomUUID,
    storage: AsyncStorage,
    appState: AppState,
    openSettings: Linking.openSettings,
    // With deepLinks off a tapped push opens `/`, as every other link does, and isn't held over sign-in.
    links: starter.features.deepLinks ? links : { map: {} },
    onOpen: (path) => router.push(path as Href),
    hold: starter.features.deepLinks ? linkHold : undefined,
    // Settings gets the row through useBlockSettings, in its untitled `general` section.
    settingsRow: { title: copy.settings.notifications, section: "general", href: "/settings/notifications" },
    statusLabels: copy.push.status,
    onError: (error, source) => console.warn(`[push] ${source}: ${error.message}`),
  });
}
