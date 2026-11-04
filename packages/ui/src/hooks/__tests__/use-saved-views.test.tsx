// @feat:persisted-ui-state
/**
 * useSavedViews on usePersistedUiState: a list saved under the same key still reads back,
 * save and delete write it, and a malformed list reads as none.
 */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useSavedViews } from "../use-saved-views";

beforeEach(() => localStorage.clear());

describe("useSavedViews", () => {
  it("reads views already saved under the key, keeping only well-formed ones", () => {
    localStorage.setItem(
      "map-views",
      JSON.stringify([{ id: "a", name: "Open", filters: { status: "open" } }, { id: 3, name: "bad" }]),
    );
    const { result } = renderHook(() => useSavedViews("map-views"));
    expect(result.current.savedViews).toEqual([{ id: "a", name: "Open", filters: { status: "open" } }]);
    expect(result.current.loadViewFilters("a")).toEqual({ status: "open" });
  });

  it("saves and deletes through storage, and two lists on one key stay in step", () => {
    const first = renderHook(() => useSavedViews("views"));
    const second = renderHook(() => useSavedViews("views"));
    act(() => first.result.current.saveView("Mine", { owner: "me" }));
    act(() => first.result.current.saveView("Late", { due: "past" }));
    expect(first.result.current.savedViews.map((v) => v.name)).toEqual(["Mine", "Late"]);
    expect(second.result.current.savedViews.map((v) => v.name)).toEqual(["Mine", "Late"]);
    expect(JSON.parse(localStorage.getItem("views")!)).toHaveLength(2);
    const id = first.result.current.savedViews[0]!.id;
    act(() => first.result.current.deleteView(id));
    expect(first.result.current.savedViews.map((v) => v.name)).toEqual(["Late"]);
  });

  it("reads a value that isn't a list as no views, and writes nothing on load", () => {
    localStorage.setItem("broken", "{not json");
    const { result } = renderHook(() => useSavedViews("broken"));
    expect(result.current.savedViews).toEqual([]);
    renderHook(() => useSavedViews("untouched"));
    expect(localStorage.getItem("untouched")).toBeNull();
  });
});
