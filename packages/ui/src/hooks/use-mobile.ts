"use client";

import { useSyncExternalStore } from "react";

const MOBILE_BREAKPOINT = 768;
const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(MOBILE_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(MOBILE_QUERY).matches;
}

/**
 * The server has no viewport, so it renders desktop. React hydrates against
 * this same `false` and only then re-renders with the viewport's answer, so a
 * phone's first client render matches the server's HTML.
 */
function getServerSnapshot(): boolean {
  return false;
}

/** Whether the viewport is narrower than the mobile breakpoint (768px). */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
