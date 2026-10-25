// @feat:native-app-shell
import { useEffect, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useQueryClient } from "@tanstack/react-query";
import { genesisBrand } from "@marktiderman/genesis-design-system";
import { createMockProvider } from "@marktiderman/genesis-core/provider";
import { useKeyboardScroll } from "@marktiderman/genesis-ui-native/layouts";
import { GenesisNativeApp, type GenesisNativeAppProps } from "../app";
import { useBoot } from "../boot";
import { useSession } from "../auth";
import { createLinkHold } from "../held-link";
import { createNativeQueryClient } from "../query";
import { createQueryPersistence, persistQueries } from "../persist";
import type { EnableRejectionTracker, ErrorUtilsLike } from "../errors";
import { fakeSupabase, flush, memoryStorage, retryableFetchError, settle, type FakeSession, type FakeSupabaseOptions } from "./fakes";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const provider = createMockProvider({});

function setup(
  props: Partial<GenesisNativeAppProps> = {},
  session: FakeSession | null = { user: { id: "u1" } },
  supabaseOptions: FakeSupabaseOptions = {},
) {
  const supabase = fakeSupabase(session, supabaseOptions);
  const splash = { preventAutoHideAsync: vi.fn(async () => true), hideAsync: vi.fn(async () => true) };
  const previous = vi.fn();
  let handler: ((error: unknown, isFatal?: boolean) => void) | undefined = previous;
  const errorUtils: ErrorUtilsLike = { getGlobalHandler: () => handler, setGlobalHandler: (next) => void (handler = next) };
  const utils = render(
    <GenesisNativeApp
      brand={genesisBrand}
      supabase={supabase.client}
      provider={provider}
      splash={splash}
      errorUtils={errorUtils}
      rejectionTracker={null}
      {...props}
    >
      {props.children ?? <span data-testid="screens">screens</span>}
    </GenesisNativeApp>,
  );
  return { ...utils, supabase, splash, previous, fireGlobal: (error: unknown, fatal: boolean) => handler?.(error, fatal) };
}

/** A cache saved for `userId`, as a previous run of the app would have left it. */
async function savedCacheFor(userId: string) {
  const storage = memoryStorage();
  const client = createNativeQueryClient();
  const stop = createQueryPersistence({ queryClient: client, storage, keys: ["clients"], buster: "1", throttleMs: 0 }).subscribe(userId);
  client.setQueryData(["clients"], [`${userId}'s client`]);
  await settle();
  stop();
  return storage;
}

function Clients() {
  const data = useQueryClient().getQueryData<string[]>(["clients"]);
  return <span data-testid="clients">{data?.join(",") ?? "none"}</span>;
}

describe("GenesisNativeApp", () => {
  it("holds the splash until the steps and the session are done, then shows the screens", async () => {
    let finish!: () => void;
    const { splash } = setup({
      steps: [{ id: "fonts", run: () => new Promise<void>((resolve) => (finish = resolve)) }],
      slots: { boot: ({ status }) => <span data-testid="booting">{status}</span> },
    });
    await act(flush);
    expect(screen.getByTestId("booting").textContent).toBe("booting");
    expect(splash.hideAsync).not.toHaveBeenCalled();
    await act(async () => {
      finish();
      await flush();
    });
    expect(screen.getByTestId("screens")).toBeTruthy();
    expect(splash.hideAsync).toHaveBeenCalledTimes(1);
  });

  it("shows the fatal screen when a step hangs; Try again shows the loading view, then the screens", async () => {
    vi.useFakeTimers();
    let unstick!: () => void;
    let finish!: () => void;
    const onError = vi.fn();
    const { splash } = setup({
      steps: [{ id: "hydrate", run: () => new Promise<void>((r) => (unstick = r)) }, { id: "fonts", run: () => new Promise<void>((r) => (finish = r)) }],
      bootOptions: { timeoutMs: 1000 },
      onError,
    });
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(screen.getByTestId("genesis-fatal")).toBeTruthy();
    expect(splash.hideAsync).toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ name: "BootTimeoutError" }), { fatal: true, source: "boot" });
    // The abandoned run finishes late; the retry counts it and moves on to the next step.
    unstick();
    await act(async () => {
      fireEvent.click(screen.getByTestId("genesis-fatal-retry"));
      await vi.advanceTimersByTimeAsync(0);
    });
    // The splash is gone, so a retry shows something rather than a blank screen.
    expect(screen.getByTestId("genesis-boot")).toBeTruthy();
    await act(async () => {
      finish();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByTestId("screens")).toBeTruthy();
  });

  it("turns a fatal global error into the fatal slot, and Try again remounts the screens", async () => {
    const onError = vi.fn();
    const { fireGlobal } = setup({
      onError,
      slots: { fatal: ({ error, retry }) => <button data-testid="custom-fatal" onClick={retry}>{error.message}</button> },
    });
    await act(flush);
    act(() => fireGlobal(new Error("native crash"), true));
    expect(screen.getByTestId("custom-fatal").textContent).toBe("native crash");
    expect(onError).toHaveBeenCalledWith(expect.any(Error), { fatal: true, source: "global" });
    fireEvent.click(screen.getByTestId("custom-fatal"));
    expect(screen.getByTestId("screens")).toBeTruthy();
  });

  it("lets a second fatal error reach the default handler, so the app restarts instead of hanging", async () => {
    const { fireGlobal, previous } = setup();
    await act(flush);
    act(() => fireGlobal(new Error("first"), true));
    expect(screen.getByTestId("genesis-fatal")).toBeTruthy();
    act(() => fireGlobal(new Error("second"), true));
    expect(previous).toHaveBeenCalledWith(expect.objectContaining({ message: "second" }), true);
  });

  it("falls back to the plain fatal screen when the fatal slot itself throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { fireGlobal } = setup({
      slots: {
        fatal: () => {
          throw new Error("fatal slot broke");
        },
      },
    });
    await act(flush);
    act(() => fireGlobal(new Error("native crash"), true));
    expect(screen.getByTestId("genesis-fatal-plain")).toBeTruthy();
    fireEvent.click(screen.getByTestId("genesis-fatal-plain-retry"));
    expect(screen.getByTestId("screens")).toBeTruthy();
  });

  it("shows the plain fatal screen when the shell can't start (a step id clashes with its own)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onError = vi.fn();
    setup({ steps: [{ id: "genesis:session", run: () => {} }], onError });
    await act(flush);
    expect(screen.getByTestId("genesis-fatal-plain")).toBeTruthy();
    expect(screen.getByText(/listed twice/)).toBeTruthy();
    expect(onError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ source: "boundary" }));
  });

  it("catches a render error in the screens", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    function Broken(): never {
      throw new Error("screen broke");
    }
    setup({ children: <Broken /> });
    await act(flush);
    expect(screen.getByText("screen broke")).toBeTruthy();
  });

  it("reports unhandled promise rejections through the tracker", async () => {
    let options: Parameters<EnableRejectionTracker>[0] | undefined;
    const onError = vi.fn();
    setup({ onError, rejectionTracker: (o) => void (options = o) });
    await act(flush);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    options?.onUnhandled(1, new Error("unawaited"));
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "unawaited" }), { fatal: false, source: "rejection" });
  });

  it("renders the signedOut slot for a signed-out user, and the screens once signed in", async () => {
    const { supabase } = setup({ slots: { signedOut: () => <span data-testid="sign-in" /> } }, null);
    await act(flush);
    expect(screen.getByTestId("sign-in")).toBeTruthy();
    act(() => supabase.emit("SIGNED_IN", { user: { id: "u1" } }));
    expect(screen.getByTestId("screens")).toBeTruthy();
  });

  it("renders the screens for a signed-out user by default, for an expo-router redirect", async () => {
    function Status() {
      return <span data-testid="status">{useSession().status}</span>;
    }
    setup({ children: <Status /> }, null);
    await act(flush);
    expect(screen.getByTestId("status").textContent).toBe("signedOut");
  });

  it("opens offline with the stored session instead of the fatal screen", async () => {
    vi.useFakeTimers();
    function Status() {
      const { status, offline } = useSession();
      return <span data-testid="status">{`${status}:${offline}`}</span>;
    }
    setup({ children: <Status />, sessionWaitMs: 3000 }, null, { hang: true, stored: { user: { id: "u1" } } });
    await act(() => vi.advanceTimersByTimeAsync(3000));
    expect(screen.getByTestId("status").textContent).toBe("signedIn:true");
  });

  it("opens offline after a network error from the refresh, too", async () => {
    function Status() {
      return <span data-testid="status">{useSession().status}</span>;
    }
    setup({ children: <Status /> }, null, { error: retryableFetchError(), stored: { user: { id: "u1" } } });
    await act(flush);
    expect(screen.getByTestId("status").textContent).toBe("signedIn");
  });

  it("renders the updates slots only with the updates block", async () => {
    setup({ slots: { updateBanner: () => <span data-testid="banner" /> } });
    await act(flush);
    expect(screen.getByTestId("screens")).toBeTruthy();
    expect(screen.queryByTestId("banner")).toBeNull();
  });

  it("lets the errorBoundary slot be dropped", async () => {
    setup({ slots: { errorBoundary: null } });
    await act(flush);
    expect(screen.queryByTestId("screens")).toBeNull();
  });

  it("restores the persisted cache for the same user before the screens render", async () => {
    const storage = await savedCacheFor("u1");
    setup({ persist: persistQueries({ storage, keys: ["clients"], buster: "1" }), children: <Clients /> });
    await act(flush);
    expect(screen.getByTestId("clients").textContent).toBe("u1's client");
  });

  it("doesn't restore a cache when the session ended while the app was closed, and deletes it", async () => {
    const storage = await savedCacheFor("a");
    setup({ persist: persistQueries({ storage, keys: ["clients"], buster: "1" }), children: <Clients /> }, null);
    await act(flush);
    expect(screen.getByTestId("clients").textContent).toBe("none");
    expect(storage.data.has("genesis-query-cache")).toBe(false);
  });

  it("doesn't restore another user's cache", async () => {
    const storage = await savedCacheFor("a");
    setup({ persist: persistQueries({ storage, keys: ["clients"], buster: "1" }), children: <Clients /> }, { user: { id: "b" } });
    await act(flush);
    expect(screen.getByTestId("clients").textContent).toBe("none");
  });

  it("clears the cache, and the saved copy, on an account switch and on sign-out", async () => {
    const client = createNativeQueryClient();
    const storage = memoryStorage();
    const onSignedOut = vi.fn();
    const { supabase } = setup(
      { queryClient: { client }, persist: persistQueries({ storage, keys: ["clients"], buster: "1", throttleMs: 0 }), onSignedOut },
      { user: { id: "a" } },
    );
    await act(flush);
    client.setQueryData(["clients"], ["A's client"]);
    await act(settle);
    expect(storage.data.get("genesis-query-cache")).toContain("A's client");

    await act(async () => {
      supabase.emit("SIGNED_IN", { user: { id: "b" } });
      await settle();
    });
    expect(client.getQueryData(["clients"])).toBeUndefined();
    expect(storage.data.get("genesis-query-cache") ?? "").not.toContain("A's client");
    expect(onSignedOut).not.toHaveBeenCalled();

    client.setQueryData(["clients"], ["B's client"]);
    await act(settle);
    await act(async () => {
      supabase.emit("SIGNED_OUT", null);
      await settle();
    });
    expect(client.getQueryData(["clients"])).toBeUndefined();
    expect(storage.data.get("genesis-query-cache") ?? "").not.toContain("B's client");
    expect(onSignedOut).toHaveBeenCalledTimes(1);
  });

  it("follows a link held while signed out, after sign-in", async () => {
    const hold = createLinkHold();
    hold.hold("/clients/1");
    const onRelease = vi.fn();
    const { supabase } = setup({ links: { hold, onRelease } }, null);
    await act(flush);
    expect(onRelease).not.toHaveBeenCalled();
    act(() => supabase.emit("SIGNED_IN", { user: { id: "u1" } }));
    expect(onRelease).toHaveBeenCalledWith("/clients/1");
  });

  it("doesn't navigate again for a link that opened while signed in", async () => {
    const hold = createLinkHold();
    hold.hold("/clients/1");
    const onRelease = vi.fn();
    setup({ links: { hold, onRelease } });
    await act(flush);
    act(() => hold.hold("/settings"));
    expect(onRelease).not.toHaveBeenCalled();
    expect(hold.peek()).toBeNull();
  });

  it("provides the keyboard-aware scroll view and the boot status", async () => {
    const Scroll = () => null;
    function Probe() {
      const boot = useBoot();
      return <span data-testid="probe">{`${boot.status}:${useKeyboardScroll() === Scroll}`}</span>;
    }
    setup({ keyboardScroll: Scroll, children: <Probe /> });
    await act(flush);
    expect(screen.getByTestId("probe").textContent).toBe("ready:true");
  });

  it("mounts the keyboard provider once, around the screens and the fatal screen", async () => {
    const mounts = vi.fn();
    function Keyboard({ children }: { children: ReactNode }) {
      useEffect(() => mounts(), []);
      return <div data-testid="keyboard">{children}</div>;
    }
    const { fireGlobal } = setup({ keyboardProvider: Keyboard, keyboardScroll: () => null });
    await act(flush);
    expect(screen.getByTestId("keyboard").contains(screen.getByTestId("screens"))).toBe(true);
    // A fatal error swaps the screens for the fatal screen inside the provider; it stays mounted.
    act(() => fireGlobal(new Error("boom"), true));
    expect(screen.getByTestId("keyboard").contains(screen.getByTestId("genesis-fatal"))).toBe(true);
    expect(mounts).toHaveBeenCalledOnce();
  });

  it("mounts the bottom-sheet provider only when the app passes the library in", async () => {
    const mounted = vi.fn();
    const bottomSheet = {
      BottomSheetModalProvider: ({ children }: { children: ReactNode }) => {
        mounted();
        return <div data-testid="sheet-provider">{children}</div>;
      },
      BottomSheetModal: () => null,
      BottomSheetView: () => null,
      BottomSheetBackdrop: () => null,
    };
    const first = setup({});
    await act(flush);
    expect(screen.queryByTestId("sheet-provider")).toBeNull();
    first.unmount();
    setup({ bottomSheet });
    await act(flush);
    expect(screen.getByTestId("sheet-provider").contains(screen.getByTestId("screens"))).toBe(true);
    expect(mounted).toHaveBeenCalled();
  });

  it("keeps the first keyboard provider, so an inline one can't remount the app", async () => {
    const shellMounts = vi.fn();
    function Probe() {
      useEffect(() => shellMounts(), []);
      return <span data-testid="screens">screens</span>;
    }
    const element = (n: number) => (
      <GenesisNativeApp brand={genesisBrand} supabase={fakeSupabase({ user: { id: "u1" } }).client} provider={provider} rejectionTracker={null}
        keyboardProvider={({ children }) => <div data-testid={`keyboard-${n}`}>{children}</div>}>
        <Probe />
      </GenesisNativeApp>
    );
    const { rerender } = render(element(1));
    await act(flush);
    rerender(element(2));
    await act(flush);
    expect(screen.getByTestId("keyboard-1")).toBeTruthy();
    expect(shellMounts).toHaveBeenCalledOnce();
  });

  it("is quiet when keyboardScroll comes with its provider", async () => {
    vi.stubGlobal("__DEV__", true);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      setup({ keyboardProvider: ({ children }) => <>{children}</>, keyboardScroll: () => null });
      await act(flush);
      expect(error).not.toHaveBeenCalledWith(expect.stringContaining("keyboardProvider"));
    } finally {
      error.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("says so in development when keyboardScroll has no keyboardProvider", async () => {
    vi.stubGlobal("__DEV__", true);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      setup({ keyboardScroll: () => null });
      await act(flush);
      expect(error).toHaveBeenCalledWith(expect.stringContaining("keyboardProvider"));
    } finally {
      error.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});
