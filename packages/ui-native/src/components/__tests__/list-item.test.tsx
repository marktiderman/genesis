import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NativeListItem } from "../list-item";

describe("NativeListItem", () => {
  it("cuts the subtitle at two lines by default, and wraps a selectable value whole", () => {
    render(<NativeListItem testID="short" title="Name" subtitle="Ada" />);
    expect(screen.getByText("Ada").getAttribute("data-number-of-lines")).toBe("2");
    expect(screen.getByText("Ada").getAttribute("data-selectable")).toBeNull();
    render(<NativeListItem testID="value" title="User id" subtitle="0000-long-id" subtitleLines={null} subtitleSelectable />);
    expect(screen.getByText("0000-long-id").getAttribute("data-number-of-lines")).toBeNull();
    expect(screen.getByText("0000-long-id").getAttribute("data-selectable")).toBe("true");
  });

  it("renders title + subtitle", () => {
    render(<NativeListItem testID="row" title="Title" subtitle="Sub" />);
    const node = screen.getByTestId("row");
    expect(node.textContent).toContain("Title");
    expect(node.textContent).toContain("Sub");
  });

  it("renders as a button when onPress is provided", () => {
    const onPress = vi.fn();
    render(<NativeListItem testID="row" title="Tap me" onPress={onPress} />);
    fireEvent.click(screen.getByTestId("row"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("disables interaction when disabled", () => {
    const onPress = vi.fn();
    render(
      <NativeListItem testID="row" title="X" onPress={onPress} disabled />
    );
    expect(screen.getByTestId("row").getAttribute("aria-disabled")).toBe("true");
    // The accessibility attribute alone isn't enough — verify the handler is
    // genuinely suppressed when disabled.
    fireEvent.click(screen.getByTestId("row"));
    expect(onPress).not.toHaveBeenCalled();
  });
});
