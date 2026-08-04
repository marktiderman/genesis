"use client";

import { useState, useEffect } from "react";
import { useStorage } from "@marktiderman/genesis-core";
import type { ViewMode } from "../components/patterns/view-toggle";

export function useViewPreference(
  key: string,
  defaultMode: ViewMode = "grid",
): [ViewMode, (mode: ViewMode) => void] {
  const storage = useStorage();
  const storageKey = `genesis-view-${key}`;
  const [mode, setMode] = useState<ViewMode>(() => {
    return (storage.getItem(storageKey) as ViewMode) || defaultMode;
  });

  useEffect(() => {
    storage.setItem(storageKey, mode);
  }, [mode, storageKey, storage]);

  return [mode, setMode];
}
