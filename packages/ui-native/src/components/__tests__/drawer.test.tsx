/**
 * Drawer unit tests — covers the PR #30 CR finding (PR #34 fixed) that
 * PanResponder closures captured stale `side` / `drawerWidth` /
 * `onOpenChange` from initial render. We can't actually drive a swipe
 * in the rn-mock env (PanResponder is stubbed to `{panHandlers:{}}`),
 * but we CAN assert the handler config is rebuilt when the props it
 * depends on change. That's the contract — `useMemo` keyed on the
 * right deps.
 */
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PanResponder } from "react-native";
import { NativeDrawer } from "../drawer";

describe("NativeDrawer", () => {
  it("rebuilds PanResponder when `side` changes (no stale closure)", () => {
    const spy = vi.spyOn(PanResponder, "create");
    const onOpenChange = vi.fn();

    const { rerender } = render(
      <NativeDrawer open onOpenChange={onOpenChange} side="left">
        <span data-testid="content">menu</span>
      </NativeDrawer>
    );
    const afterMount = spy.mock.calls.length;
    expect(afterMount).toBeGreaterThanOrEqual(1);

    rerender(
      <NativeDrawer open onOpenChange={onOpenChange} side="right">
        <span data-testid="content">menu</span>
      </NativeDrawer>
    );
    expect(spy.mock.calls.length).toBeGreaterThan(afterMount);

    spy.mockRestore();
  });

  it("rebuilds PanResponder when `width` changes", () => {
    const spy = vi.spyOn(PanResponder, "create");
    const onOpenChange = vi.fn();

    const { rerender } = render(
      <NativeDrawer open onOpenChange={onOpenChange} width={240}>
        <span>menu</span>
      </NativeDrawer>
    );
    const afterMount = spy.mock.calls.length;

    rerender(
      <NativeDrawer open onOpenChange={onOpenChange} width={320}>
        <span>menu</span>
      </NativeDrawer>
    );
    expect(spy.mock.calls.length).toBeGreaterThan(afterMount);
    spy.mockRestore();
  });

  it("PanResponder release handler closes drawer on far-enough swipe (uses fresh side)", () => {
    // Capture the latest config and drive its onPanResponderRelease with
    // a synthetic gesture state past the dismiss threshold for `side="right"`.
    // If the closure had baked in `side="left"` from a prior render, the
    // dx>0 swipe would NOT trigger dismiss (left-side drawer dismisses
    // on negative dx). The fact that it dismisses confirms the closure
    // is fresh.
    const configs: Array<Parameters<typeof PanResponder.create>[0]> = [];
    const spy = vi
      .spyOn(PanResponder, "create")
      .mockImplementation((cfg) => {
        configs.push(cfg);
        return { panHandlers: {} } as unknown as ReturnType<
          typeof PanResponder.create
        >;
      });

    const onOpenChange = vi.fn();
    const { rerender } = render(
      <NativeDrawer open onOpenChange={onOpenChange} side="left" width={300}>
        <span>menu</span>
      </NativeDrawer>
    );
    rerender(
      <NativeDrawer open onOpenChange={onOpenChange} side="right" width={300}>
        <span>menu</span>
      </NativeDrawer>
    );

    const latest = configs[configs.length - 1];
    expect(latest).toBeDefined();
    // For side="right", dismiss when dx > drawerWidth/3 == 100.
    latest?.onPanResponderRelease?.(
      {} as never,
      { dx: 150, dy: 0 } as never
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);

    spy.mockRestore();
  });
});
