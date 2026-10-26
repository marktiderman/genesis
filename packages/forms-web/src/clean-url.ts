// A public form's address bar shows only its path: the link's query (?about=, ?staff=,
// ?edit=, utm_…) is read on load, then taken out of the visible URL. The page keeps using
// the values it read: the router isn't told, so its state keeps the query. A reload within
// the same tab gets them back, since the query is kept in sessionStorage for a little while.
//
// Cosmetic, not security: the server checks every value it is sent, and anyone holding
// the link still has it. It keeps the parameters out of screenshots, shared addresses and
// over-the-shoulder reads. Moved up from the host app's src/lib/forms/clean-url.ts.

const KEY_PREFIX = "form-query:";
/** How long a reload brings the query back: 30 minutes. */
export const HIDDEN_QUERY_KEEP_MS = 30 * 60 * 1000;

/** The parts of `window` `hideQueryOnLoad` uses (pass `window`; tests pass a fake). */
export interface HiddenQueryWindow {
  location: { pathname: string; search: string; hash: string; replace(url: string): void };
  history: { state: unknown; replaceState(data: unknown, unused: string, url: string): void };
  sessionStorage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
}

/**
 * Run once when the page has read its query. Returns "hidden" when it took the query out
 * of the address bar, "restoring" when a reload is bringing a hidden query back (the page
 * is about to load again), else "none".
 */
export function hideQueryOnLoad(
  win: HiddenQueryWindow,
  isReload: boolean,
  now = Date.now(),
): "hidden" | "restoring" | "none" {
  const { pathname, search, hash } = win.location;
  const key = KEY_PREFIX + pathname;
  try {
    if (search && search !== "?") {
      win.sessionStorage.setItem(key, JSON.stringify({ search, at: now }));
      // The browser's own replaceState: a router may patch the instance's and would re-read
      // the address, losing the query the page reads (link inputs, ?edit).
      const replace = nativeReplaceState(win.history);
      replace.call(win.history, win.history.state, "", pathname + hash);
      return "hidden";
    }
    const saved = win.sessionStorage.getItem(key);
    if (!saved) return "none";
    const { search: kept, at } = JSON.parse(saved) as { search?: unknown; at?: unknown };
    if (isReload && typeof kept === "string" && typeof at === "number" && now - at < HIDDEN_QUERY_KEEP_MS) {
      win.location.replace(pathname + kept + hash);
      return "restoring";
    }
    win.sessionStorage.removeItem(key);
  } catch {
    // Storage blocked (private windows): the query just stays visible.
  }
  return "none";
}

/** History's prototype replaceState when there is one (a real browser), else the instance's. */
function nativeReplaceState(history: HiddenQueryWindow["history"]): HiddenQueryWindow["history"]["replaceState"] {
  const proto = Object.getPrototypeOf(history) as Partial<HiddenQueryWindow["history"]> | null;
  return typeof proto?.replaceState === "function" ? proto.replaceState : history.replaceState;
}

/** Whether this page load was a reload (Navigation Timing), in the browser; false elsewhere. */
export const wasReload = (): boolean =>
  typeof performance !== "undefined" &&
  (performance.getEntriesByType?.("navigation")[0] as PerformanceNavigationTiming | undefined)?.type === "reload";
