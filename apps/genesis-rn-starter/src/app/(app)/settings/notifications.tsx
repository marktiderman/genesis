import { Redirect, Stack } from "expo-router";
import { NotificationPreferences } from "@marktiderman/genesis-notifications/native";
import { getSettingsPageStackOptions } from "@marktiderman/genesis-ui-native";
import starter from "../../../../starter.config";
import { copy } from "@/copy";

/**
 * Settings → Notifications (`features.push`): the push block's permission, quiet hours and previews,
 * with genesis-notifications' switch per category and channel in place of its category switches.
 */
export default function NotificationSettingsScreen() {
  if (!starter.features.push) return <Redirect href="/settings" />;
  return (
    <>
      <Stack.Screen options={getSettingsPageStackOptions({ headerTitle: copy.push.settingsTitle, large: false })} />
      <NotificationPreferences testID="notification-settings" />
    </>
  );
}
