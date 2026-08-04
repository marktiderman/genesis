/**
 * Route prefetch utilities -- configurable chunk preloading for navigation.
 *
 * Use `createPrefetch` to build prefetch functions for any route map,
 * or import the Genesis-specific `prefetch` / `prefetchHandlers` directly.
 */

export type RouteMap = Record<string, () => Promise<unknown>>;

/**
 * Factory: create prefetch + prefetchHandlers bound to a given route map.
 */
export function createPrefetch(routeMap: RouteMap) {
  const prefetched = new Set<string>();

  function prefetch(path: string): void {
    if (prefetched.has(path)) return;
    const loader = routeMap[path];
    if (loader) {
      prefetched.add(path);
      loader();
    }
  }

  function prefetchHandlers(path: string) {
    return {
      onMouseEnter: () => prefetch(path),
      onFocus: () => prefetch(path),
    };
  }

  return { prefetch, prefetchHandlers } as const;
}

// Each consuming app calls createPrefetch(theirRouteMap) to get their own instance.
