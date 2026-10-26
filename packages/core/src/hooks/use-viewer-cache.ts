import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

/**
 * Whether the cache must be emptied going from `previous` to `next` viewer:
 * any change except the first known viewer after loading (undefined → someone).
 */
export function viewerChanged(previous: string | null | undefined, next: string | null | undefined): boolean {
  return previous !== next && previous !== undefined;
}

/**
 * Empties the query cache when the signed-in viewer changes (a sign-out, or
 * another person signing in on the same device), so nothing cached for one
 * person ever shows to the next. Call it once, where the session is known:
 * `useViewerCache(session?.user.id ?? null)`, with `undefined` while the
 * session is still loading. The first viewer, and the same one again, keep
 * the cache.
 */
export function useViewerCache(viewer: string | null | undefined): void {
  const queryClient = useQueryClient();
  const last = useRef(viewer);
  useEffect(() => {
    const clear = viewerChanged(last.current, viewer);
    last.current = viewer;
    if (clear) queryClient.clear();
  }, [viewer, queryClient]);
}
