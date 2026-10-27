import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { createContext, Fragment, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { dayIn, personTimeZone, type Day } from "../dates";
import { stableJson } from "./draft-controller";
import { NO_VIEWER, type GenesisViewerRoles, type Viewer } from "../viewer";
import { dropPendingWrites, flushPendingWrites } from "./mutation-mode";

export { NO_VIEWER, type GenesisViewerRoles, type Viewer };

/**
 * Roles as a value: object keys and lists sorted, so `["editor", "owner"]` equals
 * `["owner", "editor"]`. A Set, Map or class would stringify as `{}` and hide a change, so it throws.
 */
function rolesKeyOf(roles: GenesisViewerRoles): string {
  const plain = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(plain).map((x) => [stableJson(x), x] as const).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, x]) => x);
    if (v && typeof v === "object") {
      const proto = Object.getPrototypeOf(v);
      if (proto !== Object.prototype && proto !== null) throw new TypeError("[genesis-core] ViewerScope roles must be plain JSON (no Set, Map or class)");
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, plain(x)]));
    }
    return v;
  };
  return stableJson(plain(roles));
}

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
  /** The viewer's roles (see `GenesisViewerRoles`), when ViewerScope was given them. */
  roles?: GenesisViewerRoles;
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

/**
 * The viewer for guards: `{ id, scope, roles }` from the nearest ViewerScope, or
 * {@link NO_VIEWER} without one. The object is stable while those are equal by value, so it can
 * sit in a memo's dependencies.
 */
export function useViewer(): Viewer {
  const context = useContext(ViewerContextValue);
  return useMemo<Viewer>(
    () =>
      context
        ? Object.freeze({ id: context.viewer, scope: context.scope, ...(context.roles !== undefined ? { roles: context.roles } : {}) })
        : NO_VIEWER,
    [context],
  );
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
   * What the viewer may do there (see `GenesisViewerRoles`), for view guards. Compared by value,
   * so a new object with the same roles changes nothing. Undefined while they load: guards that
   * need them refuse. Arriving (undefined → roles) or going back to undefined changes nothing;
   * different roles send the person's waiting writes, then reread every query, with nothing
   * remounted. Plain JSON values only (lists are compared as sets, in any order).
   */
  roles?: GenesisViewerRoles;
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
export function ViewerScope({ viewer, persistedViewer, scope, roles, timeZone, fallback = null, children }: ViewerScopeProps) {
  const queryClient = useQueryClient();
  const zone = personTimeZone({ timeZone });
  const day = useToday(zone);
  // A new scope object each render shouldn't re-render every reader: compare by value.
  const scopeKey = stableJson(scope ?? {});
  // Roles by value too: undefined stays undefined, so "not known yet" never equals "none".
  const rolesKey = roles === undefined ? undefined : rolesKeyOf(roles);
  const value = useMemo<ViewerContext>(
    () => ({ viewer: viewer ?? null, scope: scope ?? {}, ...(roles !== undefined ? { roles } : {}), timeZone: zone, day }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [viewer, scopeKey, rolesKey, zone, day],
  );
  // The last roles known for this viewer. Arriving (undefined → roles) or going back to undefined
  // changes nothing; different roles for the same person send their waiting writes, then reread
  // everything under the new roles. Nothing remounts: the person, their drafts and their
  // navigation are the same.
  const known = useRef<{ viewer: string | null | undefined; roles: string | undefined }>({ viewer, roles: undefined });
  useEffect(() => {
    if (known.current.viewer !== viewer) known.current = { viewer, roles: undefined };
    if (rolesKey === undefined) return;
    const previous = known.current.roles;
    known.current.roles = rolesKey;
    if (previous === undefined || previous === rolesKey) return;
    // The session is still theirs: their writes go out, and the database decides each one with the
    // roles as they are when it arrives (a refused one fails as any refused write does).
    void flushPendingWrites(queryClient).then(() => queryClient.invalidateQueries());
  }, [viewer, rolesKey, queryClient]);
  // Who the children were last mounted for, and how many times they were reset. Undefined before
  // the first mount.
  const [mounted, setMounted] = useState<{ viewer: string | null; epoch: number } | undefined>(undefined);
  if (viewer === undefined) return <>{fallback}</>;
  if (mounted === undefined || mounted.viewer !== viewer) {
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
    setMounted({ viewer, epoch: (mounted?.epoch ?? 0) + 1 });
    return <>{fallback}</>;
  }
  return (
    <ViewerContextValue.Provider value={value}>
      <Fragment key={`${viewer ?? "signed-out"}#${mounted.epoch}`}>{children}</Fragment>
    </ViewerContextValue.Provider>
  );
}
