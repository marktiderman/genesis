/**
 * Switching a test build to another update channel (EAS "channel surfing"):
 * override the `expo-channel-name` header, check, fetch, reload. The
 * override persists on the device until it is reset or the app is removed.
 *
 * Off unless you turn it on, and turn it on only in development and preview
 * builds (`enabled: __DEV__ || isPreviewBuild`): a store build that can be
 * pointed at any channel can be pointed at an unreviewed one. Going back
 * (`reset`) always works, for everyone, because it only removes the
 * override.
 *
 * Switching reloads, so it respects the reload guard: with unsaved changes
 * it sets the channel and says `blocked`; the channel applies on the next
 * launch.
 */
import { toError, type UpdatesModuleLike, type UpdatesOnError, type UpdatesStorageLike } from "./modules";
import type { ReloadGuard } from "./checker";

export type ChannelSwitchResult =
  /** The reload was sent; JS may stop at any moment. */
  | { kind: "reloading" }
  /** The channel is set, but something is mid-edit: it applies on the next launch. */
  | { kind: "blocked" }
  /** expo-updates is off or too old here (development, Expo Go). Nothing changed. */
  | { kind: "unavailable"; reason: string }
  /** The channel is set but checking, fetching or reloading failed. */
  | { kind: "error"; error: Error };

export interface ChannelSwitcher {
  /** True when this build may switch channels (`channels.enabled`). */
  readonly enabled: boolean;
  /** Switch to `channel` and reload. Throws when switching is off. */
  switchTo(channel: string): Promise<ChannelSwitchResult>;
  /** Back to the build's own channel. Always allowed. */
  reset(): Promise<ChannelSwitchResult>;
  /** The channel picked on this device, or `null` when it follows the build. */
  requested(): Promise<string | null>;
}

export interface ChannelSwitcherOptions {
  updates?: UpdatesModuleLike;
  /** Must be explicitly true (development and preview builds only). */
  enabled: boolean;
  guard: ReloadGuard;
  /** Remembers the picked channel, for the version signature. */
  storage?: UpdatesStorageLike;
  /** Default `"genesis:updates:channel"`. */
  storageKey?: string;
  reloadScreenOptions?: object;
  onError?: UpdatesOnError;
}

const CHANNEL = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/;

export function createChannelSwitcher(options: ChannelSwitcherOptions): ChannelSwitcher {
  const { updates, enabled, guard, storage, storageKey = "genesis:updates:channel", reloadScreenOptions, onError } = options;
  const report = (error: Error) => {
    try {
      onError?.(error, "channel");
    } catch {
      // ignore a failing reporter
    }
  };
  const unavailable = (): ChannelSwitchResult | null => {
    if (!updates?.isEnabled) return { kind: "unavailable", reason: "Updates are off in this build (development or Expo Go)." };
    if (typeof updates.setUpdateRequestHeadersOverride !== "function") {
      return { kind: "unavailable", reason: "This expo-updates can't override the channel." };
    }
    return null;
  };
  const save = async (channel: string | null) => {
    if (!storage) return;
    try {
      if (channel === null) await (storage.removeItem ? storage.removeItem(storageKey) : storage.setItem(storageKey, ""));
      else await storage.setItem(storageKey, channel);
    } catch (error) {
      report(toError(error));
    }
  };
  const apply = async (): Promise<ChannelSwitchResult> => {
    const u = updates as UpdatesModuleLike;
    try {
      const check = await u.checkForUpdateAsync();
      if (check.isAvailable || check.isRollBackToEmbedded) await u.fetchUpdateAsync();
      if (!guard.canReload()) return { kind: "blocked" };
      await u.reloadAsync(reloadScreenOptions ? { reloadScreenOptions } : undefined);
      return { kind: "reloading" };
    } catch (raw) {
      const error = toError(raw);
      report(error);
      return { kind: "error", error };
    }
  };

  return {
    enabled,
    async switchTo(channel) {
      if (enabled !== true) {
        throw new Error("Channel switching is off. Pass `channels: { enabled: true }` only in development and preview builds.");
      }
      const name = channel.trim();
      if (!CHANNEL.test(name)) throw new Error(`Not a channel name: "${channel}"`);
      const off = unavailable();
      if (off) return off;
      updates!.setUpdateRequestHeadersOverride!({ "expo-channel-name": name });
      await save(name === updates!.channel ? null : name);
      return apply();
    },
    async reset() {
      const off = unavailable();
      if (off) {
        await save(null);
        return off;
      }
      // Clearing the override is the part that must happen; a failed check or reload is reported, not a reason to stay.
      updates!.setUpdateRequestHeadersOverride!(null);
      await save(null);
      return apply();
    },
    async requested() {
      if (!storage) return null;
      try {
        const value = await storage.getItem(storageKey);
        return value ? value : null;
      } catch (error) {
        report(toError(error));
        return null;
      }
    },
  };
}
