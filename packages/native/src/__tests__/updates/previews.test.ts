// @feat:native-previews
import { describe, expect, it, vi } from "vitest";
import { createChannelSwitcher, isChannelNotFoundError } from "../../updates/channels";
import { createReloadGuard } from "../../updates/checker";
import { previewLink, previewLinkChannel, previewPath } from "../../updates/preview-links";
import { normalizeLink } from "../../links";
import { fakeUpdates, memoryStorage } from "./fakes";

const at = { schemes: ["acme"], hosts: ["acme.app"] };

describe("preview links", () => {
  it("reads every form a preview arrives in", () => {
    expect(previewLinkChannel("https://acme.app/preview?channel=pr-42", at)).toEqual({ channel: "pr-42" });
    expect(previewLinkChannel("acme:///preview?channel=pr-42", at)).toEqual({ channel: "pr-42" });
    expect(previewLinkChannel("acme://preview?channel=pr-42", at)).toEqual({ channel: "pr-42" });
    expect(previewLinkChannel("/preview/pr-42", at)).toEqual({ channel: "pr-42" });
    expect(previewLinkChannel("/preview?channel=staging", at)).toEqual({ channel: "staging" });
    // Expo's development-client QR, as EAS's github-comment posts it.
    const expoQr = `acme://expo-development-client/?url=${encodeURIComponent("https://u.expo.dev/abc-123?channel-name=pr-7")}`;
    expect(previewLinkChannel(expoQr, at)).toEqual({ channel: "pr-7" });
  });

  it("ignores other links, other hosts and other schemes", () => {
    expect(previewLinkChannel("https://acme.app/clients/1", at)).toBeNull();
    expect(previewLinkChannel("https://evil.example/preview?channel=pr-1", at)).toBeNull();
    expect(previewLinkChannel("other:///preview?channel=pr-1", at)).toBeNull();
    expect(previewLinkChannel(`acme://expo-development-client/?url=${encodeURIComponent("https://u.expo.dev/abc/group/g1")}`, at)).toBeNull();
  });

  it("refuses a channel name that could carry anything else into the header", () => {
    expect(previewLinkChannel("acme:///preview?channel=pr-1%0D%0AX-Evil:%201", at)).toEqual({ channel: null });
    expect(previewLinkChannel("acme:///preview?channel=", at)).toEqual({ channel: null });
    expect(previewLinkChannel("acme:///preview", at)).toEqual({ channel: null });
    expect(() => previewLink("bad name", { scheme: "acme" })).toThrow(/Not a channel name/);
  });

  it("builds the path and the link to share", () => {
    expect(previewPath("pr-42")).toBe("/preview?channel=pr-42");
    expect(previewLink("pr-42", { origin: "https://acme.app/" })).toBe("https://acme.app/preview?channel=pr-42");
    expect(previewLink("pr-42", { scheme: "acme" })).toBe("acme:///preview?channel=pr-42");
  });

  it("is what normalizeLink returns for a preview, before the app's own map", () => {
    const links = { ...at, map: { "/clients/:id": "/clients/:id" } };
    expect(normalizeLink("https://acme.app/preview?channel=pr-42", links)).toBe("/preview?channel=pr-42");
    expect(normalizeLink("acme:///preview?channel=bad%20name", links)).toBe("/preview");
    expect(normalizeLink("https://acme.app/clients/1", links)).toBe("/clients/1");
    expect(normalizeLink("https://acme.app/preview?channel=pr-42", { ...links, previews: false })).toBe("/");
  });
});

describe("channel switching, hardened", () => {
  it("prepares a channel without reloading, then restarts into it", async () => {
    const updates = fakeUpdates({ next: { id: "pr-update" } });
    const storage = memoryStorage();
    const switcher = createChannelSwitcher({ updates, enabled: true, guard: createReloadGuard(), storage });
    await expect(switcher.prepare("pr-42")).resolves.toEqual({ kind: "downloaded" });
    expect(updates.setUpdateRequestHeadersOverride).toHaveBeenCalledWith({ "expo-channel-name": "pr-42" });
    expect(updates.reloadAsync).not.toHaveBeenCalled();
    await expect(switcher.state()).resolves.toEqual({ requested: "pr-42", build: "production" });
    await expect(switcher.restart()).resolves.toEqual({ kind: "reloading" });
    expect(updates.reloadAsync).toHaveBeenCalledTimes(1);
  });

  it("says why there's nothing to load", async () => {
    const none = fakeUpdates();
    none.checkForUpdateAsync.mockResolvedValueOnce({ isAvailable: false, isRollBackToEmbedded: false, reason: "noUpdateAvailableOnServer" } as never);
    const switcher = createChannelSwitcher({ updates: none, enabled: true, guard: createReloadGuard() });
    await expect(switcher.prepare("pr-9")).resolves.toEqual({ kind: "nothing", reason: "none" });
    none.checkForUpdateAsync.mockResolvedValueOnce({ isAvailable: false, isRollBackToEmbedded: false, reason: "updatePreviouslyFailed" } as never);
    await expect(switcher.prepare("pr-9")).resolves.toEqual({ kind: "nothing", reason: "failed" });
    none.checkForUpdateAsync.mockResolvedValueOnce({ isAvailable: false, isRollBackToEmbedded: false } as never);
    await expect(switcher.prepare("pr-9")).resolves.toEqual({ kind: "latest" });
  });

  it("heals when the channel was deleted, and recovers from a launch check's error", async () => {
    const gone = new Error("There is no channel named pr-3.");
    expect(isChannelNotFoundError(gone)).toBe(true);
    const updates = fakeUpdates({ checkError: gone });
    const storage = memoryStorage();
    const switcher = createChannelSwitcher({ updates, enabled: true, guard: createReloadGuard(), storage });
    await expect(switcher.prepare("pr-3")).resolves.toEqual({ kind: "gone" });
    expect(updates.setUpdateRequestHeadersOverride).toHaveBeenLastCalledWith(null);
    await expect(switcher.requested()).resolves.toBeNull();
    await expect(switcher.recover(new Error("network down"))).resolves.toBe(false);
    await expect(switcher.recover(gone)).resolves.toBe(true);
  });

  it("remembers the build's channel from a plain launch, and tells subscribers about changes", async () => {
    const storage = memoryStorage({ "genesis:updates:channel": "pr-1", "genesis:updates:channel:build": "production" });
    // Under an override, Updates.channel names the override.
    const updates = fakeUpdates({ channel: "pr-1", next: { id: "x" } });
    const switcher = createChannelSwitcher({ updates, enabled: true, guard: createReloadGuard(), storage });
    const seen = vi.fn();
    switcher.subscribe(seen);
    await expect(switcher.state()).resolves.toEqual({ requested: "pr-1", build: "production" });
    await switcher.reset();
    expect(seen).toHaveBeenLastCalledWith({ requested: null, build: "production" });
    expect(storage.data.get("genesis:updates:channel:build")).toBe("production");
  });

  it("runs one write at a time, in order", async () => {
    const updates = fakeUpdates({ next: { id: "x" } });
    const order: string[] = [];
    updates.setUpdateRequestHeadersOverride.mockImplementation((h: Record<string, string> | null) => order.push(h ? h["expo-channel-name"]! : "reset"));
    const switcher = createChannelSwitcher({ updates, enabled: true, guard: createReloadGuard() });
    await Promise.all([switcher.prepare("pr-1"), switcher.reset(), switcher.prepare("pr-2")]);
    expect(order).toEqual(["pr-1", "reset", "pr-2"]);
  });
});
