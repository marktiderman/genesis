---
"@marktiderman/genesis-ui": patch
---

**Two eject-path bugs the 2.3.0 tarball shipped with.** The extensibility
ladder went out as 2.3.0, but the review fixes that landed on the same branch
afterwards did not — `@marktiderman/genesis-ui@2.3.0` on npm has the slots API
and neither of these corrections. Both are cases where ejecting a part did
something other than what the prop's own documentation promised.

- **`DataPageShell`: ejecting the header no longer takes the filter row with
  it.** `header={null}` ejects the header, and the doc on `header` promises the
  filter row survives that. It only did in the standard branch, where `filters`
  renders as an independent sibling; in the collapsible branch the filter row
  reaches the DOM ONLY as the header's `details` prop, so an ejected header
  removed the filters too — with no error, which is the worst version.
  Collapsing needs a header to collapse into, so without one the standard
  branch renders the filter row on its own.

- **`ResourcePage`: the `shell` slot is typed as replaceable, not ejectable.**
  `ResourcePageSlots` accepted `null` for `shell` like every other part, but
  the implementation reads `slots?.shell ?? DataPageShell` — `null` falls
  through to the default rather than ejecting, because there is no page
  without a shell root. The type now says so: `shell` takes a component, never
  `null`, matching what the class doc already claimed.

No API is added or changed. A caller who never ejected a part sees identical
output.
