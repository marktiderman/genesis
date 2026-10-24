/**
 * Hold a deep link until sign-in completes.
 *
 * A link that arrives while nobody is signed in is held (one: the latest
 * wins), the user signs in, and the app is sent where the link pointed.
 * The hold lives outside React, because expo-router's `+native-intent` runs
 * before any component:
 *
 *   // lib/links.ts
 *   export const linkHold = createLinkHold();
 *   // app/+native-intent.ts
 *   export function redirectSystemPath({ path }) {
 *     const to = normalizeLink(path, links);
 *     if (to && to !== "/") linkHold.hold(to);
 *     return to;
 *   }
 *
 * `GenesisNativeApp` releases it (`links.onRelease`) once signed in; elsewhere
 * call `useHeldLink(linkHold, { ready, onRelease })`.
 */
import { useEffect, useRef, useSyncExternalStore } from "react";

export interface LinkHold {
  /** Hold `path`, replacing any held one. */
  hold(path: string): void;
  peek(): string | null;
  /** Return the held path and forget it. */
  take(): string | null;
  clear(): void;
  subscribe(listener: () => void): () => void;
}

/** A place to hold one deep link until sign-in completes; lives outside React. */
export function createLinkHold(): LinkHold {
  let held: string | null = null;
  const listeners = new Set<() => void>();
  const set = (next: string | null) => {
    if (held === next) return;
    held = next;
    for (const listener of listeners) listener();
  };
  return {
    hold: (path) => set(path),
    peek: () => held,
    take() {
      const path = held;
      set(null);
      return path;
    },
    clear: () => set(null),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export interface UseHeldLinkOptions {
  /** True once the link may be followed (signed in, boot finished). */
  ready: boolean;
  /** Go there, e.g. `(path) => router.replace(path)`. Called once per held link. */
  onRelease: (path: string) => void;
}

/** Release the held link once `ready`; returns the link still held. */
export function useHeldLink(hold: LinkHold, { ready, onRelease }: UseHeldLinkOptions): string | null {
  const held = useSyncExternalStore(hold.subscribe, hold.peek, hold.peek);
  const release = useRef(onRelease);
  release.current = onRelease;
  useEffect(() => {
    if (!ready || held === null) return;
    const path = hold.take();
    if (path !== null) release.current(path);
  }, [ready, held, hold]);
  return held;
}
