/**
 * What `ResourcePage`'s `can(action, item)` is asked about. New actions join
 * this union as ResourcePage gates them.
 *
 * @stability Beta
 */
export type ResourcePermissionAction = "edit" | "delete";

/** The rights props `ResourcePage` takes: `can`, and its deprecated aliases. */
export interface ResourcePermissionProps<T> {
  can?: (action: ResourcePermissionAction, item: T) => boolean;
  canEditItem?: (item: T) => boolean;
  canEdit?: (item: T) => boolean;
  canDelete?: (item: T) => boolean;
}

/**
 * Folds `can` and the deprecated `canEditItem` / `canEdit` / `canDelete` into
 * one `(action, item) => boolean`. A row may take an action only when EVERY
 * predicate given for it allows it:
 * - `can(action, item)`
 * - `canEditItem(item)`, for both actions
 * - `canEdit(item)` for "edit", `canDelete(item)` for "delete"
 *
 * So `can` alone, the aliases alone, or both (all must pass) give the same
 * answer for the same rule. None given allows everything.
 */
export function resolveCan<T>({
  can,
  canEditItem,
  canEdit,
  canDelete,
}: ResourcePermissionProps<T>): (action: ResourcePermissionAction, item: T) => boolean {
  return (action, item) => {
    if (can && !can(action, item)) return false;
    if (canEditItem && !canEditItem(item)) return false;
    if (action === "edit") return canEdit ? canEdit(item) : true;
    if (action === "delete") return canDelete ? canDelete(item) : true;
    return true;
  };
}
