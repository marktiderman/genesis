// @feat:native-layouts
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Platform, StyleSheet, Text } from "react-native";
import { SettingsPage } from "../settings-page";

const sections = [
  {
    id: "account",
    title: "Account",
    footnote: "Only you see this.",
    rows: [
      { id: "name", title: "Name", leading: <Text>icon</Text> },
      { id: "email", title: "Email" },
      { id: "phone", title: "Phone" },
    ],
  },
];

function styleOf(el: HTMLElement): Record<string, unknown> {
  return StyleSheet.flatten(JSON.parse(el.dataset.style ?? "null"));
}

const os = Platform.OS;
afterEach(() => {
  Platform.OS = os;
});

describe("SettingsPage on iOS (inset grouped)", () => {
  it("renders the header as an uppercase footnote caption in secondaryLabel, with no band or rule", () => {
    render(<SettingsPage testID="s" sections={sections} />);
    const header = screen.getByTestId("s-section-account-header");
    expect(header.getAttribute("role")).toBe("header");
    expect(header.textContent).toBe("Account");
    expect(styleOf(header)).toMatchObject({
      color: { semantic: ["secondaryLabel"] },
      fontSize: 13,
      textTransform: "uppercase",
    });
    // Inset to line up with the cell text: the group's margin plus the cell's padding.
    expect(header.className).toContain("mx-4");
    expect(header.className).toContain("px-4");
    expect(header.className).not.toMatch(/\bbg-|\bborder/);
  });

  it("puts rows in a rounded group with hairline separators between cells only", () => {
    render(<SettingsPage testID="s" sections={sections} />);
    const group = screen.getByTestId("s-row-name").parentElement!;
    expect(group.className).toContain("rounded-xl");
    expect(styleOf(group).backgroundColor).toEqual({ semantic: ["secondarySystemGroupedBackground"] });
    expect(screen.getByTestId("s-row-name-separator")).toBeTruthy();
    expect(screen.getByTestId("s-row-email-separator")).toBeTruthy();
    expect(screen.queryByTestId("s-row-phone-separator")).toBeNull();
    const separator = styleOf(screen.getByTestId("s-row-email-separator"));
    expect(separator).toMatchObject({
      height: StyleSheet.hairlineWidth,
      marginLeft: 16,
      backgroundColor: { semantic: ["separator"] },
    });
  });

  it("hides separators from screen readers", () => {
    render(<SettingsPage testID="s" sections={sections} />);
    expect(screen.getByTestId("s-row-name-separator").getAttribute("aria-label")).toBeNull();
    expect(screen.getByTestId("s-row-name-separator").textContent).toBe("");
  });

  it("puts the footnote under the group in secondaryLabel, inset like the header", () => {
    render(<SettingsPage testID="s" sections={sections} />);
    const footnote = screen.getByText("Only you see this.");
    expect(styleOf(footnote)).toMatchObject({ color: { semantic: ["secondaryLabel"] }, fontSize: 13 });
    expect(footnote.className).toContain("mx-4");
  });
});

describe("SettingsPage on Android (Material)", () => {
  it("renders the header as a tint-colored subheader, not uppercase, with no band", () => {
    Platform.OS = "android";
    render(<SettingsPage testID="s" sections={sections} />);
    const header = screen.getByTestId("s-section-account-header");
    expect(header.getAttribute("role")).toBe("header");
    const style = styleOf(header);
    expect(typeof style.color).toBe("string");
    expect(style.textTransform).toBeUndefined();
    expect(header.className).not.toMatch(/\bbg-|\bborder/);
    const group = screen.getByTestId("s-row-name").parentElement!;
    expect(group.className).not.toContain("rounded-xl");
  });
});
