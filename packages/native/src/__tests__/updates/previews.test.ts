// @feat:native-previews
import { describe, expect, it, vi } from "vitest";
import { createChannelSwitcher, isChannelNotFoundError } from "../../updates/channels";
import { createReloadGuard } from "../../updates/checker";
import { previewLink, previewLinkChannel, previewPath } from "../../updates/preview-links";
import { createAttempts } from "../../updates/preview";
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

  it("reads a hostile link in linear time", () => {
    const started = Date.now();
    expect(previewLinkChannel(`acme://${"/".repeat(100_000)}x`, at)).toBeNull();
    expect(previewLinkChannel(`a://${'"'.repeat(100_000)}`, at)).toBeNull();
    expect(previewLinkChannel(`/preview${"/".repeat(100_000)}`, { ...at, path: `/preview${"/".repeat(100_000)}` })).toEqual({ channel: null });
    expect(previewLink("pr-1", { origin: `https://acme.app${"/".repeat(100_000)}` })).toBe("https://acme.app/preview?channel=pr-1");
    expect(Date.now() - started).toBeLessThan(1000);
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
    expect(normalizeLink("https://acme.app/preview?channel=pr-42", { ...links, ignore: ["/preview"] })).toBeNull();
    // The app's own map comes first: its /preview/:id route keeps its links.
    expect(normalizeLink("https://acme.app/preview/123", { ...at, map: { "/preview/:id": "/media/:id" } })).toBe("/media/123");
  });
});

describe("preview screen attempts", () => {
  it("starts over when the channel changes, back to an earlier one included, and drops an earlier attempt's answer", () => {
    const attempts = createAttempts();
    const first = attempts.for("pr-1");
    expect(attempts.for("pr-1")).toBe(first);
    attempts.for("pr-2");
    const again = attempts.for("pr-1");
    expect(again).not.toBe(first);
    // A pr-1 preparation started in the first attempt finishes now: it isn't the attempt shown.
    expect(attempts.isCurrent(first)).toBe(false);
    expect(attempts.isCurrent(again)).toBe(true);
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
    await expect(switcher.state()).resolves.toMatchObject({ requested: "pr-42", build: "production" });
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
    await expect(switcher.state()).resolves.toMatchObject({ requested: "pr-1", build: "production" });
    await switcher.reset();
    expect(seen).toHaveBeenLastCalledWith(expect.objectContaining({ requested: null, build: "production" }));
    expect(storage.data.get("genesis:updates:channel:build")).toBe("production");
  });

  it("keeps a pick made while storage was still being read", async () => {
    let release!: () => void;
    const slow = memoryStorage();
    const gate = new Promise<void>((r) => (release = r));
    const read = slow.getItem as unknown as { mockImplementationOnce: (f: () => Promise<string | null>) => void };
    read.mockImplementationOnce(async () => {
      await gate;
      return null;
    });
    const switcher = createChannelSwitcher({ updates: fakeUpdates({ next: { id: "x" } }), enabled: true, guard: createReloadGuard(), storage: slow });
    const first = switcher.state();
    const prepared = switcher.prepare("pr-42");
    release();
    await Promise.all([first, prepared]);
    await expect(switcher.state()).resolves.toMatchObject({ requested: "pr-42" });
  });

  it("reports a fetch that got nothing as an error, not a download", async () => {
    const updates = fakeUpdates({ next: { id: "x" } });
    updates.fetchUpdateAsync.mockResolvedValueOnce({ isNew: false, isRollBackToEmbedded: false } as never);
    const switcher = createChannelSwitcher({ updates, enabled: true, guard: createReloadGuard() });
    await expect(switcher.prepare("pr-1")).resolves.toMatchObject({ kind: "error" });
  });

  it("reads a selection-policy answer as nothing newer, and a missing embedded rollback as nothing to load", async () => {
    const updates = fakeUpdates();
    const switcher = createChannelSwitcher({ updates, enabled: true, guard: createReloadGuard() });
    updates.checkForUpdateAsync.mockResolvedValueOnce({ isAvailable: false, isRollBackToEmbedded: false, reason: "updateRejectedBySelectionPolicy" } as never);
    await expect(switcher.prepare("pr-1")).resolves.toEqual({ kind: "latest" });
    updates.checkForUpdateAsync.mockResolvedValueOnce({ isAvailable: false, isRollBackToEmbedded: false, reason: "rollbackNoEmbeddedConfiguration" } as never);
    await expect(switcher.prepare("pr-1")).resolves.toEqual({ kind: "nothing", reason: "none" });
  });

  it("answers an error when the build can't override the header, instead of rejecting", async () => {
    const updates = fakeUpdates({ next: { id: "x" } });
    (updates.setUpdateRequestHeadersOverride as unknown as { mockImplementationOnce: (f: () => void) => void }).mockImplementationOnce(() => {
      throw new Error("expo-channel-name is not an embedded request header");
    });
    const switcher = createChannelSwitcher({ updates, enabled: true, guard: createReloadGuard() });
    await expect(switcher.prepare("pr-1")).resolves.toMatchObject({ kind: "error" });
    await expect(switcher.requested()).resolves.toBeNull();
  });

  it("leaving reloads after the build's channel answers, even with nothing newer (its filters now exclude the preview)", async () => {
    const updates = fakeUpdates();
    const switcher = createChannelSwitcher({ updates, enabled: true, guard: createReloadGuard(), storage: memoryStorage({ "genesis:updates:channel": "pr-1" }) });
    await expect(switcher.reset()).resolves.toEqual({ kind: "reloading" });
    expect(updates.checkForUpdateAsync).toHaveBeenCalledTimes(1);
    expect(updates.reloadAsync).toHaveBeenCalledTimes(1);
  });

  it("leaving while a form blocks the reload says blocked, with the override already cleared for the next launch", async () => {
    const updates = fakeUpdates();
    const guard = createReloadGuard();
    const release = guard.block();
    const switcher = createChannelSwitcher({ updates, enabled: true, guard, storage: memoryStorage({ "genesis:updates:channel": "pr-1" }) });
    await expect(switcher.reset()).resolves.toEqual({ kind: "blocked" });
    expect(updates.setUpdateRequestHeadersOverride).toHaveBeenLastCalledWith(null);
    expect(updates.reloadAsync).not.toHaveBeenCalled();
    release();
    await expect(switcher.restart()).resolves.toEqual({ kind: "reloading" });
  });

  it("tells when a left preview's update still runs (Android keeps the old filters), and forgets it once it doesn't", async () => {
    // Prepare records the update a preview downloaded…
    const storage = memoryStorage();
    const first = fakeUpdates({ next: { id: "pr-update-1" } });
    await createChannelSwitcher({ updates: first, enabled: true, guard: createReloadGuard(), storage }).prepare("pr-9");
    expect(JSON.parse(storage.data.get("genesis:updates:channel:preview-update")!)).toEqual({ channel: "pr-9", ids: ["pr-update-1"] });
    // The update checker then fetches a newer pr-9 update, and the phone launches on it (pr-9 still picked).
    storage.data.set("genesis:updates:channel", "pr-9");
    await createChannelSwitcher({ updates: fakeUpdates({ updateId: "pr-update-2", channel: "pr-9" }), enabled: true, guard: createReloadGuard(), storage }).state();
    expect(JSON.parse(storage.data.get("genesis:updates:channel:preview-update")!).ids).toEqual(["pr-update-1", "pr-update-2"]);
    // …the person leaves (no channel picked), and the relaunch still runs a pr-9 update: either one counts.
    storage.data.delete("genesis:updates:channel");
    await expect(createChannelSwitcher({ updates: fakeUpdates({ updateId: "pr-update-2" }), enabled: true, guard: createReloadGuard(), storage }).state()).resolves.toMatchObject({ requested: null, lingering: "pr-9" });
    storage.data.delete("genesis:updates:channel");
    const stillPreview = fakeUpdates({ updateId: "pr-update-1" });
    await expect(createChannelSwitcher({ updates: stillPreview, enabled: true, guard: createReloadGuard(), storage }).state()).resolves.toMatchObject({ requested: null, lingering: "pr-9" });
    // Once the regular update runs, it's forgotten.
    const regular = fakeUpdates({ updateId: "prod-update" });
    await expect(createChannelSwitcher({ updates: regular, enabled: true, guard: createReloadGuard(), storage }).state()).resolves.toMatchObject({ lingering: null });
    expect(storage.data.has("genesis:updates:channel:preview-update")).toBe(false);
  });

  it("recognizes a newer preview update the checker downloaded but never launched, after leaving", async () => {
    const storage = memoryStorage({ "genesis:updates:channel": "pr-6" });
    const on = createChannelSwitcher({ updates: fakeUpdates({ updateId: "pr-6-a", channel: "pr-6" }), enabled: true, guard: createReloadGuard(), storage });
    await on.state();
    // The checker fetched pr-6-b in the background; nothing launched it yet.
    await on.noteDownloaded("pr-6-b", "pr-6");
    // The person leaves, the check on the build's channel finds nothing, and Android launches pr-6-b.
    storage.data.delete("genesis:updates:channel");
    const after = createChannelSwitcher({ updates: fakeUpdates({ updateId: "pr-6-b" }), enabled: true, guard: createReloadGuard(), storage });
    await expect(after.state()).resolves.toMatchObject({ requested: null, lingering: "pr-6" });
    // A download that started on pr-6 doesn't count once another preview is picked.
    await after.prepare("pr-7");
    await after.noteDownloaded("pr-6-c", "pr-6");
    expect(storage.data.get("genesis:updates:channel:preview-update") ?? "").not.toContain("pr-6-c");
  });

  it("never records the build's own update as a preview's: a rollback from a crashed preview, an unfinished download, the embedded update", async () => {
    const storage = memoryStorage();
    const make = (o: Parameters<typeof fakeUpdates>[0]) => createChannelSwitcher({ updates: fakeUpdates(o), enabled: true, guard: createReloadGuard(), storage });
    // A launch on the release, with no preview picked: its update is remembered as the build's.
    await make({ updateId: "release-1" }).state();
    // pr-4 is picked, but expo-updates rolled back to the release (or the download never finished).
    storage.data.set("genesis:updates:channel", "pr-4");
    await make({ updateId: "release-1", channel: "pr-4" }).state();
    // The embedded update, likewise.
    const embedded = fakeUpdates({ updateId: "embedded-1", channel: "pr-4" });
    (embedded as { isEmbeddedLaunch: boolean }).isEmbeddedLaunch = true;
    await createChannelSwitcher({ updates: embedded, enabled: true, guard: createReloadGuard(), storage }).state();
    expect(storage.data.has("genesis:updates:channel:preview-update")).toBe(false);
    // After leaving, the release runs and nothing lingers.
    storage.data.delete("genesis:updates:channel");
    await expect(make({ updateId: "release-1" }).state()).resolves.toMatchObject({ requested: null, lingering: null });
  });

  it("runs one write at a time, in order", async () => {
    const updates = fakeUpdates({ next: { id: "x" } });
    const order: string[] = [];
    (updates.setUpdateRequestHeadersOverride as unknown as { mockImplementation: (f: (h: Record<string, string> | null) => void) => void }).mockImplementation((h) => {
      order.push(h ? h["expo-channel-name"]! : "reset");
    });
    const switcher = createChannelSwitcher({ updates, enabled: true, guard: createReloadGuard() });
    await Promise.all([switcher.prepare("pr-1"), switcher.reset(), switcher.prepare("pr-2")]);
    expect(order).toEqual(["pr-1", "reset", "pr-2"]);
  });
});
