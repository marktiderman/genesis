"use client";

import { useState, useEffect, useCallback } from "react";
import { useStorage } from "@marktiderman/genesis-core";

import type { DensityLevel } from "@marktiderman/genesis-design-system/app-styles";

/**
 * A list's density: Genesis's one vocabulary (`DENSITY_LEVELS`: compact,
 * comfortable, spacious), the same words as AppShell's `density` and sites'
 * design systems (ADR 0022).
 */
export type Density = DensityLevel;

export interface ViewSettings {
  pageSize: number;
  density: Density;
  defaultSort?: { key: string; direction: "asc" | "desc" } | undefined;
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
