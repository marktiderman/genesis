import { Stack } from "expo-router";

export default function LayoutsLayout() {
  return (
    <Stack
      screenOptions={{ headerShown: true, headerBackTitle: "Back" }}
    >
      <Stack.Screen name="index" options={{ title: "Layouts" }} />
      <Stack.Screen name="settings" options={{ title: "Settings (E1)" }} />
      <Stack.Screen name="settings-sub" options={{ title: "Settings sub-page (E2)" }} />
      <Stack.Screen name="notifications" options={{ title: "Notifications (E3)" }} />
      <Stack.Screen name="empty-state" options={{ title: "Empty state (E6)" }} />
      <Stack.Screen name="auth" options={{ title: "Auth (E7)" }} />
    </Stack>
  );
}
