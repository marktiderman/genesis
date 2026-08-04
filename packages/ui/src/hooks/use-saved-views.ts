"use client";

import { useCallback, useEffect, useState } from "react";

/** Same shape as `DataFilters` `savedViews` items — kept local to avoid cycles. */
export interface SavedViewItem {
  id: string;
  name: string;
  filters: Record<string, unknown>;
}

function readViews(storageKey: string): SavedViewItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is SavedViewItem =>
        !!v &&
        typeof v === "object" &&
        typeof (v as SavedViewItem).id === "string" &&
        typeof (v as SavedViewItem).name === "string" &&
        typeof (v as SavedViewItem).filters === "object",
    );
  } catch {
    return [];
  }
}

function writeViews(storageKey: string, views: SavedViewItem[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey, JSON.stringify(views));
  } catch {
    // quota / private mode — ignore
  }
}

export interface UseSavedViewsReturn {
  savedViews: SavedViewItem[];
  saveView: (name: string, filters: Record<string, unknown>) => void;
  deleteView: (id: string) => void;
  loadViewFilters: (id: string) => Record<string, unknown> | null;
}

/**
 * Persist `DataFilters` saved-view shape in localStorage.
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
  const [savedViews, setSavedViews] = useState<SavedViewItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setSavedViews(readViews(storageKey));
    setHydrated(true);
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    writeViews(storageKey, savedViews);
  }, [savedViews, storageKey, hydrated]);

  const saveView = useCallback((name: string, filters: Record<string, unknown>) => {
    const id = `view-${Date.now().toString(36)}`;
    setSavedViews((prev) => [...prev, { id, name, filters }]);
  }, []);

  const deleteView = useCallback((id: string) => {
    setSavedViews((prev) => prev.filter((v) => v.id !== id));
  }, []);

  const loadViewFilters = useCallback(
    (id: string) => {
      const view = savedViews.find((v) => v.id === id);
      return view?.filters ?? null;
    },
    [savedViews],
  );

  return { savedViews, saveView, deleteView, loadViewFilters };
}
