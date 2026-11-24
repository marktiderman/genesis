/**
 * Standards: the tab bar per screen (UIKit's hidesBottomBarWhenPushed). This screen hides it while
 * it's focused; going back shows it again.
 */
import { useMemo } from "react";
import { NativeText } from "@marktiderman/genesis-ui-native";
import { ScreenContainer } from "@marktiderman/genesis-ui-native/layouts";
import type { WorkbenchScreen } from "../registry";

function TabBarHidden() {
  const header = useMemo(() => ({ headerTitle: "No tab bar", large: false }), []);
  return (
    <ScreenContainer tabBar="hidden" header={header} scroll testID="workbench-tab-bar-hidden">
      <NativeText testID="workbench-tab-bar-hidden-body" style={{ padding: 20 }}>
        The tab bar is hidden while this screen is focused. Back (or an edge swipe) brings it back.
      </NativeText>
    </ScreenContainer>
  );
}

export const tabBarHidden: WorkbenchScreen = {
  id: "tab-bar-hidden",
  title: "Tab bar hidden on one screen",
  summary: "tabBar=\"hidden\" inside TabBarVisibilityProvider: no tab bar here, back as usual.",
  section: "Standards",
  package: "genesis-ui-native",
  covers: ["TabBarVisibilityProvider", "useHideTabBar", "NativeTabBar"],
  screen: TabBarHidden,
};
