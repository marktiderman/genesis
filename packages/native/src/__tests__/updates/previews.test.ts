// @feat:native-previews
import { describe, expect, it, vi } from "vitest";
import { createChannelSwitcher, isChannelNotFoundError } from "../../updates/channels";
import { createReloadGuard, createUpdateChecker } from "../../updates/checker";
import { previewLink, previewLinkChannel, previewPath } from "../../updates/preview-links";
import { createAttempts } from "../../updates/preview";
import { normalizeLink } from "../../links";
import { onBeforeReload } from "../../reload";
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
    expect(JSON.parse(storage.data.get("genesis:updates:channel:preview-update")!)).toEqual({ channels: { "pr-9": ["pr-update-1"] } });
    // The update checker then fetches a newer pr-9 update, and the phone launches on it (pr-9 still picked).
    storage.data.set("genesis:updates:channel", "pr-9");
    await createChannelSwitcher({ updates: fakeUpdates({ updateId: "pr-update-2", channel: "pr-9" }), enabled: true, guard: createReloadGuard(), storage }).state();
    expect(JSON.parse(storage.data.get("genesis:updates:channel:preview-update")!).channels["pr-9"]).toEqual(["pr-update-1", "pr-update-2"]);
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

  it("a release update the checker downloaded with no preview picked is never taken for a preview's", async () => {
    const storage = memoryStorage();
    const make = (o: Parameters<typeof fakeUpdates>[0]) => createChannelSwitcher({ updates: fakeUpdates(o), enabled: true, guard: createReloadGuard(), storage });
    // On the release, the checker downloads R2 (not launched yet): recorded as the build's own.
    await expect(make({ updateId: "release-1" }).noteRelease("release-2")).resolves.toBe(true);
    // pr-5 is picked, its download finds nothing, and the relaunch runs R2: not recorded as pr-5's.
    storage.data.set("genesis:updates:channel", "pr-5");
    await make({ updateId: "release-2", channel: "pr-5" }).state();
    expect(storage.data.has("genesis:updates:channel:preview-update")).toBe(false);
    // After leaving, nothing lingers.
    storage.data.delete("genesis:updates:channel");
    await expect(make({ updateId: "release-2" }).state()).resolves.toMatchObject({ requested: null, lingering: null });
  });

  it("a launch check that finds the preview's channel deleted keeps the notice up while its code still runs", async () => {
    const gone = new Error("There is no channel named pr-3.");
    const storage = memoryStorage();
    storage.data.set("genesis:updates:channel", "pr-3");
    const switcher = createChannelSwitcher({ updates: fakeUpdates({ updateId: "pr-3-a", channel: "pr-3" }), enabled: true, guard: createReloadGuard(), storage });
    await switcher.state();
    await expect(switcher.recover(gone)).resolves.toBe(true);
    await expect(switcher.state()).resolves.toMatchObject({ requested: null, lingering: "pr-3" });
    // Its download never landed (the release still runs): nothing lingers.
    const released = memoryStorage();
    await createChannelSwitcher({ updates: fakeUpdates({ updateId: "release-1" }), enabled: true, guard: createReloadGuard(), storage: released }).state();
    released.data.set("genesis:updates:channel", "pr-3");
    const onRelease = createChannelSwitcher({ updates: fakeUpdates({ updateId: "release-1", channel: "pr-3" }), enabled: true, guard: createReloadGuard(), storage: released });
    await expect(onRelease.recover(gone)).resolves.toBe(true);
    await expect(onRelease.state()).resolves.toMatchObject({ requested: null, lingering: null });
  });

  it("a deleted preview that isn't the one running keeps the running preview's notice", async () => {
    const gone = new Error("There is no channel named pr-b.");
    const storage = memoryStorage({ "genesis:updates:channel": "pr-a" });
    const switcher = createChannelSwitcher({ updates: fakeUpdates({ updateId: "pr-a-1", channel: "pr-a", next: { id: "pr-b-1" } }), enabled: true, guard: createReloadGuard(), storage });
    await switcher.state();
    // pr-a runs; pr-b is prepared (downloaded, no restart), then its pull request closes.
    await expect(switcher.prepare("pr-b")).resolves.toEqual({ kind: "downloaded" });
    await expect(switcher.recover(gone)).resolves.toBe(true);
    await expect(switcher.state()).resolves.toMatchObject({ requested: null, lingering: "pr-a" });
  });

  it("a release record that can't be read is never written over, and holds every restart until it's saved", async () => {
    const releaseKey = "genesis:updates:channel:release-updates";
    const storage = memoryStorage({ [releaseKey]: JSON.stringify(["release-0"]) });
    const getItem = storage.getItem as unknown as { mockImplementation: (f: (k: string) => Promise<string | null>) => void };
    let broken = true;
    getItem.mockImplementation(async (key) => {
      if (broken && key === releaseKey) throw new Error("io");
      return storage.data.get(key) ?? null;
    });
    const updates = fakeUpdates({ updateId: "release-1" });
    const switcher = createChannelSwitcher({ updates, enabled: true, guard: createReloadGuard(), storage });
    await switcher.state();
    await expect(switcher.noteRelease("release-2")).resolves.toBe(false);
    expect(JSON.parse(storage.data.get(releaseKey)!)).toEqual(["release-0"]);
    await expect(switcher.readyToReload()).resolves.toBe(false);
    await expect(switcher.restart()).resolves.toMatchObject({ kind: "error" });
    expect(updates.reloadAsync).not.toHaveBeenCalled();
    broken = false;
    await expect(switcher.restart()).resolves.toEqual({ kind: "reloading" });
    expect(JSON.parse(storage.data.get(releaseKey)!)).toEqual(["release-0", "release-2"]);
  });

  it("a release record that failed to save is kept and saved before the next restart", async () => {
    const releaseKey = "genesis:updates:channel:release-updates";
    const storage = memoryStorage();
    const setItem = storage.setItem as unknown as { mockImplementation: (f: (k: string, v: string) => Promise<void>) => void };
    let full = true;
    setItem.mockImplementation(async (key, value) => {
      if (full && key === releaseKey) throw new Error("disk full");
      storage.data.set(key, value);
    });
    const updates = fakeUpdates({ updateId: "release-1" });
    const switcher = createChannelSwitcher({ updates, enabled: true, guard: createReloadGuard(), storage });
    await expect(switcher.noteRelease("release-2")).resolves.toBe(false);
    await expect(switcher.readyToReload()).resolves.toBe(false);
    full = false;
    await expect(switcher.readyToReload()).resolves.toBe(true);
    expect(JSON.parse(storage.data.get(releaseKey)!)).toContain("release-2");
  });

  it("keeps every preview's updates: concurrent records, and a retry of an older one, drop none", async () => {
    const storage = memoryStorage({ "genesis:updates:channel": "pr-6" });
    const switcher = createChannelSwitcher({ updates: fakeUpdates({ updateId: "x", channel: "pr-6" }), enabled: true, guard: createReloadGuard(), storage });
    await switcher.state();
    await Promise.all([switcher.noteDownloaded("pr-6-a", "pr-6"), switcher.noteDownloaded("pr-6-b", "pr-6")]);
    await switcher.prepare("pr-7");
    await switcher.noteDownloaded("pr-7-a", "pr-7");
    const record = JSON.parse(storage.data.get("genesis:updates:channel:preview-update")!).channels;
    expect(record["pr-6"]).toEqual(expect.arrayContaining(["pr-6-a", "pr-6-b"]));
    expect(record["pr-7"]).toContain("pr-7-a");
  });

  it("retrying pr-6's failed save keeps pr-7's newer ids", async () => {
    const storage = memoryStorage({ "genesis:updates:channel": "pr-6" });
    const setItem = storage.setItem as unknown as { mockImplementation: (f: (k: string, v: string) => Promise<void>) => void };
    let failPr6 = true;
    setItem.mockImplementation(async (key, value) => {
      if (failPr6 && key.endsWith(":preview-update") && value.includes("pr-6-a")) throw new Error("disk full");
      storage.data.set(key, value);
    });
    const updates = fakeUpdates({ updateId: "x", channel: "pr-6" });
    const switcher = createChannelSwitcher({ updates, enabled: true, guard: createReloadGuard(), storage });
    await switcher.state();
    await expect(switcher.noteDownloaded("pr-6-a", "pr-6")).resolves.toBe(false);
    await switcher.prepare("pr-7");
    await switcher.noteDownloaded("pr-7-a", "pr-7");
    failPr6 = false;
    // Leaving retries pr-6's record before the restart, and pr-7's stays.
    await expect(switcher.reset()).resolves.toEqual({ kind: "reloading" });
    const record = JSON.parse(storage.data.get("genesis:updates:channel:preview-update")!).channels;
    expect(record["pr-6"]).toContain("pr-6-a");
    expect(record["pr-7"]).toContain("pr-7-a");
  });

  it("a launch record that failed to save holds Leave until it's saved", async () => {
    const storage = memoryStorage({ "genesis:updates:channel": "pr-8" });
    const setItem = storage.setItem as unknown as { mockImplementation: (f: (k: string, v: string) => Promise<void>) => void };
    let full = true;
    setItem.mockImplementation(async (key, value) => {
      if (full && key.endsWith(":preview-update")) throw new Error("disk full");
      storage.data.set(key, value);
    });
    const updates = fakeUpdates({ updateId: "pr-8-a", channel: "pr-8" });
    const switcher = createChannelSwitcher({ updates, enabled: true, guard: createReloadGuard(), storage });
    await switcher.state();
    await expect(switcher.reset()).resolves.toMatchObject({ kind: "error" });
    expect(updates.reloadAsync).not.toHaveBeenCalled();
    full = false;
    await expect(switcher.reset()).resolves.toEqual({ kind: "reloading" });
    expect(JSON.parse(storage.data.get("genesis:updates:channel:preview-update")!).channels["pr-8"]).toContain("pr-8-a");
  });

  it("the update banner's restart checks the guard after the before-reload hooks too", async () => {
    const updates = fakeUpdates({ next: { id: "u2" } });
    const guard = createReloadGuard();
    const checker = createUpdateChecker({ updates, guard });
    await checker.check();
    let release!: () => void;
    const off = onBeforeReload(() => new Promise<void>((resolve) => (release = resolve)));
    try {
      const restarting = checker.reload();
      await new Promise((r) => setTimeout(r, 0));
      guard.block();
      release();
      await expect(restarting).resolves.toBe(false);
      expect(updates.reloadAsync).not.toHaveBeenCalled();
      expect(checker.getState()).toMatchObject({ status: "ready", blocked: true });
    } finally {
      off();
    }
  });

  it("checks the guard after the before-reload hooks too", async () => {
    const updates = fakeUpdates();
    const guard = createReloadGuard();
    let release!: () => void;
    const off = onBeforeReload(() => new Promise<void>((resolve) => (release = resolve)));
    try {
      const switcher = createChannelSwitcher({ updates, enabled: true, guard, storage: memoryStorage({ "genesis:updates:channel": "pr-1" }) });
      const leaving = switcher.reset();
      await new Promise((r) => setTimeout(r, 0));
      guard.block();
      release();
      await expect(leaving).resolves.toEqual({ kind: "blocked" });
      expect(updates.reloadAsync).not.toHaveBeenCalled();
    } finally {
      off();
    }
  });

  it("checks the reload guard again after waiting on a download, so an edit started meanwhile isn't lost", async () => {
    const updates = fakeUpdates();
    const guard = createReloadGuard();
    const switcher = createChannelSwitcher({ updates, enabled: true, guard, storage: memoryStorage({ "genesis:updates:channel": "pr-1" }) });
    let finish!: () => void;
    switcher.holdReload(new Promise<boolean>((resolve) => (finish = () => resolve(true))));
    const leaving = switcher.reset();
    await new Promise((r) => setTimeout(r, 0));
    guard.block();
    finish();
    await expect(leaving).resolves.toEqual({ kind: "blocked" });
    expect(updates.reloadAsync).not.toHaveBeenCalled();
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
