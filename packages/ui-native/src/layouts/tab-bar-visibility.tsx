/**
 * Tab bar visibility per screen: UIKit's `hidesBottomBarWhenPushed` for any Genesis screen.
 *
 * Top-level screens show the tab bar. A drill-down or an immersive screen (a conversation, a
 * photo, a player) may hide it while it's on screen; the stack keeps its back button, its push
 * transition and the edge swipe back, and a deep link to the screen opens it the same way. iOS's
 * guidelines: the tab bar stays visible across a tab's hierarchy, and hides only for a screen
 * that needs the whole height.
 *
 * Wrap the tab navigator once, in the tabs layout:
 *
 *   <TabBarVisibilityProvider>
 *     {(hidden) => <NativeTabs hidden={hidden}>…</NativeTabs>}
 *   </TabBarVisibilityProvider>
 *
 * (expo-router's `NativeTabs` takes `hidden` from SDK 55; a JS `Tabs` navigator takes
 * `tabBarStyle: hidden ? { display: "none" } : undefined`; `NativeTabBar` takes `hidden`.)
 * Then a screen hides it with `<ScreenContainer tabBar="hidden">` or `useHideTabBar()`.
 *
 * A count, not a flag: pushing one hiding screen over another focuses the new one before the old
 * one's blur runs, and a flag would show the bar again under the new screen.
 *
 * Focus comes from `GenesisModules.router.useFocusEffect` (expo-router's). Without it the bar
 * hides while the screen is mounted, which is the same for a stack's top screen.
 *
 * @stability Beta
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useGenesisModules } from "../native-modules";

interface TabBarVisibilityControl {
  /** Hides the bar until the returned function runs (once). */
  hide: () => () => void;
  hidden: boolean;
}

const TabBarVisibilityContext = createContext<TabBarVisibilityControl | null>(null);

export interface TabBarVisibilityProviderProps {
  /** Receives whether a focused screen asked to hide the bar; pass it to the tab navigator. */
  children: (hidden: boolean) => ReactNode;
}

/** Holds whether the tab bar is hidden, for the tab navigator it wraps. */
export function TabBarVisibilityProvider({ children }: TabBarVisibilityProviderProps) {
  const [hiders, setHiders] = useState(0);
  const hide = useCallback(() => {
    setHiders((n) => n + 1);
    let shown = false;
    return () => {
      if (shown) return;
      shown = true;
      setHiders((n) => Math.max(0, n - 1));
    };
  }, []);
  const hidden = hiders > 0;
  const control = useMemo(() => ({ hide, hidden }), [hide, hidden]);
  return <TabBarVisibilityContext.Provider value={control}>{children(hidden)}</TabBarVisibilityContext.Provider>;
}

/** Runs `effect` while the screen is mounted: the stand-in for focus without a router. */
function useMountEffect(effect: () => void | (() => void)) {
  useEffect(effect, [effect]);
}

/** Runs `effect` while the screen is focused when the app passed `router.useFocusEffect`, else while it's mounted. */
function useScreenEffect(effect: () => void | (() => void)) {
  const { router } = useGenesisModules();
  // Set once at the app's root, so the same hook runs on every render.
  const useFocus = router?.useFocusEffect ?? useMountEffect;
  useFocus(effect);
}

/**
 * Hides the tab bar while this screen is focused, and shows it again when it blurs or unmounts.
 * Pass `false` to keep it (a screen that hides it only in one mode). Outside a
 * `TabBarVisibilityProvider` it does nothing.
 */
export function useHideTabBar(enabled = true) {
  const control = useContext(TabBarVisibilityContext);
  const hide = control?.hide;
  useScreenEffect(
    useCallback(() => {
      if (!hide || !enabled) return undefined;
      return hide();
    }, [hide, enabled]),
  );
}

/** Whether a screen has hidden the tab bar: for chrome that sits above it (a floating bar, a mini player). */
export function useTabBarHidden(): boolean {
  return useContext(TabBarVisibilityContext)?.hidden ?? false;
}

/** Stand-in for `usePathname` without a router: no path, so nothing is remembered. */
function useNoPathname(): string | undefined {
  return undefined;
}

/** What `createPlaceExit` returns: remember the last path outside, and where Back leaves to. */
export interface PlaceExit {
  /** Keeps the last path outside the place. Mount once, above the tabs (the root layout). */
  useRememberOutside: () => void;
  /**
   * Where the place's first screen goes back to: the last path outside it (when `accept` takes
   * it, e.g. the same zone), else `fallback` (opened straight in from a notification or a link).
   */
  exitPath: (fallback: string, accept?: (path: string) => boolean) => string;
  /** Tests: set the remembered path. */
  setLastOutside: (path: string | null) => void;
}

/**
 * A place of its own inside the tabs, as Messages is on iOS: while it's open the tab bar hides
 * for its whole stack (`useHideTabBar` on each of its screens), and its first screen has a back
 * button (and the edge swipe) that returns to where the person came from, in another tab. This
 * remembers that place: the last path outside `isInside`. Navigation stays the app's:
 * `router.navigate(exit.exitPath("/"))`. Reads the path through `GenesisModules.router.usePathname`.
 *
 *   export const messagesExit = createPlaceExit((path) => /^\/messages(\/|$)/.test(path));
 */
export function createPlaceExit(isInside: (path: string) => boolean): PlaceExit {
  let lastOutside: string | null = null;
  return {
    useRememberOutside() {
      const { router } = useGenesisModules();
      const usePath = router?.usePathname ?? useNoPathname;
      const path = usePath();
      useEffect(() => {
        if (path && !isInside(path)) lastOutside = path;
      }, [path]);
    },
    exitPath(fallback, accept) {
      return lastOutside && (!accept || accept(lastOutside)) ? lastOutside : fallback;
    },
    setLastOutside(path) {
      lastOutside = path;
    },
  };
}
