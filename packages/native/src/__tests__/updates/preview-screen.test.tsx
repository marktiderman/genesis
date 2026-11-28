// @feat:native-previews
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { genesisBrand } from "@marktiderman/genesis-design-system";
import { createMockProvider } from "@marktiderman/genesis-core/provider";
import { GenesisNativeApp } from "../../app";
import type { ErrorUtilsLike } from "../../errors";
import { PreviewScreen, createUpdates, previewPhoneLines } from "../../updates";
import { fakeSupabase, settle } from "../fakes";
import { fakeUpdates, memoryStorage } from "./fakes";

afterEach(() => vi.restoreAllMocks());

const application = { nativeApplicationVersion: "1.2.0", nativeBuildVersion: "12" };
const provider = createMockProvider({});

function mount(updates: ReturnType<typeof createUpdates>, child: React.ReactNode) {
  let handler: ((error: unknown, isFatal?: boolean) => void) | undefined;
  const errorUtils: ErrorUtilsLike = { getGlobalHandler: () => handler, setGlobalHandler: (next) => void (handler = next) };
  const app = (node: React.ReactNode) => (
    <GenesisNativeApp brand={genesisBrand} supabase={fakeSupabase({ user: { id: "u1" } }).client} provider={provider} errorUtils={errorUtils} rejectionTracker={null} updates={updates}>
      {node}
    </GenesisNativeApp>
  );
  const utils = render(app(child));
  return { ...utils, rerenderWith: (node: React.ReactNode) => utils.rerender(app(node)) };
}

describe("PreviewScreen", () => {
  it("starts over on pr-1 → pr-2 → pr-1, and a pr-1 download from the first attempt doesn't land", async () => {
    const fake = fakeUpdates({ next: { id: "x" } });
    const updates = createUpdates({ platform: "ios", application, policyTimeoutMs: 50, updates: fake, storage: memoryStorage(), channels: { enabled: true } });
    const done = vi.fn();
    const { rerenderWith } = mount(updates, <PreviewScreen channel="pr-1" onDone={done} />);
    await act(settle);
    // After the launch check: the preview's check waits until the test lets it finish.
    let finish!: () => void;
    fake.checkForUpdateAsync.mockImplementationOnce(() => new Promise((resolve) => (finish = () => resolve({ isAvailable: true, isRollBackToEmbedded: false } as never))));
    fireEvent.click(screen.getByTestId("genesis-preview-primary"));
    await act(settle);
    expect(screen.getByText("Loading pr-1…")).toBeTruthy();
    rerenderWith(<PreviewScreen channel="pr-2" onDone={done} />);
    rerenderWith(<PreviewScreen channel="pr-1" onDone={done} />);
    await act(settle);
    // Back on pr-1, but a new attempt: it asks again (the phone already follows pr-1, from the first attempt).
    expect(screen.queryByText("Loading pr-1…")).toBeNull();
    expect(screen.getByText("You're on pr-1")).toBeTruthy();
    await act(async () => {
      finish();
      await settle();
    });
    expect(screen.queryByText("Preview ready")).toBeNull();
    expect(screen.getByText("You're on pr-1")).toBeTruthy();
  });

  it("backs out of a failed download on Not now, so the next launch doesn't run the preview", async () => {
    const fake = fakeUpdates({ checkError: new Error("network down") });
    const storage = memoryStorage();
    const updates = createUpdates({ platform: "ios", application, policyTimeoutMs: 50, updates: fake, storage, channels: { enabled: true } });
    const done = vi.fn();
    mount(updates, <PreviewScreen channel="pr-5" onDone={done} />);
    await act(settle);
    fireEvent.click(screen.getByTestId("genesis-preview-primary"));
    await act(settle);
    expect(screen.getByText("Couldn't open the preview")).toBeTruthy();
    fireEvent.click(screen.getByTestId("genesis-preview-cancel"));
    await act(settle);
    expect(done).toHaveBeenCalled();
    await expect(updates.channels.requested()).resolves.toBeNull();
    expect(fake.setUpdateRequestHeadersOverride).toHaveBeenLastCalledWith(null);
  });

  it("says a preview may still be publishing, and the next try loads it once it is", async () => {
    const fake = fakeUpdates({ next: { id: "x" } });
    const updates = createUpdates({ platform: "ios", application, policyTimeoutMs: 50, updates: fake, storage: memoryStorage(), channels: { enabled: true } });
    mount(updates, <PreviewScreen channel="pr-7" onDone={vi.fn()} />);
    await act(settle);
    fake.checkForUpdateAsync.mockResolvedValueOnce({ isAvailable: false, isRollBackToEmbedded: false, reason: "noUpdateAvailableOnServer" } as never);
    fireEvent.click(screen.getByTestId("genesis-preview-primary"));
    await act(settle);
    expect(screen.getByText("pr-7 isn't on this phone yet")).toBeTruthy();
    expect(screen.getByText(/may still be publishing/)).toBeTruthy();
    expect(screen.getByTestId("genesis-preview-leave")).toBeTruthy();
    fake.checkForUpdateAsync.mockResolvedValueOnce({ isAvailable: true, isRollBackToEmbedded: false } as never);
    fireEvent.click(screen.getByTestId("genesis-preview-primary"));
    await act(settle);
    expect(screen.getByText("Preview ready")).toBeTruthy();
  });

  it("backs out on Not now after a retry fails, when the phone didn't follow the preview before", async () => {
    const fake = fakeUpdates({ next: { id: "x" } });
    const updates = createUpdates({ platform: "ios", application, policyTimeoutMs: 50, updates: fake, storage: memoryStorage(), channels: { enabled: true } });
    const done = vi.fn();
    mount(updates, <PreviewScreen channel="pr-8" onDone={done} />);
    await act(settle);
    fake.checkForUpdateAsync.mockResolvedValueOnce({ isAvailable: false, isRollBackToEmbedded: false, reason: "noUpdateAvailableOnServer" } as never);
    fireEvent.click(screen.getByTestId("genesis-preview-primary"));
    await act(settle);
    fake.checkForUpdateAsync.mockRejectedValueOnce(new Error("network down"));
    fireEvent.click(screen.getByTestId("genesis-preview-primary"));
    await act(settle);
    expect(screen.getByText("Couldn't open the preview")).toBeTruthy();
    fireEvent.click(screen.getByTestId("genesis-preview-cancel"));
    await act(settle);
    expect(done).toHaveBeenCalled();
    await expect(updates.channels.requested()).resolves.toBeNull();
  });
});

describe("a deleted preview channel", () => {
  it("heals at the launch check: the override goes, and the next launch is on the build's channel", async () => {
    const fake = fakeUpdates({ channel: "pr-3", checkError: new Error("There is no channel named pr-3.") });
    const storage = memoryStorage({ "genesis:updates:channel": "pr-3", "genesis:updates:channel:build": "production" });
    const onError = vi.fn();
    const updates = createUpdates({ platform: "ios", application, policyTimeoutMs: 50, updates: fake, storage, channels: { enabled: true }, onError });
    await updates.checker.check();
    await act(settle);
    expect(onError).toHaveBeenCalled();
    expect(fake.setUpdateRequestHeadersOverride).toHaveBeenLastCalledWith(null);
    await expect(updates.channels.requested()).resolves.toBeNull();
  });
});

describe("the preview notice", () => {
  it("drops a stuck leave's problem once a new preview is picked", async () => {
    let allow = false;
    const fake = fakeUpdates({ next: { id: "x" } });
    const updates = createUpdates({ platform: "ios", application, policyTimeoutMs: 50, updates: fake, storage: memoryStorage({ "genesis:updates:channel": "pr-1" }), channels: { enabled: true }, canReload: () => allow });
    mount(updates, <span>screens</span>);
    await act(settle);
    fireEvent.click(screen.getByTestId("genesis-preview-notice"));
    await act(settle);
    expect(screen.getByTestId("genesis-preview-notice-problem").textContent).toMatch(/Save or discard/);
    await act(async () => {
      await updates.channels.prepare("pr-2");
      await settle();
    });
    expect(screen.queryByTestId("genesis-preview-notice-problem")).toBeNull();
    expect(screen.getByLabelText("Preview pr-2. Leave the preview")).toBeTruthy();
    allow = true;
  });
});

describe("the checker's downloads and the preview record", () => {
  it("never records a release update whose download started before the preview was picked", async () => {
    const storage = memoryStorage();
    const fake = fakeUpdates({ next: { id: "release-x" } });
    let finish!: () => void;
    fake.fetchUpdateAsync.mockImplementationOnce(() => new Promise((resolve) => (finish = () => resolve({ isNew: true, isRollBackToEmbedded: false, manifest: { id: "release-x" } } as never))));
    const updates = createUpdates({ platform: "ios", application, policyTimeoutMs: 50, updates: fake, storage, channels: { enabled: true } });
    // The release download starts on the build's channel…
    const checking = updates.checker.check();
    await act(settle);
    expect(updates.checker.getState().status).toBe("downloading");
    // …a preview is picked while it runs (through the switcher, as a link does)…
    fake.fetchUpdateAsync.mockResolvedValueOnce({ isNew: true, isRollBackToEmbedded: false, manifest: { id: "pr-6-a" } } as never);
    await updates.channels.prepare("pr-6");
    // …then the release download finishes, and the banner is dismissed.
    finish();
    await checking;
    await act(settle);
    updates.checker.dismiss();
    await act(settle);
    expect(JSON.parse(storage.data.get("genesis:updates:channel:preview-update")!).channels["pr-6"]).toEqual(["pr-6-a"]);
  });

  it("records a preview's download that finishes after the person left it", async () => {
    const storage = memoryStorage({ "genesis:updates:channel": "pr-6" });
    const fake = fakeUpdates({ next: { id: "pr-6-b" }, channel: "pr-6" });
    let finish!: () => void;
    fake.fetchUpdateAsync.mockImplementationOnce(() => new Promise((resolve) => (finish = () => resolve({ isNew: true, isRollBackToEmbedded: false, manifest: { id: "pr-6-b" } } as never))));
    const updates = createUpdates({ platform: "ios", application, policyTimeoutMs: 50, updates: fake, storage, channels: { enabled: true }, canReload: () => false });
    await updates.channels.state();
    const checking = updates.checker.check();
    await act(settle);
    // Leaving overlaps the download (the reload is blocked, so nothing restarts yet).
    await updates.channels.reset();
    finish();
    await checking;
    await act(settle);
    expect(JSON.parse(storage.data.get("genesis:updates:channel:preview-update")!).channels["pr-6"]).toContain("pr-6-b");
  });

  it("records a download the checker finishes with a preview open", async () => {
    const storage = memoryStorage({ "genesis:updates:channel": "pr-6" });
    const fake = fakeUpdates({ next: { id: "pr-6-b" }, channel: "pr-6" });
    const updates = createUpdates({ platform: "ios", application, policyTimeoutMs: 50, updates: fake, storage, channels: { enabled: true } });
    await updates.channels.state();
    await updates.checker.check();
    await act(settle);
    expect(JSON.parse(storage.data.get("genesis:updates:channel:preview-update")!).channels["pr-6"]).toContain("pr-6-b");
  });

  it("leaving waits for a preview download still running, so the restart can't beat its record", async () => {
    const storage = memoryStorage({ "genesis:updates:channel": "pr-6" });
    const fake = fakeUpdates({ next: { id: "pr-6-c" }, channel: "pr-6" });
    let finish!: () => void;
    fake.fetchUpdateAsync.mockImplementationOnce(() => new Promise((resolve) => (finish = () => resolve({ isNew: true, isRollBackToEmbedded: false, manifest: { id: "pr-6-c" } } as never))));
    const updates = createUpdates({ platform: "ios", application, policyTimeoutMs: 50, updates: fake, storage, channels: { enabled: true } });
    await updates.channels.state();
    const checking = updates.checker.check();
    await act(settle);
    // Leave while the download runs; nothing blocks the reload.
    const leaving = updates.channels.reset();
    await act(settle);
    expect(fake.reloadAsync).not.toHaveBeenCalled();
    finish();
    await checking;
    await act(async () => {
      await leaving;
    });
    expect(fake.reloadAsync).toHaveBeenCalledTimes(1);
    expect(JSON.parse(storage.data.get("genesis:updates:channel:preview-update")!).channels["pr-6"]).toContain("pr-6-c");
  });

  it("doesn't restart when the download's record couldn't be saved: Leave answers an error to retry", async () => {
    const storage = memoryStorage({ "genesis:updates:channel": "pr-6" });
    const setItem = storage.setItem as unknown as { mockImplementation: (f: (k: string, v: string) => Promise<void>) => void };
    setItem.mockImplementation(async (key, value) => {
      if (key.endsWith(":preview-update")) throw new Error("disk full");
      storage.data.set(key, value);
    });
    const fake = fakeUpdates({ next: { id: "pr-6-d" }, channel: "pr-6" });
    let finish!: () => void;
    fake.fetchUpdateAsync.mockImplementationOnce(() => new Promise((resolve) => (finish = () => resolve({ isNew: true, isRollBackToEmbedded: false, manifest: { id: "pr-6-d" } } as never))));
    const updates = createUpdates({ platform: "ios", application, policyTimeoutMs: 50, updates: fake, storage, channels: { enabled: true } });
    await updates.channels.state();
    const checking = updates.checker.check();
    await act(settle);
    const leaving = updates.channels.reset();
    finish();
    await checking;
    await expect(leaving).resolves.toMatchObject({ kind: "error" });
    expect(fake.reloadAsync).not.toHaveBeenCalled();
    // Trying again while the disk is still full: still refused.
    await expect(updates.channels.reset()).resolves.toMatchObject({ kind: "error" });
    expect(fake.reloadAsync).not.toHaveBeenCalled();
    // Once it can be saved, the next try saves it first, then restarts.
    setItem.mockImplementation(async (key, value) => void storage.data.set(key, value));
    await expect(updates.channels.reset()).resolves.toEqual({ kind: "reloading" });
    expect(JSON.parse(storage.data.get("genesis:updates:channel:preview-update")!).channels["pr-6"]).toContain("pr-6-d");
  });

  it("a record that failed before leaving still holds the first Leave until it's saved", async () => {
    const storage = memoryStorage({ "genesis:updates:channel": "pr-6" });
    const setItem = storage.setItem as unknown as { mockImplementation: (f: (k: string, v: string) => Promise<void>) => void };
    let full = true;
    setItem.mockImplementation(async (key, value) => {
      if (full && key.endsWith(":preview-update")) throw new Error("disk full");
      storage.data.set(key, value);
    });
    const fake = fakeUpdates({ next: { id: "pr-6-f" }, channel: "pr-6" });
    const updates = createUpdates({ platform: "ios", application, policyTimeoutMs: 50, updates: fake, storage, channels: { enabled: true } });
    await updates.channels.state();
    // The checker's download finishes (and fails to save) well before the person leaves.
    await updates.checker.check();
    await act(settle);
    await expect(updates.channels.reset()).resolves.toMatchObject({ kind: "error" });
    expect(fake.reloadAsync).not.toHaveBeenCalled();
    full = false;
    await expect(updates.channels.reset()).resolves.toEqual({ kind: "reloading" });
    expect(JSON.parse(storage.data.get("genesis:updates:channel:preview-update")!).channels["pr-6"]).toContain("pr-6-f");
  });

  it("doesn't restart when a download is still running after 10 s", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const storage = memoryStorage({ "genesis:updates:channel": "pr-6" });
      const fake = fakeUpdates({ next: { id: "pr-6-e" }, channel: "pr-6" });
      fake.fetchUpdateAsync.mockImplementationOnce(() => new Promise(() => {}));
      const updates = createUpdates({ platform: "ios", application, policyTimeoutMs: 50, updates: fake, storage, channels: { enabled: true } });
      await updates.channels.state();
      void updates.checker.check();
      await vi.advanceTimersByTimeAsync(10);
      const leaving = updates.channels.reset();
      await vi.advanceTimersByTimeAsync(10_500);
      await expect(leaving).resolves.toMatchObject({ kind: "error" });
      expect(fake.reloadAsync).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("the update banner's restart waits on the same gate: an unsaved preview record stops it", async () => {
    const storage = memoryStorage({ "genesis:updates:channel": "pr-6" });
    const setItem = storage.setItem as unknown as { mockImplementation: (f: (k: string, v: string) => Promise<void>) => void };
    setItem.mockImplementation(async (key, value) => {
      if (key.endsWith(":preview-update")) throw new Error("disk full");
      storage.data.set(key, value);
    });
    const fake = fakeUpdates({ next: { id: "pr-6-g" }, channel: "pr-6" });
    const updates = createUpdates({ platform: "ios", application, policyTimeoutMs: 50, updates: fake, storage, channels: { enabled: true } });
    await updates.channels.state();
    await updates.checker.check();
    await act(settle);
    expect(updates.checker.getState().status).toBe("ready");
    await expect(updates.checker.reload()).resolves.toBe(false);
    expect(fake.reloadAsync).not.toHaveBeenCalled();
  });
});

describe("PreviewScreen's phone details", () => {
  it("shows the installed build, its runtime and what runs, and says up to date when the phone already runs the newest", async () => {
    // The phone follows pr-3 and runs its update; the server has nothing newer for it.
    const fake = fakeUpdates({ updateId: "abcdef12-3456", runtimeVersion: "7c750d9daf53588dab66a503b3ddaa8faaf57a22" });
    const storage = memoryStorage({ "genesis:updates:channel": "pr-3" });
    const updates = createUpdates({ platform: "ios", application, policyTimeoutMs: 50, updates: fake, storage, channels: { enabled: true } });
    mount(updates, <PreviewScreen channel="pr-3" onDone={vi.fn()} />);
    await act(settle);
    // The build's own channel isn't known on a launch with a preview picked (and none remembered).
    expect(screen.getByText("1.2.0 (12) · ios")).toBeTruthy();
    expect(screen.getByText("7c750d9")).toBeTruthy();
    expect(screen.getByText("Update abcdef12 from pr-3")).toBeTruthy();
    fake.checkForUpdateAsync.mockResolvedValueOnce({ isAvailable: false, isRollBackToEmbedded: false, reason: "noUpdateAvailableOnServer" } as never);
    fireEvent.click(screen.getByTestId("genesis-preview-primary"));
    await act(settle);
    expect(screen.getByText("You have the newest pr-3")).toBeTruthy();
  });

  it("says nothing newer, not the newest preview, when the phone doesn't run that preview", async () => {
    // A fresh phone on the build's own code opens pr-7; the check keeps what it runs.
    const fake = fakeUpdates({ updateId: "release-1" });
    const updates = createUpdates({ platform: "ios", application, policyTimeoutMs: 50, updates: fake, storage: memoryStorage(), channels: { enabled: true } });
    mount(updates, <PreviewScreen channel="pr-7" onDone={vi.fn()} />);
    await act(settle);
    expect(screen.getByText("1.2.0 (12) · ios · production")).toBeTruthy();
    expect(screen.getByText("The build's own update (release-)")).toBeTruthy();
    fake.checkForUpdateAsync.mockResolvedValueOnce({ isAvailable: false, isRollBackToEmbedded: false } as never);
    fireEvent.click(screen.getByTestId("genesis-preview-primary"));
    await act(settle);
    expect(screen.getByText("Nothing newer to load")).toBeTruthy();
    expect(screen.queryByText("You have the newest pr-7")).toBeNull();
  });
});

describe("previewPhoneLines", () => {
  const sig = { version: "1.2.0", build: "12", platform: "ios", channel: "pr-7", requestedChannel: "pr-7", runtimeVersion: "7c750d9daf53", updateId: "abcdef1234", launch: "update" as const, emergency: false, short: "", text: "" };
  const value = (lines: { label: string; value: string }[], label: string) => lines.find((l) => l.label === label)?.value;
  it("names the build's own channel, not a picked preview's, and where the running update came from", () => {
    const lines = previewPhoneLines(sig, { build: "production", running: "pr-7" });
    expect(value(lines, "Installed build")).toBe("1.2.0 (12) · ios · production");
    expect(value(lines, "Runtime")).toBe("7c750d9");
    expect(value(lines, "Running")).toBe("Update abcdef12 from pr-7");
    // pr-7 is picked but a release update runs: it says so, not "from pr-7".
    expect(value(previewPhoneLines(sig, { build: "production", running: null }), "Running")).toBe("The build's own update (abcdef12)");
    // With no state, a picked preview's channel is never shown as the build's.
    expect(value(previewPhoneLines(sig), "Installed build")).toBe("1.2.0 (12) · ios");
  });
  it("reads embedded, off, a recovered launch and missing values", () => {
    expect(value(previewPhoneLines({ ...sig, launch: "embedded" }), "Running")).toBe("The build's own code");
    expect(value(previewPhoneLines({ ...sig, launch: "off" }), "Running")).toBe("Updates are off in this build");
    expect(value(previewPhoneLines({ ...sig, launch: "embedded", emergency: true }), "Running")).toBe("The build's own code (recovered after a failed launch)");
    const bare = previewPhoneLines({ ...sig, version: null, build: null, runtimeVersion: null, channel: null, requestedChannel: null });
    expect(value(bare, "Installed build")).toBe("unknown · ios");
    expect(value(bare, "Runtime")).toBe("none");
  });
});
