// @feat:native-previews
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { genesisBrand } from "@marktiderman/genesis-design-system";
import { createMockProvider } from "@marktiderman/genesis-core/provider";
import { GenesisNativeApp } from "../../app";
import type { ErrorUtilsLike } from "../../errors";
import { PreviewScreen, createUpdates } from "../../updates";
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
