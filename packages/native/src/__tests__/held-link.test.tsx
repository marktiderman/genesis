// @feat:native-app-shell
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { createLinkHold, useHeldLink, type HeldLinkAuth } from "../held-link";

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

function harness(initial: HeldLinkAuth) {
  const hold = createLinkHold();
  const onRelease = vi.fn();
  const view = renderHook(({ auth }) => useHeldLink(hold, { auth, onRelease }), { initialProps: { auth: initial } });
  return { hold, onRelease, ...view };
}

describe("useHeldLink", () => {
  it("follows a link held while signed out, once, after sign-in", () => {
    const { hold, onRelease, rerender, result } = harness("pending");
    act(() => hold.hold("/clients/1"));
    rerender({ auth: "signedOut" });
    expect(result.current).toBe("/clients/1");
    expect(onRelease).not.toHaveBeenCalled();
    rerender({ auth: "signedIn" });
    expect(onRelease).toHaveBeenCalledWith("/clients/1");
    rerender({ auth: "signedIn" });
    expect(onRelease).toHaveBeenCalledTimes(1);
    expect(result.current).toBeNull();
  });

  it("drops a link that arrives while signed in: the router already opened it", () => {
    const { hold, onRelease, result } = harness("signedIn");
    act(() => hold.hold("/settings"));
    expect(onRelease).not.toHaveBeenCalled();
    expect(result.current).toBeNull();
  });

  it("drops a link from a cold start that turns out signed in", () => {
    const { hold, onRelease, rerender } = harness("pending");
    act(() => hold.hold("/clients/1"));
    rerender({ auth: "signedIn" });
    expect(onRelease).not.toHaveBeenCalled();
    expect(hold.peek()).toBeNull();
  });
});
