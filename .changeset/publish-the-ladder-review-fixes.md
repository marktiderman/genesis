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

No runtime behaviour changes for a caller who never ejected a part, and the
second fix changes no runtime behaviour at all — `null` already fell through to
the default; only the type stopped permitting it.

**One type-level narrowing, called out because it is not visible at runtime.**
In 2.3.0 `ResourcePageSlots` was `Slots<ResourcePageSlotMap<T>>`, so `shell`
accepted `null` like every other part. It is now
`Omit<Slots<…>, "shell"> & { shell?: ComponentType<…> }`. A consumer who wrote
`slots={{ shell: null }}` compiled on 2.3.0 and will not compile on 2.3.1 —
they should drop the key, which is what that code already did at runtime. Kept
as a patch deliberately: the previous type described an eject the
implementation never performed, so this is the type being corrected to match
shipped behaviour rather than behaviour being taken away.
