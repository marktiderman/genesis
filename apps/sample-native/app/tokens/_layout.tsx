import { Stack } from "expo-router";

/**
 * Tokens viewer (Phase G.2).
 *
 * Six screens — one per token category — generated directly from
 * `@marktiderman/genesis-design-system` so the portfolio always reflects
 * what the package actually exports. Every token shows its name +
 * value + a visual sample.
 *
 * Maestro deep links: `genesis-sample://tokens/<category>`.
 */
export default function TokensLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerBackTitle: "Back",
      }}
    >
      <Stack.Screen name="index" options={{ title: "Tokens" }} />
      <Stack.Screen name="colors" options={{ title: "Colors" }} />
      <Stack.Screen name="typography" options={{ title: "Typography" }} />
      <Stack.Screen name="spacing" options={{ title: "Spacing" }} />
      <Stack.Screen name="radii" options={{ title: "Radii" }} />
      <Stack.Screen name="motion" options={{ title: "Motion" }} />
      <Stack.Screen name="shadows" options={{ title: "Shadows" }} />
    </Stack>
  );
}
