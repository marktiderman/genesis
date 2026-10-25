// @feat:app-updates
import { describe, expect, it } from "vitest";
import { versionSignature } from "../../updates/signature";
import { createChannelSwitcher } from "../../updates/channels";
import { createReloadGuard } from "../../updates/checker";
import { fakeUpdates, memoryStorage } from "./fakes";

const application = { nativeApplicationVersion: "1.4.0", nativeBuildVersion: "37" };

describe("versionSignature", () => {
  it("names the binary, channel and update", () => {
    const updates = { ...fakeUpdates({ channel: "preview", updateId: "3f2a9c1b-0000-4000-8000-000000000000", runtimeVersion: "1.4.0" }) };
    const sig = versionSignature({ application, updates, platform: "ios" });
    expect(sig.short).toBe("1.4.0 (37) · preview · 3f2a9c1b");
    expect(sig.text).toBe(
      ["Version 1.4.0 (37)", "Platform ios", "Channel preview", "Runtime 1.4.0", "Update 3f2a9c1b-0000-4000-8000-000000000000"].join("\n"),
    );
  });

  it("says embedded, updates off, a switched channel, an emergency launch and unknown values", () => {
    const embedded = { ...fakeUpdates({ channel: "production" }), isEmbeddedLaunch: true };
    expect(versionSignature({ application, updates: embedded, platform: "ios" }).short).toBe("1.4.0 (37) · production · embedded");
    expect(versionSignature({ application, updates: fakeUpdates({ isEnabled: false }), platform: "android" }).short).toBe("1.4.0 (37) · updates off");
    expect(versionSignature({ platform: "ios" }).short).toBe("unknown (unknown) · updates off");
    const switched = versionSignature({ application, updates: fakeUpdates({ channel: "production", updateId: "abcdef1234" }), platform: "ios", requestedChannel: "pr-42" });
    expect(switched.short).toBe("1.4.0 (37) · pr-42 · abcdef12");
    expect(switched.text).toContain("Channel production (switched to pr-42)");
    const emergency = versionSignature({
      application,
      updates: { ...fakeUpdates(), isEmergencyLaunch: true, emergencyLaunchReason: "the update crashed" },
      platform: "ios",
    });
    expect(emergency.short).toContain("emergency launch");
    expect(emergency.text).toContain("Emergency launch: the update crashed");
  });

  it("never prints an empty value: a development build's empty runtime version reads none, an empty id unknown", () => {
    // expo-updates in a development build: updates off, runtime version "".
    const dev = versionSignature({ application, updates: { ...fakeUpdates({ isEnabled: false }), runtimeVersion: "" }, platform: "ios" });
    expect(dev.text).toContain("Runtime none");
    expect(dev.runtimeVersion).toBeNull();
    const on = versionSignature({ application: { nativeApplicationVersion: "", nativeBuildVersion: "37" }, updates: { ...fakeUpdates({ channel: "" }), runtimeVersion: "" }, platform: "ios" });
    expect(on.text).toContain("Runtime unknown");
    expect(on.text).toContain("Channel unknown");
    expect(on.short.startsWith("unknown (37)")).toBe(true);
    expect(on.text.split("\n").every((line) => !/ $/.test(line))).toBe(true);
  });
});

describe("channel switching", () => {
  it("is off unless enabled, and says so", async () => {
    const updates = fakeUpdates();
    const switcher = createChannelSwitcher({ updates, enabled: false, guard: createReloadGuard() });
    await expect(switcher.switchTo("preview")).rejects.toThrow(/Channel switching is off/);
    expect(updates.setUpdateRequestHeadersOverride).not.toHaveBeenCalled();
  });

  it("overrides the channel header, fetches and reloads", async () => {
    const updates = fakeUpdates({ next: { id: "pr-build" } });
    const storage = memoryStorage();
    const switcher = createChannelSwitcher({ updates, enabled: true, guard: createReloadGuard(), storage });
    expect(await switcher.switchTo("pr-42")).toEqual({ kind: "reloading" });
    expect(updates.setUpdateRequestHeadersOverride).toHaveBeenCalledWith({ "expo-channel-name": "pr-42" });
    expect(updates.fetchUpdateAsync).toHaveBeenCalled();
    expect(updates.reloadAsync).toHaveBeenCalled();
    expect(await switcher.requested()).toBe("pr-42");
  });

  it("doesn't reload mid-form; the channel applies on the next launch", async () => {
    const updates = fakeUpdates({ next: { id: "pr-build" } });
    const guard = createReloadGuard();
    guard.block();
    const switcher = createChannelSwitcher({ updates, enabled: true, guard });
    expect(await switcher.switchTo("pr-42")).toEqual({ kind: "blocked" });
    expect(updates.reloadAsync).not.toHaveBeenCalled();
  });

  it("refuses a bad channel name, and is unavailable with updates off", async () => {
    const switcher = createChannelSwitcher({ updates: fakeUpdates(), enabled: true, guard: createReloadGuard() });
    await expect(switcher.switchTo("../etc")).rejects.toThrow(/Not a channel name/);
    const off = createChannelSwitcher({ updates: fakeUpdates({ isEnabled: false }), enabled: true, guard: createReloadGuard() });
    expect((await off.switchTo("preview")).kind).toBe("unavailable");
  });

  it("resets for everyone, even when switching is off and the check fails", async () => {
    const updates = fakeUpdates({ checkError: new Error("offline") });
    const storage = memoryStorage({ "genesis:updates:channel": "pr-42" });
    const switcher = createChannelSwitcher({ updates, enabled: false, guard: createReloadGuard(), storage });
    const result = await switcher.reset();
    expect(updates.setUpdateRequestHeadersOverride).toHaveBeenCalledWith(null);
    expect(result.kind).toBe("error");
    expect(await switcher.requested()).toBeNull();
  });
});
