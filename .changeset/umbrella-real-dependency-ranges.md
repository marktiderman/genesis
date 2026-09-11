---
"@marktiderman/genesis": patch
---

Republish the umbrella with real dependency ranges.

`@marktiderman/genesis@0.5.2` is on npm with `"workspace:*"` as the literal
version of all five packages it re-exports, so nobody can install it — and it
is the coordinate the README recommends ("pull in the whole system as one
pinned coordinate").

The source is correct: `workspace:*` is what an in-repo dependency should say,
and `pnpm publish` rewrites it to a real range at pack time. 0.5.2 reached npm
through `npm publish`, which copies the protocol string into the tarball
verbatim. `@marktiderman/genesis-ui` hit the same thing at 2.1.0 and 2.2.0 and
was fixed by republishing as 2.2.1.

So this carries no code change. It exists to cut 0.5.3 through the pnpm-aware
path. **Publish with `pnpm publish`, never `npm publish`**; `pnpm pack` and
then reading the packed `package.json` is the check.

`@marktiderman/genesis-ui-native@2.0.2` and
`@marktiderman/genesis-switchboard@2.0.1` were named alongside these in the
original report but ship no `workspace:` dependency on npm — verified with
`npm view <pkg> dependencies --json`. They need no republish.
