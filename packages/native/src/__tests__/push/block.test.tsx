// @feat:push
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { genesisBrand } from "@marktiderman/genesis-design-system";
import { createMockProvider } from "@marktiderman/genesis-core/provider";
import { GenesisNativeApp, type GenesisNativeAppProps } from "../../app";
import type { ErrorUtilsLike } from "../../errors";
import { createLinkHold } from "../../held-link";
import { useBlockSettings } from "../../blocks";
import { createPush, usePushPrompt, useSuppressNotifications, type PushOptions } from "../../push";
import { fakeSupabase, memoryStorage, settle } from "../fakes";
import { fakeAppState, fakeBackend, fakeNotifications, permission, tap } from "./fakes";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const provider = createMockProvider({});
const errorUtils: ErrorUtilsLike = { getGlobalHandler: () => undefined, setGlobalHandler: () => {} };

function setup(options: Partial<PushOptions> & { user?: string | null } = {}, props: Partial<GenesisNativeAppProps> = {}) {
  const n = options.notifications ? null : fakeNotifications();
  const b = fakeBackend();
  const storage = (options.storage as ReturnType<typeof memoryStorage>) ?? memoryStorage();
  const errors: string[] = [];
  const push = createPush({
    notifications: n?.module,
    platform: "ios",
    projectId: "00000000-0000-4000-8000-00000000eeee",
    appVersion: "1.2.0",
    backend: b.backend,
    storage,
    categories: [{ id: "messages", title: "Messages" }, { id: "digest", title: "Weekly digest", defaultOn: false }],
    onError: (e, source) => errors.push(`${source}: ${e.message}`),
    ...options,
  });
  const supabase = fakeSupabase(options.user === null ? null : { user: { id: options.user ?? "u1" } });
  const utils = render(
    <GenesisNativeApp brand={genesisBrand} supabase={supabase.client} provider={provider} errorUtils={errorUtils} rejectionTracker={null} blocks={[push]} {...props}>
      {props.children ?? <span data-testid="screens">screens</span>}
    </GenesisNativeApp>,
  );
  return { ...utils, push, n: n!, b, storage, errors, supabase };
}

describe("the push block: registration follows the session", () => {
  it("registers this device's token for the signed-in person once permission is granted, and never asks at launch", async () => {
    const { n, b, storage } = setup();
    await act(settle);
    expect(n.module.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: "00000000-0000-4000-8000-00000000eeee" });
    expect(b.calls).toEqual(["register ExponentPushToken[device-1] ios 1.2.0"]);
    expect(JSON.parse(storage.data.get("genesis:push:device")!)).toMatchObject({ token: "ExponentPushToken[device-1]", userId: "u1" });
    expect(n.module.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it("asks nothing and registers nothing while permission is undetermined", async () => {
    const n = fakeNotifications({ status: permission.undetermined });
    const { b } = setup({ notifications: n.module });
    await act(settle);
    expect(n.module.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(n.module.getExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(b.calls).toEqual([]);
  });

  it("says once, loudly, that a build without an EAS project id gets no token", async () => {
    const { n, b, errors, push } = setup({ projectId: "" });
    await act(settle);
    expect(n.module.getExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(b.calls).toEqual([]);
    expect(errors.filter((e) => e.includes("no EAS project id"))).toHaveLength(1);
    expect(push.registration.getState()).toEqual({ status: "unavailable", problem: "no_project_id" });
  });

  it("forgets the token, clears the badge and hides pushes on sign-out", async () => {
    const { n, b, supabase, storage } = setup();
    await act(settle);
    act(() => supabase.emit("SIGNED_OUT", null));
    await act(settle);
    expect(b.calls).toEqual(["register ExponentPushToken[device-1] ios 1.2.0", "forget ExponentPushToken[device-1]"]);
    expect(n.module.setBadgeCountAsync).toHaveBeenCalledWith(0);
    expect(storage.data.has("genesis:push:device")).toBe(false);
    expect(await n.present({ url: "/x" })).toEqual({ shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false });
  });

  it("keeps a forget that failed offline and retries it at the next start", async () => {
    const first = setup();
    await act(settle);
    first.b.backend.forget.mockRejectedValueOnce(new Error("Failed to fetch"));
    act(() => first.supabase.emit("SIGNED_OUT", null));
    await act(settle);
    expect(JSON.parse(first.storage.data.get("genesis:push:forget")!)).toEqual(["ExponentPushToken[device-1]"]);
    first.unmount();
    const second = setup({ storage: first.storage, user: null });
    await act(settle);
    expect(second.b.calls).toEqual(["forget ExponentPushToken[device-1]"]);
    expect(second.storage.data.has("genesis:push:forget")).toBe(false);
  });

  it("never lets a stale offline forget undo a later registration of the same token", async () => {
    const first = setup();
    await act(settle);
    first.b.backend.forget.mockRejectedValueOnce(new Error("Failed to fetch"));
    act(() => first.supabase.emit("SIGNED_OUT", null));
    await act(settle);
    act(() => first.supabase.emit("SIGNED_IN", { user: { id: "u1" } }));
    await act(settle);
    expect(first.storage.data.has("genesis:push:forget")).toBe(false);
    await act(() => first.push.registration.flush());
    // Only the forget that failed offline was ever tried; the token is registered again and stays.
    expect(first.b.backend.forget).toHaveBeenCalledTimes(1);
    expect(first.b.calls.filter((c) => c.startsWith("forget"))).toEqual([]);
  });

  it("registers again for the new person when the account switches", async () => {
    const { b, supabase } = setup();
    await act(settle);
    act(() => supabase.emit("SIGNED_IN", { user: { id: "u2" } }));
    await act(settle);
    expect(b.calls).toEqual(["register ExponentPushToken[device-1] ios 1.2.0", "forget ExponentPushToken[device-1]", "register ExponentPushToken[device-1] ios 1.2.0"]);
  });

  it("registers the new token when the OS rotates it", async () => {
    const { n, b } = setup();
    await act(settle);
    n.setToken("ExponentPushToken[device-2]");
    n.setDeviceToken("raw-2");
    act(() => n.emitToken());
    await act(settle);
    expect(b.calls).toEqual(["register ExponentPushToken[device-1] ios 1.2.0", "register ExponentPushToken[device-2] ios 1.2.0", "forget ExponentPushToken[device-1]"]);
  });

  it("registers once, not in a loop, when fetching the token tells the token listener (as Expo does)", async () => {
    const n = fakeNotifications({ echoDeviceToken: true });
    const { b } = setup({ notifications: n.module });
    await act(settle);
    await act(settle);
    expect(b.calls).toEqual(["register ExponentPushToken[device-1] ios 1.2.0"]);
    expect(n.module.getExpoPushTokenAsync.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it("on Android, makes the channels (private on the lock screen) before the permission prompt and the token", async () => {
    const n = fakeNotifications({ status: permission.undetermined });
    const { push } = setup({ notifications: n.module, platform: "android" });
    await act(settle);
    await act(() => push.permission.request());
    await act(settle);
    expect(n.order).toEqual(["channel:default", "channel:messages", "channel:digest", "request", "token"]);
    expect(n.module.setNotificationChannelAsync).toHaveBeenCalledWith("messages", { name: "Messages", importance: 5, description: null, lockscreenVisibility: 2, showBadge: true });
  });
});

describe("the push block: taps", () => {
  const links = (onRelease = vi.fn()) => ({ hold: createLinkHold(), onRelease });

  it("opens the tap that launched the app, through the link map, once", async () => {
    const n = fakeNotifications({ last: tap("/messages/42") });
    const onOpen = vi.fn();
    setup({ notifications: n.module, onOpen, links: { map: { "/messages/:id": "/messages/:id" } } });
    // Boot, the session read and the launch-tap lookup take more than one settle on a slow runner.
    await vi.waitFor(async () => {
      await act(settle);
      expect(onOpen).toHaveBeenCalledWith("/messages/42");
    });
    expect(n.module.clearLastNotificationResponse).toHaveBeenCalled();
    act(() => n.emitResponse(tap("/messages/42")));
    await act(settle);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("sends a path the app doesn't know to /, and follows no other app's URL", async () => {
    const n = fakeNotifications();
    const onOpen = vi.fn();
    setup({ notifications: n.module, onOpen, links: { schemes: ["acme"], map: { "/settings": "/settings" } } });
    await act(settle);
    act(() => n.emitResponse(tap("/nowhere", "a")));
    act(() => n.emitResponse(tap("https://evil.example/settings", "b")));
    await act(settle);
    expect(onOpen.mock.calls).toEqual([["/"], ["/"]]);
  });

  it("without a link map, follows only a plain app path", async () => {
    const n = fakeNotifications();
    const onOpen = vi.fn();
    setup({ notifications: n.module, onOpen });
    await act(settle);
    for (const [i, url] of ["/ok?x=1", "//evil.example", "javascript:alert(1)", "/a/../b", 42].entries()) act(() => n.emitResponse(tap(url, `t${i}`)));
    await act(settle);
    expect(onOpen.mock.calls).toEqual([["/ok?x=1"]]);
  });

  it("routes only a tap on the notification itself; an action goes to onResponse", async () => {
    const n = fakeNotifications();
    const onOpen = vi.fn();
    const onResponse = vi.fn();
    setup({ notifications: n.module, onOpen, onResponse });
    await act(settle);
    act(() => n.emitResponse(tap("/x", "z", "reply")));
    await act(settle);
    expect(onOpen).not.toHaveBeenCalled();
    expect(onResponse).toHaveBeenCalledWith(expect.objectContaining({ actionIdentifier: "reply" }));
  });

  it("holds a tap made while signed out and opens it after sign-in (GenesisNativeApp's held link)", async () => {
    const n = fakeNotifications({ last: tap("/settings") });
    const l = links();
    const { supabase } = setup({ notifications: n.module, user: null, hold: l.hold }, { links: l });
    await act(settle);
    expect(l.hold.peek()).toBe("/settings");
    expect(l.onRelease).not.toHaveBeenCalled();
    act(() => supabase.emit("SIGNED_IN", { user: { id: "u1" } }));
    await act(settle);
    expect(l.onRelease).toHaveBeenCalledWith("/settings");
  });

  it("says so, never silently, when a tap has nowhere to go", async () => {
    const signedIn = setup({ notifications: fakeNotifications({ last: tap("/settings") }).module });
    await act(settle);
    expect(signedIn.errors.join("\n")).toContain("pass `onOpen`");
    signedIn.unmount();
    const signedOut = setup({ notifications: fakeNotifications({ last: tap("/settings", "n2") }).module, onOpen: vi.fn(), user: null });
    await act(settle);
    expect(signedOut.errors.join("\n")).toContain("pass `hold`");
  });
});

describe("the push block: as a block", () => {
  it("contributes a Notifications row with the permission as its subtitle, and reads the permission behind the splash", async () => {
    const n = fakeNotifications({ status: permission.denied });
    const navigate = vi.fn();
    function Settings() {
      const sections = useBlockSettings([], { navigate });
      return (
        <ul>
          {sections.flatMap((s) => s.rows).map((r) => (
            <li key={r.id} data-testid={r.testID} onClick={r.onPress}>
              {r.title}: {r.subtitle}
            </li>
          ))}
        </ul>
      );
    }
    const { push } = setup({ notifications: n.module }, { children: <Settings /> });
    await act(settle);
    expect(push.id).toBe("push");
    expect(push.bootSteps.map((s) => s.id)).toEqual(["genesis:push"]);
    expect(screen.getByTestId("genesis-push-settings").textContent).toBe("Notifications: Off in Settings");
    fireEvent.click(screen.getByTestId("genesis-push-settings"));
    expect(navigate).toHaveBeenCalledWith("/settings/notifications");
  });

  it("drops the row with settingsRow: false", () => {
    const push = createPush({ platform: "ios", backend: fakeBackend().backend, settingsRow: false });
    expect(push.contributes?.settings).toEqual([]);
  });
});

describe("the push block: coming back to the front", () => {
  it("retries a forget that failed offline, and registers again if the last try failed", async () => {
    const appState = fakeAppState();
    const first = setup({ appState });
    await act(settle);
    first.b.backend.forget.mockRejectedValueOnce(new Error("Failed to fetch"));
    act(() => first.supabase.emit("SIGNED_OUT", null));
    await act(settle);
    expect(first.storage.data.has("genesis:push:forget")).toBe(true);
    act(() => appState.emit("active"));
    await act(settle);
    expect(first.storage.data.has("genesis:push:forget")).toBe(false);
    expect(first.b.calls.at(-1)).toBe("forget ExponentPushToken[device-1]");

    first.b.backend.register.mockRejectedValueOnce(new Error("Failed to fetch"));
    act(() => first.supabase.emit("SIGNED_IN", { user: { id: "u2" } }));
    await act(settle);
    expect(first.push.registration.getState().status).toBe("error");
    act(() => appState.emit("active"));
    await act(settle);
    expect(first.push.registration.getState().status).toBe("registered");
  });
});

describe("the push block: foreground", () => {
  it("shows a push while the app is open, unless a screen hides its kind", async () => {
    const n = fakeNotifications();
    function Thread() {
      useSuppressNotifications((data) => data.threadId === "42");
      return null;
    }
    setup({ notifications: n.module }, { children: <Thread /> });
    await act(settle);
    expect(await n.present({ threadId: "7" })).toEqual({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true });
    expect(await n.present({ threadId: "42" })).toMatchObject({ shouldShowBanner: false, shouldShowList: false });
  });

  it("removes its handler when it stops", async () => {
    const { n, unmount } = setup();
    await act(settle);
    unmount();
    expect(n.module.setNotificationHandler).toHaveBeenLastCalledWith(null);
  });
});

describe("the push block: the soft prompt", () => {
  function Offer({ onResult }: { onResult: (shown: boolean) => void }) {
    const prompt = usePushPrompt();
    return (
      <button data-testid="offer" onClick={() => void prompt.offer("when someone replies").then(onResult)}>
        offer
      </button>
    );
  }

  function promptSetup(status = permission.undetermined, start = 0) {
    let clock = start;
    const n = fakeNotifications({ status });
    const results: boolean[] = [];
    const s = setup({ notifications: n.module, now: () => clock, prompt: { launchGraceMs: 10_000, cooldownMs: 1000, maxDeclines: 2 } }, { children: <Offer onResult={(r) => results.push(r)} /> });
    return { ...s, n, results, advance: (ms: number) => void (clock += ms) };
  }

  it("is ignored at launch, then shows the sheet with the reason; Turn on brings up the system prompt and registers", async () => {
    const { n, b, results, advance } = promptSetup();
    await act(settle);
    fireEvent.click(screen.getByTestId("offer"));
    await act(settle);
    expect(results).toEqual([false]);
    expect(screen.queryByTestId("genesis-push-prompt")).toBeNull();
    advance(10_000);
    fireEvent.click(screen.getByTestId("offer"));
    await act(settle);
    expect(results).toEqual([false, true]);
    expect(screen.getByTestId("genesis-push-prompt-body").textContent).toContain("when someone replies");
    // Centred in the sheet, not stacked at the top of a full-height page sheet.
    expect(JSON.parse(screen.getByTestId("genesis-push-prompt-content").dataset.style ?? "{}")).toMatchObject({ flexGrow: 1, justifyContent: "center" });
    expect(n.module.requestPermissionsAsync).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("genesis-push-prompt-accept"));
    await act(settle);
    expect(n.module.requestPermissionsAsync).toHaveBeenCalledWith({ ios: { allowAlert: true, allowBadge: true, allowSound: true } });
    expect(b.calls).toEqual(["register ExponentPushToken[device-1] ios 1.2.0"]);
    expect(screen.queryByTestId("genesis-push-prompt")).toBeNull();
  });

  it("after Not now waits out the cooldown, and stops offering after maxDeclines", async () => {
    const { n, results, advance, storage } = promptSetup(permission.undetermined);
    await act(settle);
    advance(10_000);
    const offer = async () => {
      fireEvent.click(screen.getByTestId("offer"));
      await act(settle);
    };
    await offer();
    fireEvent.click(screen.getByTestId("genesis-push-prompt-decline"));
    await act(settle);
    await offer();
    advance(1000);
    await offer();
    fireEvent.click(screen.getByTestId("genesis-push-prompt-decline"));
    await act(settle);
    advance(5000);
    await offer();
    expect(results).toEqual([true, false, true, false]);
    expect(JSON.parse(storage.data.get("genesis:push:prompt")!)).toMatchObject({ count: 2 });
    expect(n.module.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it("a dismissal that fires as the sheet closes after Turn on is not a Not now", async () => {
    const { advance, storage, push } = promptSetup();
    await act(settle);
    advance(10_000);
    fireEvent.click(screen.getByTestId("offer"));
    await act(settle);
    fireEvent.click(screen.getByTestId("genesis-push-prompt-accept"));
    await act(() => push.prompt.decline());
    expect(storage.data.has("genesis:push:prompt")).toBe(false);
  });

  it("never offers once the system won't ask again, or when already granted", async () => {
    for (const status of [permission.denied, permission.granted]) {
      const { results, advance, unmount } = promptSetup(status);
      await act(settle);
      advance(20_000);
      fireEvent.click(screen.getByTestId("offer"));
      await act(settle);
      expect(results).toEqual([false]);
      unmount();
    }
  });
});
