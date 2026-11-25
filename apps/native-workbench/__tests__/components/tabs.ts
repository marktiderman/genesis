import { screen } from "@testing-library/react-native";

/**
 * The native tab bar's tabs, as react-native-screens renders them under Jest: one
 * `RNSTabsScreen*` host view per tab, titled with its label. There is no role or text
 * query for these (the bar itself is native), so the tests read the host views.
 */
export function tabTitles(): string[] {
  return screen.container
    .queryAll((node) => typeof node.type === "string" && node.type.startsWith("RNSTabsScreen"))
    .map((node) => String(node.props.title));
}
