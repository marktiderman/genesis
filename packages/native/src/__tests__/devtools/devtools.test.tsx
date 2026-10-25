// @feat:devtools-overlay
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Alert } from "react-native";
import { genesisBrand } from "@marktiderman/genesis-design-system";
import { createMockProvider } from "@marktiderman/genesis-core/provider";
import { GenesisNativeApp, type GenesisNativeAppProps } from "../../app";
import { buildDebugInfo, createDevtools, createHoldDetector, createShakeDetector } from "../../devtools";
import { createObservability } from "../../observability";
import { createUpdates, versionSignature } from "../../updates";
import { fakeSupabase, settle } from "../fakes";
import { fakeUpdates, memoryStorage } from "../updates/fakes";

afterEach(() => vi.restoreAllMocks());

const provider = createMockProvider({});

function setup(props: Partial<GenesisNativeAppProps> = {}) {
  return render(
    <GenesisNativeApp brand={genesisBrand} supabase={fakeSupabase({ user: { id: "user-9" } }).client} provider={provider} rejectionTracker={null} {...props}>
      <span data-testid="screens">screens</span>
    </GenesisNativeApp>,
  );
}

describe("createHoldDetector", () => {
  it("fires once when three fingers stay down for the hold, and re-arms when they lift", () => {
    const timers: (() => void)[] = [];
    const onTrigger = vi.fn();
    const hold = createHoldDetector({ onTrigger, setTimer: (run) => timers.push(run), clearTimer: () => timers.pop() });
    hold.touches(2);
    expect(timers).toHaveLength(0);
    hold.touches(3);
    hold.touches(3);
    expect(timers).toHaveLength(1);
    timers[0]!();
    expect(onTrigger).toHaveBeenCalledTimes(1);
    hold.touches(3);
    expect(timers).toHaveLength(1);
    hold.touches(0);
    hold.touches(3);
    expect(timers).toHaveLength(2);
  });

  it("cancels when a finger lifts before the hold", () => {
    let cleared = 0;
    const hold = createHoldDetector({ onTrigger: vi.fn(), setTimer: () => 1, clearTimer: () => void cleared++ });
    hold.touches(3);
    hold.touches(1);
    expect(cleared).toBe(1);
  });
});

describe("createShakeDetector", () => {
  it("needs several hard samples within the window, then waits out the cooldown", () => {
    let t = 0;
    const onShake = vi.fn();
    const shake = createShakeDetector({ onShake, now: () => t });
    const hard = { x: 2.5, y: 0, z: 1 };
    shake.sample({ x: 0, y: 0, z: 1 });
    shake.sample(hard);
    t = 100;
    shake.sample(hard);
    expect(onShake).not.toHaveBeenCalled();
    t = 200;
    shake.sample(hard);
    expect(onShake).toHaveBeenCalledTimes(1);
    for (t = 300; t < 900; t += 100) shake.sample(hard);
    expect(onShake).toHaveBeenCalledTimes(1);
  });
});

describe("buildDebugInfo", () => {
  it("lists the build, user id, server without its query, blocks, flags and recent activity, with unknowns printed", () => {
    const text = buildDebugInfo({
      at: 0,
      signature: versionSignature({ platform: "ios", application: { nativeApplicationVersion: "1.0.0", nativeBuildVersion: "3" } }),
      userId: "user-9",
      baseUrl: "https://x.supabase.co?apikey=sb_publishable_abcdefghijk",
      blocks: ["app-updates", "observability"],
      flags: { updates: true, label: "a@b.co" },
      recent: { breadcrumbs: [{ category: "navigation", message: "/(app)", timestamp: 0 }], errors: [{ at: 0, name: "Error", message: "x", source: "boundary", fatal: true }] },
    });
    expect(text).toContain("Version 1.0.0 (3)");
    expect(text).toContain("User user-9");
    expect(text).toContain("Server https://x.supabase.co\n");
    expect(text).toContain("Blocks app-updates, observability");
    expect(text).toContain("Flags updates=true, label=[email]");
    expect(text).toContain("fatal boundary Error: x");
    expect(text).toContain("navigation /(app)");
    expect(buildDebugInfo({ at: 0 })).toContain("Server unknown");
  });
});

describe("the devtools overlay", () => {
  it("mounts nothing and opens nothing unless enabled", () => {
    const devtools = createDevtools({ enabled: false });
    expect(devtools.Root).toBeUndefined();
    devtools.open();
    expect(devtools.getState().open).toBe(false);
  });

  it("shows the signature, channel, user id, blocks, flags and recent errors", async () => {
    const updates = createUpdates({ platform: "ios", application: { nativeApplicationVersion: "2.1.0", nativeBuildVersion: "8" }, updates: fakeUpdates({ channel: "preview" }), storage: memoryStorage(), channels: { enabled: true } });
    const observability = createObservability({ sinks: [] });
    const devtools = createDevtools({ enabled: true, updates, observability, baseUrl: "http://127.0.0.1:54421", flags: { updates: true } });
    setup({ blocks: [updates, observability, devtools] });
    await act(settle);
    observability.captureError(new Error("sync failed for a@b.co"), { source: "sync" });
    act(() => devtools.open());
    await act(settle);
    expect(screen.getByTestId("genesis-devtools-signature").textContent).toContain("Version 2.1.0 (8)");
    expect(screen.getByTestId("genesis-devtools-channel").textContent).toContain("preview");
    expect(screen.getByTestId("genesis-devtools-user").textContent).toContain("user-9");
    expect(screen.getByTestId("genesis-devtools-server").textContent).toContain("http://127.0.0.1:54421");
    expect(screen.getByTestId("genesis-devtools-blocks").textContent).toContain("app-updates, observability, devtools-overlay");
    expect(screen.getByTestId("genesis-devtools-flag-updates").textContent).toContain("true");
    expect(screen.getByTestId("genesis-devtools-error").textContent).toContain("sync failed for [email]");
    expect(screen.getByTestId("screens")).toBeTruthy();
  });

  it("copies the debug info through the app's copy", async () => {
    const copy = vi.fn();
    const devtools = createDevtools({ enabled: true, copy });
    setup({ blocks: [devtools] });
    await act(settle);
    act(() => devtools.open());
    fireEvent.click(screen.getByTestId("genesis-devtools-copy"));
    await act(settle);
    expect(copy.mock.calls[0]![0]).toContain("User user-9");
  });

  it("crash test throws a render error the shell catches and the observability block reports", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const captured: string[] = [];
    const observability = createObservability({ sinks: [{ name: "spy", captureError: (e, c) => void captured.push(`${c.source}:${e.message}`) }] });
    const devtools = createDevtools({ enabled: true, observability });
    const alert = vi.mocked(Alert.alert).mockImplementation((_t, _m, buttons) => buttons?.find((b) => b.style === "destructive")?.onPress?.());
    setup({ blocks: [observability, devtools] });
    await act(settle);
    act(() => devtools.open());
    act(() => fireEvent.click(screen.getByTestId("genesis-devtools-crash")));
    await act(settle);
    expect(alert).toHaveBeenCalled();
    expect(screen.getByTestId("genesis-fatal")).toBeTruthy();
    expect(captured).toEqual(["boundary:Devtools crash test: a render error on purpose."]);
    // Try again comes back to the screens, not to another crash.
    act(() => fireEvent.click(screen.getByTestId("genesis-fatal-retry")));
    await act(settle);
    expect(screen.getByTestId("screens")).toBeTruthy();
  });

  it("adds an item to the dev menu once", async () => {
    const addMenuItem = vi.fn();
    const devtools = createDevtools({ enabled: true, devSettings: { addMenuItem } });
    setup({ blocks: [devtools] });
    await act(settle);
    expect(addMenuItem).toHaveBeenCalledWith("Open devtools", expect.any(Function));
    act(() => addMenuItem.mock.calls[0]![1]());
    expect(devtools.getState().open).toBe(true);
  });

  it("close resolves only once the sheet has finished hiding (its onDismiss), so a screenshot after it shows the app", async () => {
    const devtools = createDevtools({ enabled: true });
    let closing: Promise<void> | undefined;
    let sheetUpWhenResolved: boolean | undefined;
    setup({
      blocks: [devtools],
      slots: {
        devtoolsFeedback: ({ close }) => (
          <button
            data-testid="feedback"
            onClick={() => {
              closing = Promise.resolve(close()).then(() => {
                sheetUpWhenResolved = screen.queryByTestId("genesis-devtools") !== null;
              });
            }}
          />
        ),
      },
    });
    await act(settle);
    act(() => devtools.open());
    expect(screen.getByTestId("genesis-devtools")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByTestId("feedback"));
      await closing;
    });
    expect(devtools.getState().open).toBe(false);
    expect(sheetUpWhenResolved).toBe(false);
    // Closed already: nothing to wait for.
    await expect(devtools.close()).resolves.toBeUndefined();
  });

  it("renders the devtoolsFeedback slot with the debug info", async () => {
    const devtools = createDevtools({ enabled: true });
    setup({ blocks: [devtools], slots: { devtoolsFeedback: ({ debugInfo }) => <span data-testid="feedback">{debugInfo.split("\n")[0]}</span> } });
    await act(settle);
    act(() => devtools.open());
    expect(screen.getByTestId("feedback").textContent).toMatch(/^Debug info /);
  });
});
