import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  NavBarSaveButton,
  NavBarSearchBar,
  NavBarTitle,
} from "../nav-bar";

describe("NavBarSaveButton", () => {
  it("calls onPress when pressed and not disabled", () => {
    const onPress = vi.fn();
    render(<NavBarSaveButton onPress={onPress} testID="save" />);
    fireEvent.click(screen.getByTestId("save"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("does not call onPress when disabled", () => {
    const onPress = vi.fn();
    render(<NavBarSaveButton onPress={onPress} disabled testID="save" />);
    fireEvent.click(screen.getByTestId("save"));
    expect(onPress).not.toHaveBeenCalled();
  });

  it("renders busy indicator when loading", () => {
    render(<NavBarSaveButton onPress={() => {}} loading testID="save" />);
    expect(screen.getByTestId("save").textContent).toBe("…");
  });
});

describe("NavBarTitle", () => {
  it("renders title and optional subtitle", () => {
    render(
      <NavBarTitle testID="title" title="Inbox" subtitle="3 unread" />,
    );
    expect(screen.getByTestId("title-title").textContent).toBe("Inbox");
    expect(screen.getByTestId("title-subtitle").textContent).toBe("3 unread");
  });

  it("becomes pressable when onPress passed", () => {
    const onPress = vi.fn();
    render(<NavBarTitle testID="title" title="Tap me" onPress={onPress} />);
    fireEvent.click(screen.getByTestId("title"));
    expect(onPress).toHaveBeenCalled();
  });
});

describe("NavBarSearchBar", () => {
  it("calls onChangeText when user types", () => {
    const onChangeText = vi.fn();
    render(
      <NavBarSearchBar
        testID="search"
        value=""
        onChangeText={onChangeText}
      />,
    );
    fireEvent.change(screen.getByTestId("search-input"), {
      target: { value: "abc" },
    });
    expect(onChangeText).toHaveBeenCalledWith("abc");
  });

  it("shows clear button when value present and clears on press", () => {
    const onChangeText = vi.fn();
    render(
      <NavBarSearchBar
        testID="search"
        value="hello"
        onChangeText={onChangeText}
      />,
    );
    fireEvent.click(screen.getByTestId("search-clear"));
    expect(onChangeText).toHaveBeenCalledWith("");
  });

  it("hides clear button when value empty", () => {
    render(
      <NavBarSearchBar
        testID="search"
        value=""
        onChangeText={() => {}}
      />,
    );
    expect(screen.queryByTestId("search-clear")).toBeNull();
  });
});
