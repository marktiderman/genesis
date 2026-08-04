import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NativeCombobox, type NativeComboboxOption } from "../combobox";

const options: NativeComboboxOption[] = [
  { value: "a", label: "Apple" },
  { value: "b", label: "Banana" },
  { value: "c", label: "Cherry" },
];

function Wrapper() {
  const [v, setV] = useState<string | undefined>();
  return (
    <NativeCombobox
      testID="cb"
      options={options}
      value={v}
      onChange={setV}
    />
  );
}

describe("NativeCombobox", () => {
  it("shows options on focus and filters by query", () => {
    render(<Wrapper />);
    const input = screen.getByTestId("cb-input") as HTMLInputElement;
    fireEvent.focus(input);
    expect(screen.getByTestId("cb-option-a")).toBeTruthy();
    expect(screen.getByTestId("cb-option-b")).toBeTruthy();
    fireEvent.change(input, { target: { value: "ba" } });
    expect(screen.queryByTestId("cb-option-a")).toBeNull();
    expect(screen.getByTestId("cb-option-b")).toBeTruthy();
  });

  it("selects an option on press", () => {
    render(<Wrapper />);
    fireEvent.focus(screen.getByTestId("cb-input"));
    fireEvent.click(screen.getByTestId("cb-option-c"));
    expect((screen.getByTestId("cb-input") as HTMLInputElement).value).toBe(
      "Cherry"
    );
  });

  it("closes the dropdown on input blur without selecting", () => {
    // CR finding (PR #30 / fixed PR #34): the dropdown had no way to
    // dismiss without picking an option. Blur now closes the popup
    // (with a 120ms delay so an option-press can still register).
    // Use fake timers + act() so the React state update inside the
    // timer callback flushes synchronously.
    vi.useFakeTimers();
    try {
      render(<Wrapper />);
      const input = screen.getByTestId("cb-input");
      fireEvent.focus(input);
      expect(screen.getByTestId("cb-option-a")).toBeTruthy();
      fireEvent.blur(input);
      act(() => {
        vi.advanceTimersByTime(150);
      });
      expect(screen.queryByTestId("cb-option-a")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders the option list inside a ScrollView (keyboardShouldPersistTaps)", () => {
    // The list must be scrollable when content exceeds the dropdown
    // height. The rn-mock aliases ScrollView -> View, but the
    // keyboardShouldPersistTaps prop survives onto the DOM as a custom
    // attribute (lowercased). We assert it's present, which proves the
    // wrap exists at the source level.
    const many: NativeComboboxOption[] = Array.from({ length: 30 }, (_, i) => ({
      value: `v${i}`,
      label: `Option ${i}`,
    }));
    render(
      <NativeCombobox testID="cb" options={many} onChange={() => {}} />
    );
    fireEvent.focus(screen.getByTestId("cb-input"));
    // Walk up from the first option to find a node carrying the
    // keyboardShouldPersistTaps attribute (the ScrollView wrapper).
    let node: HTMLElement | null = screen.getByTestId("cb-option-v0");
    let foundScrollWrapper = false;
    while (node) {
      if (
        node.getAttribute("keyboardshouldpersisttaps") === "handled" ||
        node.getAttribute("keyboardShouldPersistTaps") === "handled"
      ) {
        foundScrollWrapper = true;
        break;
      }
      node = node.parentElement;
    }
    expect(foundScrollWrapper).toBe(true);
  });
});
