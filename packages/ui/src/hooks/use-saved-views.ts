"use client";

import { useCallback } from "react";
import { usePersistedUiState } from "@marktiderman/genesis-core/hooks";

/** Same shape as `DataFilters` `savedViews` items — kept local to avoid cycles. */
export interface SavedViewItem {
  id: string;
  name: string;
  filters: Record<string, unknown>;
}

const NO_VIEWS: SavedViewItem[] = [];

/** The stored list, keeping only well-formed views; anything else reads as none. */
function parseViews(raw: string): SavedViewItem[] | undefined {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return undefined;
    return parsed.filter(
      (v): v is SavedViewItem =>
        !!v &&
        typeof v === "object" &&
        typeof (v as SavedViewItem).id === "string" &&
        typeof (v as SavedViewItem).name === "string" &&
        typeof (v as SavedViewItem).filters === "object",
    );
  } catch {
    return undefined;
  }
}
const VIEWS_FORMAT = { parse: parseViews };

export interface UseSavedViewsReturn {
  savedViews: SavedViewItem[];
  saveView: (name: string, filters: Record<string, unknown>) => void;
  deleteView: (id: string) => void;
  loadViewFilters: (id: string) => Record<string, unknown> | null;
}

/**
 * Persist `DataFilters` saved-view shape in the app's storage (localStorage on the web), through
 * usePersistedUiState: SSR-safe, and in step across every list on the same key.
 *
 * @example
 * const { savedViews, saveView, deleteView } = useSavedViews("genesis-map-views");
 * <DataFilters
 *   savedViews={savedViews}
 *   canSaveViews
 *   onSaveView={(name) => saveView(name, currentFilters)}
 *   onLoadView={(filters) => applyFilters(filters)}
 *   onDeleteView={deleteView}
 * />
 */
export function useSavedViews(storageKey: string): UseSavedViewsReturn {
  const [savedViews, setSavedViews] = usePersistedUiState(storageKey, NO_VIEWS, VIEWS_FORMAT);

  const saveView = useCallback(
    (name: string, filters: Record<string, unknown>) => {
      const id = `view-${Date.now().toString(36)}`;
      setSavedViews((prev) => [...prev, { id, name, filters }]);
    },
    [setSavedViews],
  );

  const deleteView = useCallback(
    (id: string) => setSavedViews((prev) => prev.filter((v) => v.id !== id)),
    [setSavedViews],
  );

  const loadViewFilters = useCallback(
    (id: string) => {
      const view = savedViews.find((v) => v.id === id);
      return view?.filters ?? null;
    },
    [savedViews],
  );

  return { savedViews, saveView, deleteView, loadViewFilters };
}
