/**
 * Genesis settings for whoever is signed in: Supabase's `genesis_settings` and the tenant and
 * person layers, kept current over Realtime (`watchAppSettings`), for support's keys and error
 * reporting's (`observability.*`). Support and its context dump read them each time they need one
 * (`appSettings: starterSettings.current`), Sentry gets each change (`sentry.applySettings`), and
 * a screen that shows something a setting switches re-renders with `useStarterSettings`. With
 * none read yet, the `max` preset: everything on.
 *
 * The settings need a signed-in person, so the first launch starts Sentry from them after sign-in;
 * every later launch starts it at once from what this device kept (`src/lib/observability.ts`).
 *
 * The root layout starts the watch (`useWatchStarterSettings`) for as long as the app is mounted.
 */
import { useEffect, useSyncExternalStore } from "react";
import { settingsCatalogue, type SettingsCatalogue } from "@marktiderman/genesis-config/settings";
import { observabilitySettings } from "@marktiderman/genesis-native/observability";
import { watchAppSettings, type AppSettings, type RealtimeSettingsClient } from "@marktiderman/genesis-supabase";
import { SUPPORT_SETTINGS_DECLARATIONS } from "@marktiderman/genesis-support";
import { sentry } from "./observability";
import { supabase } from "./supabase";

let catalogue: SettingsCatalogue | undefined;
/** Support's keys and error reporting's. */
export function starterSettingsCatalogue(): SettingsCatalogue {
  return (catalogue ??= settingsCatalogue([...SUPPORT_SETTINGS_DECLARATIONS, observabilitySettings]));
}

/** What the watch needs of the Supabase client: settings, Realtime and the signed-in person. */
export interface SettingsAuthClient extends RealtimeSettingsClient {
  auth: {
    onAuthStateChange(callback: (event: string, session: { user: { id: string } } | null) => void): { data: { subscription: { unsubscribe(): void } } };
  };
}

export interface StarterSettings {
  /** The settings as last read, or `undefined` before the first read for this person. */
  current(): AppSettings | undefined;
  subscribe(listener: () => void): () => void;
  /** Follow the settings of whoever is signed in, until the returned stop. */
  start(): () => void;
}

export function createStarterSettings(client: SettingsAuthClient, onError: (error: unknown) => void): StarterSettings {
  let value: AppSettings | undefined;
  const listeners = new Set<() => void>();
  const set = (next: AppSettings | undefined) => {
    value = next;
    for (const listener of listeners) listener();
  };
  return {
    current: () => value,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start() {
      const catalogue = starterSettingsCatalogue();
      let person: string | null | undefined;
      let stop: (() => void) | undefined;
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        const next = session?.user.id ?? null;
        // A token refresh is the same person: the watch keeps going.
        if (next === person) return;
        person = next;
        stop?.();
        // One person's values never stand for another's: none until this person's are read.
        if (value !== undefined) set(undefined);
        stop = watchAppSettings(client, catalogue, { ...(next ? { personId: next } : {}), onChange: set, onError });
      });
      return () => {
        stop?.();
        data.subscription.unsubscribe();
        // No longer followed: nothing read for whoever comes next stands for them.
        if (value !== undefined) set(undefined);
      };
    },
  };
}

/** The app's settings. */
export const starterSettings = createStarterSettings(supabase, (error) => console.warn(`[settings] ${error instanceof Error ? error.message : String(error)}`));

// Sentry follows the settings: started, stopped or waiting for the next launch (signed out: no change).
const reporting = sentry;
if (reporting) starterSettings.subscribe(() => reporting.applySettings(starterSettings.current()));

/** The settings now, re-rendering when they change. */
export function useStarterSettings(): AppSettings | undefined {
  return useSyncExternalStore(starterSettings.subscribe, starterSettings.current, starterSettings.current);
}

/** Follows the settings while the calling component is mounted (the root layout), when `on`. */
export function useWatchStarterSettings(on: boolean): void {
  useEffect(() => (on ? starterSettings.start() : undefined), [on]);
}
