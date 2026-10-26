import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { Fragment, useState, type ReactNode } from "react";
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

export interface ViewerScopeProps {
  /** The signed-in viewer's id, null when signed out, undefined while the session loads. */
  viewer: string | null | undefined;
  /**
   * The viewer a persisted cache was saved for. When the first known viewer
   * is this one, the restored cache is kept; otherwise it's emptied.
   */
  persistedViewer?: string | null;
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
export function ViewerScope({ viewer, persistedViewer, fallback = null, children }: ViewerScopeProps) {
  const queryClient = useQueryClient();
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
  return <Fragment key={viewer ?? "signed-out"}>{children}</Fragment>;
}
