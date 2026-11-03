// @vitest-environment happy-dom
// @feat:inbox-thread
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JUMP_SETTLE_MS, useThreadJump } from "../conversation/use-thread-jump";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const setup = (initial: { target: string | null; ids: string[]; loading?: boolean; loadUntil?: (id: string) => Promise<boolean> }) => {
  const scrollTo = vi.fn();
  const onGone = vi.fn();
  const onLanded = vi.fn();
  const hook = renderHook(
    (p: typeof initial) => useThreadJump({ target: p.target, has: (id) => p.ids.includes(id), loading: p.loading, loadUntil: p.loadUntil, scrollTo, onGone, onLanded }),
    { initialProps: initial },
  );
  return { ...hook, scrollTo, onGone, onLanded };
};

describe("useThreadJump", () => {
  it("goes to a held row and highlights it for two seconds", () => {
    const { result, scrollTo, onLanded } = setup({ target: "b", ids: ["a", "b"] });
    expect(scrollTo).toHaveBeenCalledWith("b");
    expect(onLanded).toHaveBeenCalledWith("b");
    expect(result.current.highlightedId).toBe("b");
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.highlightedId).toBeNull();
  });

  it("waits for the first page before deciding", () => {
    const { rerender, scrollTo, onGone } = setup({ target: "b", ids: [], loading: true });
    act(() => vi.advanceTimersByTime(1000));
    expect(onGone).not.toHaveBeenCalled();
    rerender({ target: "b", ids: ["a", "b"], loading: false });
    expect(scrollTo).toHaveBeenCalledWith("b");
  });

  it("finds a row that arrives a moment after loadUntil resolves", async () => {
    const loadUntil = vi.fn(async () => true);
    const { rerender, scrollTo, onGone } = setup({ target: "old", ids: ["a"], loadUntil });
    await act(async () => {});
    expect(loadUntil).toHaveBeenCalledWith("old");
    act(() => vi.advanceTimersByTime(JUMP_SETTLE_MS / 2));
    rerender({ target: "old", ids: ["old", "a"], loadUntil });
    expect(scrollTo).toHaveBeenCalledWith("old");
    act(() => vi.advanceTimersByTime(JUMP_SETTLE_MS));
    expect(onGone).not.toHaveBeenCalled();
  });

  it("says a row is gone once the rows have had their moment", async () => {
    const loadUntil = vi.fn(async () => false);
    const { scrollTo, onGone } = setup({ target: "gone", ids: ["a"], loadUntil });
    await act(async () => {});
    act(() => vi.advanceTimersByTime(JUMP_SETTLE_MS));
    expect(onGone).toHaveBeenCalledWith("gone");
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("goes again to the same row after the target was cleared", () => {
    const { rerender, scrollTo } = setup({ target: "b", ids: ["a", "b"] });
    rerender({ target: null, ids: ["a", "b"] });
    rerender({ target: "b", ids: ["a", "b"] });
    expect(scrollTo).toHaveBeenCalledTimes(2);
  });
});
