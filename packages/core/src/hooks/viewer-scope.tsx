import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { createContext, Fragment, useContext, useMemo, useState, type ReactNode } from "react";
import { dropPendingWrites, flushPendingWrites } from "./mutation-mode";

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
export function ViewerScope({ viewer, persistedViewer, scope, fallback = null, children }: ViewerScopeProps) {
  const queryClient = useQueryClient();
  // A new scope object each render shouldn't re-render every reader: compare by value.
  const scopeKey = JSON.stringify(scope ?? {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const value = useMemo<ViewerContext>(() => ({ viewer: viewer ?? null, scope: scope ?? {} }), [viewer, scopeKey]);
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
