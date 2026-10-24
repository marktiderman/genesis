// @feat:native-app-shell
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
import type { ErrorUtilsLike } from "../errors";
import { fakeSupabase, flush, memoryStorage, type FakeSession } from "./fakes";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const provider = createMockProvider({});

function setup(props: Partial<GenesisNativeAppProps> = {}, session: FakeSession | null = { user: { id: "u1" } }) {
  const supabase = fakeSupabase(session);
  const splash = { preventAutoHideAsync: vi.fn(async () => true), hideAsync: vi.fn(async () => true) };
  let handler: ((error: unknown, isFatal?: boolean) => void) | undefined;
  const errorUtils: ErrorUtilsLike = { getGlobalHandler: () => handler, setGlobalHandler: (next) => void (handler = next) };
  const utils = render(
    <GenesisNativeApp brand={genesisBrand} supabase={supabase.client} provider={provider} splash={splash} errorUtils={errorUtils} {...props}>
      {props.children ?? <span data-testid="screens">screens</span>}
    </GenesisNativeApp>,
  );
  return { ...utils, supabase, splash, fireGlobal: (error: unknown, fatal: boolean) => handler?.(error, fatal) };
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

  it("shows the fatal screen when a step hangs, and Try again resumes the boot", async () => {
    vi.useFakeTimers();
    let hang = true;
    const onError = vi.fn();
    const { splash } = setup({
      steps: [{ id: "hydrate", run: () => (hang ? new Promise(() => {}) : undefined) }],
      bootOptions: { timeoutMs: 1000 },
      onError,
    });
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(screen.getByTestId("genesis-fatal")).toBeTruthy();
    expect(splash.hideAsync).toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ name: "BootTimeoutError" }), { fatal: true, source: "boot" });
    hang = false;
    await act(async () => {
      fireEvent.click(screen.getByTestId("genesis-fatal-retry"));
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

  it("catches a render error in the screens", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    function Broken(): never {
      throw new Error("screen broke");
    }
    setup({ children: <Broken /> });
    await act(flush);
    expect(screen.getByText("screen broke")).toBeTruthy();
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

  it("fills the updateBanner slot, which is empty by default", async () => {
    setup({ slots: { updateBanner: () => <span data-testid="banner" /> } });
    await act(flush);
    expect(screen.getByTestId("banner")).toBeTruthy();
  });

  it("lets the errorBoundary slot be dropped", async () => {
    setup({ slots: { errorBoundary: null } });
    await act(flush);
    expect(screen.queryByTestId("screens")).toBeNull();
  });

  it("clears the query cache and the saved copy on sign-out", async () => {
    const client = createNativeQueryClient();
    const storage = memoryStorage();
    const onSignedOut = vi.fn();
    const { supabase } = setup({ queryClient: { client, persist: { keys: ["clients"], buster: "1", throttleMs: 0 } }, storage, onSignedOut });
    await act(flush);
    client.setQueryData(["clients"], ["Ada"]);
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(storage.data.get("genesis-query-cache")).toContain("Ada");
    await act(async () => {
      supabase.emit("SIGNED_OUT", null);
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(client.getQueryData(["clients"])).toBeUndefined();
    expect(storage.data.get("genesis-query-cache") ?? "").not.toContain("Ada");
    expect(onSignedOut).toHaveBeenCalled();
  });

  it("restores the persisted cache before the screens render", async () => {
    const storage = memoryStorage();
    storage.data.set(
      "genesis-query-cache",
      JSON.stringify({
        buster: "1",
        timestamp: Date.now(),
        clientState: {
          mutations: [],
          queries: [{ queryKey: ["clients"], queryHash: '["clients"]', state: { data: ["Ada"], status: "success", dataUpdatedAt: Date.now(), dataUpdateCount: 1, error: null, errorUpdateCount: 0, errorUpdatedAt: 0, fetchFailureCount: 0, fetchFailureReason: null, fetchMeta: null, isInvalidated: false, fetchStatus: "idle" } }],
        },
      }),
    );
    function Clients() {
      const data = useQueryClient().getQueryData<string[]>(["clients"]);
      return <span data-testid="clients">{data?.join(",") ?? "none"}</span>;
    }
    setup({ storage, queryClient: { persist: { keys: ["clients"], buster: "1" } }, children: <Clients /> });
    await act(flush);
    expect(screen.getByTestId("clients").textContent).toBe("Ada");
  });

  it("releases a held link once signed in", async () => {
    const hold = createLinkHold();
    hold.hold("/clients/1");
    const onRelease = vi.fn();
    const { supabase } = setup({ links: { hold, onRelease } }, null);
    await act(flush);
    expect(onRelease).not.toHaveBeenCalled();
    act(() => supabase.emit("SIGNED_IN", { user: { id: "u1" } }));
    expect(onRelease).toHaveBeenCalledWith("/clients/1");
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
});
