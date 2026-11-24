/**
 * Standards: the stack's native header from inside the screen (ScreenContainer `header`): a
 * large title that collapses as the list scrolls, the system search field and native header
 * buttons; and a drill-down's standard title.
 */
import { useMemo, useState } from "react";
import { router, type Href } from "expo-router";
import { NativeText } from "@marktiderman/genesis-ui-native";
import { ScreenContainer } from "@marktiderman/genesis-ui-native/layouts";
import type { WorkbenchScreen } from "../registry";
import { SAMPLE_MESSAGES } from "../sample-data";

function HeaderLarge() {
  const [query, setQuery] = useState("");
  const header = useMemo(
    () => ({
      headerTitle: "Native header",
      search: { placeholder: "Search names", onChangeText: (e: { nativeEvent: { text: string } }) => setQuery(e.nativeEvent.text) },
      headerRightItems: () => [{ type: "button", label: "Drill in", onPress: () => router.push("/standards/header-drilldown" as Href) }],
    }),
    [],
  );
  const rows = SAMPLE_MESSAGES.filter((r) => !query || r.from.toLowerCase().includes(query.toLowerCase()));
  return (
    <ScreenContainer header={header} scroll testID="workbench-header-large">
      {rows.map((r) => (
        <NativeText key={r.id} testID={`workbench-header-large-row-${r.id}`} style={{ paddingHorizontal: 20, paddingVertical: 14 }}>
          {r.from}
        </NativeText>
      ))}
    </ScreenContainer>
  );
}

function HeaderDrilldown() {
  const header = useMemo(() => ({ headerTitle: "Drill-down", large: false }), []);
  return (
    <ScreenContainer header={header} scroll testID="workbench-header-drilldown">
      <NativeText style={{ padding: 20 }}>A standard title, and the stack's own back button and edge swipe.</NativeText>
    </ScreenContainer>
  );
}

export const headerLarge: WorkbenchScreen = {
  id: "header-large",
  title: "Native header: large title, search, buttons",
  summary: "The large title collapses into the bar as the list scrolls; the search field is the system's; Drill in is a native header button.",
  section: "Standards",
  package: "genesis-ui-native",
  covers: ["ScreenContainer", "composeHeaderOptions"],
  screen: HeaderLarge,
};

export const headerDrilldown: WorkbenchScreen = {
  id: "header-drilldown",
  title: "Native header: drill-down",
  summary: "large: false gives a standard title; back is the stack's button and edge swipe.",
  section: "Standards",
  package: "genesis-ui-native",
  covers: ["ScreenContainer"],
  screen: HeaderDrilldown,
};
