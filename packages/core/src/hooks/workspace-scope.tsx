import { createContext, useContext, useEffect, useMemo } from "react";
import { ViewerScope, type ViewerScopeProps } from "./viewer-scope";
import { workspaceAt, workspaceHref, type Workspace, type WorkspaceHrefOptions } from "../workspaces";

/**
 * The workspace the viewer is in, and where each of their others is from here.
 *
 * @stability Beta
 */
export interface WorkspaceContext<W extends Workspace = Workspace> {
  /** Undefined when the URL is in no workspace (the app's front door, a sign-in page). */
  current: W | undefined;
  workspaces: readonly W[];
  /** Where switching to `to` goes from the current URL, keeping the viewer's place when it can. */
  hrefFor: (to: W) => string;
}

const WorkspaceContextValue = createContext<WorkspaceContext | null>(null);

/**
 * The nearest `WorkspaceScope`'s workspaces, or null outside one.
 *
 * @stability Beta
 */
export function useWorkspace<W extends Workspace = Workspace>(): WorkspaceContext<W> | null {
  return useContext(WorkspaceContextValue) as WorkspaceContext<W> | null;
}

const STORAGE_PREFIX = "genesis:workspace:";

/**
 * The workspace this viewer was last in on this device, for the app's front door
 * (`defaultWorkspace(workspaces, rememberedWorkspaceId(viewer))`). Null when unknown.
 *
 * @stability Beta
 */
export function rememberedWorkspaceId(viewer: string | null | undefined): string | null {
  if (!viewer || typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + viewer);
  } catch {
    return null;
  }
}

function remember(viewer: string, id: string) {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + viewer, id);
  } catch {
    // private mode or full: the front door falls back to the first tenant.
  }
}

/** @stability Beta */
export interface WorkspaceScopeProps<W extends Workspace = Workspace> extends Omit<ViewerScopeProps, "scope" | "roles" | "scopeTimeZone"> {
  /** Every workspace this viewer has. */
  workspaces: readonly W[];
  /** The current URL's path (`useLocation().pathname`): the workspace is read from it. */
  pathname: string;
  /** Scope keys every workspace adds to its own (rarely needed). */
  scope?: ViewerScopeProps["scope"];
  /** How switching keeps the viewer's place (see `workspaceHref`). */
  keep?: WorkspaceHrefOptions["keep"];
}

/**
 * `ViewerScope` for an app with workspaces: use it in place of `ViewerScope`. It reads the current
 * workspace from the URL and scopes everything under it to that workspace (its `scope`, `roles` and
 * `timeZone`), so every view with `scope: ["org_id"]` follows the switcher with no screen code. It
 * remembers the workspace per viewer on this device, and gives `WorkspaceSwitcher` its list.
 *
 * ```tsx
 * <WorkspaceScope viewer={userId} workspaces={workspaces} pathname={location.pathname}>
 *   <AppShell headerSlot={<WorkspaceSwitcher linkComponent={Link} />} …>
 * </WorkspaceScope>
 * ```
 *
 * @stability Beta
 */
export function WorkspaceScope<W extends Workspace>({ workspaces, pathname, scope, keep, children, ...viewerProps }: WorkspaceScopeProps<W>) {
  const current = workspaceAt(workspaces, pathname);
  const value = useMemo<WorkspaceContext<W>>(
    () => ({
      current,
      workspaces,
      hrefFor: (to) => workspaceHref(workspaces, to, pathname, keep ? { keep } : {}),
    }),
    [current, workspaces, pathname, keep],
  );
  const viewer = viewerProps.viewer;
  useEffect(() => {
    if (viewer && current) remember(viewer, current.id);
  }, [viewer, current]);
  return (
    <WorkspaceContextValue.Provider value={value as unknown as WorkspaceContext}>
      <ViewerScope
        {...viewerProps}
        scope={{ ...scope, ...current?.scope }}
        {...(current?.roles !== undefined ? { roles: current.roles } : {})}
        {...(current?.timeZone !== undefined ? { scopeTimeZone: current.timeZone } : {})}
      >
        {children}
      </ViewerScope>
    </WorkspaceContextValue.Provider>
  );
}

