/**
 * Delete wording follows what a delete does (recycle bin vs gone for good),
 * and a failed unconfirmed delete reaches the user or the caller's onError,
 * never only the console.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const toastError = vi.hoisted(() => vi.fn());
vi.mock("../../ui/sonner", () => ({ toast: { error: toastError }, Toaster: () => null }));

import { GenesisProvider, createMockProvider } from "../../../provider";
import { ResourcePage, type ResourcePageProps } from "../ResourcePage";
import { ConfirmDeleteDialog } from "../ConfirmDeleteDialog";

interface Task {
  [key: string]: unknown;
  id: string;
  title: string;
}

beforeEach(() => {
  localStorage.clear();
  toastError.mockReset();
});

function renderTasks(extra: Partial<ResourcePageProps<Task>>, provider: ReturnType<typeof createMockProvider>) {
  return render(
    <GenesisProvider provider={provider}>
      <ResourcePage<Task> resource="tasks" title="Tasks" columns={["title"]} titleField="name" keyboardNavigation={false} {...extra} />
    </GenesisProvider>,
  );
}

async function askToDelete(title: string) {
  fireEvent.click(await screen.findByText(title));
  fireEvent.click(await screen.findByTestId("detail-panel-delete"));
}

describe("ConfirmDeleteDialog kind", () => {
  it('says "can\'t be undone" by default and names the recycle bin for kind="recycle"', () => {
    const { rerender } = render(<ConfirmDeleteDialog open onOpenChange={() => {}} onConfirm={() => {}} />);
    expect(screen.getByText("This can't be undone.")).toBeTruthy();
    rerender(<ConfirmDeleteDialog open onOpenChange={() => {}} onConfirm={() => {}} kind="recycle" />);
    expect(screen.getByText("It moves to the recycle bin, where it can be restored.")).toBeTruthy();
  });
});

describe("ResourcePage delete wording", () => {
  it("uses the recycle-bin wording when the provider reports softDelete", async () => {
    const provider = createMockProvider({ tasks: [{ id: "1", title: "Write" }] });
    const capabilities = vi.fn(async () => ({
      search: true,
      sort: true,
      filterOperators: [],
      bulkWrites: false,
      versionedWrites: false,
      compositeKeys: false,
      softDelete: true,
    }));
    renderTasks({ allowDelete: true }, { ...provider, capabilities });
    await askToDelete("Write");
    const dialog = await screen.findByRole("alertdialog");
    await waitFor(() =>
      expect(within(dialog).getByText("It moves to the recycle bin, where it can be restored.")).toBeTruthy(),
    );
    expect(capabilities).toHaveBeenCalledWith("tasks");
  });
});

describe("ResourcePage unconfirmed delete failures", () => {
  function failing() {
    const provider = createMockProvider({ tasks: [{ id: "1", title: "Write" }] });
    vi.spyOn(provider, "deleteOne").mockRejectedValue(new Error("You can't delete this task."));
    return provider;
  }

  it("tells the user with a toast when the caller has no onError", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderTasks({ allowDelete: true, confirmDelete: false }, failing());
    await askToDelete("Write");
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("You can't delete this task."));
  });

  it("leaves it to resourceOptions.onError when there is one", async () => {
    const onError = vi.fn();
    renderTasks({ allowDelete: true, confirmDelete: false, resourceOptions: { onError } }, failing());
    await askToDelete("Write");
    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(toastError).not.toHaveBeenCalled();
  });
});
