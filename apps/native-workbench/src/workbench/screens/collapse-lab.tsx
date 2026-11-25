/** TEMPORARY: which wrapper stops a large title collapsing over a NativeResourceView. Removed with the fix. */
import { useMemo, type ComponentType } from "react";
import { Stack } from "expo-router";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DataProviderRoot } from "@marktiderman/genesis-core/provider";
import { defineView } from "@marktiderman/genesis-core/resource-view";
import { composeHeaderOptions } from "@marktiderman/genesis-ui-native";
import { NativeResourceView } from "@marktiderman/genesis-ui-native/data";
import { ScreenContainer } from "@marktiderman/genesis-ui-native/layouts";
import type { WorkbenchScreen } from "../registry";
import { sampleMessages, sampleProvider, type SampleMessage } from "../sample-data";

const view = defineView<typeof sampleMessages, SampleMessage>(sampleMessages, { columns: { default: ["from", "subject"] } });
const viewWithActions = defineView<typeof sampleMessages, SampleMessage>(sampleMessages, {
  columns: { default: ["from", "subject"] },
  actions: [
    { name: "read", label: "Read", swipe: { side: "leading", full: true }, icon: "mail-open", tone: "info" },
    { name: "archive", label: "Archive", swipe: { side: "trailing", full: true }, icon: "archive", tone: "neutral" },
  ],
});

function List({ actions = false, withHeader = false }: { actions?: boolean; withHeader?: boolean }) {
  const provider = useMemo(() => sampleProvider(), []);
  return (
    <DataProviderRoot provider={provider}>
      <NativeResourceView
        view={actions ? viewWithActions : view}
        can={() => false}
        title={false}
        searchable={false}
        {...(actions ? { onAction: () => undefined, onRowPress: () => undefined } : {})}
        {...(withHeader ? { header: <Text style={{ padding: 16 }}>A header in the list</Text> } : {})}
        testID="lab-view"
      />
    </DataProviderRoot>
  );
}

const header = (t: string) => composeHeaderOptions({ headerTitle: t, large: true, scrollEdgeBehavior: "match" });

const LAB_B_HEADER = { headerTitle: "Lab B container" };
function LabB() {
  return (
    <ScreenContainer header={LAB_B_HEADER}>
      <List />
    </ScreenContainer>
  );
}

const LAB_F_HEADER = { headerTitle: "Lab F actions" };
function LabF() {
  return (
    <ScreenContainer header={LAB_F_HEADER}>
      <List actions />
    </ScreenContainer>
  );
}
const LAB_G_HEADER = { headerTitle: "Lab G header" };
function LabG() {
  return (
    <ScreenContainer header={LAB_G_HEADER}>
      <List withHeader />
    </ScreenContainer>
  );
}

const LAB_H_HEADER = { headerTitle: "Lab H testID" };
function LabH() {
  return (
    <ScreenContainer header={LAB_H_HEADER} testID="lab-h">
      <List />
    </ScreenContainer>
  );
}

const variants: Record<string, ComponentType> = {
  // A: NRV directly, header from Stack.Screen.
  a: () => (<><Stack.Screen options={header("Lab A bare")} /><List /></>),
  // B: ScreenContainer header, NRV as its only child (the failing case).
  b: LabB,
  f: LabF,
  g: LabG,
  h: LabH,
  // I: SafeAreaView > View with a testID (not flattened) > NRV.
  i: () => (<><Stack.Screen options={header("Lab I view testID")} /><SafeAreaView edges={["left", "right"]} style={{ flex: 1 }}><View testID="lab-i-body" style={{ flex: 1 }}><List /></View></SafeAreaView></>),
  // C: RNC SafeAreaView > NRV.
  c: () => (<><Stack.Screen options={header("Lab C safe")} /><SafeAreaView edges={["left", "right"]} style={{ flex: 1 }}><List /></SafeAreaView></>),
  // D: View > NRV.
  d: () => (<><Stack.Screen options={header("Lab D view")} /><View style={{ flex: 1 }}><List /></View></>),
  // E: SafeAreaView > View > NRV (ScreenContainer's structure, by hand).
  e: () => (<><Stack.Screen options={header("Lab E safe view")} /><SafeAreaView edges={["left", "right"]} style={{ flex: 1 }}><View style={{ flex: 1 }}><List /></View></SafeAreaView></>),
};

export const collapseLab: WorkbenchScreen[] = Object.entries(variants).map(([k, screen]) => ({
  id: `lab-${k}`,
  title: `Collapse lab ${k.toUpperCase()}`,
  summary: "Temporary: a large title over a list in one wrapper.",
  section: "Standards",
  package: "lab",
  covers: ["NativeResourceView"],
  screen,
}));
