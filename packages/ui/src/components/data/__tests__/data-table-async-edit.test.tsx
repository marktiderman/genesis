/**
 * DataTable in-place editing with an async `onSave`.
 *
 * What this locks in: a save that is still in flight keeps the editor open
 * and saves once, a rejected save keeps the user's draft and shows WHY on
 * screen, and the classic `void` onSave still closes at once.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DataTable, type DataTableColumn } from "../DataTable";

interface Row {
  id: string;
  note: string;
}

const rows: Row[] = [{ id: "1", note: "before" }];

type OnSave = NonNullable<DataTableColumn<Row>["editable"]>["onSave"];

function renderTable(onSave: OnSave) {
  return render(
    <DataTable<Row>
      items={rows}
      getKey={(r) => r.id}
      columnVisibility={false}
      pagination={false}
      columns={[{ key: "note", header: "Note", editable: { type: "text", onSave } }]}
    />,
  );
}

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function startEditing(value: string) {
  fireEvent.click(screen.getByText("before"));
  const input = screen.getByDisplayValue("before");
  fireEvent.change(input, { target: { value } });
  return input;
}

describe("DataTable async cell editing", () => {
  it("stays open while saving, saves once, then closes", async () => {
    const pending = deferred();
    const onSave = vi.fn(() => pending.promise);
    renderTable(onSave);

    const input = startEditing("after");
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith(rows[0], "after");
    expect(screen.getByLabelText("Saving")).toBeTruthy();
    expect(screen.getByDisplayValue("after")).toBeTruthy();

    await act(async () => pending.resolve());
    expect(screen.queryByDisplayValue("after")).toBeNull();
  });

  it("keeps the draft and shows the reason when the save is rejected", async () => {
    const pending = deferred();
    renderTable(() => pending.promise);

    const input = startEditing("mine");
    fireEvent.keyDown(input, { key: "Enter" });
    await act(async () => pending.reject(new Error("Not saved: someone else changed this row.")));

    expect(screen.getByRole("alert").textContent).toBe("Not saved: someone else changed this row.");
    expect(screen.getByDisplayValue("mine").getAttribute("aria-invalid")).toBe("true");
  });

  it("doesn't silently retry a failed draft when the cell loses focus", async () => {
    const onSave = vi.fn(() => Promise.reject(new Error("nope")));
    renderTable(onSave);

    const input = startEditing("mine");
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    await act(async () => {
      fireEvent.blur(screen.getByDisplayValue("mine"));
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(screen.queryByDisplayValue("mine")).toBeNull();
  });

  it("closes at once for a synchronous onSave, as before", () => {
    const onSave = vi.fn();
    renderTable(onSave);
    const input = startEditing("sync");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(screen.queryByDisplayValue("sync")).toBeNull();
  });
});

describe("DataTable async select editing", () => {
  it("closes on Escape without saving", async () => {
    const onSave = vi.fn(() => Promise.resolve());
    render(
      <DataTable<{ id: string; status: string }>
        items={[{ id: "1", status: "active" }]}
        getKey={(r) => r.id}
        columnVisibility={false}
        pagination={false}
        columns={[{ key: "status", header: "Status", editable: { type: "select", options: ["active", "paused"], onSave } }]}
      />,
    );
    fireEvent.click(screen.getByText("active"));
    await act(async () => {
      fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
    });
    expect(screen.queryByRole("combobox")).toBeNull();
    fireEvent.click(screen.getByText("active"));
    expect(screen.getByRole("combobox")).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });
});
