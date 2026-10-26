---
"@marktiderman/genesis-core": patch
"@marktiderman/genesis-ui": patch
"@marktiderman/genesis-ui-native": patch
---

ResourceView and ResourceWorkspace review fixes.

- `genesis-core/resource-view`:
  - view actions can be `destructive`; names are trimmed before the checks; `canAction` allows only `true` and turns any other non-reason into a refusal.
  - `rowPicture` takes only http(s) or root-relative image sources.
  - workspaces reject settings that are JSON, lists, links or sensitive, and section keys they don't know.
  - new workspace helpers: `settingsLocked(row)`, `recordId(row)` (by key fields), and `headerFor(row, { can, runnable, served })`.
  - `listFilter` refuses an empty or non-single-valued filter in development; a bad readiness tone falls back to muted with a warning; readiness checks carry a stable `key`.
- `genesis-ui`: `ResourceWorkspace` shows settings read-only with the reason when update is refused, takes a `can` prop, hides actions nothing can run or the provider doesn't serve, styles destructive actions, and never saves NaN.
- `genesis-ui-native`: the workspace menu is an action sheet on iOS and a sheet elsewhere (Android alerts show at most three buttons), runs one action at a time, and prefixes accessibility action names. More than four sections open in place with a way back when there is no `onOpenSection`. Settings lock like the web's, and numbers accept a comma decimal and never save NaN. `NativeResourceView` keys rows by the view's key fields.
