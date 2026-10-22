/**
 * SortableList reordering.
 *
 * What this locks in: an item moves by keyboard pick-up (Space, arrows,
 * Space), by Alt+arrow, by drag and drop (above or below the row it lands
 * on), and by the render context's move functions; Escape puts a picked-up
 * item back; every move is announced; a rejected `onReorder` leaves the order
 * alone; and a disabled list renders no handles and ignores moves.
 */
import { act, createEvent, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { SortableList } from "../sortable-list";

interface Step {
  id: string;
  name: string;
}

const steps: Step[] = [
  { id: "a", name: "Week 1" },
  { id: "b", name: "Week 2" },
  { id: "c", name: "Week 3" },
];

function reorder<T>(list: T[], from: number, to: number) {
  const next = list.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

function Harness({
  onReorder,
  reject,
  disabled,
}: {
  onReorder?: (from: number, to: number) => void;
  reject?: boolean;
  disabled?: boolean;
}) {
  const [items, setItems] = useState(steps);
  return (
    <SortableList<Step>
      label="Course steps"
      items={items}
      getKey={(s) => s.id}
      getItemLabel={(s) => s.name}
      disabled={disabled}
      onReorder={(from, to) => {
        onReorder?.(from, to);
        if (reject) return Promise.reject(new Error("no"));
        setItems((current) => reorder(current, from, to));
      }}
      renderItem={(s, { handle, moveUp, moveDown, moveTo }) => (
        <div>
          {handle}
          <span>{s.name}</span>
          <button type="button" onClick={moveUp}>Up {s.name}</button>
          <button type="button" onClick={moveDown}>Down {s.name}</button>
          <button type="button" onClick={() => moveTo(0)}>Top {s.name}</button>
        </div>
      )}
    />
  );
}

const order = () =>
  within(screen.getByRole("list", { name: "Course steps" }))
    .getAllByRole("listitem")
    .map((li) => li.getAttribute("data-sortable-key"));

const live = () => document.querySelector('[aria-live="polite"]')!.textContent;

function dataTransfer() {
  const data = new Map<string, string>();
  return {
    setData: (type: string, value: string) => data.set(type, value),
    getData: (type: string) => data.get(type) ?? "",
    effectAllowed: "",
    dropEffect: "",
  };
}

// jsdom has no DragEvent, so `clientY` in fireEvent's init is dropped; set it
// on the event itself.
function dragOverAt(el: HTMLElement, transfer: ReturnType<typeof dataTransfer>, clientY: number) {
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue({ top: 100, height: 40 } as DOMRect);
  const event = createEvent.dragOver(el, { dataTransfer: transfer });
  Object.defineProperty(event, "clientY", { value: clientY });
  fireEvent(el, event);
}

describe("SortableList", () => {
  it("picks up, moves and drops an item from the keyboard, announcing each step", () => {
    render(<Harness />);
    const handle = screen.getByRole("button", { name: "Reorder Week 1" });
    handle.focus();

    fireEvent.keyDown(handle, { key: " " });
    expect(handle.getAttribute("aria-pressed")).toBe("true");
    expect(live()).toContain("Week 1 picked up, position 1 of 3");

    fireEvent.keyDown(handle, { key: "ArrowDown" });
    expect(order()).toEqual(["b", "a", "c"]);
    expect(live()).toBe("Week 1 moved to position 2 of 3.");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Reorder Week 1" }));

    fireEvent.keyDown(handle, { key: "End" });
    expect(order()).toEqual(["b", "c", "a"]);

    fireEvent.keyDown(handle, { key: "Enter" });
    expect(handle.getAttribute("aria-pressed")).toBe("false");
    expect(live()).toBe("Week 1 dropped at position 3 of 3.");
  });

  it("puts a picked-up item back on Escape", () => {
    render(<Harness />);
    const handle = screen.getByRole("button", { name: "Reorder Week 2" });
    fireEvent.keyDown(handle, { key: " " });
    fireEvent.keyDown(handle, { key: "ArrowUp" });
    expect(order()).toEqual(["b", "a", "c"]);
    fireEvent.keyDown(handle, { key: "Escape" });
    expect(order()).toEqual(["a", "b", "c"]);
    expect(live()).toBe("Move cancelled. Week 2 is back at position 2 of 3.");
  });

  it("moves one step with Alt+arrow, and arrows alone do nothing until picked up", () => {
    const onReorder = vi.fn();
    render(<Harness onReorder={onReorder} />);
    const handle = screen.getByRole("button", { name: "Reorder Week 3" });
    fireEvent.keyDown(handle, { key: "ArrowUp" });
    expect(onReorder).not.toHaveBeenCalled();
    fireEvent.keyDown(handle, { key: "ArrowUp", altKey: true });
    expect(onReorder).toHaveBeenCalledWith(2, 1);
    expect(order()).toEqual(["a", "c", "b"]);
  });

  it("does nothing past either end", () => {
    const onReorder = vi.fn();
    render(<Harness onReorder={onReorder} />);
    fireEvent.keyDown(screen.getByRole("button", { name: "Reorder Week 1" }), { key: "ArrowUp", altKey: true });
    fireEvent.keyDown(screen.getByRole("button", { name: "Reorder Week 3" }), { key: "ArrowDown", altKey: true });
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("moves by drag and drop from the handle, above or below the row it lands on", () => {
    const onReorder = vi.fn();
    render(<Harness onReorder={onReorder} />);
    const rows = () => within(screen.getByRole("list", { name: "Course steps" })).getAllByRole("listitem");

    // Drag Week 1 into the lower half of Week 3: it lands after it.
    fireEvent.pointerDown(screen.getByRole("button", { name: "Reorder Week 1" }));
    let transfer = dataTransfer();
    fireEvent.dragStart(rows()[0]!, { dataTransfer: transfer });
    dragOverAt(rows()[2]!, transfer, 130);
    fireEvent.drop(rows()[2]!, { dataTransfer: transfer });
    expect(onReorder).toHaveBeenLastCalledWith(0, 2);
    expect(order()).toEqual(["b", "c", "a"]);
    expect(live()).toBe("Week 1 dropped at position 3 of 3.");

    // Drag Week 1 (now last) into the upper half of Week 2 (first): it lands before it.
    fireEvent.pointerDown(screen.getByRole("button", { name: "Reorder Week 1" }));
    transfer = dataTransfer();
    fireEvent.dragStart(rows()[2]!, { dataTransfer: transfer });
    dragOverAt(rows()[0]!, transfer, 105);
    fireEvent.drop(rows()[0]!, { dataTransfer: transfer });
    expect(onReorder).toHaveBeenLastCalledWith(2, 0);
    expect(order()).toEqual(["a", "b", "c"]);

    // A drop right next to where it already is changes nothing.
    fireEvent.pointerDown(screen.getByRole("button", { name: "Reorder Week 2" }));
    transfer = dataTransfer();
    fireEvent.dragStart(rows()[1]!, { dataTransfer: transfer });
    dragOverAt(rows()[2]!, transfer, 105);
    fireEvent.drop(rows()[2]!, { dataTransfer: transfer });
    expect(onReorder).toHaveBeenCalledTimes(2);
  });

  it("only drags from the handle", () => {
    render(<Harness />);
    const first = within(screen.getByRole("list", { name: "Course steps" })).getAllByRole("listitem")[0]!;
    expect(first.getAttribute("draggable")).toBeNull();
    fireEvent.pointerDown(screen.getByRole("button", { name: "Reorder Week 1" }));
    expect(first.getAttribute("draggable")).toBe("true");
  });

  it("moves from the render context's functions, for a row menu", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Down Week 1" }));
    expect(order()).toEqual(["b", "a", "c"]);
    fireEvent.click(screen.getByRole("button", { name: "Top Week 3" }));
    expect(order()).toEqual(["c", "b", "a"]);
    fireEvent.click(screen.getByRole("button", { name: "Up Week 3" }));
    expect(order()).toEqual(["c", "b", "a"]);
  });

  it("leaves the order alone when onReorder rejects", async () => {
    render(<Harness reject />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Down Week 1" }));
    });
    expect(order()).toEqual(["a", "b", "c"]);
  });

  it("renders no handles and ignores moves when disabled", () => {
    const onReorder = vi.fn();
    render(<Harness onReorder={onReorder} disabled />);
    expect(screen.queryByRole("button", { name: /Reorder/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Down Week 1" }));
    expect(onReorder).not.toHaveBeenCalled();
  });
});
