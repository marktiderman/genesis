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

function styleOf(el: Element): Record<string, unknown> {
  return StyleSheet.flatten(JSON.parse((el as HTMLElement).dataset.style ?? "null"));
}

const os = Platform.OS;
const version = Platform.Version;
afterEach(() => {
  Platform.OS = os;
  Platform.Version = version;
});

describe("SettingsPage on iOS (inset grouped)", () => {
  it("renders the header as an uppercase footnote in secondaryLabel, read as written, with no band or rule", () => {
    render(<SettingsPage testID="s" sections={sections} />);
    const header = screen.getByTestId("s-section-account-header");
    expect(header.getAttribute("role")).toBe("header");
    expect(header.getAttribute("aria-label")).toBe("Account");
    expect(header.textContent).toBe("Account");
    const style = styleOf(header);
    expect(style).toMatchObject({
      color: { semantic: ["secondaryLabel"] },
      fontSize: 13,
      textTransform: "uppercase",
      marginHorizontal: 16,
    });
    expect(style.backgroundColor).toBeUndefined();
    expect(style.borderBottomWidth).toBeUndefined();
    expect(header.className).not.toMatch(/\bbg-|\bborder/);
  });

  it("aligns the header with the cell text: the group's margin, then the cell's padding", () => {
    render(<SettingsPage testID="s" sections={sections} />);
    const header = screen.getByTestId("s-section-account-header");
    const group = screen.getByTestId("s-section-account-group");
    expect(styleOf(header).marginHorizontal).toBe(styleOf(group).marginHorizontal);
    expect(header.className).toContain("px-4");
    expect(screen.getByTestId("s-row-email").className).toContain("px-4");
  });

  it("puts rows in a rounded group on secondarySystemGroupedBackground", () => {
    Platform.Version = "18.4";
    const { unmount } = render(<SettingsPage testID="s" sections={sections} />);
    const group = screen.getByTestId("s-section-account-group");
    expect(group.className).toContain("overflow-hidden");
    expect(styleOf(group)).toMatchObject({
      backgroundColor: { semantic: ["secondarySystemGroupedBackground"] },
      borderRadius: 10,
    });
    unmount();
    Platform.Version = "26.0";
    render(<SettingsPage testID="s" sections={sections} />);
    expect(styleOf(screen.getByTestId("s-section-account-group")).borderRadius).toBe(26);
  });

  it("draws hairline separators between cells only, inset to the cell text and hidden from screen readers", () => {
    render(<SettingsPage testID="s" sections={sections} />);
    expect(screen.queryByTestId("s-row-phone-separator")).toBeNull();
    const separator = screen.getByTestId("s-row-email-separator");
    expect(separator.getAttribute("aria-hidden")).toBe("true");
    expect(styleOf(separator).height).toBe(StyleSheet.hairlineWidth);
    // The leading spacer is the cell's `px-4`, so the line starts where the text does.
    const [inset, line] = Array.from(separator.children);
    expect(inset!.className).toBe("w-4");
    expect(styleOf(screen.getByTestId("s-row-email-separator-line")).backgroundColor).toEqual({
      semantic: ["separator"],
    });
    expect(line).toBe(screen.getByTestId("s-row-email-separator-line"));
  });

  it("insets a separator past a leading icon by the icon and the cell's gap", () => {
    render(<SettingsPage testID="s" sections={sections} />);
    const children = Array.from(screen.getByTestId("s-row-name-separator").children);
    expect(children.map((c) => c.className)).toEqual(expect.arrayContaining(["w-4", "mr-3"]));
    expect(children[1]!.className).toBe("mr-3");
    expect(styleOf(children[1]!)).toHaveProperty("width");
  });

  it("stops separators short of the trailing edge from iOS 26", () => {
    Platform.Version = "18.4";
    const { unmount } = render(<SettingsPage testID="s" sections={sections} />);
    expect(screen.getByTestId("s-row-email-separator").children).toHaveLength(2);
    unmount();
    Platform.Version = "26.0";
    render(<SettingsPage testID="s" sections={sections} />);
    expect(screen.getByTestId("s-row-email-separator").children).toHaveLength(3);
  });

  it("puts the footnote under the group in secondaryLabel, aligned like the header", () => {
    render(<SettingsPage testID="s" sections={sections} />);
    const footnote = screen.getByText("Only you see this.");
    expect(styleOf(footnote)).toMatchObject({
      color: { semantic: ["secondaryLabel"] },
      fontSize: 13,
      marginHorizontal: 16,
    });
    expect(footnote.className).toContain("px-4");
    const group = screen.getByTestId("s-section-account-group");
    expect(group.compareDocumentPosition(footnote) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("SettingsPage on Android (Material)", () => {
  it("renders the header as a primary-colored subheader, not uppercase, with no band", () => {
    Platform.OS = "android";
    render(<SettingsPage testID="s" sections={sections} />);
    const header = screen.getByTestId("s-section-account-header");
    expect(header.getAttribute("role")).toBe("header");
    expect(header.className).toContain("text-primary");
    expect(header.className).not.toMatch(/\bbg-|\bborder/);
    const style = styleOf(header);
    expect(style.textTransform).toBeUndefined();
    expect(style.backgroundColor).toBeUndefined();
  });

  it("keeps full-width cells and colors the footnote from the theme roles", () => {
    Platform.OS = "android";
    render(<SettingsPage testID="s" sections={sections} />);
    const group = screen.getByTestId("s-section-account-group");
    expect(styleOf(group).borderRadius).toBeUndefined();
    expect(group.className).toContain("border-y");
    expect(typeof styleOf(screen.getByText("Only you see this.")).color).toBe("string");
  });
});
