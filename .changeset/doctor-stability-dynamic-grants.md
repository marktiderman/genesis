---
"@marktiderman/genesis-cli": patch
---

`genesis doctor`: `deprecated-import` and `beta-import` read tags on named re-exports
(`/** @deprecated … */ export { Old } from "./old"`), and no longer read import examples inside
strings as imports. `migration-grants` warns on a grant built as a string for `execute` (to anon,
public or a computed role), since what it grants can't be checked.
