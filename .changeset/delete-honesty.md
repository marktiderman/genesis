---
"@marktiderman/genesis-core": minor
"@marktiderman/genesis-ui": minor
---

Deletes say what they do and never fail silently:

- `ProviderCapabilities.softDelete`: a delete moves the record to a recycle bin. The Supabase provider reports it per resource for `binTables`.
- New core hook `useCapabilities(resource)`: the provider's capabilities, cached per resource.
- `ConfirmDeleteDialog` `kind="recycle"` reads "It moves to the recycle bin, where it can be restored." instead of "This can't be undone." The default stays `"permanent"`.
- `ResourcePage` asks the provider in provider mode and picks the wording itself.
- An unconfirmed built-in delete that fails used to go only to `console.error`. It now goes to `resourceOptions.onError` when set, or to a toast otherwise.
