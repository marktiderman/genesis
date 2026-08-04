import { Stack } from "expo-router";

export default function StandardsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerBackTitle: "Back",
      }}
    >
      <Stack.Screen name="index" options={{ title: "Standards" }} />
    </Stack>
  );
}
