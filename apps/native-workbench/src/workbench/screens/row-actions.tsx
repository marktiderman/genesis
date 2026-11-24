/**
 * Standards: a row's actions, the iOS way from one list (ADR 0028): behind a swipe (leading,
 * trailing, a full swipe for the first of a side), in the system long-press menu, and as
 * VoiceOver's actions. What ran shows in the line under the header, so a flow can read it.
 */
import { useMemo, useState } from "react";
import { View } from "react-native";
import { DataProviderRoot } from "@marktiderman/genesis-core/provider";
import { defineView } from "@marktiderman/genesis-core/resource-view";
import type { RowSwipeAction } from "@marktiderman/genesis-core/row-actions";
import { NativeListItem, NativeRowActions, NativeText } from "@marktiderman/genesis-ui-native";
import { NativeResourceView } from "@marktiderman/genesis-ui-native/data";
import { ScreenContainer } from "@marktiderman/genesis-ui-native/layouts";
import type { WorkbenchScreen } from "../registry";
import { sampleMessages, sampleProvider, type SampleMessage } from "../sample-data";

const messagesView = defineView<typeof sampleMessages, SampleMessage>(sampleMessages, {
  columns: { default: ["from", "subject"] },
  actions: [
    { name: "read", label: "Read", swipe: { side: "leading", full: true }, icon: "mail-open", tone: "info" },
    { name: "pin", label: "Pin", swipe: "leading", icon: "pin", accent: "orange" },
    { name: "mute", label: "Hide Alerts", swipe: "trailing", icon: "bell-off", accent: "purple" },
    { name: "archive", label: "Archive", swipe: { side: "trailing", full: true }, icon: "archive", tone: "neutral" },
    // No `swipe`: the long-press menu and VoiceOver only.
    { name: "note", label: "Add Note", icon: "edit" },
  ],
});

function LastRan({ id, last }: { id: string; last: string }) {
  return (
    <NativeText testID={`workbench-${id}-last`} style={{ paddingHorizontal: 20, paddingVertical: 8, opacity: 0.7 }}>
      {last || "Swipe a row, or long press it."}
    </NativeText>
  );
}

function RowActionsList() {
  const provider = useMemo(sampleProvider, []);
  const [last, setLast] = useState("");
  const header = useMemo(() => ({ headerTitle: "Row actions" }), []);
  return (
    <ScreenContainer header={header} testID="workbench-row-actions-list">
      <DataProviderRoot provider={provider}>
        {/* The line goes in the list's own header: the list must be the screen's first view, or
            iOS can't find the scroll view to collapse the large title into. */}
        <NativeResourceView
          view={messagesView}
          header={<LastRan id="row-actions-list" last={last} />}
          can={() => false}
          title={false}
          searchable={false}
          onAction={(name, row) => setLast(`Ran ${name} on ${(row as SampleMessage).from}`)}
          onRowPress={(row) => setLast(`Opened ${row.from}`)}
          testID="workbench-row-actions-list-view"
        />
      </DataProviderRoot>
    </ScreenContainer>
  );
}

function itemActions(say: (what: string) => void): RowSwipeAction[] {
  return [
    { id: "unread", label: "Unread", icon: "message-unread", accent: "blue", swipe: { side: "leading", full: true }, onPress: () => say("unread") },
    { id: "pin", label: "Pin", icon: "pin", accent: "orange", swipe: { side: "leading" }, onPress: () => say("pin") },
    { id: "alerts", label: "Hide Alerts", icon: "bell-off", accent: "purple", onPress: () => say("alerts") },
    { id: "delete", label: "Delete", icon: "trash", destructive: true, confirms: true, swipe: { side: "trailing", full: true }, onPress: () => say("delete") },
  ];
}

function RowActionsItems() {
  const [last, setLast] = useState("");
  const actions = useMemo(() => itemActions((what) => setLast(`Ran ${what}`)), []);
  const header = useMemo(() => ({ headerTitle: "List item actions", large: false }), []);
  return (
    <ScreenContainer header={header} scroll testID="workbench-row-actions-items">
      <LastRan id="row-actions-items" last={last} />
      <NativeListItem title="Fill (default)" subtitle="Swipe either way; long press for the menu" actions={actions} onPress={() => setLast("Opened fill")} testID="workbench-row-actions-items-fill" />
      <NativeListItem title="Round (iOS 26)" subtitle="Round buttons; the row becomes a pill while open" actions={actions} actionsAppearance="round" onPress={() => setLast("Opened round")} testID="workbench-row-actions-items-round" />
      <NativeRowActions
        actions={actions}
        title="With a peek"
        preview={() => <NativeText testID="workbench-row-actions-items-peek" style={{ padding: 16 }}>A preview of the row above its menu.</NativeText>}
        testID="workbench-row-actions-items-peek-actions"
      >
        <NativeListItem title="With a peek" subtitle="Long press shows a preview" onPress={() => setLast("Opened peek")} testID="workbench-row-actions-items-peek-row" />
      </NativeRowActions>
      <View style={{ height: 400 }} />
    </ScreenContainer>
  );
}

export const rowActionsList: WorkbenchScreen = {
  id: "row-actions-list",
  title: "Row actions on a list",
  summary: "Leading Read and Pin, trailing Hide Alerts and Archive; a full swipe runs Read or Archive; long press opens the system menu with Add Note too.",
  section: "Standards",
  package: "genesis-ui-native",
  covers: ["NativeResourceView", "NativeSwipeRow", "NativeSystemMenuRow"],
  screen: RowActionsList,
};

export const rowActionsItems: WorkbenchScreen = {
  id: "row-actions-items",
  title: "Row actions on list items",
  summary: "NativeListItem actions in fill and iOS 26 round style, and NativeRowActions with a peek above the long-press menu.",
  section: "Standards",
  package: "genesis-ui-native",
  covers: ["NativeListItem", "NativeRowActions", "NativeContextMenu"],
  screen: RowActionsItems,
};
