import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AccessibilityInfo, PanResponder, Text } from "react-native";
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

  it("keeps the cursor where it was across a toggle, and is a plain button to a screen reader", () => {
    render(<NativePasswordToggleField testID="pw" value="hunter2" onChangeText={() => {}} />);
    const input = screen.getByTestId("pw") as HTMLInputElement;
    input.setSelectionRange(3, 3);
    fireEvent.select(input);
    fireEvent.click(screen.getByTestId("pw-toggle"));
    // Asked for again with the new secureTextEntry, so Android doesn't send it to the start.
    expect(JSON.parse(screen.getByTestId("pw").dataset.selection!)).toEqual({ start: 3, end: 3 });
    expect(screen.getByTestId("pw-toggle").getAttribute("aria-checked")).toBeNull();
    // Typing hands the cursor back to the field.
    fireEvent.change(screen.getByTestId("pw"), { target: { value: "hunter23" } });
    expect(screen.getByTestId("pw").dataset.selection).toBeUndefined();
  });
});

describe("NativeInputOTP", () => {
  function Otp({ onComplete }: { onComplete: (v: string) => void }) {
    const [v, setV] = useState("");
    return <NativeInputOTP maxLength={4} value={v} onChange={setV} onComplete={onComplete} />;
  }
  it("fills the boxes and completes once", () => {
    const done = vi.fn();
    render(<Otp onComplete={done} />);
    fireEvent.change(screen.getByTestId("native-input-otp-input"), { target: { value: "12 34" } });
    expect(screen.getByTestId("native-input-otp-slot-3").textContent).toBe("4");
    expect(done).toHaveBeenCalledWith("1234");
    expect(screen.getByTestId("native-input-otp-input").getAttribute("aria-label")).toBe("One-time code");
  });
  it("tests the pattern against the whole code, as the web's input-otp does: a refused change keeps the code", () => {
    const onChange = vi.fn();
    const { rerender } = render(<NativeInputOTP maxLength={4} value="12" onChange={onChange} />);
    fireEvent.change(screen.getByTestId("native-input-otp-input"), { target: { value: "12a" } });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId("native-input-otp-slot-1").textContent).toBe("2");
    rerender(<NativeInputOTP maxLength={4} value="" onChange={onChange} pattern="^[A-Z0-9]+$" />);
    fireEvent.change(screen.getByTestId("native-input-otp-input"), { target: { value: "AB1" } });
    expect(onChange).toHaveBeenLastCalledWith("AB1");
  });
  it.each(["123-456", "123 456", " 12 34 56 "])("keeps a pasted or autofilled %j whole: no native cap cuts it first", (pasted) => {
    const done = vi.fn();
    function Six() {
      const [v, setV] = useState("");
      return <NativeInputOTP value={v} onChange={setV} onComplete={done} />;
    }
    render(<Six />);
    const input = screen.getByTestId("native-input-otp-input");
    // The native maxLength filter runs before onChangeText; with one, "123-456" arrived as "123-45".
    expect(input.getAttribute("maxlength")).toBeNull();
    fireEvent.change(input, { target: { value: pasted } });
    expect(done).toHaveBeenCalledWith("123456");
  });
  it("is one labelled field VoiceOver can reach: not at 0 opacity, its text transparent", () => {
    render(<NativeInputOTP value="12" onChange={() => {}} />);
    const input = screen.getByTestId("native-input-otp-input");
    expect((JSON.parse(input.dataset.style!) as { opacity: number }).opacity).toBeGreaterThan(0.01);
    expect(input.className).not.toContain("opacity-0");
    expect(input.className).toContain("text-transparent");
    expect(input.dataset.caretHidden).toBe("true");
    expect(input.getAttribute("aria-label")).toBe("One-time code");
    // The boxes are drawing only: hidden, so the field is the one element.
    expect(screen.getByTestId("native-input-otp-slot-0").closest("[aria-hidden='true']")).toBeTruthy();
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
    const dots = screen.getByTestId("native-carousel-dots");
    expect(dots.getAttribute("role")).toBe("adjustable");
    expect(dots.getAttribute("aria-label")).toBe("Featured");
    expect(dots.getAttribute("aria-valuetext")).toBe("Slide 1 of 3");
    fireEvent.click(screen.getByTestId("native-carousel-dot-2"));
    expect(onIndexChange).toHaveBeenLastCalledWith(2);
    expect(screen.getByTestId("native-carousel-next").getAttribute("aria-disabled")).toBe("true");
    a11y(dots, "decrement");
    expect(onIndexChange).toHaveBeenLastCalledWith(1);
  });

  it("leaves the slide's own buttons and the arrows reachable: the carousel isn't one element", () => {
    render(
      <NativeCarousel accessibilityLabel="Featured" showControls>
        <NativeButton testID="book">Book</NativeButton>
        <Text>Two</Text>
      </NativeCarousel>,
    );
    const root = screen.getByTestId("native-carousel");
    // No role on the container, so iOS doesn't fold the subtree into a single element.
    expect(root.getAttribute("role")).toBeNull();
    expect(root.getAttribute("aria-valuetext")).toBeNull();
    expect(screen.getByTestId("book").closest("[aria-hidden='true']")).toBeNull();
    expect(screen.getByTestId("native-carousel-next").getAttribute("role")).toBe("button");
    // The slide off screen is hidden while dots and arrows move the pages.
    expect(screen.getByTestId("native-carousel-slide-1").getAttribute("aria-hidden")).toBe("true");
  });

  it("with no dots or arrows, keeps every slide reachable for the screen reader", () => {
    render(
      <NativeCarousel showDots={false}>
        <Text>One</Text>
        <Text>Two</Text>
      </NativeCarousel>,
    );
    expect(screen.getByTestId("native-carousel-slide-1").getAttribute("aria-hidden")).toBeNull();
  });

  it("slides to a dot's page without the effect cutting the animation short", () => {
    render(
      <NativeCarousel>
        <Text>One</Text>
        <Text>Two</Text>
        <Text>Three</Text>
      </NativeCarousel>,
    );
    const pages = screen.getByTestId("native-carousel-pages") as HTMLElement & { scrollTo: unknown };
    const scrollTo = vi.fn();
    pages.scrollTo = scrollTo;
    act(() => void screen.getByTestId("native-carousel").dispatchEvent(new CustomEvent("layout", { detail: { width: 300, height: 100 } })));
    expect(scrollTo).toHaveBeenLastCalledWith({ x: 0, animated: false });
    scrollTo.mockClear();
    fireEvent.click(screen.getByTestId("native-carousel-dot-2"));
    expect(scrollTo.mock.calls).toEqual([[{ x: 600, animated: true }]]);
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
  type PanConfig = {
    onPanResponderGrant: () => void;
    onPanResponderMove: (e: unknown, g: { dy: number }) => void;
    onPanResponderRelease: (e: unknown, g: { dy: number }) => void;
    onPanResponderTerminationRequest: () => boolean;
    onShouldBlockNativeResponder: () => boolean;
  };
  /** The responders built for the list's current order, one per row in order (the mock draws no gesture). */
  function capturePans() {
    const made: PanConfig[] = [];
    const create = vi.spyOn(PanResponder, "create").mockImplementation((config: unknown) => {
      made.push(config as PanConfig);
      return { panHandlers: {} } as never;
    });
    return { rows: (n: number) => made.slice(-n), restore: () => create.mockRestore() };
  }

  it("drags a row by its handle, keeps the gesture from a parent ScrollView, and tells the screen", async () => {
    const pans = capturePans();
    const onReorder = vi.fn();
    const onDragChange = vi.fn();
    function Dragged() {
      const [items, setItems] = useState(["A", "B", "C"]);
      return (
        <NativeSortableList
          label="Weeks"
          items={items}
          getKey={(i) => i}
          getItemLabel={(i) => i}
          onDragChange={onDragChange}
          onReorder={(from, to) => {
            const next = items.slice();
            const [x] = next.splice(from, 1);
            next.splice(to, 0, x!);
            setItems(next);
            onReorder(from, to);
          }}
          renderItem={(item, ctx) => (
            <Text testID={`row-${ctx.index}`}>
              {item}
              {ctx.handle}
            </Text>
          )}
        />
      );
    }
    render(<Dragged />);
    const [a] = pans.rows(3);
    // A parent ScrollView asking for the gesture mid-drag is refused; Android's native scroll is blocked.
    expect(a!.onPanResponderTerminationRequest()).toBe(false);
    expect(a!.onShouldBlockNativeResponder()).toBe(true);
    act(() => a!.onPanResponderGrant());
    expect(onDragChange).toHaveBeenLastCalledWith(true);
    // Two rows down (the default row height is 56).
    act(() => a!.onPanResponderMove(null, { dy: 112 }));
    expect(screen.getByTestId("row-2").textContent).toBe("A⋮⋮");
    act(() => a!.onPanResponderRelease(null, { dy: 112 }));
    expect(onDragChange).toHaveBeenLastCalledWith(false);
    expect(onReorder).toHaveBeenCalledWith(0, 2);
    await act(async () => {});
    expect(screen.getByTestId("row-2").textContent).toBe("A⋮⋮");
    pans.restore();
  });

  it("calls the latest onReorder on a drop, not the one from when the order last changed", () => {
    const pans = capturePans();
    const calls: number[] = [];
    function Counting() {
      const [version, setVersion] = useState(1);
      return (
        <>
          <Text testID="bump" onPress={() => setVersion((v) => v + 1)}>
            bump
          </Text>
          <NativeSortableList
            label="Weeks"
            items={["A", "B"]}
            getKey={(i) => i}
            getItemLabel={(i) => i}
            onReorder={() => {
              calls.push(version);
            }}
            renderItem={(item) => <Text>{item}</Text>}
          />
        </>
      );
    }
    render(<Counting />);
    const [a] = pans.rows(2);
    fireEvent.click(screen.getByTestId("bump"));
    act(() => a!.onPanResponderGrant());
    act(() => a!.onPanResponderRelease(null, { dy: 56 }));
    expect(calls).toEqual([2]);
    pans.restore();
  });
});
