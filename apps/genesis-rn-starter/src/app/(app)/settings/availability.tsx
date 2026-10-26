import { Redirect, Stack, router } from "expo-router";
import { ChatAvailabilityScreen } from "@marktiderman/genesis-chat/native";
import { getSettingsPageStackOptions } from "@marktiderman/genesis-ui-native";
import starter from "../../../../starter.config";
import { copy } from "@/copy";

/** Settings → Availability (`features.chat`): your away message, working hours and time zone, shown in your conversations. */
export default function AvailabilitySettingsScreen() {
  if (!starter.features.chat) return <Redirect href="/settings" />;
  return (
    <>
      <Stack.Screen options={getSettingsPageStackOptions({ headerTitle: copy.settings.availability, large: false })} />
      <ChatAvailabilityScreen onSaved={() => router.back()} />
    </>
  );
}
