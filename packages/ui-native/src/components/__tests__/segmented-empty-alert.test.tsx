/**
 * Combined small-component tests: segmented control, empty state,
 * inline alert, banner, section list header. One smoke test each
 * covering the primary render + (where applicable) interaction.
 */
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NativeSegmentedControl } from "../segmented-control";
import { NativeEmptyState } from "../empty-state";
import { NativeInlineAlert, NativeBanner } from "../inline-alert";
import { NativeSectionListHeader } from "../section-list";

function Segmented() {
  const [v, setV] = useState<"a" | "b" | "c">("a");
  return (
    <NativeSegmentedControl<"a" | "b" | "c">
      testID="seg"
      options={[
        { value: "a", label: "A" },
        { value: "b", label: "B" },
        { value: "c", label: "C" },
      ]}
      value={v}
      onChange={setV}
    />
  );
}

describe("Small primitives", () => {
  it("segmented control selects an option", () => {
    render(<Segmented />);
    expect(screen.getByTestId("seg-option-a").getAttribute("aria-selected")).toBe(
      "true"
    );
    fireEvent.click(screen.getByTestId("seg-option-c"));
    expect(screen.getByTestId("seg-option-c").getAttribute("aria-selected")).toBe(
      "true"
    );
  });

  it("empty state renders variant-specific defaults", () => {
    render(
      <NativeEmptyState
        variant="error"
        description="Could not load."
      />
    );
    const node = screen.getByTestId("empty-state-error");
    expect(node.textContent).toContain("Something went wrong");
    expect(node.textContent).toContain("Could not load.");
  });

  it("inline alert dismiss fires callback", () => {
    const onDismiss = vi.fn();
    render(
      <NativeInlineAlert
        testID="alert"
        variant="warning"
        title="Heads up"
        onDismiss={onDismiss}
      />
    );
    fireEvent.click(screen.getByTestId("alert-dismiss"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("banner renders a header role", () => {
    render(
      <NativeBanner testID="b" variant="info" title="Note" description="x" />
    );
    expect(screen.getByTestId("b")).toBeTruthy();
  });

  it("section list header renders title", () => {
    render(<NativeSectionListHeader title="General" testID="hdr" />);
    expect(screen.getByTestId("hdr").textContent).toBe("General");
  });
});
