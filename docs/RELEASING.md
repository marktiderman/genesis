# Releasing Genesis packages

All public `@marktiderman/*` packages (every `packages/*` without
`"private": true`) are published by CI, from `.github/workflows/release.yml` on
`main`, with npm Trusted Publishing (OIDC). No npm token is stored anywhere.
npm attaches an SLSA provenance attestation to every trusted publish, even
though each package sets `publishConfig.provenance: false` (e.g.
`npm view @marktiderman/genesis-forms@0.1.1 dist.attestations`); the commit that
shipped is also in the release tag and the Actions run. Do not publish by hand (except a brand-new
package's first version, below): a manual `npm publish`
skips the `workspace:` rewrite (the 2.1.0 incident) and leaves no record of
which commit shipped.

## Normal release (nothing to do on npm)

1. In your feature PR, add a changeset: `pnpm changeset` (pick packages and
   bump type). Merge the PR. Work usually lands in a `staging/*` (or
   `prestage/*`) batch first, then reaches `main` in one release PR; PRs into a
   batch run the same CI as PRs into `main` (build, typecheck, test, features,
   lint, Storybook, self-lint, tarball integrity, CodeQL).
2. The Release workflow opens or updates a **"chore: version packages"** PR.
3. Merge that PR. Release runs again, checks npm trusts it for every package
   about to publish, publishes, then tags and creates GitHub releases.
4. Confirm: `npm view @marktiderman/<pkg> dist-tags.latest`.

If a publish fails transiently, re-run it from Actions → Release →
**Run workflow** on `main` (it publishes any version not yet on npm).

The tooling is Changesets CLI v3 with `changesets/action` v2. The action writes the version PR's
commit, the package tags and their GitHub releases through the GitHub API with the job's
`GITHUB_TOKEN`; it learns what was published from the file `changeset publish` writes to
`CHANGESETS_OUTPUT`, so the publish script stays `pnpm changeset publish`. Two v3 changes to
know when running it by hand: `changeset version` exits 1 when there are no changesets, and
`changeset tag` is now `changeset git-tag`.

### Tags are created through the API, never pushed

Release never runs `git push`. A push with the workflow's `GITHUB_TOKEN` is refused when the ref
it creates brings in commits that change a file under `.github/workflows/` ("refusing to allow
a GitHub App to create or update workflow … without `workflows` permission"), and that token
can't be given the `workflows` permission. A `release/*` tag on a `main` commit hit this on
2026-10-29. So every tag (the package tags of the "Publish versions already on main" step, and
the `release/*` tag) is created with `scripts/create-tag-ref.sh`, a `POST
repos/{owner}/{repo}/git/refs`, which creates the ref without pushing commits and needs only
`contents: write`. It is idempotent: a tag already at that commit counts as done, so re-runs are
safe. The checkouts keep no git credentials (`persist-credentials: false`).

If GitHub ever refuses the API call with the same `workflows` message, the script prints it and
the job fails. Fix it without a code change: create a fine-grained personal access token for
`marktiderman/genesis` only, with **Contents: read and write** and **Workflows: read and write**,
and save it as the repository secret `RELEASE_TAG_TOKEN`. Release uses it for the tags it makes
itself (`scripts/create-tag-ref.sh`: the `release/*` tag and "Publish versions already on main"),
and `GITHUB_TOKEN` when it isn't set. The package tags and GitHub releases of a normal publish are
made by changesets/action with `GITHUB_TOKEN`; if those are refused, tag them by hand (below). Then use **Re-run failed jobs**. The secret is not
set today.

## Release notes

Release notes are for people, not developers: what reached beta or live in `features.ts`, written
from each feature's tagline (`genesis-product release`, `packages/product`). Release's
**Release notes** job does it, after the publish job and apart from it, so it can never fail or
slow a publish, and it holds no npm environment or OIDC token:

- **While the version PR is open**, each push to `main` posts the draft notes as one comment on
  that PR, found by its `<!-- genesis-product:release-notes -->` marker and edited in place
  (changesets rewrites the PR's body, so the notes can't live there). Edit the features' taglines
  in `features.ts` to change them.
- **After a successful publish**, it tags the commit `release/<YYYY-MM-DD>` (the date in UTC;
  `-2`, `-3` for a second release that day) and drafts the notes since the previous `release/*`
  tag. The first time there is no `release/*` tag, so the notes start from the last version
  packages merge. When a feature reached beta or live, the notes become that tag's GitHub
  release (not marked latest, so the package releases keep that); otherwise the tag alone marks
  where the next release's notes start.
- **Then** it closes each open idea issue linked (`feature:<id>` label) to a feature that
  shipped, with a "Shipped in release …" comment. Never before the publish, so nothing is closed
  for a release that didn't ship.

If the job fails (it says why), open the run and use **Re-run failed jobs**: it reuses the
publish job's result, and a commit that already has its `release/*` tag keeps it. Re-running
Release as a whole doesn't redo the notes, because with nothing left to publish changesets
reports nothing published. To finish by hand, from a clone with every tag:

```bash
sha=<the publish commit>                                                   # the version packages merge
prev=$(git describe --tags --match 'release/*' --abbrev=0 "$sha^")        # first release ever: the version packages merge before it
GITHUB_REPOSITORY=marktiderman/genesis scripts/create-tag-ref.sh release/2026-10-26 "$sha"   # or: git tag … && git push origin …
pnpm product release --from "$prev" --to "$sha" --name 2026-10-26 > notes.md   # then: gh release create release/2026-10-26 --verify-tag --notes-file notes.md
pnpm product release --from "$prev" --to "$sha" --name 2026-10-26 --notify     # lists the issues; add --yes to close them (GITHUB_TOKEN)
```

`--notify` refuses more than 10 changed features unless you pass `--force`, in case `--from` is
wrong. The job runs only on `marktiderman/genesis`, never on a fork.

## How npm knows it is us

Each package has one Trusted Publisher on npmjs.com (package → Settings →
Trusted Publisher):

| field | value |
|---|---|
| provider | GitHub Actions |
| repository | `marktiderman/genesis` |
| workflow | `release.yml` |
| environment | `npm` |

The GitHub environment `npm` (repo Settings → Environments) allows deployments
from `main` only. So only the Release job on `main` can get a publish token.
A workflow on any other branch is refused by npm or by GitHub.

npm **binds** a Trusted Publisher to the repository's immutable id on its first
successful publish. A new Trusted Publisher **expires after 48 hours** if no
publish uses it. So after trusting a package by hand, get a CI publish of it out
within 48 hours (merge its next version PR), or the "Verify npm Trusted
Publishing" step fails for it and it needs the fix below.

## One Genesis version per app

`@marktiderman/genesis` is the release train. Each build writes `dist/versions.json`, the exact
version of every Genesis package the umbrella depends on (packages it doesn't depend on, such as
the CLI, studio and supabase, release on their own and aren't listed), and the package exports it as
`@marktiderman/genesis/versions.json`. In an app that has the umbrella installed, `genesis doctor`
warns (`version-skew`) for every other installed Genesis package on a different version. Raise it to
an error with `"rules": { "version-skew": "error" }`. Bump every Genesis package in an app together:
the reusable `genesis-upgrade` workflow does it weekly from that manifest and opens one pull request
(see [App CI](./APP-CI.md), which also says which Genesis commit an app's CI should call), and
`genesis upgrade` does the same bump locally (one shared piece of code), then refreshes the files
Genesis owns in the app.

What a release carries for `genesis add`, `migrate` and `upgrade`:

- **The CLI is the version of the templates and the starter.** Its build copies `templates/` and
  the app-owned files of `apps/genesis-rn-starter` into `dist/`, and a catalog of every package's
  version and `genesis.blocks` manifests. A change to a template or the starter reaches apps
  through a CLI release, so give it a changeset on `@marktiderman/genesis-cli`.
- **A shipped migration never changes.** Apps copy package migrations and checksum them; `genesis
  migrate` refuses to rewrite a copy and reports a package whose text changed as
  `changed-upstream`. A change to a released migration is a new numbered migration.
- **A breaking change brings its codemod.** Add an entry to
  `packages/genesis-cli/src/upgrade/codemods.ts` naming the package and the first version that
  breaks; `genesis upgrade` runs it only for apps that move across that version.
- **The workflow's bump is generated.** `.github/workflows/genesis-upgrade.yml` embeds
  `packages/genesis-cli/src/upgrade/bump-core.mjs`; after editing it, run
  `node scripts/sync-genesis-bump.mjs` (a test fails until you do).

## A brand-new package

npm can't attach a Trusted Publisher to a package that doesn't exist yet, so a
new package's **first** version is published once by hand, from a clean `main`
checkout, with `pnpm publish` (it rewrites `workspace:` ranges; `npm publish`
does not):

Order matters, because CI's verify step refuses a release that would publish a
package npm doesn't trust yet, and the trust expires after 48 hours unused:

1. Land the package on `main` (the staging PR), but **don't merge the version
   PR yet**: it would try to publish the new package through CI and fail.
2. Publish it by hand and trust it, one package at a time:

   ```bash
   git checkout main && git pull
   pnpm install --frozen-lockfile && pnpm build:packages
   pnpm --filter @marktiderman/<pkg> publish --access public --no-git-checks   # asks for 2FA
   npx -y npm@latest trust github @marktiderman/<pkg> --file release.yml --repo marktiderman/genesis \
     --env npm --allow-publish --allow-stage-publish -y
   ```

   Run `trust` right after the publish. Right after a first publish npm can
   answer 404 for a few minutes (seen on 2026-10-22, about 5 minutes) while
   its CDN catches up: wait and run `trust` again. Each first-published
   package also shows a `0.0.0-stage` version on npm, created around the same
   time; it is outside every range we write and never `latest`.
3. Merge the version PR within 48 hours. Give the new package a patch
   changeset in the same release, so CI publishes it once and its trust is
   used before it expires.

If the version PR merges before the hand publish, CI fails closed (the verify
step refuses a package npm doesn't have). To recover: hand-publish the version
`main` now holds, trust it, then re-run Release (Run workflow on `main`). If
the package's next CI release is more than 48 hours away, re-trust it first.

Publish packages that others depend on first (for forms: `genesis-forms`, then
`-react`, then `-web` and `-devtools`). Set the package's `version` to the first
release (e.g. `0.1.0`) by hand, not with a changeset bump from `0.0.0`: that
puts its `workspace:^` dependents out of range, and changesets then gives them
a major bump (`1.0.0`). Its patch changeset (step 3) bumps that first version,
so CI publishes the next one (e.g. `0.1.1`). Every later version goes through
CI as usual.

## Forms packages and 0.x peer ranges

With `workspace:^` on a 0.x package, every minor of `genesis-forms` would leave
`^0.1.x`, and changesets gives a dependent a **major** bump when a new version
leaves its peer range: `-react`, `-web` and `-devtools` would go to `1.0.0`. So
their peer ranges on other forms packages are written as
`workspace:>=0.1.1 <1.0.0` (any 0.x from that floor), and changesets leaves a
dependent alone while the new version stays in range. That relies on
`onlyUpdatePeerDependentsWhenOutOfRange: true` in `.changeset/config.json`;
without it, changesets majors a dependent on any non-patch peer release, in
range or not, so keep it on. Raise a floor by hand when a dependent starts
needing a newer forms API. Each forms package is versioned on its own (no
`linked` group). Check a release plan with `pnpm changeset status --verbose`.

## When the "Verify npm Trusted Publishing" step fails

It prints `npm refused the OIDC token exchange` and names the package. The
package's Trusted Publisher is missing, bound to another repository, or expired.
Fix it, then publish within 48 hours:

```bash
npm trust list   @marktiderman/<pkg>              # note the id (asks for 2FA)
npm trust revoke @marktiderman/<pkg> --id=<id>
npm trust github @marktiderman/<pkg> --file release.yml --repo marktiderman/genesis \
  --env npm --allow-publish --allow-stage-publish -y
```

Then re-run Release (Run workflow on `main`) or merge the pending version PR.
These commands need a recent npm 11 (`npx npm@latest trust ...`) and an npm
login with 2FA.

## Moving to a new Expo SDK

The workspace holds one React and one React Native, the versions the native starter's Expo SDK
pins, so a bump touches more than the starter:

1. In `apps/genesis-rn-starter/package.json`, set `expo` and every Expo-managed package to the
   new SDK's versions (`bundledNativeModules.json` in the `expo` package lists them).
2. In `pnpm-workspace.yaml`, set the `overrides` for `react`, `react-dom`, `@types/react` and
   `react-native` to that SDK's versions, and raise `apps/sample`'s `react` / `react-dom` ranges
   to match.
3. `pnpm install`, then the full check list: `pnpm build:packages`, `pnpm typecheck`,
   `pnpm test`, `pnpm lint`, `pnpm lint:genesis`, `pnpm --filter sample docs:check`, and in the
   starter `pnpm doctor` and `pnpm export:ios`.

## Things that break publishing

- **Deleting and re-creating the GitHub repo**, even with the same name. That
  happened on 2026-08-04. Every package then needs the fix above.
- **Renaming `release.yml`**, or the `npm` environment, or the repo. Update
  every package's Trusted Publisher to match.
- **Adding `registry-url:` to `actions/setup-node`.** It writes a placeholder
  token that npm treats as real credentials.
- **Moving `environment: npm` off the release job.** npm will refuse the token.
