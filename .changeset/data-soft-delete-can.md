---
"@marktiderman/genesis-core": minor
"@marktiderman/genesis-ui": minor
---

**Recycle-bin deletes say so, delete failures reach the user, and one permission function.** Additive; a **minor**.

genesis-core:
- `ProviderCapabilities.softDelete` is new. `createSupabaseProvider`'s `capabilities(resource)` reports `softDelete: true` for `binTables` / `deleteMode: "bin"` resources. Asked without a resource, it is false.
- `useCapabilities(resource?, { enabled })` is a new hook. It reads `DataProvider.capabilities` once and caches it under `["genesis", "capabilities", resource]`, outside the resource's own keys.

genesis-ui:
- **`ResourcePage` `can(action, item)`** (`"edit"` | `"delete"`, type `ResourcePermissionAction`) gates the peek's Edit and Delete buttons and the built-in edit form. `canEditItem`, `canEdit` and `canDelete` still work but are now marked `@deprecated`. When they are given together with `can`, a row must pass all of them.
- **Recycle-bin wording.** `ConfirmDeleteDialog` takes `softDelete` and `noun`. A soft delete says "The {noun} moves to the recycle bin." instead of "This can't be undone." The built-in delete in `ResourcePage` (`allowDelete`) asks the provider for `softDelete`. `capabilities={{ softDelete }}` overrides the provider and also covers a caller's own `onDelete`. `confirmDelete` copy now takes `noun`.
- **Delete failures reach the user.** These failures now show an error toast (sonner `toast.error`) as well as logging to the console:
  - an unconfirmed built-in delete (`confirmDelete={false}`) that fails;
  - an unconfirmed `onDelete` whose promise rejects.

  Confirmed deletes still show the failure in the dialog.
