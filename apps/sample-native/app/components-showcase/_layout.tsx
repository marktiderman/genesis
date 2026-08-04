import { Stack } from "expo-router";

/**
 * Stack layout for visual-regression showcase screens.
 *
 * These screens exist primarily to give Maestro a stable surface to
 * screenshot every primitive in @marktiderman/genesis-ui-native. Each child
 * route renders a single primitive in a deterministic, content-stable
 * layout so frame-by-frame snapshot diffs are meaningful.
 *
 * NOT linked from the main tab UI. Reachable via deep link only:
 *   genesis-sample://components-showcase/buttons
 *
 * Maestro flows in apps/sample-native/.maestro/flows use these deep
 * links to navigate; see flows/screenshot-light.yaml etc.
 */
export default function ComponentsShowcaseLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerBackTitle: "Back",
      }}
    >
      <Stack.Screen name="index" options={{ title: "Showcase" }} />
      <Stack.Screen name="buttons" options={{ title: "Buttons" }} />
      <Stack.Screen name="cards" options={{ title: "Cards" }} />
      <Stack.Screen name="inputs" options={{ title: "Inputs" }} />
      <Stack.Screen name="badges" options={{ title: "Badges" }} />
      <Stack.Screen name="dialogs" options={{ title: "Dialogs" }} />
      <Stack.Screen name="alerts" options={{ title: "Alerts" }} />
      <Stack.Screen name="progress" options={{ title: "Progress" }} />
    </Stack>
  );
}
