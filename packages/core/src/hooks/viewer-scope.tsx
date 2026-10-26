import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { createContext, Fragment, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { dayIn, personTimeZone, type Day } from "../dates";
import { stableJson } from "./draft-controller";
import { dropPendingWrites, flushPendingWrites } from "./mutation-mode";

/** Today in `zone`, rechecked when the page comes back into view and at the next minute boundary while it's open. */
function useToday(zone: string): Day {
  const [day, setDay] = useState(() => dayIn(zone));
  useEffect(() => {
    const check = () => setDay(dayIn(zone));
    check();
    const onVisible = () => {
      if (typeof document === "undefined" || document.visibilityState === "visible") check();
    };
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);
    // A page left open over midnight rolls over within a minute.
    const timer = setInterval(check, 60_000);
    return () => {
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, [zone]);
  return day;
}

/**
 * Empties the query cache for a new viewer: sends the old viewer's waiting
 * undoable writes (the session is still theirs), cancels reads in flight,
 * then removes every query. Call it in the sign-in and sign-out actions,
 * before the session changes.
 */
export async function clearViewerCache(queryClient: QueryClient): Promise<void> {
  await flushPendingWrites(queryClient);
  await queryClient.cancelQueries();
  queryClient.clear();
}

/**
 * Where the viewer is working: the current practice, person or space, or a set
 * of people. Screens turn it into server filters and create defaults; it never
 * decides access (row-level security does).
 */
export interface ResourceScope {
  practiceId?: string;
  personId?: string;
  spaceId?: string;
  /** Several people at once (a coach's client list, a group). */
  personIds?: readonly string[];
  [key: string]: unknown;
}

export interface ViewerContext {
  viewer: string | null;
  scope: ResourceScope;
  /** The zone the viewer's days are counted in: theirs if known, else the device's. */
  timeZone: string;
  /**
   * Today on the viewer's clock (YYYY-MM-DD), kept current when the page comes back into view.
   * Use it for every "today" read and as query keys' `day`: `keys.for(useViewerScope())`.
   */
  day: Day;
}

const ViewerContextValue = createContext<ViewerContext | null>(null);

/** The viewer and scope from the nearest `ViewerScope`. Throws without one: screens that cache per viewer need it. */
export function useViewerScope(): ViewerContext {
  const value = useContext(ViewerContextValue);
  if (!value) throw new Error("[genesis-core] useViewerScope needs a <ViewerScope> above it");
  return value;
}

/** Like useViewerScope, or null outside a ViewerScope. */
export function useOptionalViewerScope(): ViewerContext | null {
  return useContext(ViewerContextValue);
}

export interface ViewerScopeProps {
  /** The signed-in viewer's id, null when signed out, undefined while the session loads. */
  viewer: string | null | undefined;
  /**
   * The viewer a persisted cache was saved for. When the first known viewer
   * is this one, the restored cache is kept; otherwise it's emptied.
   */
  persistedViewer?: string | null;
  /** Where the viewer is working (see `ResourceScope`). Changing it doesn't remount or clear anything. */
  scope?: ResourceScope;
  /**
   * The viewer's saved time zone (IANA), when known; else the device's is used. Pass it when
   * rendering on a server, whose own zone is rarely the viewer's.
   */
  timeZone?: string | null;
  /** Shown while the session loads (and for the one render a change takes). */
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Keeps one viewer's cached data from ever showing to the next. Children
 * render only once the viewer is known, under a key of that viewer, so a
 * sign-out or a new person signing in unmounts every screen and its queries
 * before the cache is emptied and the new viewer's screens mount fresh. The
 * first known viewer empties a restored cache too, unless it's the
 * `persistedViewer` it was saved for.
 *
 * ```tsx
 * <ViewerScope viewer={session === undefined ? undefined : (session?.user.id ?? null)}>
 *   <App />
 * </ViewerScope>
 * ```
 */
export function ViewerScope({ viewer, persistedViewer, scope, timeZone, fallback = null, children }: ViewerScopeProps) {
  const queryClient = useQueryClient();
  const zone = personTimeZone({ timeZone });
  const day = useToday(zone);
  // A new scope object each render shouldn't re-render every reader: compare by value.
  const scopeKey = stableJson(scope ?? {});
  const value = useMemo<ViewerContext>(
    () => ({ viewer: viewer ?? null, scope: scope ?? {}, timeZone: zone, day }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [viewer, scopeKey, zone, day],
  );
  // The viewer the children were last mounted for; undefined before the first.
  const [mounted, setMounted] = useState<string | null | undefined>(undefined);
  if (viewer === undefined) return <>{fallback}</>;
  if (viewer !== mounted) {
    const keep = mounted === undefined && persistedViewer !== undefined && persistedViewer === viewer;
    // Nothing for the new viewer is mounted yet, so emptying now can't strand
    // a fetch; the old viewer's screens unmount with this render.
    if (!keep) {
      // The session already belongs to the new viewer: the old one's unsent
      // writes must never go out under it. (clearViewerCache, run before the
      // session changes, sends them instead.)
      dropPendingWrites(queryClient);
      void queryClient.cancelQueries();
      queryClient.clear();
    }
    setMounted(viewer);
    return <>{fallback}</>;
  }
  return (
    <ViewerContextValue.Provider value={value}>
      <Fragment key={viewer ?? "signed-out"}>{children}</Fragment>
    </ViewerContextValue.Provider>
  );
}
