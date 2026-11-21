/**
 * Switching a build to another update channel (EAS "channel surfing",
 * https://docs.expo.dev/eas-update/channel-surfing/): override the
 * `expo-channel-name` header, check, fetch, reload. The override persists on
 * the device until it is reset or the app is removed. Previews of pull
 * requests (`pr-<number>`) are channels; a preview link opens one
 * (`previewLinkChannel`, preview-links.ts).
 *
 * Off unless the app turns it on (`enabled: true`). An app may turn it on in
 * release builds, store builds included: the header override only picks
 * which compatible update the build loads (same runtime version), it changes
 * no native code and keeps expo-updates' fallback to the embedded update.
 * Never pair it with `disableAntiBrickingMeasures`. Going back (`reset`)
 * always works, for everyone, because it only removes the override.
 *
 * What it handles, learnt from apps that ran this in production:
 * - Writes are queued: a preview link, a reset and recovery never race.
 * - The build's own channel is remembered on a plain launch, because under an
 *   override `Updates.channel` names the override, not the build.
 * - A channel that was deleted (its pull request closed) heals: EAS answers
 *   "There is no channel named …", the override is dropped and `gone` says so.
 * - A build with no channel at all isn't checked (EAS answers 400).
 * - Nothing loadable says why (nothing published for this runtime, or an
 *   update that crashed before), instead of a silent no-op.
 *
 * Switching reloads, so it respects the reload guard: with unsaved changes
 * it sets the channel and says `blocked`; the channel applies on the next
 * launch.
 */
import { toError, type UpdatesModuleLike, type UpdatesOnError, type UpdatesStorageLike } from "./modules";
import type { ReloadGuard } from "./checker";
import { runBeforeReload } from "../reload";

export type ChannelSwitchResult =
  /** The reload was sent; JS may stop at any moment. */
  | { kind: "reloading" }
  /** The channel is set, but something is mid-edit: it applies on the next launch. */
  | { kind: "blocked" }
  /** expo-updates is off or too old here (development, Expo Go). Nothing changed. */
  | { kind: "unavailable"; reason: string }
  /** The channel is set but checking, fetching or reloading failed. */
  | { kind: "error"; error: Error };

/** What a channel has for this build, after `prepare`. */
export type ChannelCheck =
  /** An update from the channel is downloaded: `restart` loads it. */
  | { kind: "downloaded" }
  /** Nothing newer on the channel than what this phone runs (or expo-updates' selection policy keeps what it runs). */
  | { kind: "latest" }
  /**
   * Nothing on the channel this build can load. `reason`: `"none"` (nothing published for this
   * platform and runtime version: the pull request changed native code, or nothing was published
   * yet), `"failed"` (its update crashed on this device before and expo-updates won't retry it).
   */
  | { kind: "nothing"; reason: "none" | "failed" }
  /** The channel doesn't exist (any more): the override was dropped. */
  | { kind: "gone" }
  | { kind: "unavailable"; reason: string }
  | { kind: "error"; error: Error };

export interface ChannelState {
  /** The channel picked on this device, or `null` when it follows the build. */
  requested: string | null;
  /** The build's own channel, as remembered from a launch without an override; `null` until known. */
  build: string | null;
  /**
   * The preview whose code is still running although none is picked: leaving cleared the override,
   * but the restart launched the preview's update again (on Android a check that finds nothing
   * keeps the previous manifest filters). `null` otherwise. Leaving again (`reset`) is the way out.
   */
  lingering?: string | null;
}

export interface ChannelSwitcher {
  /** True when this build may switch channels (`channels.enabled`). */
  readonly enabled: boolean;
  /** Switch to `channel` and reload. Throws when switching is off or the name isn't a channel's. */
  switchTo(channel: string): Promise<ChannelSwitchResult>;
  /**
   * Point at `channel` and download what it has, without reloading (a preview link's "Load", then
   * "Restart"). Throws when switching is off or the name isn't a channel's.
   */
  prepare(channel: string): Promise<ChannelCheck>;
  /**
   * Record an update something else downloaded (the update checker) as `channel`'s, so its code is
   * still recognized if a restart after leaving launches it. `channel` is the preview picked when
   * the download started; recorded while it's still picked or none is (left mid-download), not
   * once another preview is picked.
   */
  /** Resolves `false` when the record couldn't be saved. */
  noteDownloaded(updateId: string, channel: string): Promise<boolean>;
  /**
   * Hold the next reload until `work` settles (at most 10 s): a checker download and its record, so
   * leaving can't restart into a preview update before it's recorded as the preview's. If it
   * doesn't settle in time, or a preview update's record couldn't be saved, the reload doesn't
   * happen: it answers an error. A record that failed is kept and saved again before every later
   * reload, which stays refused until it is.
   */
  holdReload(work: Promise<unknown>): void;
  /**
   * What every other restart (the update banner's) asks first: `true` once held downloads and
   * their records are settled and saved, else `false` (and the restart must not happen).
   */
  readyToReload(): Promise<boolean>;
  /** Reload into what was downloaded (respects the reload guard). */
  restart(): Promise<ChannelSwitchResult>;
  /** Back to the build's own channel. Always allowed. */
  reset(): Promise<ChannelSwitchResult>;
  /** The channel picked on this device, or `null` when it follows the build. */
  requested(): Promise<string | null>;
  /** The picked channel and the build's own. */
  state(): Promise<ChannelState>;
  /**
   * When `error` is EAS's "no channel named …" (a preview whose pull request closed), drop the
   * override and resolve true; otherwise false. Call it with update check errors at launch.
   */
  recover(error: unknown): Promise<boolean>;
  /** Told whenever the picked channel changes on this device. Returns the unsubscribe. */
  subscribe(listener: (state: ChannelState) => void): () => void;
}

export interface ChannelSwitcherOptions {
  updates?: UpdatesModuleLike;
  /** Must be explicitly true. */
  enabled: boolean;
  guard: ReloadGuard;
  /** Remembers the picked channel and the build's own. */
  storage?: UpdatesStorageLike;
  /** Default `"genesis:updates:channel"`; the build's channel is kept under `<key>:build`. */
  storageKey?: string;
  reloadScreenOptions?: object;
  onError?: UpdatesOnError;
}

/** What a channel name may be: letters, digits, `.`, `_`, `-` and `/`, at most 100, starting with a letter or digit. */
export const CHANNEL_NAME = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/;

export function isChannelName(value: unknown): value is string {
  return typeof value === "string" && CHANNEL_NAME.test(value);
}

/** EAS's answer for a channel that doesn't exist. */
export function isChannelNotFoundError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return /there is no channel named/i.test(message);
}

function parseIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as unknown;
    return Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Preview updates by channel (each newest last). Reads the older one-channel form too. */
type PreviewRecord = Record<string, string[]>;

function parsePreviewRecord(raw: string | null): PreviewRecord {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as { channels?: unknown; channel?: unknown; ids?: unknown; id?: unknown };
    const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
    if (value.channels && typeof value.channels === "object") {
      const out: PreviewRecord = {};
      for (const [ch, ids] of Object.entries(value.channels as Record<string, unknown>)) if (strings(ids).length) out[ch] = strings(ids);
      return out;
    }
    if (typeof value.channel === "string") return { [value.channel]: typeof value.id === "string" ? [value.id] : strings(value.ids) };
    return {};
  } catch {
    return {};
  }
}

/** The channel whose preview updates include `id`, else null. */
function channelOf(record: PreviewRecord, id: string): string | null {
  for (const [channel, ids] of Object.entries(record)) if (ids.includes(id)) return channel;
  return null;
}

/** `record` with `id` added to `channel` (at most 20 per channel, 10 channels, newest kept). */
function withPreviewUpdate(record: PreviewRecord, channel: string, id: string): PreviewRecord {
  const next: PreviewRecord = { ...record, [channel]: [...(record[channel] ?? []).filter((x) => x !== id), id].slice(-20) };
  const channels = Object.keys(next);
  for (const ch of channels.slice(0, Math.max(0, channels.length - 10))) if (ch !== channel) delete next[ch];
  return next;
}

export function createChannelSwitcher(options: ChannelSwitcherOptions): ChannelSwitcher {
  const { updates, enabled, guard, storage, storageKey = "genesis:updates:channel", reloadScreenOptions, onError } = options;
  const buildKey = `${storageKey}:build`;
  /** `{ channels: { [channel]: ids } }`: the preview updates this device downloaded or ran, to tell when one still runs. */
  const previewKey = `${storageKey}:preview-update`;
  /** The updates seen running with no preview picked (the build's own), newest last: never a preview's. */
  const releaseKey = `${storageKey}:release-updates`;
  const listeners = new Set<(state: ChannelState) => void>();
  let cache: ChannelState | null = null;
  /** The first read of storage, shared: a later publish always wins over it. */
  let loading: Promise<ChannelState> | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  /** One write at a time, in the order asked. */
  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const next = queue.then(task, task);
    queue = next.catch(() => undefined);
    return next;
  };

  const report = (error: Error) => {
    try {
      onError?.(error, "channel");
    } catch {
      // ignore a failing reporter
    }
  };
  const unavailable = (): { kind: "unavailable"; reason: string } | null => {
    if (!updates?.isEnabled) return { kind: "unavailable", reason: "Updates are off in this build (development or Expo Go)." };
    if (typeof updates.setUpdateRequestHeadersOverride !== "function") {
      return { kind: "unavailable", reason: "This expo-updates can't override the channel." };
    }
    return null;
  };
  const read = async (key: string): Promise<string | null> => {
    if (!storage) return null;
    try {
      const value = await storage.getItem(key);
      return value ? value : null;
    } catch (error) {
      report(toError(error));
      return null;
    }
  };
  /** Whether it was saved (no storage: nothing to save, so yes). */
  const write = async (key: string, value: string | null): Promise<boolean> => {
    if (!storage) return true;
    try {
      if (value === null) await (storage.removeItem ? storage.removeItem(key) : storage.setItem(key, ""));
      else await storage.setItem(key, value);
      return true;
    } catch (error) {
      report(toError(error));
      return false;
    }
  };
  /** Preview updates whose record couldn't be saved yet (id → channel): retried before every restart. */
  const unsaved = new Map<string, string>();
  const init = async (): Promise<ChannelState> => {
    const requested = await read(storageKey);
    let build = await read(buildKey);
    let lingering: string | null = null;
    const running = updates?.updateId ?? null;
    const record = parsePreviewRecord(await read(previewKey));
    const release = parseIds(await read(releaseKey));
    if (requested && running) {
      // Launched with a preview picked. What runs is the preview's (the switcher's download, or a
      // newer one the update checker fetched) unless it is the embedded update or one already seen
      // running without a preview: expo-updates rolled back from a crashed preview, or the download
      // never finished. Only the preview's are recorded.
      if (!updates?.isEmbeddedLaunch && !release.includes(running) && !(record[requested] ?? []).includes(running)) {
        // Not saved: kept with the others and retried before any restart.
        if (!(await write(previewKey, JSON.stringify({ channels: withPreviewUpdate(record, requested, running) })))) unsaved.set(running, requested);
      }
    } else if (!requested && running && channelOf(record, running)) {
      lingering = channelOf(record, running);
    } else if (!requested) {
      if (Object.keys(record).length) await write(previewKey, null);
      // The build's own code: remember it, so a later launch with a preview picked can tell it apart.
      if (running && !release.includes(running)) await write(releaseKey, JSON.stringify([...release, running].slice(-20)));
    }
    // A launch with no override runs on the build's own channel: remember it, since under an
    // override `Updates.channel` reports the override instead.
    if (!requested && updates?.channel) {
      build = updates.channel;
      await write(buildKey, build);
    }
    // A pick published while storage was being read is newer: keep it.
    if (!cache) cache = { requested, build, lingering };
    return cache;
  };
  const load = (): Promise<ChannelState> => (cache ? Promise.resolve(cache) : (loading ??= init()));
  const publish = (next: ChannelState) => {
    cache = next;
    for (const listener of listeners) {
      try {
        listener(next);
      } catch {
        // a listener's failure isn't the switcher's
      }
    }
  };
  const pick = async (channel: string | null) => {
    const state = await load();
    const requested = channel && channel !== state.build ? channel : null;
    await write(storageKey, requested);
    publish({ ...state, requested, lingering: requested ? null : (state.lingering ?? null) });
  };
  const validName = (channel: string): string => {
    if (enabled !== true) throw new Error("Channel switching is off. Pass `channels: { enabled: true }` to turn it on.");
    const name = channel.trim();
    if (!isChannelName(name)) throw new Error(`Not a channel name: "${channel}"`);
    return name;
  };
  const dropOverride = async () => {
    try {
      updates?.setUpdateRequestHeadersOverride?.(null);
    } catch (error) {
      report(toError(error));
    }
    await pick(null);
  };
  /** Point the header at `name`; expo-updates throws when the build embeds no expo-channel-name header to override. */
  const override = (name: string): { kind: "error"; error: Error } | null => {
    try {
      updates!.setUpdateRequestHeadersOverride!({ "expo-channel-name": name });
      return null;
    } catch (raw) {
      const error = toError(raw);
      report(error);
      return { kind: "error", error };
    }
  };
  const holds = new Set<Promise<boolean>>();
  /** True once every hold settled well; false on a timeout or a hold that failed. */
  const settled = async (): Promise<boolean> => {
    if (!holds.size) return true;
    const all = Promise.all([...holds]).then((oks) => oks.every(Boolean));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<boolean>((resolve) => (timer = setTimeout(() => resolve(false), 10_000)));
    try {
      return await Promise.race([all, late]);
    } finally {
      clearTimeout(timer);
    }
  };
  /** Null when a restart may go ahead; else the error to answer (a download or its record still pending). */
  const readyToReload = async (): Promise<{ kind: "error"; error: Error } | null> => {
    if ((await settled()) && (await saveUnsaved())) return null;
    const error = new Error("The app is still saving a download. Try again in a moment.");
    report(error);
    return { kind: "error", error };
  };
  const reload = async (): Promise<ChannelSwitchResult> => {
    const u = updates as UpdatesModuleLike;
    try {
      if (!guard.canReload()) return { kind: "blocked" };
      // A checker download still running (or its record) first: what the restart launches is then
      // known. Not settled in time, or not saved: no restart that could hide a running preview.
      const ready = await readyToReload();
      if (ready) return ready;
      // The waits above can take seconds: a form may have started blocking meanwhile.
      if (!guard.canReload()) return { kind: "blocked" };
      // Queued crash reports and events would be lost with the runtime: flush them first.
      await runBeforeReload();
      // So can the flush (up to 2 s): ask once more, last thing before the restart.
      if (!guard.canReload()) return { kind: "blocked" };
      await u.reloadAsync(reloadScreenOptions ? { reloadScreenOptions } : undefined);
      return { kind: "reloading" };
    } catch (raw) {
      const error = toError(raw);
      report(error);
      return { kind: "error", error };
    }
  };
  /** Add `id` to `channel`'s record (default: the open preview's; none open: nothing). */
  // Read-modify-write of the record, one at a time: its own queue, not the switcher's (a reload in
  // that queue can be waiting on a record), and merged per channel, so no write drops another's ids.
  let recordQueue: Promise<unknown> = Promise.resolve();
  const recordPreviewUpdate = (id: string, channel?: string): Promise<boolean> => {
    const task = async (): Promise<boolean> => {
      const picked = channel ?? (await load()).requested;
      if (!picked) return true;
      const record = parsePreviewRecord(await read(previewKey));
      const saved = await write(previewKey, JSON.stringify({ channels: withPreviewUpdate(record, picked, id) }));
      if (saved) unsaved.delete(id);
      else unsaved.set(id, picked);
      return saved;
    };
    const next = recordQueue.then(task, task);
    recordQueue = next.catch(() => undefined);
    return next;
  };
  /** Save what couldn't be saved before; true when nothing is left unsaved. */
  const saveUnsaved = async (): Promise<boolean> => {
    for (const [id, channel] of [...unsaved]) await recordPreviewUpdate(id, channel);
    return unsaved.size === 0;
  };
  /** Check and fetch what the current header names. */
  const fetch = async (): Promise<ChannelCheck> => {
    const u = updates as UpdatesModuleLike;
    try {
      const check = await u.checkForUpdateAsync();
      if (check.isAvailable || check.isRollBackToEmbedded) {
        const got = (await u.fetchUpdateAsync()) as { isNew?: boolean; isRollBackToEmbedded?: boolean; manifest?: unknown } | undefined;
        // `{ isNew: false, isRollBackToEmbedded: false }` is a fetch that got nothing (the channel changed in between).
        if (got && got.isNew === false && !got.isRollBackToEmbedded) {
          const error = new Error("The preview didn't download. Try again.");
          report(error);
          return { kind: "error", error };
        }
        // Remember which update a preview downloaded, so its code can be told apart after leaving.
        const id = (got?.manifest as { id?: unknown } | undefined)?.id;
        if (typeof id === "string" && !(await recordPreviewUpdate(id))) {
          const error = new Error("Couldn't save the preview on this phone. Try again.");
          report(error);
          return { kind: "error", error };
        }
        return { kind: "downloaded" };
      }
      const reason = (check as { reason?: string }).reason;
      if (reason === "updatePreviouslyFailed") return { kind: "nothing", reason: "failed" };
      if (reason === "noUpdateAvailableOnServer" || reason === "rollbackNoEmbeddedConfiguration") return { kind: "nothing", reason: "none" };
      // No reason, or a selection-policy rejection: nothing newer this phone would load.
      return { kind: "latest" };
    } catch (raw) {
      if (isChannelNotFoundError(raw)) {
        await dropOverride();
        return { kind: "gone" };
      }
      const error = toError(raw);
      report(error);
      return { kind: "error", error };
    }
  };

  return {
    enabled,
    async switchTo(channel) {
      const name = validName(channel);
      return serial(async () => {
        const off = unavailable();
        if (off) return off;
        const failed = override(name);
        if (failed) return failed;
        await pick(name);
        const got = await fetch();
        if (got.kind === "gone") return { kind: "error", error: new Error(`There is no channel named ${name}.`) };
        if (got.kind === "error") return got;
        if (got.kind === "unavailable") return got;
        return reload();
      });
    },
    async prepare(channel) {
      const name = validName(channel);
      return serial(async () => {
        const off = unavailable();
        if (off) return off;
        const failed = override(name);
        if (failed) return failed;
        await pick(name);
        return fetch();
      });
    },
    async readyToReload() {
      return (await readyToReload()) === null;
    },
    holdReload(work) {
      const held: Promise<boolean> = work.then((value) => value !== false, () => false).finally(() => holds.delete(held));
      holds.add(held);
    },
    noteDownloaded(updateId, channel) {
      // Not behind the write queue: a reset in that queue waits for this (holdReload), not the reverse.
      return (async () => {
        // Still on that preview, or left it while the download ran (the download asked for the
        // preview's header, so it is the preview's): record. Moved to another preview: not this one's.
        const now = (await load()).requested;
        return now === channel || now === null ? recordPreviewUpdate(updateId, channel) : true;
      })();
    },
    restart() {
      return serial(async () => unavailable() ?? reload());
    },
    reset() {
      return serial(async () => {
        const off = unavailable();
        if (off) {
          await pick(null);
          return off;
        }
        // Clearing the override is the part that must happen; a failed check or reload is reported, not a reason to stay.
        await dropOverride();
        const got = await fetch();
        if (got.kind === "error") return got;
        return reload();
      });
    },
    async requested() {
      return (await load()).requested;
    },
    state: load,
    recover(error) {
      if (!isChannelNotFoundError(error)) return Promise.resolve(false);
      return serial(async () => {
        await dropOverride();
        return true;
      });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
