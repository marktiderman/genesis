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

  it("cancels a jump in progress when the target becomes null", async () => {
    let resolve: (v: boolean) => void = () => {};
    const loadUntil = vi.fn(() => new Promise<boolean>((r) => (resolve = r)));
    const { result, rerender, onGone } = setup({ target: "old", ids: ["a"], loadUntil });
    expect(result.current.jumping).toBe(true);
    rerender({ target: null, ids: ["a"], loadUntil });
    expect(result.current.jumping).toBe(false);
    await act(async () => resolve(false));
    act(() => vi.advanceTimersByTime(JUMP_SETTLE_MS * 2));
    expect(onGone).not.toHaveBeenCalled();
  });

  describe("cancel", () => {
    it("drops a jump waiting on its load: no scroll when the row arrives, nothing gone, and not jumping", async () => {
      let resolve: (v: boolean) => void = () => {};
      const loadUntil = vi.fn(() => new Promise<boolean>((r) => (resolve = r)));
      const { result, rerender, scrollTo, onGone } = setup({ target: "old", ids: ["a"], loadUntil });
      expect(result.current.jumping).toBe(true);
      act(() => result.current.cancel());
      expect(result.current.jumping).toBe(false);
      await act(async () => resolve(true));
      rerender({ target: "old", ids: ["old", "a"], loadUntil });
      act(() => vi.advanceTimersByTime(JUMP_SETTLE_MS * 2));
      expect(scrollTo).not.toHaveBeenCalled();
      expect(onGone).not.toHaveBeenCalled();
    });

    it("drops a jump in its last moment before it's called gone", async () => {
      const loadUntil = vi.fn(async () => false);
      const { result, onGone } = setup({ target: "gone", ids: ["a"], loadUntil });
      await act(async () => {});
      act(() => result.current.cancel());
      act(() => vi.advanceTimersByTime(JUMP_SETTLE_MS * 2));
      expect(onGone).not.toHaveBeenCalled();
    });

    it("lets the same row be gone to again after null", () => {
      const { result, rerender, scrollTo } = setup({ target: "old", ids: ["a"], loadUntil: () => new Promise(() => undefined) });
      act(() => result.current.cancel());
      rerender({ target: null, ids: ["old", "a"] });
      rerender({ target: "old", ids: ["old", "a"] });
      expect(scrollTo).toHaveBeenCalledWith("old");
    });
  });

  it("gives up on time in a busy thread, whatever rows keep arriving", async () => {
    const loadUntil = vi.fn(async () => false);
    const { rerender, onGone } = setup({ target: "old", ids: ["a"], loadUntil });
    await act(async () => {});
    for (let i = 0; i < 5; i++) {
      act(() => vi.advanceTimersByTime(JUMP_SETTLE_MS / 4));
      rerender({ target: "old", ids: ["a", `n${i}`], loadUntil });
    }
    expect(onGone).toHaveBeenCalledWith("old");
  });
});
