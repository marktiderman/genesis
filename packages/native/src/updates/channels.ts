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

export function createChannelSwitcher(options: ChannelSwitcherOptions): ChannelSwitcher {
  const { updates, enabled, guard, storage, storageKey = "genesis:updates:channel", reloadScreenOptions, onError } = options;
  const buildKey = `${storageKey}:build`;
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
  const write = async (key: string, value: string | null) => {
    if (!storage) return;
    try {
      if (value === null) await (storage.removeItem ? storage.removeItem(key) : storage.setItem(key, ""));
      else await storage.setItem(key, value);
    } catch (error) {
      report(toError(error));
    }
  };
  const init = async (): Promise<ChannelState> => {
    const requested = await read(storageKey);
    let build = await read(buildKey);
    // A launch with no override runs on the build's own channel: remember it, since under an
    // override `Updates.channel` reports the override instead.
    if (!requested && updates?.channel) {
      build = updates.channel;
      await write(buildKey, build);
    }
    // A pick published while storage was being read is newer: keep it.
    if (!cache) cache = { requested, build };
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
    publish({ ...state, requested });
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
  const reload = async (): Promise<ChannelSwitchResult> => {
    const u = updates as UpdatesModuleLike;
    try {
      if (!guard.canReload()) return { kind: "blocked" };
      // Queued crash reports and events would be lost with the runtime: flush them first.
      await runBeforeReload();
      await u.reloadAsync(reloadScreenOptions ? { reloadScreenOptions } : undefined);
      return { kind: "reloading" };
    } catch (raw) {
      const error = toError(raw);
      report(error);
      return { kind: "error", error };
    }
  };
  /** Check and fetch what the current header names. */
  const fetch = async (): Promise<ChannelCheck> => {
    const u = updates as UpdatesModuleLike;
    try {
      const check = await u.checkForUpdateAsync();
      if (check.isAvailable || check.isRollBackToEmbedded) {
        const got = (await u.fetchUpdateAsync()) as { isNew?: boolean; isRollBackToEmbedded?: boolean } | undefined;
        // `{ isNew: false, isRollBackToEmbedded: false }` is a fetch that got nothing (the channel changed in between).
        if (got && got.isNew === false && !got.isRollBackToEmbedded) {
          const error = new Error("The preview didn't download. Try again.");
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
