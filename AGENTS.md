# Genesis: agent notes

Genesis is a pnpm monorepo of `@marktiderman/genesis-*` packages (`packages/`) and two apps: the
web reference app (`apps/sample`) and the Expo starter new native apps are made from
(`apps/genesis-rn-starter`).

- Build before you test or typecheck: `pnpm build:packages`, then `pnpm test` and `pnpm typecheck`.
  `pnpm lint:genesis` runs the repo's own rules.
- Every package change needs a changeset (`pnpm changeset`). Releases follow `docs/RELEASING.md`.
- `docs/component-reference.md` and `apps/sample/app/data/primitives.json` (with `story-ids.json`
  beside it) are generated, and the version PR refreshes them (`pnpm version:packages`). A feature
  PR doesn't regenerate or commit them; on a merge conflict in either, take main's version
  (`git checkout --theirs <file>`).
- Docs name only API the packages export: `pnpm check:docs-match-exports` (CI) type-checks every TS example and the prose under `<!-- api: … -->`; write anything not built yet as `**Planned**` with its features.ts id.
- Merge, never rebase or force-push.
- Genesis is public: never name an app or customer built on it, anywhere (code, tests, docs,
  changelogs, commits, PRs). Write "a consumer app"; use neutral sample names (Acme, sample-app).
  `pnpm check:private-names` runs in CI.
- Before building anything, read Part 1 of `docs/FRAMEWORK.md` ("The Genesis way"): reuse, then
  extend, then invent, and invent in the app before Genesis. Slots, variants and configuration
  are config; recreating something that exists, or should, is the custom code we remove. Cite
  the principle IDs (G1–G6) in reviews.
- Work tracked outside this repo is referenced only by its id (`Closes <ID>`): never write what
  the card is, or which app it's for, in a commit, PR or comment.

## Building a screen in an app

The same rules hold in every Genesis app, and `genesis doctor` enforces them from what each
package declares (`genesis catalog` lists them; `genesis agents` writes them into an app's
AGENTS.md and skill):

- **A list** is a view: `defineView` (`@marktiderman/genesis-core/resource-view`) rendered by
  `<ResourceView>` (`@marktiderman/genesis-ui/data`). Never a hand-built table, and `ResourcePage`
  only as an escape hatch inside a component that renders ResourceView.
- **A record's page** is `<RecordView>` from the same description.
- **On the phone**, the same view through `NativeResourceView` (`@marktiderman/genesis-ui-native/data`).
- **Data** goes through the view and the resource's provider rules. A screen never calls
  `supabase.from`, `.rpc` or `.schema(…).from` itself.
- Never copy an older screen as a template, and write a gap up for Genesis before inventing.

A package that adds a primitive declares its rule in its package.json (`genesis.doctor`); see
the genesis-cli README, "Package rules". Every published package must declare one, or say why
not.

## Before you start a build or a phase

Several agents work in this repo and in its sibling (Genesis and the apps built on it) at the same
time. Before writing code for a new build or phase:

1. **Read what changed.** Check the recent merged PRs and every open PR in both repositories
   (`gh pr list --state open`, `gh pr list --state merged --limit 30`), plus any design doc under
   review that touches your area.
2. **Check for overlap.** If an open PR, a design or a recent merge touches the same files or the
   same idea (lists, layouts, navigation, the data layer, forms), message its author first, and
   build on the shared piece rather than beside it.
3. **Claim it.** Tell the sessions your work affects what you're starting and which files. On a
   shared area, wait for no objection. Keep parallel workers few.
4. **Announce changes of direction.** When a decision changes what others should build (a new
   shared component, a deprecation, a new rule), message every session working in that area in
   the same turn: what to stop, what to do instead, and the link.

Why: work has been duplicated, and plans have been written against components that were about to
be replaced, when this check was skipped.

Ideas and planned work are kept by the maintainers outside this repository. `features.ts` here
holds work from `building` on, plus the planned features shipped ones depend on: don't add `idea`
entries to it.
New design decisions (ADRs) and new primitives also start outside this repository; a public ADR
is written here when a contract ships. Don't open a PR here that only proposes a new design.

## Owning a pull request

1. **The session that opens a PR owns it until it merges.** Turn on Auto-fix for it (the Claude
   desktop app's CI monitor), keep its required checks green, merge its base in whenever it falls
   behind or conflicts, and answer every review finding: fix it, or decline it with the reason.
2. **Hand it to triage when it's ready.** Triage is the session that reviews PRs into staging
   batches. It runs an independent, adversarial review (a reviewer that didn't write the code),
   checks that every finding is addressed, approves the PR and merges it into the batch. A PR whose
   owner has stopped goes to triage, which finds it a new owner.
3. **Triage brings load-bearing decisions to the maintainer:** declining a major finding, changing
   a contract, or anything that touches production. **Only the maintainer merges into `main`.**
   Agents prepare each release PR (green, reviewed, what it carries in the body) and ask.
4. **One staging batch at a time.** Open every PR meant for `main` into the current batch,
   `staging/<YYYY-MM-DD>/<letter>` (the open release PR into `main` names it); triage cuts a new
   one from `main` once the last is released. Keep a separate branch only for a reason written in
   its PR (a launch hold, say), and fold it in when that ends.

Why: PRs sat with stale red checks, unanswered reviews and branches drifting from their base
whenever nobody owned them.

## Releasing, and how apps get a release

- **Release:** the maintainer merges the batch's release PR into `main`; the Release workflow
  then opens or updates "chore: version packages", and merging that publishes to npm
  (`docs/RELEASING.md`). Nothing is published before that second merge, so a blocker found after
  the first is fixed through a staging batch into `main` before the version PR merges, as #586 was.
- **A change to a shared contract** (core types, ResourceView, the data layer, a published
  package's API) also gets an adversarial review from reviewers that didn't write it, before
  triage merges it into the batch.
- **Apps take published versions only**, with `genesis upgrade` and `genesis doctor` in a version
  bump PR. To try an unreleased change, link a Genesis checkout locally (`pnpm link` or a `link:`
  override) and never commit it; merge the app's PR once the release is on npm. Genesis has no
  prerelease channel.

<!-- genesis-features:start -->
## Features

Every feature is in `features.ts`: 153 features (26 planned, 70 building, 22 beta, 27 live, 1 deprecated, 7 retired).

- Before adding UI, routes or flags, run `pnpm features find <term>` to see whether a feature already covers it.
- New work starts as an entry in `features.ts`; then run `pnpm features build`. `pnpm features check` runs in CI.
- Finding, adding and retiring features: `.claude/skills/features/SKILL.md`.

Generated by `pnpm features build`. Don't edit this block.
<!-- genesis-features:end -->
