/**
 * EmptyState — filter-state precedence + the deprecated `/data` alias.
 *
 * The branch under test suppresses what the caller passed: when
 * `hasFilters` is true the heading is replaced with fixed copy, the
 * description is dropped, and — only if `onClearFilters` is also given —
 * the caller's `action` is swapped for a "Clear all filters" button. Every
 * one of those is a silent behaviour change if it regresses: the component
 * still renders something plausible, just not what the caller asked for.
 *
 * The last block pins the convergence itself. `@marktiderman/genesis-ui/data`
 * used to ship a SECOND EmptyState implementation; it is now a re-export of
 * this one, so the two names must be the same function object, and the props
 * that variant offered must still drive this one.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { EmptyState } from "../empty-state";
import { EmptyState as DataEmptyState } from "../../data/EmptyState";

const FILTERED_COPY = "No results match your filters";

describe("EmptyState — default state", () => {
  it("renders the caller's title, description and action", () => {
    render(
      <EmptyState
        title="Nothing here"
        description="Add your first item to get started."
        action={<button type="button">Create</button>}
      />
    );

    expect(screen.getByRole("heading").textContent).toBe("Nothing here");
    expect(
      screen.getByText("Add your first item to get started.")
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create" })).toBeTruthy();
  });

  it("falls back title -> message -> generic default", () => {
    const { rerender } = render(<EmptyState message="No items found" />);
    expect(screen.getByRole("heading").textContent).toBe("No items found");

    // `title` wins when both are given.
    rerender(<EmptyState title="Real title" message="No items found" />);
    expect(screen.getByRole("heading").textContent).toBe("Real title");

    rerender(<EmptyState />);
    expect(screen.getByRole("heading").textContent).toBe("No results found");
  });
});

describe("EmptyState — filter-state precedence", () => {
  it("overrides the caller title and suppresses the description", () => {
    render(
      <EmptyState
        hasFilters
        title="Nothing here"
        description="Add your first item to get started."
      />
    );

    expect(screen.getByRole("heading").textContent).toBe(FILTERED_COPY);
    expect(screen.queryByText("Nothing here")).toBeNull();
    expect(
      screen.queryByText("Add your first item to get started.")
    ).toBeNull();
  });

  it("overrides the deprecated `message` heading too", () => {
    render(<EmptyState hasFilters message="No items found" />);
    expect(screen.getByRole("heading").textContent).toBe(FILTERED_COPY);
    expect(screen.queryByText("No items found")).toBeNull();
  });

  it("keeps the caller's action when onClearFilters is absent", () => {
    render(
      <EmptyState hasFilters action={<button type="button">Create</button>} />
    );

    expect(screen.getByRole("button", { name: "Create" })).toBeTruthy();
    expect(screen.queryByTestId("empty-state-clear-filters")).toBeNull();
  });

  it("replaces the caller's action with clear-filters and invokes it on click", () => {
    const onClearFilters = vi.fn();
    render(
      <EmptyState
        hasFilters
        onClearFilters={onClearFilters}
        action={<button type="button">Create</button>}
      />
    );

    // The caller's action is gone, not rendered alongside.
    expect(screen.queryByRole("button", { name: "Create" })).toBeNull();

    const clear = screen.getByTestId("empty-state-clear-filters");
    expect(clear.textContent).toBe("Clear all filters");

    fireEvent.click(clear);
    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });

  it("does not render a clear-filters action when there are no active filters", () => {
    const onClearFilters = vi.fn();
    render(<EmptyState onClearFilters={onClearFilters} title="Nothing here" />);

    expect(screen.getByRole("heading").textContent).toBe("Nothing here");
    expect(screen.queryByTestId("empty-state-clear-filters")).toBeNull();
  });
});

describe("EmptyState — deprecated `/data` alias", () => {
  it("is the very same component, not a second implementation", () => {
    expect(DataEmptyState).toBe(EmptyState);
  });

  it("still honours the props the `/data` variant offered", () => {
    const onClearFilters = vi.fn();
    const { rerender } = render(<DataEmptyState message="No items found" />);
    expect(screen.getByRole("heading").textContent).toBe("No items found");

    // The pattern DataPageShell / ResourcePage rely on: toggle `hasFilters`
    // on an already-mounted instance.
    rerender(<DataEmptyState message="No items found" hasFilters onClearFilters={onClearFilters} />);
    expect(screen.getByRole("heading").textContent).toBe(FILTERED_COPY);

    fireEvent.click(screen.getByTestId("empty-state-clear-filters"));
    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });
});
