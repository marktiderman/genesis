// @feat:data-views
/**
 * KanbanBoard moving cards between columns.
 *
 * What this locks in: a card moves by drag and drop AND by its "Move to…"
 * menu (the keyboard path), a drop on the column it came from does nothing,
 * a column can show its full total and a footer, and a board without
 * `onMoveItem` stays exactly as it was (no menus, nothing draggable).
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { KanbanBoard, type KanbanColumn } from "../KanbanBoard";

interface Card {
  id: string;
  name: string;
}

const columns: KanbanColumn<Card>[] = [
  { key: "todo", label: "To do", items: [{ id: "a", name: "Ana" }], total: 12 },
  { key: "done", label: "Done", items: [{ id: "b", name: "Ben" }] },
];

function dataTransfer() {
  const data = new Map<string, string>();
  return {
    setData: (type: string, value: string) => data.set(type, value),
    getData: (type: string) => data.get(type) ?? "",
    effectAllowed: "",
    dropEffect: "",
  };
}

function renderBoard(onMoveItem?: (item: Card, to: string) => void | Promise<void>) {
  return render(
    <KanbanBoard<Card>
      columns={columns}
      getKey={(c) => c.id}
      getItemLabel={(c) => c.name}
      renderCard={(c) => <div>{c.name}</div>}
      onMoveItem={onMoveItem}
      renderColumnFooter={(c) => (c.total && c.total > c.items.length ? <button type="button">Load more {c.label}</button> : null)}
    />,
  );
}

describe("KanbanBoard moves", () => {
  it("moves a card from its menu, from the keyboard", async () => {
    const onMoveItem = vi.fn();
    renderBoard(onMoveItem);
    fireEvent.keyDown(screen.getByRole("button", { name: "Move Ana" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Done" }));
    expect(onMoveItem).toHaveBeenCalledWith({ id: "a", name: "Ana" }, "done");
  });

  it("moves a card by drag and drop, and ignores a drop on its own column", () => {
    const onMoveItem = vi.fn();
    renderBoard(onMoveItem);
    const card = screen.getByText("Ana").parentElement!;
    const done = screen.getByRole("region", { name: "Done" });
    const todo = screen.getByRole("region", { name: "To do" });

    let transfer = dataTransfer();
    fireEvent.dragStart(card, { dataTransfer: transfer });
    fireEvent.dragOver(todo, { dataTransfer: transfer });
    fireEvent.drop(todo, { dataTransfer: transfer });
    expect(onMoveItem).not.toHaveBeenCalled();

    transfer = dataTransfer();
    fireEvent.dragStart(card, { dataTransfer: transfer });
    fireEvent.dragOver(done, { dataTransfer: transfer });
    fireEvent.drop(done, { dataTransfer: transfer });
    expect(onMoveItem).toHaveBeenCalledWith({ id: "a", name: "Ana" }, "done");
  });

  it("shows a column's total and its footer", () => {
    renderBoard(vi.fn());
    const todo = screen.getByRole("region", { name: "To do" });
    expect(within(todo).getByText("12")).toBeTruthy();
    expect(within(todo).getByRole("button", { name: "Load more To do" })).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Done" })).queryByRole("button", { name: /Load more/ })).toBeNull();
  });

  it("stays a plain board without onMoveItem", () => {
    renderBoard();
    expect(screen.queryByRole("button", { name: /^Move / })).toBeNull();
    expect(screen.getByText("Ana").parentElement!.getAttribute("draggable")).toBeNull();
  });
});

const live = () => document.querySelector('[aria-live="polite"]')!.textContent!.trim();
const handle = (name: string) => screen.getByRole("button", { name: `Pick up ${name}` });
// A keyboard or screen-reader activation reaches the handle as a click with detail 0.
const activate = (el: HTMLElement) => fireEvent.click(el, { detail: 0 });

/** A board whose state follows its moves, as a real caller's would. */
function LiveBoard({ onMove }: { onMove?: (item: Card, to: string) => void }) {
  const [cols, setCols] = useState(columns);
  return (
    <KanbanBoard<Card>
      columns={cols}
      getKey={(c) => c.id}
      getItemLabel={(c) => c.name}
      renderCard={(c) => <div>{c.name}</div>}
      onMoveItem={(item, to) => {
        onMove?.(item, to);
        setCols((prev) =>
          prev.map((c) => ({
            ...c,
            items: c.key === to ? [...c.items, item] : c.items.filter((i) => i.id !== item.id),
          })),
        );
      }}
    />
  );
}

describe("KanbanBoard keyboard pick-up", () => {
  it("picks a card up, chooses a column with the arrows, drops it and announces the move", async () => {
    const onMoveItem = vi.fn();
    renderBoard(onMoveItem);
    const grip = handle("Ana");
    grip.focus();
    activate(grip);
    expect(grip.getAttribute("data-grabbed")).toBe("true");
    expect(live()).toMatch(/^Ana picked up in To do\./);
    fireEvent.keyDown(grip, { key: "ArrowRight" });
    expect(live()).toBe("Over Done, column 2 of 2.");
    expect(screen.getByRole("region", { name: "Done" }).className).toContain("ring-2");
    expect(onMoveItem).not.toHaveBeenCalled();
    activate(grip);
    expect(onMoveItem).toHaveBeenCalledWith({ id: "a", name: "Ana" }, "done");
    await waitFor(() => expect(live()).toBe("Ana moved to Done."));
  });

  it("puts the card back on Escape without closing anything around it", () => {
    const onMoveItem = vi.fn();
    renderBoard(onMoveItem);
    const grip = handle("Ana");
    grip.focus();
    activate(grip);
    fireEvent.keyDown(grip, { key: "ArrowRight" });
    const outer = vi.fn();
    window.addEventListener("keydown", outer);
    fireEvent.keyDown(grip, { key: "Escape" });
    expect(outer).not.toHaveBeenCalled();
    window.removeEventListener("keydown", outer);
    expect(live()).toBe("Move cancelled. Ana stays in To do.");
    expect(grip.getAttribute("data-grabbed")).toBeNull();
    activate(grip);
    activate(grip);
    expect(onMoveItem).not.toHaveBeenCalled();
    expect(live()).toBe("Ana dropped back in To do.");
  });

  it("moves one column with Alt+arrow, and keeps focus on the moved card's handle", async () => {
    const onMove = vi.fn();
    render(<LiveBoard onMove={onMove} />);
    handle("Ana").focus();
    fireEvent.keyDown(handle("Ana"), { key: "ArrowRight", altKey: true });
    expect(onMove).toHaveBeenCalledWith({ id: "a", name: "Ana" }, "done");
    expect(within(screen.getByRole("region", { name: "Done" })).getByText("Ana")).toBeTruthy();
    expect(document.activeElement).toBe(handle("Ana"));
    await waitFor(() => expect(live()).toBe("Ana moved to Done."));
    // No column past the last one.
    fireEvent.keyDown(handle("Ana"), { key: "ArrowRight", altKey: true });
    expect(onMove).toHaveBeenCalledTimes(1);
  });

  it("announces a move the caller rejects", async () => {
    renderBoard(() => Promise.reject(new Error("nope")));
    fireEvent.keyDown(handle("Ana"), { key: "ArrowRight", altKey: true });
    await waitFor(() => expect(live()).toBe("Couldn’t move Ana."));
  });

  it("doesn't pull focus back to a card whose move failed", async () => {
    let reject!: (error: Error) => void;
    const onMoveItem = () => new Promise<void>((_, r) => (reject = r));
    const board = () => (
      <>
        <button type="button">Elsewhere</button>
        <KanbanBoard<Card>
          columns={columns}
          getKey={(c) => c.id}
          getItemLabel={(c) => c.name}
          renderCard={(c) => <div>{c.name}</div>}
          onMoveItem={onMoveItem}
        />
      </>
    );
    const { rerender } = render(board());
    fireEvent.keyDown(screen.getByRole("button", { name: "Move Ana" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Done" }));
    // The user moves on while the move is still saving; then it fails.
    screen.getByRole("button", { name: "Elsewhere" }).focus();
    await act(async () => reject(new Error("nope")));
    await waitFor(() => expect(live()).toBe("Couldn’t move Ana."));
    // Later, focus leaves for the page: it must stay there.
    (document.activeElement as HTMLElement).blur();
    rerender(board());
    expect(document.activeElement).toBe(document.body);
  });

  it("keeps the refocus of a later move when an earlier move of the same card fails", async () => {
    const pending: { resolve: () => void; reject: (e: Error) => void }[] = [];
    function Board() {
      const [cols, setCols] = useState(columns);
      return (
        <KanbanBoard<Card>
          columns={cols}
          getKey={(c) => c.id}
          getItemLabel={(c) => c.name}
          renderCard={(c) => <div>{c.name}</div>}
          onMoveItem={(item, to) =>
            new Promise<void>((resolve, reject) => {
              pending.push({
                resolve: () => {
                  setCols((prev) =>
                    prev.map((c) => ({
                      ...c,
                      items: c.key === to ? [...c.items, item] : c.items.filter((i) => i.id !== item.id),
                    })),
                  );
                  resolve();
                },
                reject,
              });
            })
          }
        />
      );
    }
    render(<Board />);
    handle("Ana").focus();
    fireEvent.keyDown(handle("Ana"), { key: "ArrowRight", altKey: true });
    fireEvent.keyDown(handle("Ana"), { key: "ArrowRight", altKey: true });
    expect(pending).toHaveLength(2);
    // The first attempt fails; the second lands and the card moves.
    await act(async () => pending[0]!.reject(new Error("conflict")));
    (document.activeElement as HTMLElement).blur();
    await act(async () => pending[1]!.resolve());
    expect(within(screen.getByRole("region", { name: "Done" })).getByText("Ana")).toBeTruthy();
    expect(document.activeElement).toBe(handle("Ana"));
  });

  it("ignores a pointer click on the handle", () => {
    const onMoveItem = vi.fn();
    renderBoard(onMoveItem);
    fireEvent.click(handle("Ana"), { detail: 1 });
    expect(handle("Ana").getAttribute("data-grabbed")).toBeNull();
  });
});

describe("KanbanBoard touch drag", () => {
  afterEach(() => vi.restoreAllMocks());

  function pointer(type: "pointerDown" | "pointerMove" | "pointerUp", el: Element, init: Record<string, unknown>) {
    const event = new Event(type.replace("pointer", "pointer").toLowerCase(), { bubbles: true, cancelable: true });
    Object.assign(event, { pointerId: 7, pointerType: "touch", clientX: 10, clientY: 10, ...init });
    act(() => {
      el.dispatchEvent(event);
    });
  }

  it("drags a card by its handle to the column under the finger", () => {
    const onMoveItem = vi.fn();
    renderBoard(onMoveItem);
    const done = screen.getByRole("region", { name: "Done" });
    document.elementFromPoint = vi.fn(() => done.firstElementChild);
    const grip = handle("Ana");
    pointer("pointerDown", grip, {});
    pointer("pointerMove", grip, {});
    expect(done.className).toContain("ring-2");
    pointer("pointerUp", grip, {});
    expect(onMoveItem).toHaveBeenCalledWith({ id: "a", name: "Ana" }, "done");
  });

  it("leaves the card when the finger lifts over its own column, and ignores the mouse", () => {
    const onMoveItem = vi.fn();
    renderBoard(onMoveItem);
    const todo = screen.getByRole("region", { name: "To do" });
    document.elementFromPoint = vi.fn(() => todo);
    const grip = handle("Ana");
    pointer("pointerDown", grip, {});
    pointer("pointerUp", grip, {});
    expect(onMoveItem).not.toHaveBeenCalled();
    expect(live()).toBe("Ana dropped back in To do.");
    document.elementFromPoint = vi.fn(() => screen.getByRole("region", { name: "Done" }));
    pointer("pointerDown", grip, { pointerType: "mouse" });
    pointer("pointerUp", grip, { pointerType: "mouse" });
    expect(onMoveItem).not.toHaveBeenCalled();
  });
});
