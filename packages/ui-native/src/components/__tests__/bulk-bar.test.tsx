import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NativeBulkBar } from "../bulk-bar";

describe("NativeBulkBar", () => {
  it("renders nothing while nothing is selected", () => {
    render(<NativeBulkBar selected={new Set()} totalCount={3} onToggleAll={() => {}} onClearSelection={() => {}} actions={[]} />);
    expect(screen.queryByTestId("native-bulk-bar")).toBeNull();
  });

  it("shows the count, runs actions, toggles all and clears", () => {
    const archive = vi.fn();
    const onToggleAll = vi.fn();
    const onClear = vi.fn();
    render(
      <NativeBulkBar
        selected={new Set(["a", "b"])}
        totalCount={3}
        onToggleAll={onToggleAll}
        onClearSelection={onClear}
        actions={[
          { label: "Archive", icon: "copy", onClick: archive, testId: "bulk-archive" },
          { label: "Delete", icon: "trash", onClick: () => {}, variant: "destructive", disabled: true, testId: "bulk-delete" },
        ]}
      />,
    );
    expect(screen.getByText("2 selected")).toBeTruthy();
    fireEvent.click(screen.getByTestId("bulk-archive"));
    expect(archive).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("bulk-delete").getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(screen.getByTestId("native-bulk-bar-all"));
    expect(onToggleAll).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("native-bulk-bar-clear"));
    expect(onClear).toHaveBeenCalled();
  });
});
