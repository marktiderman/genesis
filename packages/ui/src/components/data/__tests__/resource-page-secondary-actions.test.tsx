/**
 * `secondaryActions` — the header's action budget.
 *
 * The shape this exists to protect: ONE primary button, everything else in a
 * single overflow menu. A header with three or four top-level buttons squeezes
 * its own title to an ellipsis at real viewport widths — a downstream question
 * bank rendered its title as "Que…" for exactly that reason.
 *
 * Before this prop the only way to get a fourth action was `actions`, an
 * opaque `ReactNode` slot each surface filled itself, so every surface spent
 * the budget differently and one of them forked the whole header. Taking the
 * actions as DATA is what lets the header keep the budget on the surface's
 * behalf rather than asking it to.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GenesisProvider } from "../../../provider";
import { ResourcePage } from "../ResourcePage";

interface Post {
  [key: string]: unknown;
  id: string;
  title: string;
}

const rows: Post[] = [{ id: "1", title: "Alpha" }];

beforeEach(() => {
  localStorage.clear();
});

/** Radix's trigger opens on pointerdown, not click. */
function openMenu() {
  fireEvent.pointerDown(
    screen.getByTestId("page-header-more-actions"),
    new PointerEvent("pointerdown", { bubbles: true, button: 0, ctrlKey: false }),
  );
}

function renderWith(secondaryActions: Parameters<typeof ResourcePage>[0]["secondaryActions"]) {
  return render(
    <GenesisProvider mock={{ datasets: {} }}>
      <ResourcePage<Post>
        title="Posts"
        data={rows}
        total={1}
        columns={["title"]}
        secondaryActions={secondaryActions}
      />
    </GenesisProvider>,
  );
}

describe("PageHeader secondaryActions", () => {
  it("keeps them out of the header until the menu opens", async () => {
    renderWith([
      { label: "Generate", onClick: () => {}, testId: "generate" },
      { label: "Import", onClick: () => {}, testId: "import" },
    ]);

    // The budget: neither is a top-level button.
    expect(screen.queryByTestId("generate")).toBeNull();
    expect(screen.queryByTestId("import")).toBeNull();
    expect(screen.getByTestId("page-header-more-actions")).toBeTruthy();
  });

  it("reveals and fires them from the overflow menu", async () => {
    const onClick = vi.fn();
    renderWith([{ label: "Generate", onClick, testId: "generate" }]);

    openMenu();
    fireEvent.click(await screen.findByTestId("generate"));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("omits a `hidden` action rather than showing a dead entry", async () => {
    // The case: "Review drafts" when there are no drafts. Filtering here
    // instead of at the call site is what stops every call site from growing
    // its own conditional array.
    renderWith([
      { label: "Review drafts", onClick: () => {}, testId: "review", hidden: true },
      { label: "Import", onClick: () => {}, testId: "import" },
    ]);

    openMenu();

    expect(await screen.findByTestId("import")).toBeTruthy();
    expect(screen.queryByTestId("review")).toBeNull();
  });

  it("renders no menu at all when every action is hidden", () => {
    // A trigger that opens an empty menu is a control that does nothing.
    renderWith([
      { label: "Review drafts", onClick: () => {}, hidden: true },
    ]);

    expect(screen.queryByTestId("page-header-more-actions")).toBeNull();
  });
});
