import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AccessibilityInfo, Text } from "react-native";
import { NativeButton } from "../button";
import { NativeButtonGroup } from "../button-group";
import { NativeCalendar } from "../calendar";
import { NativeCarousel } from "../carousel";
import { NativeInputGroup, NativePasswordToggleField } from "../input-group";
import { NativeInputOTP } from "../input-otp";
import { NativeSortableList } from "../sortable-list";

const a11y = (el: HTMLElement, name: string) => act(() => void el.dispatchEvent(new CustomEvent("accessibilityaction", { detail: name })));

describe("NativeButtonGroup", () => {
  it("joins its buttons: inner corners squared, one toolbar", () => {
    render(
      <NativeButtonGroup accessibilityLabel="Pages">
        <NativeButton testID="a">Previous</NativeButton>
        <NativeButton testID="b">Today</NativeButton>
        <NativeButton testID="c">Next</NativeButton>
      </NativeButtonGroup>,
    );
    expect(screen.getByRole("toolbar").getAttribute("aria-label")).toBe("Pages");
    expect(screen.getByTestId("a").className).toContain("rounded-r-none");
    expect(screen.getByTestId("b").className).toContain("rounded-none");
    expect(screen.getByTestId("c").className).toContain("rounded-l-none");
  });
});

describe("NativeInputGroup and NativePasswordToggleField", () => {
  it("draws a prefix and suffix inside the field", () => {
    render(<NativeInputGroup testID="price" prefix="$" suffix="USD" value="" onChangeText={() => {}} />);
    expect(screen.getByText("$")).toBeTruthy();
    expect(screen.getByText("USD")).toBeTruthy();
  });

  it("shows and hides the password, keeping what was typed", () => {
    render(<NativePasswordToggleField testID="pw" value="hunter2" onChangeText={() => {}} />);
    const toggle = screen.getByTestId("pw-toggle");
    expect(toggle.getAttribute("aria-label")).toBe("Show password");
    expect((screen.getByTestId("pw") as HTMLInputElement).type).toBe("password");
    fireEvent.click(toggle);
    expect(screen.getByTestId("pw-toggle").getAttribute("aria-label")).toBe("Hide password");
    expect((screen.getByTestId("pw") as HTMLInputElement).value).toBe("hunter2");
  });
});

describe("NativeInputOTP", () => {
  function Otp({ onComplete }: { onComplete: (v: string) => void }) {
    const [v, setV] = useState("");
    return <NativeInputOTP maxLength={4} value={v} onChange={setV} onComplete={onComplete} />;
  }
  it("keeps digits only, fills the boxes and completes once", () => {
    const done = vi.fn();
    render(<Otp onComplete={done} />);
    fireEvent.change(screen.getByTestId("native-input-otp-input"), { target: { value: "1a2 34" } });
    expect(screen.getByTestId("native-input-otp-slot-3").textContent).toBe("4");
    expect(done).toHaveBeenCalledWith("1234");
    expect(screen.getByTestId("native-input-otp-input").getAttribute("aria-label")).toBe("One-time code");
  });
});

describe("NativeCalendar", () => {
  it("picks a day, and moves between months", () => {
    const onSelect = vi.fn();
    render(<NativeCalendar defaultMonth={new Date(2026, 5, 1)} onSelect={onSelect} locale="en-US" today={new Date(2026, 5, 10)} />);
    expect(screen.getByTestId("native-calendar-title").textContent).toBe("June 2026");
    const day = screen.getByTestId("native-calendar-day-2026-06-03");
    expect(day.getAttribute("aria-label")).toBe("Wednesday, June 3, 2026");
    fireEvent.click(day);
    expect(onSelect.mock.calls[0]![0]).toEqual(new Date(2026, 5, 3));
    fireEvent.click(screen.getByTestId("native-calendar-next"));
    expect(screen.getByTestId("native-calendar-title").textContent).toBe("July 2026");
  });

  it("picks a range in two presses", () => {
    function Range() {
      const [r, setR] = useState<{ from: Date | undefined; to?: Date | undefined } | undefined>();
      return <NativeCalendar mode="range" selected={r} onSelect={setR} defaultMonth={new Date(2026, 0, 1)} />;
    }
    render(<Range />);
    fireEvent.click(screen.getByTestId("native-calendar-day-2026-01-10"));
    fireEvent.click(screen.getByTestId("native-calendar-day-2026-01-05"));
    expect(screen.getByTestId("native-calendar-day-2026-01-07").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("native-calendar-day-2026-01-11").getAttribute("aria-selected")).toBe("false");
  });

  it("won't pick a disabled day", () => {
    const onSelect = vi.fn();
    render(<NativeCalendar defaultMonth={new Date(2026, 0, 1)} onSelect={onSelect} disabled={(d) => d.getDate() === 4} />);
    const day = screen.getByTestId("native-calendar-day-2026-01-04");
    expect(day.getAttribute("aria-disabled")).toBe("true");
  });
});

describe("NativeCarousel", () => {
  it("says which slide it shows, and moves with the dots and a screen reader's swipe", () => {
    const onIndexChange = vi.fn();
    render(
      <NativeCarousel accessibilityLabel="Featured" onIndexChange={onIndexChange} showControls>
        <Text>One</Text>
        <Text>Two</Text>
        <Text>Three</Text>
      </NativeCarousel>,
    );
    const root = screen.getByTestId("native-carousel");
    expect(root.getAttribute("aria-valuetext")).toBe("Slide 1 of 3");
    fireEvent.click(screen.getByTestId("native-carousel-dot-2"));
    expect(onIndexChange).toHaveBeenLastCalledWith(2);
    expect(screen.getByTestId("native-carousel-next").getAttribute("aria-disabled")).toBe("true");
    a11y(root, "decrement");
    expect(onIndexChange).toHaveBeenLastCalledWith(1);
  });
});

describe("NativeSortableList", () => {
  function List({ onReorder }: { onReorder: (from: number, to: number) => void | Promise<void> }) {
    const [items, setItems] = useState(["Week 1", "Week 2", "Week 3"]);
    return (
      <NativeSortableList
        label="Weeks"
        items={items}
        getKey={(i) => i}
        getItemLabel={(i) => i}
        onReorder={(from, to) => {
          const next = items.slice();
          const [x] = next.splice(from, 1);
          next.splice(to, 0, x!);
          setItems(next);
          return onReorder(from, to);
        }}
        renderItem={(item, ctx) => (
          <Text testID={`row-${ctx.index}`}>
            {item}
          </Text>
        )}
      />
    );
  }

  it("moves an item with a screen reader's action and announces it", async () => {
    const announce = vi.spyOn(AccessibilityInfo, "announceForAccessibility");
    const onReorder = vi.fn();
    render(<List onReorder={onReorder} />);
    const first = screen.getByTestId("native-sortable-list-item-Week 1");
    expect(first.getAttribute("data-a11y-actions")).toBe("moveDown,moveToBottom,longpress");
    a11y(first, "moveToBottom");
    expect(onReorder).toHaveBeenCalledWith(0, 2);
    expect(screen.getByTestId("row-2").textContent).toBe("Week 1");
    await act(async () => {});
    expect(announce).toHaveBeenCalledWith("Week 1 moved to position 3 of 3.");
  });

  it("puts the order back when the move fails", async () => {
    const announce = vi.spyOn(AccessibilityInfo, "announceForAccessibility");
    function Failing() {
      return (
        <NativeSortableList
          label="Weeks"
          items={["A", "B"]}
          getKey={(i) => i}
          getItemLabel={(i) => i}
          onReorder={() => Promise.reject(new Error("no"))}
          renderItem={(item, ctx) => <Text testID={`row-${ctx.index}`}>{item}</Text>}
        />
      );
    }
    render(<Failing />);
    a11y(screen.getByTestId("native-sortable-list-item-A"), "moveDown");
    expect(screen.getByTestId("row-0").textContent).toBe("B");
    await act(async () => {});
    expect(screen.getByTestId("row-0").textContent).toBe("A");
    expect(announce).toHaveBeenCalledWith("Couldn’t move A.");
  });
});
