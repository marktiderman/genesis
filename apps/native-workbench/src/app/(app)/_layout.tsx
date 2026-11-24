import { NativeTabs } from "expo-router/native-tabs";
import { TabBarVisibilityProvider } from "@marktiderman/genesis-ui-native/layouts";
import { workbenchExit } from "@/workbench/screens/place-exit";

/**
 * The showcase: one tab per section, each a stack of the section's screens. No sign-in: every
 * screen runs on sample data. A screen hides the tab bar while it's focused with
 * `<ScreenContainer tabBar="hidden">` or `useHideTabBar()`.
 */
export default function AppLayout() {
  // The place exit demo remembers the last path outside its place.
  workbenchExit.useRememberOutside();
  return (
    <TabBarVisibilityProvider>
      {(hidden) => (
        <NativeTabs hidden={hidden} minimizeBehavior="onScrollDown">
          <NativeTabs.Trigger name="standards">
            <NativeTabs.Trigger.Label>Standards</NativeTabs.Trigger.Label>
            <NativeTabs.Trigger.Icon sf={{ default: "checkmark.seal", selected: "checkmark.seal.fill" }} md="verified" />
          </NativeTabs.Trigger>
          <NativeTabs.Trigger name="components">
            <NativeTabs.Trigger.Label>Components</NativeTabs.Trigger.Label>
            <NativeTabs.Trigger.Icon sf={{ default: "square.grid.2x2", selected: "square.grid.2x2.fill" }} md="widgets" />
          </NativeTabs.Trigger>
          <NativeTabs.Trigger name="layouts">
            <NativeTabs.Trigger.Label>Layouts</NativeTabs.Trigger.Label>
            <NativeTabs.Trigger.Icon sf={{ default: "rectangle.3.group", selected: "rectangle.3.group.fill" }} md="dashboard" />
          </NativeTabs.Trigger>
          <NativeTabs.Trigger name="messages">
            <NativeTabs.Trigger.Label>Messages</NativeTabs.Trigger.Label>
            <NativeTabs.Trigger.Icon sf={{ default: "bubble.left.and.bubble.right", selected: "bubble.left.and.bubble.right.fill" }} md="chat" />
          </NativeTabs.Trigger>
        </NativeTabs>
      )}
    </TabBarVisibilityProvider>
  );
}
