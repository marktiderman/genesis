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
  are config; recreating something Genesis already has a piece for is the custom code we remove. Cite
  the principle IDs (G1–G6) in reviews.
- Design lives in Figma: the library file and one file per consumer app. A new screen, flow or
  layout change is designed as a proposal section on its route page in the app file, wired into
  the live prototype (a new library component, on its page in the library file), and approved by the maintainer before its code is written, from
  library instances where they exist (an app component that wraps one where it is close, one of the app's own where nothing does the job); fixes,
  copy, new states from existing components and small tweaks go code-first.
  `docs/FIGMA-GUIDELINES.md` has the setup and the rules, `docs/DESIGN-LIBRARY.md` the
  library's internals.
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
- Never copy an older screen as a template.
- When a Genesis piece is close and does the same job, extend it: a prop, a variant, a slot, or the
  app's own component that wraps it. Never a parallel piece beside it.
- When nothing in Genesis does the job, invent it in the app. Genesis asks for no write-up or
  approval first, and recommending it to Genesis (`genesis upstream`) is optional. The app's own
  design review (the Figma proposal above) is a separate thing and still applies.

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
   behind or conflicts, and fix every review finding itself, in the PR, lows included (a follow-up card is not a fix),
   or decline it with a reason the reviewer accepts.
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

### Adversarial review gate

Every PR into a staging batch (`staging/**`) or into `main` (the release PR included) carries the
check "Adversarial review" (`.github/workflows/review-gate.yml`), required on staging and main. It
passes only with the label `review: approved` and an approving latest verdict on the PR's current
head commit, both from a person's account, never an app or a bot. It runs the default branch's
copy of the workflow (`pull_request_target` always loads it from `main`, whatever the PR's
base), so a PR can't change its own gate, and a gate change takes effect only once it is on
`main`.

- An independent adversarial reviewer, never the PR's author, reviews the latest head and posts a
  formal GitHub review with its findings. Every agent acts as the account that opened the PR, and
  GitHub refuses `--approve` and `--request-changes` from a PR's author, so post
  `gh pr review <n> --comment` with a body that starts `Verdict: approve` or
  `Verdict: changes requested`, then lists the findings. Only a maintainer's review (owner, member
  or collaborator) counts. Write exactly one line that starts with `Verdict`, and don't quote an
  earlier verdict line: every line starting "verdict" is read, so a second one ("Verdicts below…")
  makes the review unreadable and a quoted `> Verdict: changes requested` counts against the PR. A
  review with no verdict line that says "changes requested" or "request changes" anywhere also
  counts against it.
- Every finding, lows included, is fixed before merge, or declined with a reason the reviewer
  accepts. The author fixes it itself, in the PR: a follow-up card is not a fix. The reviewer adds
  `review: approved` only then, after posting the review: adding the label is what runs the check.
  A later `Verdict: changes requested` on the same head overrides an earlier approve; to re-run
  the check after a changed verdict, remove the label. Never approve or label your own PR.
- A new commit, a merge of the base included, removes the label, and a review of an older head
  doesn't count, so every push needs a review of the new head. Batch pushes. Claude review (`claude-code-review.yml`, which calls the reusable `claude-review.yml` that apps call too) also re-runs on every push; it is not the adversarial review.
- The author turns on Auto-fix for every PR it opens.
- Claude Ship's agents (Code Review, PR Steward, Claude Approvals) don't take part in the review
  gate: a `claude[bot]` review never counts toward it. Code Review's findings are review threads,
  though, and `main`'s ruleset requires every conversation to be resolved before a merge, so an
  open Code Review thread on a PR into `main` (the release PR included) blocks the maintainer's
  merge. Before asking the maintainer to merge, fix each finding (the next review resolves its
  thread when it judges it fixed) or resolve its thread with a reply that gives the reason
  (https://code.claude.com/docs/en/code-review-pull-requests#respond-to-findings). The staging
  rulesets require only checks, so threads don't block a merge into a batch.
- Code Review follows `REVIEW.md`. PR Steward follows `.claude/skills/steward/SKILL.md` and starts
  when someone comments `@claude steward`, if the maintainer sets it to start only on request and keeps their own PR Steward setting off
  "Act on its own", which overrides the repository's and would start it on every PR the account
  opens (https://code.claude.com/docs/en/pr-steward-pull-requests); `@claude stop` stops it.
  `.claude/approvals.yml` stays in observe mode, where Claude only comments and the check normally
  doesn't block, until the maintainer says otherwise.
- One watcher per PR: Auto-fix can't start on a PR that PR Steward watches, a local `/steward`
  watch doesn't start there, and PR Steward labelling a PR ends a local `/ship` or `/steward` watch
  (https://code.claude.com/docs/en/pr-steward,
  https://code.claude.com/docs/en/ship-command). So the owner keeps Auto-fix, and PR Steward runs
  only once the owner has stopped (`@claude stop` it before the owner resumes). Auto-merge stays
  off. Once the managed Code Review is on, retire `claude-code-review.yml` (keep
  `claude-review.yml`, which apps call).
- Bot PRs get the same review: triage reviews each "chore: version packages" PR and each Dependabot
  PR like any other. The Release workflow pushes the version PR with Actions' `GITHUB_TOKEN`, which
  starts no run, so after reviewing a new head the reviewer removes and re-adds the label.

## Releasing, and how apps get a release

- **Release:** the maintainer merges the batch's release PR into `main`; the Release workflow
  then opens or updates "chore: version packages", and merging that publishes to npm
  (`docs/RELEASING.md`). Nothing is published before that second merge, so a blocker found after
  the first is fixed through a staging batch into `main` before the version PR merges, as #586 was.
  Triage reviews the version PR, and every Dependabot PR, through the adversarial review gate
  like any other PR.
- **A change to a shared contract** (core types, ResourceView, the data layer, a published
  package's API) also gets an adversarial review from reviewers that didn't write it, before
  triage merges it into the batch.
- **Apps take published versions only**, with `genesis upgrade` and `genesis doctor` in a version
  bump PR. To try an unreleased change, link a Genesis checkout locally (`pnpm link` or a `link:`
  override) and never commit it; merge the app's PR once the release is on npm. Genesis has no
  prerelease channel.

<!-- genesis-features:start -->
## Features

Every feature is in `features.ts`: 189 features (25 planned, 103 building, 23 beta, 27 live, 1 deprecated, 10 retired).

- Before adding UI, routes or flags, run `pnpm features find <term>` to see whether a feature already covers it.
- New work starts as an entry in `features.ts`; then run `pnpm features build`. `pnpm features check` runs in CI.
- Finding, adding and retiring features: `.claude/skills/features/SKILL.md`.

Generated by `pnpm features build`. Don't edit this block.
<!-- genesis-features:end -->
