/**
 * Hold a deep link until sign-in completes.
 *
 * expo-router opens every incoming link itself. For a signed-in user that is
 * all that should happen. For a signed-out user, the auth layout redirects to
 * sign-in and the link is lost; holding it lets the app go there once the user
 * has signed in. The hold lives outside React, because expo-router's
 * `+native-intent` runs before any component:
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
 * `useHeldLink` follows a held link only if the user was seen signed out
 * while it was held. A link that arrives while signed in, or at a cold start
 * that turns out signed in, is dropped, since the router already opened it.
 * `GenesisNativeApp` runs it for you (`links.onRelease`).
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

/** `"pending"` while booting or reading the session. */
export type HeldLinkAuth = "pending" | "signedOut" | "signedIn";

export interface UseHeldLinkOptions {
  auth: HeldLinkAuth;
  /** Go there, e.g. `(path) => router.replace(path)`. Called once per link held across a sign-in. */
  onRelease: (path: string) => void;
}

/** Follow the held link after a sign-in, drop it otherwise; returns the link still held. */
export function useHeldLink(hold: LinkHold, { auth, onRelease }: UseHeldLinkOptions): string | null {
  const held = useSyncExternalStore(hold.subscribe, hold.peek, hold.peek);
  const release = useRef(onRelease);
  release.current = onRelease;
  // Was the user signed out while this link was held?
  const waitedForSignIn = useRef(false);
  useEffect(() => {
    if (held === null) {
      waitedForSignIn.current = false;
      return;
    }
    if (auth === "signedOut") waitedForSignIn.current = true;
    if (auth !== "signedIn") return;
    const path = hold.take();
    const follow = waitedForSignIn.current;
    waitedForSignIn.current = false;
    if (path !== null && follow) release.current(path);
  }, [auth, held, hold]);
  return held;
}
