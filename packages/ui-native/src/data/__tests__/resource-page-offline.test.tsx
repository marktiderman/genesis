// @feat:native-app-shell
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The list's TanStack state, set per test. offlineFirst leaves a query with nothing saved
// `pending` and paused while offline: not loading, and not an empty list either.
const list = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock("@marktiderman/genesis-core/hooks", () => ({
  useResource: () => ({ list: list.current, setSearch: () => {}, setFilters: () => {} }),
}));

import { NativeResourcePage } from "../NativeResourcePage";

const base = { isLoading: false, isError: false, isPaused: false, isRefetching: false, data: undefined, error: null, refetch: vi.fn() };

describe("NativeResourcePage offline", () => {
  beforeEach(() => {
    list.current = { ...base };
  });

  it("says it is offline, not empty, while a list with nothing saved is paused", () => {
    list.current = { ...base, isPaused: true };
    render(<NativeResourcePage resource="clients" title="Clients" emptyState={<span>No clients yet</span>} />);
    expect(screen.getByTestId("native-resource-offline").textContent).toContain("offline");
    expect(screen.queryByText("No clients yet")).toBeNull();
  });

  it("keeps the search above the offline message, so clearing a search offline is still possible", () => {
    list.current = { ...base, isPaused: true };
    render(<NativeResourcePage resource="clients" title="Clients" searchFields={["name"]} searchPlaceholder="Search clients" />);
    expect(screen.getByTestId("native-resource-offline")).toBeTruthy();
    expect(screen.getByPlaceholderText("Search clients")).toBeTruthy();
  });

  it("keeps showing saved rows while paused", () => {
    list.current = { ...base, isPaused: true, data: { data: [{ id: "1", name: "Ada" }], total: 1 } };
    render(<NativeResourcePage resource="clients" title="Clients" cardFields={["name"]} />);
    expect(screen.queryByTestId("native-resource-offline")).toBeNull();
    expect(screen.getByText("Ada")).toBeTruthy();
  });

  it("takes the app's own offline state", () => {
    list.current = { ...base, isPaused: true };
    render(<NativeResourcePage resource="clients" title="Clients" offlineState={<span>Reconnect to see clients</span>} />);
    expect(screen.getByText("Reconnect to see clients")).toBeTruthy();
  });
});
