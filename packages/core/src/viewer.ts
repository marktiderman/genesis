// The viewer as guards read it, with no React: resource-view (pure) and ViewerScope (React) share it.

import type { ResourceScope } from "./hooks/viewer-scope";

/**
 * What the viewer may do where they are working, for guards that narrow what a page shows. Empty
 * here: an app adds its own keys by module augmentation, so core never names an app's roles.
 *
 * ```ts
 * declare module "@marktiderman/genesis-core" {
 *   interface GenesisViewerRoles {
 *     teamRoles?: readonly ("owner" | "editor" | "reader")[];
 *   }
 * }
 * ```
 *
 * Roles never decide access: row-level security does. A guard reading them only hides or refuses
 * a control the server would refuse anyway.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-empty-interface -- filled by apps through module augmentation
export interface GenesisViewerRoles {}

/**
 * Who is looking, as a view's guards and `when` read it (`useViewer()`). Outside a `ViewerScope`
 * it is `{ id: null, scope: {} }`, so a guard that needs the viewer refuses (fails closed).
 */
export interface Viewer {
  /** The signed-in viewer's id; null when signed out or outside a ViewerScope. */
  readonly id: string | null;
  readonly scope: ResourceScope;
  /** Undefined until the app knows them; a guard that needs them refuses meanwhile. */
  readonly roles?: GenesisViewerRoles;
}

/** The viewer outside any ViewerScope: no one, nowhere, no roles. */
export const NO_VIEWER: Viewer = Object.freeze({ id: null, scope: Object.freeze({}) as ResourceScope });

