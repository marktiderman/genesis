/**
 * SortableList reordering.
 *
 * What this locks in:
 * - a keyboard pick-up (Space/Enter arrive as a `detail: 0` click) moves only
 *   on screen and writes once on drop; Escape and tabbing away put it back
 *   with no write, and Escape doesn't also close a surrounding dialog;
 * - Alt+arrow, drag and drop (above or below a row), the built-in "Move" menu
 *   and the render context's functions each write once;
 * - focus follows the moved item only when its handle had focus;
 * - a pending async move shows the new order, blocks other moves, and a
 *   rejection puts the old order back and says so;
 * - a row is draggable only while its handle is pressed;
 * - disabled renders no handles or menus, ends a pick-up and ignores moves.
 */
import { act, createEvent, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { Dialog, DialogContent, DialogTitle } from "../../ui/dialog";
import { SortableList, type SortableListProps } from "../sortable-list";

interface Step {
  id: string;
  name: string;
}

const steps: Step[] = [
  { id: "a", name: "Week 1" },
  { id: "b", name: "Week 2" },
  { id: "c", name: "Week 3" },
];

function reorder<T>(list: readonly T[], from: number, to: number) {
  const next = list.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

type Mode = "sync" | "reject" | "defer";

function Harness({
  mode = "sync",
  onReorder,
  deferred,
  disabled,
  moveMenu,
}: {
  mode?: Mode;
  onReorder?: SortableListProps<Step>["onReorder"];
  deferred?: Array<() => void>;
  disabled?: boolean;
  moveMenu?: boolean;
}) {
  const [items, setItems] = useState(steps);
  return (
    <>
      <SortableList<Step>
        label="Course steps"
        items={items}
        getKey={(s) => s.id}
        getItemLabel={(s) => s.name}
        disabled={disabled}
        moveMenu={moveMenu}
        onReorder={(from, to, move) => {
          onReorder?.(from, to, move);
          if (mode === "reject") return Promise.reject(new Error("no"));
          if (mode === "defer")
            return new Promise<void>((resolve) => {
              deferred!.push(() => {
                setItems((current) => reorder(current, from, to));
                resolve();
              });
            });
          setItems((current) => reorder(current, from, to));
        }}
        renderItem={(s, { handle, moveDown, moveTo }) => (
          <div>
            {handle}
            <span>{s.name}</span>
            <button type="button" onClick={moveDown}>Down {s.name}</button>
            <button type="button" onClick={() => moveTo(0)}>Top {s.name}</button>
            <button type="button" onClick={() => moveTo(Number.NaN)}>Nowhere {s.name}</button>
            <button type="button" onClick={() => moveTo(1.6)}>Second {s.name}</button>
          </div>
        )}
      />
      <button type="button">Elsewhere</button>
    </>
  );
}

const order = () =>
  within(screen.getByRole("list", { name: "Course steps" }))
    .getAllByRole("listitem")
    .map((li) => li.getAttribute("data-sortable-key"));
const live = () => document.querySelector('[aria-live="polite"]')!.textContent;
const handle = (name: string) => screen.getByRole("button", { name: `Reorder ${name}` });
const press = (el: HTMLElement) => fireEvent.click(el, { detail: 0 }); // Space/Enter on a button
const settle = () => act(async () => {});

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

const rows = () => within(screen.getByRole("list", { name: "Course steps" })).getAllByRole("listitem");

describe("SortableList keyboard pick-up", () => {
  it("moves on screen while picked up and writes once on drop", async () => {
    const onReorder = vi.fn();
    render(<Harness onReorder={onReorder} />);
    const h = handle("Week 1");
    h.focus();

    press(h);
    expect(h.getAttribute("data-grabbed")).toBe("true");
    expect(live()).toContain("Week 1 picked up, position 1 of 3");

    fireEvent.keyDown(h, { key: "ArrowDown" });
    expect(order()).toEqual(["b", "a", "c"]);
    expect(live()).toBe("Week 1 moved to position 2 of 3.");
    expect(document.activeElement).toBe(handle("Week 1"));
    fireEvent.keyDown(h, { key: "End" });
    expect(order()).toEqual(["b", "c", "a"]);
    expect(onReorder).not.toHaveBeenCalled();

    press(h);
    await settle();
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith(0, 2, { key: "a" });
    expect(order()).toEqual(["b", "c", "a"]);
    expect(live()).toBe("Week 1 dropped at position 3 of 3.");
    expect(document.activeElement).toBe(handle("Week 1"));
  });

  it("puts the item back on Escape with no write", () => {
    const onReorder = vi.fn();
    render(<Harness onReorder={onReorder} />);
    const h = handle("Week 2");
    h.focus();
    press(h);
    for (let i = 0; i < 5; i++) fireEvent.keyDown(h, { key: i % 2 ? "ArrowDown" : "ArrowUp" });
    fireEvent.keyDown(h, { key: "Escape" });
    expect(order()).toEqual(["a", "b", "c"]);
    expect(onReorder).not.toHaveBeenCalled();
    expect(live()).toBe("Move cancelled. Week 2 is back at position 2 of 3.");
  });

  it("puts the item back when focus leaves the handle", () => {
    const onReorder = vi.fn();
    render(<Harness onReorder={onReorder} />);
    const h = handle("Week 1");
    h.focus();
    press(h);
    fireEvent.keyDown(h, { key: "ArrowDown" });
    act(() => screen.getByRole("button", { name: "Elsewhere" }).focus());
    expect(order()).toEqual(["a", "b", "c"]);
    expect(onReorder).not.toHaveBeenCalled();
    expect(live()).toBe("Move cancelled. Week 1 is back at position 1 of 3.");
  });

  it("doesn't close a surrounding dialog on Escape while an item is picked up", () => {
    const onOpenChange = vi.fn();
    render(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogTitle>Edit course</DialogTitle>
          <Harness />
        </DialogContent>
      </Dialog>,
    );
    const h = handle("Week 1");
    h.focus();
    press(h);
    fireEvent.keyDown(h, { key: "Escape" });
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(live()).toContain("Move cancelled");
    // Once nothing is picked up, Escape closes the dialog as usual.
    fireEvent.keyDown(h, { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("ignores a pointer click on the handle", () => {
    render(<Harness />);
    fireEvent.click(handle("Week 1"), { detail: 1 });
    expect(handle("Week 1").getAttribute("data-grabbed")).toBeNull();
  });
});

describe("SortableList single moves", () => {
  it("moves one step with Alt+arrow; arrows alone do nothing", async () => {
    const onReorder = vi.fn();
    render(<Harness onReorder={onReorder} />);
    const h = handle("Week 3");
    h.focus();
    fireEvent.keyDown(h, { key: "ArrowUp" });
    expect(onReorder).not.toHaveBeenCalled();
    fireEvent.keyDown(h, { key: "ArrowUp", altKey: true });
    await settle();
    expect(onReorder).toHaveBeenCalledWith(2, 1, { key: "c" });
    expect(order()).toEqual(["a", "c", "b"]);
    expect(document.activeElement).toBe(handle("Week 3"));
  });

  it("does nothing past either end", () => {
    const onReorder = vi.fn();
    render(<Harness onReorder={onReorder} />);
    fireEvent.keyDown(handle("Week 1"), { key: "ArrowUp", altKey: true });
    fireEvent.keyDown(handle("Week 3"), { key: "ArrowDown", altKey: true });
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("moves by drag and drop from the handle, above or below the row it lands on", async () => {
    const onReorder = vi.fn();
    render(<Harness onReorder={onReorder} />);

    fireEvent.pointerDown(handle("Week 1"));
    let transfer = dataTransfer();
    fireEvent.dragStart(rows()[0]!, { dataTransfer: transfer });
    dragOverAt(rows()[2]!, transfer, 130);
    fireEvent.drop(rows()[2]!, { dataTransfer: transfer });
    await settle();
    expect(onReorder).toHaveBeenLastCalledWith(0, 2, { key: "a" });
    expect(order()).toEqual(["b", "c", "a"]);
    expect(live()).toBe("Week 1 dropped at position 3 of 3.");

    fireEvent.pointerDown(handle("Week 1"));
    transfer = dataTransfer();
    fireEvent.dragStart(rows()[2]!, { dataTransfer: transfer });
    dragOverAt(rows()[0]!, transfer, 105);
    fireEvent.drop(rows()[0]!, { dataTransfer: transfer });
    await settle();
    expect(onReorder).toHaveBeenLastCalledWith(2, 0, { key: "a" });
    expect(order()).toEqual(["a", "b", "c"]);

    // A drop right next to where it already is changes nothing.
    fireEvent.pointerDown(handle("Week 2"));
    transfer = dataTransfer();
    fireEvent.dragStart(rows()[1]!, { dataTransfer: transfer });
    dragOverAt(rows()[2]!, transfer, 105);
    fireEvent.drop(rows()[2]!, { dataTransfer: transfer });
    await settle();
    expect(onReorder).toHaveBeenCalledTimes(2);
  });

  it("is draggable only while the handle is pressed", () => {
    render(<Harness />);
    const first = rows()[0]!;
    expect(first.getAttribute("draggable")).toBeNull();
    fireEvent.pointerDown(handle("Week 1"));
    expect(rows()[0]!.getAttribute("draggable")).toBe("true");
    act(() => {
      window.dispatchEvent(new Event("pointercancel"));
    });
    expect(rows()[0]!.getAttribute("draggable")).toBeNull();
    fireEvent.pointerDown(handle("Week 1"));
    act(() => {
      window.dispatchEvent(new Event("pointerup"));
    });
    expect(rows()[0]!.getAttribute("draggable")).toBeNull();
  });

  it("moves from the built-in Move menu and leaves focus off the handle", async () => {
    const onReorder = vi.fn();
    render(<Harness onReorder={onReorder} />);
    fireEvent.keyDown(screen.getByRole("button", { name: "Move Week 1" }), { key: "Enter" });
    expect((await screen.findByRole("menuitem", { name: "Move up" })).getAttribute("data-disabled")).not.toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: "Move down" }));
    await settle();
    expect(onReorder).toHaveBeenCalledWith(0, 1, { key: "a" });
    expect(order()).toEqual(["b", "a", "c"]);
    expect(document.activeElement).not.toBe(handle("Week 1"));
  });

  it("hides the Move menu when asked", () => {
    render(<Harness moveMenu={false} />);
    expect(screen.queryByRole("button", { name: /^Move / })).toBeNull();
  });

  it("moves from the render context, keeping focus on the row's own button", async () => {
    render(<Harness />);
    const down = screen.getByRole("button", { name: "Down Week 1" });
    down.focus();
    fireEvent.click(down);
    await settle();
    expect(order()).toEqual(["b", "a", "c"]);
    expect(document.activeElement).toBe(down);

    fireEvent.click(screen.getByRole("button", { name: "Top Week 3" }));
    await settle();
    expect(order()).toEqual(["c", "b", "a"]);
  });

  it("rounds moveTo and ignores non-finite targets", async () => {
    const onReorder = vi.fn();
    render(<Harness onReorder={onReorder} />);
    fireEvent.click(screen.getByRole("button", { name: "Nowhere Week 1" }));
    expect(onReorder).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Second Week 1" }));
    await settle();
    expect(onReorder).toHaveBeenCalledWith(0, 2, { key: "a" });
  });
});

describe("SortableList async moves", () => {
  it("shows a pending move, blocks other moves, and settles once", async () => {
    const onReorder = vi.fn();
    const deferred: Array<() => void> = [];
    render(<Harness mode="defer" deferred={deferred} onReorder={onReorder} />);
    const h = handle("Week 1");
    h.focus();
    fireEvent.keyDown(h, { key: "ArrowDown", altKey: true });
    expect(order()).toEqual(["b", "a", "c"]);
    fireEvent.keyDown(handle("Week 1"), { key: "ArrowDown", altKey: true });
    fireEvent.click(screen.getByRole("button", { name: "Down Week 2" }));
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(live()).toBe("");

    await act(async () => deferred[0]!());
    expect(order()).toEqual(["b", "a", "c"]);
    expect(live()).toBe("Week 1 moved to position 2 of 3.");

    // Now unblocked.
    fireEvent.keyDown(handle("Week 1"), { key: "ArrowDown", altKey: true });
    expect(onReorder).toHaveBeenCalledTimes(2);
    expect(onReorder).toHaveBeenLastCalledWith(1, 2, { key: "a" });
  });

  it("puts the old order back when onReorder rejects, and says so each time", async () => {
    render(<Harness mode="reject" />);
    fireEvent.click(screen.getByRole("button", { name: "Down Week 1" }));
    await settle();
    expect(order()).toEqual(["a", "b", "c"]);
    expect(live()).toBe("Couldn’t move Week 1.");
    fireEvent.click(screen.getByRole("button", { name: "Down Week 1" }));
    await settle();
    // Same message again, changed just enough for the live region to repeat it.
    expect(live()).toBe("Couldn’t move Week 1. ");
  });
});

describe("SortableList disabled", () => {
  it("renders no handles or menus and ignores moves", () => {
    const onReorder = vi.fn();
    render(<Harness onReorder={onReorder} disabled />);
    expect(screen.queryByRole("button", { name: /Reorder|^Move / })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Down Week 1" }));
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("ends a pick-up when the list turns disabled", () => {
    const onReorder = vi.fn();
    const { rerender } = render(<Harness onReorder={onReorder} />);
    const h = handle("Week 1");
    h.focus();
    press(h);
    fireEvent.keyDown(h, { key: "ArrowDown" });
    rerender(<Harness onReorder={onReorder} disabled />);
    expect(order()).toEqual(["a", "b", "c"]);
    rerender(<Harness onReorder={onReorder} />);
    expect(handle("Week 1").getAttribute("data-grabbed")).toBeNull();
    expect(onReorder).not.toHaveBeenCalled();
  });
});
