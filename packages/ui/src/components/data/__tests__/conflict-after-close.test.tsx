// @feat:data-offline
/**
 * A conflict that comes back after the form closed (a route change during the
 * undo delay) has no sheet to show it, so ResourceForm toasts it instead.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DataWriteError, type DataProvider } from "@marktiderman/genesis-core/provider";

import { GenesisProvider, createMockProvider } from "../../../provider";
import { ResourceForm } from "../ResourceForm";
import type { ResourceFormFieldDef } from "../ResourceFormField";

const toasts = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("../undo-toast", async (original) => ({
  ...(await original<typeof import("../undo-toast")>()),
  showWriteErrorToast: toasts.error,
}));

const fields: ResourceFormFieldDef[] = [{ key: "title", label: "Title", type: "text" }];

function renderEdit() {
  const base = createMockProvider({ tasks: [{ id: "t1", title: "Old", version: 3 }] }, { delay: 0 });
  let fail: (error: Error) => void = () => {};
  const update = vi.fn(() => new Promise<never>((_, reject) => (fail = reject)));
  const provider = { ...base, update } as unknown as DataProvider;
  const view = render(
    <GenesisProvider provider={provider}>
      <ResourceForm
        resource="tasks"
        action="edit"
        item={{ id: "t1", title: "Old", version: 3 }}
        open
        onOpenChange={() => {}}
        fields={fields}
        noun="task"
        mutationMode="optimistic"
        prefillFromUrl={false}
      />
    </GenesisProvider>,
  );
  const conflict = (withRow = true) =>
    fail(
      new DataWriteError(
        "conflict",
        "Someone else changed this task after you opened it.",
        withRow ? { current: { id: "t1", title: "Theirs", version: 5 }, currentVersion: "5" } : {},
      ),
    );
  return { view, update, conflict };
}

describe("ResourceForm, a conflict after it closed", () => {
  it("toasts the conflict once the form is gone", async () => {
    const { view, update, conflict } = renderEdit();
    fireEvent.change(await screen.findByLabelText(/Title/), { target: { value: "Mine" } });
    fireEvent.click(screen.getByRole("button", { name: /Save|Update/ }));
    await waitFor(() => expect(update).toHaveBeenCalled());
    view.unmount();
    await act(async () => conflict());
    await waitFor(() => expect(toasts.error).toHaveBeenCalledTimes(1));
    expect((toasts.error.mock.calls[0]![0] as DataWriteError).outcome).toBe("conflict");
  });

  it("leaves it to the sheet while the form is open", async () => {
    toasts.error.mockClear();
    const { update, conflict } = renderEdit();
    fireEvent.change(await screen.findByLabelText(/Title/), { target: { value: "Mine" } });
    fireEvent.click(screen.getByRole("button", { name: /Save|Update/ }));
    await waitFor(() => expect(update).toHaveBeenCalled());
    await act(async () => conflict());
    expect(await screen.findByTestId("resource-form-conflict")).toBeTruthy();
    expect(toasts.error).not.toHaveBeenCalled();
  });

  it("toasts a conflict that brings no row to show, even while the form is open", async () => {
    toasts.error.mockClear();
    const { update, conflict } = renderEdit();
    fireEvent.change(await screen.findByLabelText(/Title/), { target: { value: "Mine" } });
    fireEvent.click(screen.getByRole("button", { name: /Save|Update/ }));
    await waitFor(() => expect(update).toHaveBeenCalled());
    await act(async () => conflict(false));
    await waitFor(() => expect(toasts.error).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("resource-form-conflict")).toBeNull();
  });
});
