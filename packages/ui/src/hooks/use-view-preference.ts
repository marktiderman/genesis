"use client";

import { useCallback } from "react";
import { usePersistedUiState } from "@marktiderman/genesis-core/hooks";
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
// usePersistedUiState keeps every hook on a key in step (two lists of one resource, a header
// toggle and a page body) and other tabs too, reads storage SSR-safely, and holds a choice
// storage didn't keep for the hook's lifetime. Values are the mode as plain text.
const MODE_FORMAT = {
  parse: (raw: string) => (isViewMode(raw) ? raw : undefined),
  serialize: (mode: ViewMode | undefined) => mode ?? "",
};

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
  const isMobile = useIsMobile();
  const responsive = typeof defaultMode !== "string";
  const [chosen, setChosen] = usePersistedUiState<ViewMode | undefined>(choiceKey(key), undefined, MODE_FORMAT);
  // The legacy key is read only for a plain default (see the storage keys above), never written.
  const [legacy] = usePersistedUiState<ViewMode | undefined>(responsive ? null : legacyKey(key), undefined, MODE_FORMAT);

  const fallback = !responsive
    ? defaultMode
    : isMobile
        ? defaultMode.mobile
        : defaultMode.desktop;

  const setMode = useCallback((mode: ViewMode) => setChosen(mode), [setChosen]);

  return [chosen ?? legacy ?? fallback, setMode];
}
