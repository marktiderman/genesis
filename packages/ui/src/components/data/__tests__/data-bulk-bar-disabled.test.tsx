/**
 * DataBulkBar — the `disabled` field on a bulk action.
 *
 * A consumer running a bulk mutation (move / duplicate / delete) wants every
 * bulk action dead until it settles, so the user cannot double-fire a
 * destructive operation. The workaround without this field is an early return
 * inside `onClick`, which stops the second call but leaves the button looking
 * live. These tests pin both halves of the fix: the click really does not
 * reach `onClick`, AND the rendered control is visibly/assistively disabled.
 * The last case pins the back-compat half — omitting the field behaves as it
 * always has.
 */
import type { ComponentProps } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Trash2 } from "lucide-react";

import { DataBulkBar } from "../DataBulkBar";

function renderBar(actions: ComponentProps<typeof DataBulkBar>["actions"]) {
  return render(
    <DataBulkBar
      selected={new Set(["1", "2"])}
      totalCount={3}
      onToggleAll={() => {}}
      onClearSelection={() => {}}
      actions={actions}
    />
  );
}

describe("DataBulkBar — disabled actions", () => {
  it("does not fire onClick when a disabled action is clicked", () => {
    const onClick = vi.fn();
    renderBar([
      { label: "Delete", icon: Trash2, onClick, disabled: true },
    ]);

    fireEvent.click(screen.getByText("Delete"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("renders a disabled action with the native disabled attribute", () => {
    renderBar([
      { label: "Delete", icon: Trash2, onClick: () => {}, disabled: true },
    ]);

    const button = screen.getByRole("button", { name: /Delete/ });
    // Button's default (non-asChild) mode renders a real <button>, so the
    // state lands on the native attribute rather than aria-disabled.
    expect(button.hasAttribute("disabled")).toBe(true);
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("leaves an action without `disabled` fully clickable", () => {
    const onClick = vi.fn();
    renderBar([{ label: "Archive", icon: Trash2, onClick }]);

    const button = screen.getByRole("button", { name: /Archive/ });
    expect(button.hasAttribute("disabled")).toBe(false);

    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("disables only the actions that ask for it", () => {
    const onBlocked = vi.fn();
    const onLive = vi.fn();
    renderBar([
      { label: "Delete", icon: Trash2, onClick: onBlocked, disabled: true },
      { label: "Archive", icon: Trash2, onClick: onLive },
    ]);

    fireEvent.click(screen.getByRole("button", { name: /Delete/ }));
    fireEvent.click(screen.getByRole("button", { name: /Archive/ }));

    expect(onBlocked).not.toHaveBeenCalled();
    expect(onLive).toHaveBeenCalledTimes(1);
  });
});
