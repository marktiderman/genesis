// @feat:native-components
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Text, View } from "react-native";
import { SettingsPage, type SettingsPageSlotMap } from "../settings-page";

const sections = [
  { id: "account", title: "Account", footnote: "Only you see this.", rows: [{ id: "name", title: "Name" }, { id: "email", title: "Email" }] },
];

describe("SettingsPage slots", () => {
  it("replaces one part and keeps the rest", () => {
    const Row = ({ title, testID, isLast }: SettingsPageSlotMap["row"]) => (
      <View testID={testID}>
        <Text>{`custom ${title}${isLast ? " (last)" : ""}`}</Text>
      </View>
    );
    render(<SettingsPage testID="s" sections={sections} slots={{ row: Row }} />);
    expect(screen.getByText("custom Name")).toBeTruthy();
    expect(screen.getByText("custom Email (last)")).toBeTruthy();
    expect(screen.getByTestId("s-section-account-header")).toBeTruthy();
    expect(screen.getByText("Only you see this.")).toBeTruthy();
  });

  it("drops a part with null", () => {
    render(<SettingsPage testID="s" sections={sections} slots={{ sectionHeader: null, footnote: null }} />);
    expect(screen.queryByTestId("s-section-account-header")).toBeNull();
    expect(screen.queryByText("Only you see this.")).toBeNull();
    expect(screen.getByTestId("s-row-name")).toBeTruthy();
  });

  it("feeds a default part through slotProps", () => {
    render(<SettingsPage testID="s" sections={sections} slotProps={{ footnote: { text: "Overridden." } }} />);
    expect(screen.getByText("Overridden.")).toBeTruthy();
  });

  it("gives each dangerous action a stable test id", () => {
    render(<SettingsPage testID="s" sections={sections} dangerousActions={[{ label: "Sign out", onPress: () => {} }]} />);
    expect(screen.getByTestId("s-danger-sign-out")).toBeTruthy();
  });
});
