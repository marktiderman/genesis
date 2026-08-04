"use client";

import { useState, useEffect, useCallback } from "react";
import { useStorage } from "@marktiderman/genesis-core";

export type Density = "compact" | "comfortable" | "spacious";

export interface ViewSettings {
  pageSize: number;
  density: Density;
  defaultSort?: { key: string; direction: "asc" | "desc" };
}

const DEFAULT_SETTINGS: ViewSettings = {
  pageSize: 25,
  density: "comfortable",
};

export function useViewSettings(key: string) {
  const storage = useStorage();
  const storageKey = `genesis-settings-${key}`;

  const [settings, setSettings] = useState<ViewSettings>(() => {
    try {
      const saved = storage.getItem(storageKey);
      if (saved) return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
    } catch {
      // ignore
    }
    return DEFAULT_SETTINGS;
  });

  useEffect(() => {
    storage.setItem(storageKey, JSON.stringify(settings));
  }, [settings, storageKey, storage]);

  const updateSetting = useCallback(
    <K extends keyof ViewSettings>(settingKey: K, value: ViewSettings[K]) => {
      setSettings((prev) => ({ ...prev, [settingKey]: value }));
    },
    [],
  );

  return { settings, updateSetting };
}
