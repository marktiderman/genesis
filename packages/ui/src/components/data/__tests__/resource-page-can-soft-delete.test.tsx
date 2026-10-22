/**
 * ResourcePage — `can(action, item)` and its deprecated aliases, the
 * recycle-bin (`softDelete`) confirm copy, and delete failures that reach
 * the user.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const toastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: toastError }, Toaster: () => null }));

import { GenesisProvider, createMockProvider, type DataProvider } from "../../../provider";
import type { ProviderCapabilities } from "@marktiderman/genesis-core/schema";
import { ResourcePage, type ResourcePageProps } from "../ResourcePage";
import { resolveCan, type ResourcePermissionAction } from "../resource-permissions";

interface Practice {
  [key: string]: unknown;
  id: string;
  name: string;
  locked: boolean;
  mine: boolean;
}

const seed = (): Practice[] => [
  { id: "1", name: "Northside", locked: false, mine: true },
  { id: "2", name: "Southside", locked: true, mine: true },
  { id: "3", name: "Eastside", locked: false, mine: false },
  { id: "4", name: "Westside", locked: true, mine: false },
];

const baseCaps: ProviderCapabilities = {
  search: true,
  sort: true,
  filterOperators: [],
  bulkWrites: false,
  versionedWrites: false,
  compositeKeys: false,
};

function withCapabilities(
  provider: DataProvider,
  caps: (resource?: string) => Partial<ProviderCapabilities>,
): DataProvider {
  provider.capabilities = async (resource) => ({ ...baseCaps, ...caps(resource) });
  return provider;
}

beforeEach(() => {
  localStorage.clear();
  toastError.mockReset();
});

function renderPage(
  extra: Partial<ResourcePageProps<Practice>> = {},
  provider: DataProvider = createMockProvider({ practices: seed() }),
) {
  return render(
    <GenesisProvider provider={provider}>
      <ResourcePage<Practice>
        resource="practices"
        title="Practices"
        columns={["name"]}
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

async function closePeek() {
  fireEvent.click(screen.getByTestId("detail-panel-close"));
  await waitFor(() => expect(screen.queryByTestId("detail-panel-close")).toBeNull());
}

const editButton = () => screen.queryByTestId("detail-panel-edit");
const deleteButton = () => screen.queryByTestId("detail-panel-delete");

// One rule, written both ways: you may change your own rows, and delete only
// the unlocked ones.
const rule = (action: ResourcePermissionAction, p: Practice) =>
  p.mine && (action !== "delete" || !p.locked);
const aliases = {
  canEditItem: (p: Practice) => p.mine,
  canDelete: (p: Practice) => !p.locked,
};

describe("resolveCan", () => {
  it("can and the deprecated aliases agree for every row and action", () => {
    const viaCan = resolveCan<Practice>({ can: rule });
    const viaAliases = resolveCan<Practice>(aliases);
    for (const row of seed()) {
      for (const action of ["edit", "delete"] as const) {
        expect(viaCan(action, row)).toBe(viaAliases(action, row));
      }
    }
  });

  it("maps each alias to its action", () => {
    const row = seed()[0];
    expect(resolveCan<Practice>({ canEdit: () => false })("edit", row)).toBe(false);
    expect(resolveCan<Practice>({ canEdit: () => false })("delete", row)).toBe(true);
    expect(resolveCan<Practice>({ canDelete: () => false })("edit", row)).toBe(true);
    expect(resolveCan<Practice>({ canDelete: () => false })("delete", row)).toBe(false);
    expect(resolveCan<Practice>({ canEditItem: () => false })("edit", row)).toBe(false);
    expect(resolveCan<Practice>({ canEditItem: () => false })("delete", row)).toBe(false);
  });

  it("requires every predicate when can and aliases are both given", () => {
    const row = seed()[0];
    expect(resolveCan<Practice>({ can: () => true, canEditItem: () => false })("edit", row)).toBe(false);
    expect(resolveCan<Practice>({ can: () => false, canEdit: () => true })("edit", row)).toBe(false);
    expect(resolveCan<Practice>({})("delete", row)).toBe(true);
  });
});

describe("ResourcePage — can(action, item)", () => {
  it("shows the same Edit / Delete buttons as the aliases, row by row", async () => {
    const seen: Record<string, [boolean, boolean]>[] = [];
    for (const props of [{ can: rule }, aliases]) {
      const { unmount } = renderPage({ onEdit: () => {}, onDelete: () => {}, ...props });
      const result: Record<string, [boolean, boolean]> = {};
      for (const row of seed()) {
        await openPeek(row.name);
        result[row.name] = [!!editButton(), !!deleteButton()];
        await closePeek();
      }
      unmount();
      seen.push(result);
    }
    expect(seen[0]).toEqual(seen[1]);
    expect(seen[0]).toEqual({
      Northside: [true, true],
      Southside: [true, false],
      Eastside: [false, false],
      Westside: [false, false],
    });
  });

  it("asks can with the action and the row", async () => {
    const can = vi.fn(() => true);
    renderPage({ onEdit: () => {}, onDelete: () => {}, can });
    await openPeek("Northside");
    expect(can).toHaveBeenCalledWith("edit", expect.objectContaining({ id: "1" }));
    expect(can).toHaveBeenCalledWith("delete", expect.objectContaining({ id: "1" }));
  });

  it("keeps the built-in edit form shut for a row can refuses", async () => {
    renderPage({
      allowEdit: true,
      can: (action, p) => action !== "edit" || !p.locked,
      formFields: [{ key: "name", label: "Name" }],
    });
    await openPeek("Southside");
    expect(editButton()).toBeNull();
  });
});

describe("ResourcePage — softDelete confirm copy", () => {
  async function openDialog() {
    await openPeek("Northside");
    fireEvent.click(deleteButton()!);
    return screen.findByRole("alertdialog");
  }

  it("a recycle-bin resource says the record moves to the bin, never that it can't be undone", async () => {
    const provider = withCapabilities(createMockProvider({ practices: seed() }), (r) => ({
      softDelete: r === "practices",
    }));
    renderPage({ allowDelete: true, confirmDelete: { noun: "practice" } }, provider);
    const dialog = await openDialog();
    await waitFor(() =>
      expect(within(dialog).getByText("The practice moves to the recycle bin.")).toBeTruthy(),
    );
    expect(within(dialog).getByText("Delete this practice?")).toBeTruthy();
    expect(within(dialog).queryByText("This can't be undone.")).toBeNull();
  });

  it("a hard delete keeps \"This can't be undone.\"", async () => {
    const provider = withCapabilities(createMockProvider({ practices: seed() }), () => ({
      softDelete: false,
    }));
    renderPage({ allowDelete: true }, provider);
    const dialog = await openDialog();
    expect(within(dialog).getByText("This can't be undone.")).toBeTruthy();
    expect(within(dialog).getByText("Delete this record?")).toBeTruthy();
  });

  it("the capabilities prop wins over the provider", async () => {
    const provider = withCapabilities(createMockProvider({ practices: seed() }), () => ({
      softDelete: true,
    }));
    renderPage({ allowDelete: true, capabilities: { softDelete: false } }, provider);
    const dialog = await openDialog();
    expect(within(dialog).getByText("This can't be undone.")).toBeTruthy();
  });

  it("the capabilities prop alone works for a caller's onDelete", async () => {
    renderPage({ onDelete: async () => {}, confirmDelete: true, capabilities: { softDelete: true } });
    const dialog = await openDialog();
    expect(within(dialog).getByText("The record moves to the recycle bin.")).toBeTruthy();
  });
});

describe("ResourcePage — delete failures reach the user", () => {
  it("an unconfirmed built-in delete that fails shows an error toast", async () => {
    const provider = createMockProvider({ practices: seed() });
    vi.spyOn(provider, "deleteOne").mockRejectedValue(new Error("You can't delete this practice."));
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderPage({ allowDelete: true, confirmDelete: false }, provider);
    await openPeek("Northside");
    fireEvent.click(deleteButton()!);
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("You can't delete this practice."),
    );
    // Still open: nothing was deleted.
    expect(screen.getByTestId("detail-panel-close")).toBeTruthy();
  });

  it("an unconfirmed onDelete whose promise rejects shows an error toast", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onDelete = vi.fn().mockRejectedValue(new Error("Nope"));
    renderPage({ onDelete });
    await openPeek("Northside");
    fireEvent.click(deleteButton()!);
    expect(onDelete).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Nope"));
  });

  it("a confirmed delete's failure stays in the dialog, not a toast", async () => {
    const provider = createMockProvider({ practices: seed() });
    vi.spyOn(provider, "deleteOne").mockRejectedValue(new Error("Not allowed"));
    renderPage({ allowDelete: true }, provider);
    await openPeek("Northside");
    fireEvent.click(deleteButton()!);
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect((await within(dialog).findByRole("alert")).textContent).toContain("Not allowed");
    expect(toastError).not.toHaveBeenCalled();
  });
});
