/**
 * ResourcePage — per-row rights, the built-in confirmed delete, and a peek
 * that stays true to the data.
 *
 * What a real screen had to hand-build through the `detail` slot before
 * these existed: an Edit button that respected per-record rights, a Delete
 * behind a confirm dialog, a computed subtitle, and a peek that did not show
 * pre-edit values after a save (the old behaviour closed it to hide that).
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GenesisProvider, createMockProvider } from "../../../provider";
import { ResourcePage, type ResourcePageProps } from "../ResourcePage";

interface Practice {
  [key: string]: unknown;
  id: string;
  name: string;
  staff: number;
  locked: boolean;
}

const seed = (): Practice[] => [
  { id: "1", name: "Northside", staff: 2, locked: false },
  { id: "2", name: "Southside", staff: 5, locked: true },
];

beforeEach(() => {
  localStorage.clear();
});

function renderPage(
  extra: Partial<ResourcePageProps<Practice>> = {},
  provider = createMockProvider({ practices: seed() }),
) {
  return render(
    <GenesisProvider provider={provider}>
      <ResourcePage<Practice>
        resource="practices"
        title="Practices"
        columns={["name", "staff"]}
        titleField="name"
        keyboardNavigation={false}
        {...extra}
      />
    </GenesisProvider>,
  );
}

async function openPeek(name: string) {
  fireEvent.click(await screen.findByText(name));
  return screen.findByTestId("detail-panel-close");
}

const editButton = () => screen.queryByTestId("detail-panel-edit");
const deleteButton = () => screen.queryByTestId("detail-panel-delete");

describe("ResourcePage — canEdit / canDelete", () => {
  it("hides Edit and Delete for a row the predicates refuse", async () => {
    renderPage({
      onEdit: () => {},
      onDelete: () => {},
      canEdit: (p) => !p.locked,
      canDelete: (p) => !p.locked,
    });
    await openPeek("Southside");
    expect(editButton()).toBeNull();
    expect(deleteButton()).toBeNull();
  });

  it("shows them for a row the predicates allow", async () => {
    renderPage({
      onEdit: () => {},
      onDelete: () => {},
      canEdit: (p) => !p.locked,
      canDelete: (p) => !p.locked,
    });
    await openPeek("Northside");
    expect(editButton()).toBeTruthy();
    expect(deleteButton()).toBeTruthy();
  });

  it("gates each independently", async () => {
    renderPage({ onEdit: () => {}, onDelete: () => {}, canDelete: () => false });
    await openPeek("Northside");
    expect(editButton()).toBeTruthy();
    expect(deleteButton()).toBeNull();
  });
});

describe("ResourcePage — delete", () => {
  it("allowDelete confirms, deletes through the provider, closes the peek and reports", async () => {
    const provider = createMockProvider({ practices: seed() });
    const deleteOne = vi.spyOn(provider, "deleteOne");
    const onDeleted = vi.fn();
    renderPage({ allowDelete: true, onDeleted }, provider);
    await openPeek("Northside");

    fireEvent.click(deleteButton()!);
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Delete this record?")).toBeTruthy();
    expect(deleteOne).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(deleteOne).toHaveBeenCalledWith("practices", { id: "1" });
    expect(onDeleted).toHaveBeenCalledWith(expect.objectContaining({ id: "1" }));
    await waitFor(() => expect(screen.queryByText("Northside")).toBeNull());
    expect(screen.queryByTestId("detail-panel-close")).toBeNull();
  });

  it("Cancel leaves the record alone", async () => {
    const provider = createMockProvider({ practices: seed() });
    const deleteOne = vi.spyOn(provider, "deleteOne");
    renderPage({ allowDelete: true }, provider);
    await openPeek("Northside");
    fireEvent.click(deleteButton()!);
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Cancel",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(deleteOne).not.toHaveBeenCalled();
    expect(screen.getByTestId("detail-panel-close")).toBeTruthy();
  });

  it("shows a failed delete in the dialog instead of swallowing it", async () => {
    const provider = createMockProvider({ practices: seed() });
    vi.spyOn(provider, "deleteOne").mockRejectedValue(new Error("Not allowed"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderPage({ allowDelete: true }, provider);
    await openPeek("Northside");
    fireEvent.click(deleteButton()!);
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect((await within(dialog).findByRole("alert")).textContent).toContain(
      "Not allowed",
    );
    expect(screen.getByRole("alertdialog")).toBeTruthy();
  });

  it("takes custom copy, per row", async () => {
    renderPage({
      allowDelete: true,
      confirmDelete: {
        title: (p) => `Delete ${p.name}?`,
        confirmLabel: "Remove",
        cancelLabel: "Keep it",
      },
    });
    await openPeek("Northside");
    fireEvent.click(deleteButton()!);
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Delete Northside?")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Remove" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Keep it" })).toBeTruthy();
  });

  it("keeps an unconfirmed onDelete exactly as before: called straight away", async () => {
    const onDelete = vi.fn();
    renderPage({ onDelete });
    await openPeek("Northside");
    fireEvent.click(deleteButton()!);
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: "1" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("puts onDelete behind the dialog with confirmDelete", async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    renderPage({ onDelete, confirmDelete: true });
    await openPeek("Northside");
    fireEvent.click(deleteButton()!);
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Delete",
      }),
    );
    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.queryByTestId("detail-panel-close")).toBeNull(),
    );
  });

  it("replaces the dialog through the deleteDialog slot", async () => {
    renderPage({
      allowDelete: true,
      slots: {
        deleteDialog: ({ open }) =>
          open ? <div data-testid="my-confirm">mine</div> : null,
      },
    });
    await openPeek("Northside");
    fireEvent.click(deleteButton()!);
    expect(await screen.findByTestId("my-confirm")).toBeTruthy();
  });
});

describe("ResourcePage — the peek", () => {
  it("shows getSubtitle's computed value", async () => {
    renderPage({ getSubtitle: (p) => `${p.staff} staff` });
    await openPeek("Northside");
    expect(screen.getByText("2 staff")).toBeTruthy();
  });

  it("stays open after an edit and shows the saved values", async () => {
    renderPage({
      allowEdit: true,
      formFields: [{ key: "name", label: "Name", type: "text" }],
      getSubtitle: (p) => `${p.staff} staff`,
    });
    await openPeek("Northside");
    fireEvent.click(editButton()!);

    const input = await screen.findByLabelText(/Name/);
    fireEvent.change(input, { target: { value: "Northside East" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    // The peek is still open, and its title is the saved one, not the
    // snapshot taken when the row was clicked.
    await waitFor(() =>
      expect(screen.getAllByText("Northside East").length).toBeGreaterThan(1),
    );
    expect(screen.getByTestId("detail-panel-close")).toBeTruthy();
  });

  it("does not open the built-in edit form for a row canEdit refuses", async () => {
    renderPage({
      allowEdit: true,
      canEdit: (p) => !p.locked,
      formFields: [{ key: "name", label: "Name" }],
    });
    await openPeek("Southside");
    expect(editButton()).toBeNull();
  });
});
