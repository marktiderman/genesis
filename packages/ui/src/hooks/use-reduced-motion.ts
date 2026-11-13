"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const list = window.matchMedia(QUERY);
  list.addEventListener?.("change", onChange);
  return () => list.removeEventListener?.("change", onChange);
}

const snapshot = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(QUERY).matches;

/**
 * Whether the person asked their device for less motion (`prefers-reduced-motion: reduce`),
 * kept current as they change it. A custom view that animates (a leaderboard's rows sliding into
 * place) skips or shortens the animation when it's true. False on the server.
 *
 * ```tsx
 * const still = useReducedMotion();
 * <li style={{ transition: still ? "none" : "transform 300ms" }} />
 * ```
 *
 * @stability Beta
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
