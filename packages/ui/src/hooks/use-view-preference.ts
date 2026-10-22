"use client";

import { useState, useCallback, useSyncExternalStore } from "react";
import { useStorage } from "@marktiderman/genesis-core";
import type { ViewMode } from "../components/patterns/view-toggle";
import { useIsMobile } from "./use-mobile";

/**
 * A default view that depends on the viewport: cards on a phone, a table on
 * a desktop. Only the DEFAULT is responsive — once the user picks a view it
 * is theirs on every screen size.
 *
 * @stability Beta
 */
export interface ResponsiveViewMode {
  /** Below the mobile breakpoint (768px). */
  mobile: ViewMode;
  /** At or above the mobile breakpoint. */
  desktop: ViewMode;
}

/** @stability Beta */
export type ViewModeDefault = ViewMode | ResponsiveViewMode;

const VIEW_MODES: readonly ViewMode[] = ["grid", "table", "list"];

function isViewMode(value: unknown): value is ViewMode {
  return typeof value === "string" && (VIEW_MODES as readonly string[]).includes(value);
}

/**
 * The user's view mode for a list, persisted under `genesis-view-choice-<key>`.
 *
 * Only an explicit choice is written. The default is never stored: writing
 * it on mount would turn "cards on phones" into a stored choice the first
 * time the page rendered on a phone, and the desktop would then open in
 * cards too — the default would stop being a default. Likewise a later
 * change to the default reaches every user who has not chosen.
 *
 * SSR: the server renders the desktop default (it has no viewport), and a
 * phone switches to its mobile default right after hydration — the same
 * contract as `useIsMobile`, so there is no hydration mismatch.
 */
// Same-tab subscribers: a choice made by one hook instance reaches every
// other instance reading the same key (two lists of one resource, a header
// toggle and a page body). Other tabs arrive through the `storage` event.
const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** The server has no stored preference; hydrate against the default. */
function getServerSnapshot(): null {
  return null;
}

/**
 * Storage keys. Earlier versions wrote the DEFAULT to `genesis-view-<key>`
 * on mount, so a value there may be a real choice or just a stale default —
 * there is no telling which. Explicit choices now go to their own key. The
 * legacy key is still honoured for a plain default (where a stale default
 * and the default agree, so reading it changes nothing), but not for a
 * responsive one, which it would otherwise pin to whatever the first device
 * stored.
 */
const choiceKey = (key: string) => `genesis-view-choice-${key}`;
const legacyKey = (key: string) => `genesis-view-${key}`;

export function useViewPreference(
  key: string,
  defaultMode: ViewModeDefault = "grid",
): [ViewMode, (mode: ViewMode) => void] {
  const storage = useStorage();
  const storageKey = choiceKey(key);
  const isMobile = useIsMobile();
  const responsive = typeof defaultMode !== "string";

  // `useSyncExternalStore` rather than a `useState` initializer: the server
  // renders with no stored value, so reading storage during the client's
  // first render would mismatch the server's HTML. React hydrates against
  // `getServerSnapshot` and then re-renders with the stored choice; a
  // client-only render reads storage directly, with no flash.
  const getSnapshot = useCallback(
    () => storage.getItem(storageKey),
    [storage, storageKey],
  );
  const getLegacySnapshot = useCallback(
    () => (responsive ? null : storage.getItem(legacyKey(key))),
    [storage, key, responsive],
  );
  const stored = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const legacy = useSyncExternalStore(
    subscribe,
    getLegacySnapshot,
    getServerSnapshot,
  );
  // `undefined` = the user has not chosen; fall through to the default.
  const chosen = isViewMode(stored)
    ? stored
    : isViewMode(legacy)
      ? legacy
      : undefined;

  const fallback = !responsive
    ? defaultMode
    : isMobile
        ? defaultMode.mobile
        : defaultMode.desktop;

  // Holds a choice storage did not keep (quota, private mode, a no-op
  // adapter), so it still applies for this hook's lifetime. Adapters
  // swallow write errors, so the write is checked by reading it back.
  const [unsaved, setUnsaved] = useState<ViewMode | undefined>(undefined);

  const setMode = useCallback(
    (mode: ViewMode) => {
      let saved: string | null = null;
      try {
        storage.setItem(storageKey, mode);
        saved = storage.getItem(storageKey);
      } catch {
        saved = null;
      }
      setUnsaved(saved === mode ? undefined : mode);
      for (const listener of listeners) listener();
    },
    [storage, storageKey],
  );

  return [unsaved ?? chosen ?? fallback, setMode];
}
