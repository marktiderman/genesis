import { Redirect, Stack } from "expo-router";
import { NotificationSettings } from "@marktiderman/genesis-native/push";
import { getSettingsPageStackOptions } from "@marktiderman/genesis-ui-native";
import starter from "../../../../starter.config";
import { copy } from "@/copy";

/** Settings → Notifications (`features.push`): categories, quiet hours and previews, on the push block. */
export default function NotificationSettingsScreen() {
  if (!starter.features.push) return <Redirect href="/settings" />;
  return (
    <>
      <Stack.Screen options={getSettingsPageStackOptions({ headerTitle: copy.push.settingsTitle, large: false })} />
      <NotificationSettings testID="notification-settings" />
    </>
  );
}
