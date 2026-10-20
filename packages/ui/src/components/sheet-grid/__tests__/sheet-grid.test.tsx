/**
 * SheetGrid — the keyboard model, editing, and copy/paste as TSV.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { parseTsv, SheetCommitError, SheetGrid, toTsv, type SheetCellChange, type SheetGridColumn } from "../sheet-grid";

interface Row {
  id: string;
  name: string;
  status: string;
  note: string;
}

const rows: Row[] = [
  { id: "1", name: "Ana", status: "active", note: "" },
  { id: "2", name: "Ben", status: "paused", note: "x" },
  { id: "3", name: "Cy", status: "active", note: "" },
];

const columns: SheetGridColumn<Row>[] = [
  { key: "id", header: "id", editable: false, readOnlyReason: "Key fields can't be edited." },
  { key: "name", header: "name", editable: true },
  { key: "status", header: "status", editable: true, options: ["active", "paused"] },
  { key: "note", header: "note", editable: true },
];

function renderGrid(onCommit = vi.fn<(c: SheetCellChange<Row>[]) => Promise<void>>(async () => {}), extra = {}) {
  render(<SheetGrid<Row> rows={rows} columns={columns} getKey={(r) => r.id} onCommit={onCommit} label="Clients" {...extra} />);
  const grid = screen.getByRole("grid", { name: "Clients" });
  return { grid, onCommit };
}

const cell = (r: number, c: number) => screen.getAllByRole("row")[r + 1]!.querySelectorAll('[role="gridcell"]')[c] as HTMLElement;

// happy-dom does no layout, so every element measures 0×0 and the
// virtualizer would render no rows. Give elements a viewport-sized box.
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => 480 });
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get: () => 1024 });
  HTMLElement.prototype.getBoundingClientRect = () =>
    ({ x: 0, y: 0, top: 0, left: 0, bottom: 480, right: 1024, width: 1024, height: 480, toJSON: () => ({}) }) as DOMRect;
});

describe("TSV", () => {
  it("parses tabs, lines and quoted fields, and round-trips", () => {
    expect(parseTsv('a\tb\n"c\td"\t"say ""hi"""')).toEqual([
      ["a", "b"],
      ["c\td", 'say "hi"'],
    ]);
    const grid = [["x", "y\tz"], ["1", 'q"']];
    expect(parseTsv(toTsv(grid))).toEqual(grid);
  });
});

describe("SheetGrid", () => {
  it("moves the active cell with the keyboard and extends a range with Shift", () => {
    const { grid } = renderGrid();
    fireEvent.keyDown(grid, { key: "ArrowRight" });
    expect(cell(0, 1).getAttribute("aria-selected")).toBe("true");
    expect(grid.getAttribute("aria-activedescendant")).toBe(cell(0, 1).id);
    fireEvent.keyDown(grid, { key: "ArrowDown", shiftKey: true });
    fireEvent.keyDown(grid, { key: "ArrowRight", shiftKey: true });
    expect([cell(0, 1), cell(0, 2), cell(1, 1), cell(1, 2)].every((el) => el.getAttribute("aria-selected") === "true")).toBe(true);
    expect(cell(2, 1).getAttribute("aria-selected")).toBe("false");
    fireEvent.keyDown(grid, { key: "End", ctrlKey: true });
    expect(grid.getAttribute("aria-activedescendant")).toBe(cell(2, 3).id);
  });

  it("edits by typing, saves on Enter and moves down", async () => {
    const { grid, onCommit } = renderGrid();
    fireEvent.keyDown(grid, { key: "ArrowRight" });
    fireEvent.keyDown(grid, { key: "Z" });
    const input = screen.getByLabelText("name, row 1");
    fireEvent.change(input, { target: { value: "Zoe" } });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    fireEvent.blur(input); // the blur that follows Enter must not save again
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith([{ row: rows[0], rowKey: "1", column: "name", value: "Zoe" }]);
    expect(grid.getAttribute("aria-activedescendant")).toBe(cell(1, 1).id);
  });

  it("leaves keys and pastes in a row header or the footer to that control", () => {
    const onCommit = vi.fn(async () => {});
    renderGrid(onCommit, {
      rowHeader: { width: 40, render: (row: Row) => <input type="checkbox" aria-label={`Select ${row.name}`} /> },
      footer: <button type="button">Add a record</button>,
    });
    const box = screen.getByLabelText("Select Ana");
    const space = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
    box.dispatchEvent(space);
    expect(space.defaultPrevented).toBe(false);
    expect(screen.queryByLabelText("id, row 1")).toBeNull();
    const add = screen.getByRole("button", { name: "Add a record" });
    const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    add.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(false);
    fireEvent.paste(box, { clipboardData: { getData: () => "X" } });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("won't edit a read-only cell", () => {
    const { grid } = renderGrid();
    fireEvent.keyDown(grid, { key: "Enter" });
    expect(screen.queryByLabelText("id, row 1")).toBeNull();
    expect(cell(0, 0).getAttribute("title")).toBe("Key fields can't be edited.");
  });

  it("pastes a block from a spreadsheet as one commit, skipping read-only cells", async () => {
    const onSkipped = vi.fn();
    const { grid, onCommit } = renderGrid(undefined, { onSkipped });
    await act(async () => {
      fireEvent.paste(grid, { clipboardData: { getData: () => "9\tAna2\tpaused\n8\tBen2\tactive\n" } });
    });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.calls[0]![0].map((c) => `${c.rowKey}.${c.column}=${c.value}`)).toEqual([
      "1.name=Ana2",
      "1.status=paused",
      "2.name=Ben2",
      "2.status=active",
    ]);
    expect(onSkipped).toHaveBeenCalledWith(2);
  });

  it("fills a selected range with a single pasted value", async () => {
    const { grid, onCommit } = renderGrid();
    fireEvent.keyDown(grid, { key: "ArrowRight" });
    fireEvent.keyDown(grid, { key: "ArrowRight" });
    fireEvent.keyDown(grid, { key: "ArrowDown", shiftKey: true });
    fireEvent.keyDown(grid, { key: "ArrowDown", shiftKey: true });
    await act(async () => {
      fireEvent.paste(grid, { clipboardData: { getData: () => "paused" } });
    });
    expect(onCommit.mock.calls[0]![0].map((c) => c.rowKey)).toEqual(["1", "3"]); // row 2 is already paused
  });

  it("copies the range as TSV", () => {
    const { grid } = renderGrid();
    fireEvent.keyDown(grid, { key: "ArrowRight" });
    fireEvent.keyDown(grid, { key: "ArrowDown", shiftKey: true });
    fireEvent.keyDown(grid, { key: "ArrowRight", shiftKey: true });
    const setData = vi.fn();
    fireEvent.copy(grid, { clipboardData: { setData } });
    expect(setData).toHaveBeenCalledWith("text/plain", "Ana\tactive\nBen\tpaused");
  });

  it("clears the range with Delete and undoes with Ctrl+Z", async () => {
    const onUndo = vi.fn();
    const { grid, onCommit } = renderGrid(undefined, { onUndo });
    fireEvent.keyDown(grid, { key: "ArrowRight" });
    fireEvent.keyDown(grid, { key: "ArrowRight" });
    fireEvent.keyDown(grid, { key: "ArrowRight" });
    fireEvent.keyDown(grid, { key: "ArrowDown", shiftKey: true });
    await act(async () => {
      fireEvent.keyDown(grid, { key: "Delete" });
    });
    expect(onCommit.mock.calls[0]![0]).toEqual([{ row: rows[1], rowKey: "2", column: "note", value: "" }]);
    fireEvent.keyDown(grid, { key: "z", ctrlKey: true });
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it("marks only the cells a SheetCommitError names as failed", async () => {
    const onCommit = vi.fn(async () => {
      throw new SheetCommitError("1 row failed", [{ rowKey: "2", column: "name", message: "Not saved: someone else changed this row." }]);
    });
    const { grid } = renderGrid(onCommit);
    await act(async () => {
      fireEvent.paste(grid, { clipboardData: { getData: () => "x\tA\nx\tB" } });
    });
    expect(cell(1, 1).getAttribute("aria-invalid")).toBe("true");
    expect(cell(1, 1).getAttribute("title")).toMatch(/someone else changed/);
    expect(cell(0, 1).getAttribute("aria-invalid")).toBeNull();
  });
});

describe("SheetGrid edits follow their row", () => {
  it("saves to the row being edited even when rows shift underneath", async () => {
    const commits: unknown[] = [];
    type R = { id: string; name: string };
    const cols = [{ key: "name", header: "Name", editable: true }];
    const onCommit = (changes: unknown[]) => {
      commits.push(...changes);
    };
    const view = render(<SheetGrid<R> label="People" rows={[{ id: "a", name: "Ann" }, { id: "b", name: "Bo" }]} columns={cols} getKey={(r) => r.id} onCommit={onCommit} />);
    fireEvent.doubleClick(screen.getByText("Bo"));
    const input = screen.getByDisplayValue("Bo");
    fireEvent.change(input, { target: { value: "Bob" } });
    // A refetch puts a new row first while the editor is open.
    view.rerender(<SheetGrid<R> label="People" rows={[{ id: "z", name: "Zed" }, { id: "a", name: "Ann" }, { id: "b", name: "Bo" }]} columns={cols} getKey={(r) => r.id} onCommit={onCommit} />);
    await act(async () => {
      fireEvent.keyDown(screen.getByDisplayValue("Bob"), { key: "Enter" });
    });
    expect(commits).toEqual([expect.objectContaining({ rowKey: "b", column: "name", value: "Bob" })]);
  });
});

describe("blank cells in copy and paste", () => {
  it("round-trips a lone blank cell and a trailing blank row", () => {
    expect(toTsv([[""]])).toBe('""');
    expect(parseTsv(toTsv([[""]]))).toEqual([[""]]);
    expect(parseTsv(toTsv([["A"], [""]]))).toEqual([["A"], [""]]);
    expect(parseTsv(toTsv([["", ""]]))).toEqual([["", ""]]);
    expect(parseTsv(toTsv([["a\tb"], [""], ["c"]]))).toEqual([["a\tb"], [""], ["c"]]);
  });
});
