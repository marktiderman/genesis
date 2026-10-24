// @feat:app-updates
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { genesisBrand } from "@marktiderman/genesis-design-system";
import { createMockProvider } from "@marktiderman/genesis-core/provider";
import { GenesisNativeApp, type GenesisNativeAppProps } from "../../app";
import type { ErrorUtilsLike } from "../../errors";
import {
  UpdatesProvider,
  createUpdates,
  staticPolicySource,
  useBlockReload,
  useForceUpgrade,
  useVersionSignature,
  type UpdatePolicy,
  type UpdatesOptions,
} from "../../updates";
import { fakeSupabase, settle } from "../fakes";
import { fakeUpdates, memoryStorage, never } from "./fakes";

afterEach(() => vi.restoreAllMocks());

const application = { nativeApplicationVersion: "1.2.0", nativeBuildVersion: "12" };
const provider = createMockProvider({});

function setup(options: Partial<UpdatesOptions> = {}, props: Partial<GenesisNativeAppProps> = {}) {
  const updates = createUpdates({ platform: "ios", application, policyTimeoutMs: 50, ...options });
  let handler: ((error: unknown, isFatal?: boolean) => void) | undefined;
  const errorUtils: ErrorUtilsLike = { getGlobalHandler: () => handler, setGlobalHandler: (next) => void (handler = next) };
  const utils = render(
    <GenesisNativeApp
      brand={genesisBrand}
      supabase={fakeSupabase({ user: { id: "u1" } }).client}
      provider={provider}
      errorUtils={errorUtils}
      rejectionTracker={null}
      updates={updates}
      {...props}
    >
      {props.children ?? <span data-testid="screens">screens</span>}
    </GenesisNativeApp>,
  );
  return { ...utils, updates };
}

const policy = (p: UpdatePolicy) => staticPolicySource(p);

describe("the updates block in GenesisNativeApp", () => {
  it("shows the force-upgrade screen instead of the screens, with the store link", async () => {
    const openURL = vi.fn();
    setup({ policy: policy({ minimumVersion: { ios: "1.3" }, storeUrl: { ios: "https://apps.apple.com/app/id1" } }), openURL });
    await act(settle);
    expect(screen.getByTestId("genesis-force-upgrade")).toBeTruthy();
    expect(screen.queryByTestId("screens")).toBeNull();
    fireEvent.click(screen.getByTestId("genesis-force-upgrade-store"));
    await act(settle);
    expect(openURL).toHaveBeenCalledWith("https://apps.apple.com/app/id1");
  });

  it("shows the screens when the policy can't load (offline), and never holds the boot past its timeout", async () => {
    setup({ policy: { load: never }, storage: memoryStorage() });
    await act(() => new Promise((resolve) => setTimeout(resolve, 120)));
    expect(screen.getByTestId("screens")).toBeTruthy();
  });

  it("shows maintenance with retry, and the screens once it's over", async () => {
    let active = true;
    const load = vi.fn(async () => ({ maintenance: { active, message: "Back at 10" } }));
    setup({ policy: { load } });
    await act(settle);
    expect(screen.getByTestId("genesis-maintenance")).toBeTruthy();
    expect(screen.getByText("Back at 10")).toBeTruthy();
    active = false;
    fireEvent.click(screen.getByTestId("genesis-maintenance-retry"));
    await act(settle);
    expect(load).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("screens")).toBeTruthy();
  });

  it("shows the banner for a downloaded update and reloads on tap", async () => {
    const updates = fakeUpdates({ next: { id: "next-1" } });
    setup({ updates });
    await act(settle);
    expect(screen.getByTestId("screens")).toBeTruthy();
    expect(screen.getByTestId("genesis-update-banner")).toBeTruthy();
    expect(updates.reloadAsync).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("genesis-update-banner-restart"));
    await act(settle);
    expect(updates.reloadAsync).toHaveBeenCalledTimes(1);
  });

  it("never reloads in the middle of a form", async () => {
    const updates = fakeUpdates({ next: { id: "next-1" } });
    function Form() {
      const [dirty, setDirty] = useState(true);
      useBlockReload(dirty);
      return (
        <button data-testid="save" onClick={() => setDirty(false)}>
          save
        </button>
      );
    }
    setup({ updates }, { children: <Form /> });
    await act(settle);
    const restart = screen.getByTestId("genesis-update-banner-restart");
    expect(restart.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/Finish what you're doing/)).toBeTruthy();
    fireEvent.click(restart);
    await act(settle);
    expect(updates.reloadAsync).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("save"));
    await act(settle);
    fireEvent.click(screen.getByTestId("genesis-update-banner-restart"));
    await act(settle);
    expect(updates.reloadAsync).toHaveBeenCalledTimes(1);
  });

  it("hides the banner on Later without reloading", async () => {
    const updates = fakeUpdates({ next: { id: "next-1" } });
    setup({ updates });
    await act(settle);
    fireEvent.click(screen.getByTestId("genesis-update-banner-later"));
    await act(settle);
    expect(screen.queryByTestId("genesis-update-banner")).toBeNull();
    expect(updates.reloadAsync).not.toHaveBeenCalled();
  });

  it("shows what's new once per version", async () => {
    const storage = memoryStorage({ "genesis:updates:seen-version": "1.1.0" });
    const notes = [{ version: "1.2.0", title: "Faster sync", body: "Everything loads quicker." }];
    const first = setup({ storage, notes });
    await act(settle);
    expect(screen.getByText("Faster sync")).toBeTruthy();
    fireEvent.click(screen.getByTestId("genesis-whats-new-done"));
    await act(settle);
    expect(screen.queryByTestId("genesis-whats-new")).toBeNull();
    first.unmount();

    setup({ storage, notes });
    await act(settle);
    expect(screen.getByTestId("screens")).toBeTruthy();
    expect(screen.queryByTestId("genesis-whats-new")).toBeNull();
  });

  it("takes slots: replace a renderer, or eject a blocking one so it never blocks", async () => {
    const block = { policy: policy({ minimumVersion: { ios: "9" } }) };
    const first = setup(block, { slots: { forceUpgrade: ({ minimumVersion }) => <span data-testid="mine">{minimumVersion}</span> } });
    await act(settle);
    expect(screen.getByTestId("mine").textContent).toBe("9");
    first.unmount();

    setup(block, { slots: { forceUpgrade: null } });
    await act(settle);
    expect(screen.getByTestId("screens")).toBeTruthy();
  });

  it("is off with no updates prop: the screens render as before", async () => {
    render(
      <GenesisNativeApp brand={genesisBrand} supabase={fakeSupabase({ user: { id: "u1" } }).client} provider={provider} rejectionTracker={null}>
        <span data-testid="screens">screens</span>
      </GenesisNativeApp>,
    );
    await act(settle);
    expect(screen.getByTestId("screens")).toBeTruthy();
  });
});

describe("the hooks, under UpdatesProvider", () => {
  it("give the force-upgrade state and the version signature without the shell", async () => {
    const block = createUpdates({
      platform: "ios",
      application,
      updates: fakeUpdates({ channel: "preview", updateId: "abcdef12-3456" }),
      policy: policy({ minimumVersion: { ios: "2.0" } }),
      storage: memoryStorage({ "genesis:updates:channel": "pr-7" }),
    });
    await block.bootStep.run();
    function Probe() {
      const force = useForceUpgrade();
      const sig = useVersionSignature();
      return (
        <span data-testid="probe">
          {force?.minimumVersion} | {sig.short}
        </span>
      );
    }
    render(
      <UpdatesProvider block={block}>
        <Probe />
      </UpdatesProvider>,
    );
    await act(settle);
    expect(screen.getByTestId("probe").textContent).toBe("2.0 | 1.2.0 (12) · pr-7 · abcdef12");
  });

  it("useBlockReload does nothing without a block", () => {
    function Lone() {
      useBlockReload(true);
      return <span data-testid="lone" />;
    }
    render(<Lone />);
    expect(screen.getByTestId("lone")).toBeTruthy();
  });
});
