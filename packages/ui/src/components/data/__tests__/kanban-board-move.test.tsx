// @feat:data-views
/**
 * KanbanBoard moving cards between columns.
 *
 * What this locks in: a card moves by drag and drop AND by its "Move to…"
 * menu (the keyboard path), a drop on the column it came from does nothing,
 * a column can show its full total and a footer, and a board without
 * `onMoveItem` stays exactly as it was (no menus, nothing draggable).
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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

function renderBoard(onMoveItem?: (item: Card, to: string) => void) {
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
