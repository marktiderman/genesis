// @feat:native-app-shell
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { createLinkHold, useHeldLink } from "../held-link";

describe("createLinkHold", () => {
  it("holds the latest link until taken", () => {
    const hold = createLinkHold();
    hold.hold("/a");
    hold.hold("/b");
    expect(hold.peek()).toBe("/b");
    expect(hold.take()).toBe("/b");
    expect(hold.take()).toBeNull();
  });
});

describe("useHeldLink", () => {
  it("releases the held link once ready, once", () => {
    const hold = createLinkHold();
    hold.hold("/clients/1");
    const onRelease = vi.fn();
    const { result, rerender } = renderHook(({ ready }) => useHeldLink(hold, { ready, onRelease }), { initialProps: { ready: false } });
    expect(result.current).toBe("/clients/1");
    expect(onRelease).not.toHaveBeenCalled();
    rerender({ ready: true });
    expect(onRelease).toHaveBeenCalledWith("/clients/1");
    rerender({ ready: true });
    expect(onRelease).toHaveBeenCalledTimes(1);
    expect(result.current).toBeNull();
  });

  it("releases a link that arrives while ready", () => {
    const hold = createLinkHold();
    const onRelease = vi.fn();
    renderHook(() => useHeldLink(hold, { ready: true, onRelease }));
    act(() => hold.hold("/settings"));
    expect(onRelease).toHaveBeenCalledWith("/settings");
  });
});
