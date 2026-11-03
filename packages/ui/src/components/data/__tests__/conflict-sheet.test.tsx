// @feat:data-offline
/**
 * ConflictSheet: a save that met someone else's change shows theirs beside
 * yours, theirs first, then "Keep mine" (saved again at the new version) or
 * "Take theirs". ResourceForm opens it on a `conflict`.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataWriteError, type DataProvider } from "@marktiderman/genesis-core/provider";
import { writeConflict } from "@marktiderman/genesis-core";

import { GenesisProvider, createMockProvider } from "../../../provider";
import { ConflictSheet } from "../ConflictSheet";
import { ResourceForm } from "../ResourceForm";
import type { ResourceFormFieldDef } from "../ResourceFormField";

afterEach(() => {
  vi.restoreAllMocks();
});

const conflict = writeConflict(
  new DataWriteError("conflict", "x", { current: { id: "t1", title: "Theirs", done: true, notes: "same" }, currentVersion: "5" }),
  { title: "Mine", done: true, notes: "same" },
)!;

describe("ConflictSheet", () => {
  it("shows only the fields that differ, theirs before yours", () => {
    render(<ConflictSheet conflict={conflict} noun="task" onKeepMine={() => {}} onTakeTheirs={() => {}} onDismiss={() => {}} />);
    const sheet = screen.getByTestId("conflict-sheet");
    expect(within(sheet).getByText("Someone else changed this task")).toBeTruthy();
    expect(within(sheet).getByTestId("conflict-sheet-field-title").textContent).toBe("TitleTheirsMine");
    expect(within(sheet).queryByTestId("conflict-sheet-field-notes")).toBeNull();
    const headers = within(sheet).getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["Field", "Theirs", "Yours"]);
  });

  it("waits for keep mine, and offers only take theirs when nothing differs", async () => {
    let finish: () => void = () => {};
    const onKeepMine = vi.fn(() => new Promise<void>((r) => (finish = r)));
    const { rerender } = render(<ConflictSheet conflict={conflict} onKeepMine={onKeepMine} onTakeTheirs={() => {}} onDismiss={() => {}} />);
    fireEvent.click(screen.getByTestId("conflict-sheet-keep-mine"));
    expect(onKeepMine).toHaveBeenCalledTimes(1);
    expect((screen.getByTestId("conflict-sheet-take-theirs") as HTMLButtonElement).disabled).toBe(true);
    await act(async () => finish());

    rerender(<ConflictSheet conflict={{ ...conflict, fields: [] }} onKeepMine={onKeepMine} onTakeTheirs={() => {}} onDismiss={() => {}} />);
    expect(screen.queryByTestId("conflict-sheet-keep-mine")).toBeNull();
    expect(screen.getByText(/already matches yours/)).toBeTruthy();
  });

  it("stays closed without a conflict, and Escape dismisses it", () => {
    const onDismiss = vi.fn();
    const { rerender } = render(<ConflictSheet conflict={null} onKeepMine={() => {}} onTakeTheirs={() => {}} onDismiss={onDismiss} />);
    expect(screen.queryByTestId("conflict-sheet")).toBeNull();
    rerender(<ConflictSheet conflict={conflict} onKeepMine={() => {}} onTakeTheirs={() => {}} onDismiss={onDismiss} />);
    fireEvent.keyDown(screen.getByTestId("conflict-sheet"), { key: "Escape" });
    expect(onDismiss).toHaveBeenCalled();
  });
});

describe("ResourceForm on a conflict", () => {
  const fields: ResourceFormFieldDef[] = [{ key: "title", label: "Title", type: "text" }];

  function renderEdit() {
    const base = createMockProvider({ tasks: [{ id: "t1", title: "Old", version: 3 }] }, { delay: 0 });
    let calls = 0;
    const update = vi.fn(async (resource: string, params: Parameters<DataProvider["update"]>[1]) => {
      calls += 1;
      if (calls === 1) {
        throw new DataWriteError("conflict", "Someone else changed this task after you opened it.", {
          current: { id: "t1", title: "Theirs", version: 5 },
          currentVersion: "5",
        });
      }
      return base.update(resource, params);
    });
    const provider = { ...base, update } as DataProvider;
    const onOpenChange = vi.fn();
    render(
      <GenesisProvider provider={provider}>
        <ResourceForm
          resource="tasks"
          action="edit"
          item={{ id: "t1", title: "Old", version: 3 }}
          open
          onOpenChange={onOpenChange}
          fields={fields}
          noun="task"
          prefillFromUrl={false}
        />
      </GenesisProvider>,
    );
    return { update, onOpenChange };
  }

  it("opens the sheet instead of only an error, and keep mine saves at the new version", async () => {
    const { update, onOpenChange } = renderEdit();
    fireEvent.change(await screen.findByLabelText(/Title/), { target: { value: "Mine" } });
    fireEvent.click(screen.getByRole("button", { name: /Save|Update/ }));
    const sheet = await screen.findByTestId("resource-form-conflict");
    expect(within(sheet).getByTestId("resource-form-conflict-field-title").textContent).toBe("TitleTheirsMine");
    await act(async () => {
      fireEvent.click(within(sheet).getByTestId("resource-form-conflict-keep-mine"));
    });
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    expect(update.mock.calls[1]![1]).toMatchObject({ id: "t1", data: { title: "Mine" }, expectedVersion: "5" });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("take theirs puts their values in the form, unsaved", async () => {
    const { update } = renderEdit();
    fireEvent.change(await screen.findByLabelText(/Title/), { target: { value: "Mine" } });
    fireEvent.click(screen.getByRole("button", { name: /Save|Update/ }));
    const sheet = await screen.findByTestId("resource-form-conflict");
    fireEvent.click(within(sheet).getByTestId("resource-form-conflict-take-theirs"));
    await waitFor(() => expect((screen.getByLabelText(/Title/) as HTMLInputElement).value).toBe("Theirs"));
    expect(update).toHaveBeenCalledTimes(1);
  });
});
