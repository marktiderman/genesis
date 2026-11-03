"use client";

import { useCallback, useSyncExternalStore } from "react";

const MOBILE_BREAKPOINT = 768;
const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

const canMatch = () => typeof window !== "undefined" && typeof window.matchMedia === "function";

/**
 * Whether a media query matches, as it changes. The server has no viewport, so
 * it renders `serverValue`; React hydrates against that same value and only
 * then re-renders with the viewport's answer, so the first client render
 * matches the server's HTML.
 */
export function useMediaQuery(query: string, serverValue = false): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!canMatch()) return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener?.("change", onChange);
      return () => mql.removeEventListener?.("change", onChange);
    },
    [query],
  );
  const getSnapshot = useCallback(() => (canMatch() ? window.matchMedia(query).matches : serverValue), [query, serverValue]);
  return useSyncExternalStore(subscribe, getSnapshot, () => serverValue);
}

/** Whether the viewport is narrower than the mobile breakpoint (768px). The server renders desktop. */
export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_QUERY, false);
}
