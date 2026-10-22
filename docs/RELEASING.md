# Releasing Genesis packages

All seven `@marktiderman/*` packages are published by CI, from
`.github/workflows/release.yml` on `main`, with npm Trusted Publishing (OIDC).
No npm token is stored anywhere. Do not publish by hand (except a brand-new
package's first version, below): a manual `npm publish`
skips the `workspace:` rewrite (the 2.1.0 incident) and leaves no provenance
of which commit shipped.

## Normal release (nothing to do on npm)

1. In your feature PR, add a changeset: `pnpm changeset` (pick packages and
   bump type). Merge the PR.
2. The Release workflow opens or updates a **"chore: version packages"** PR.
3. Merge that PR. Release runs again, checks npm trusts it for every package
   about to publish, publishes, then tags and creates GitHub releases.
4. Confirm: `npm view @marktiderman/<pkg> dist-tags.latest`.

If a publish fails transiently, re-run it from Actions → Release →
**Run workflow** on `main` (it publishes any version not yet on npm).

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
publish uses it.

## A brand-new package

npm can't attach a Trusted Publisher to a package that doesn't exist yet, so a
new package's **first** version is published once by hand, from a clean `main`
checkout, with `pnpm publish` (it rewrites `workspace:` ranges; `npm publish`
does not):

```bash
git checkout main && git pull
pnpm install --frozen-lockfile && pnpm build:packages
pnpm --filter @marktiderman/<pkg> publish --access public --no-git-checks   # asks for 2FA
npm trust github @marktiderman/<pkg> --file release.yml --repo marktiderman/genesis \
  --env npm --allow-publish --allow-stage-publish -y
```

Publish packages that others depend on first (for forms: `genesis-forms`, then
`-react`, then `-web` and `-devtools`). Set the package's `version` to the first
release (e.g. `0.1.0`) and leave it out of the changeset. A changeset bumping a
`0.0.0` package puts its `workspace:^` dependents out of range, and changesets
then gives them a major bump (`1.0.0`). Every later version goes through CI as
usual.

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

## Things that break publishing

- **Deleting and re-creating the GitHub repo**, even with the same name. That
  happened on 2026-08-04. Every package then needs the fix above.
- **Renaming `release.yml`**, or the `npm` environment, or the repo. Update
  every package's Trusted Publisher to match.
- **Adding `registry-url:` to `actions/setup-node`.** It writes a placeholder
  token that npm treats as real credentials.
- **Moving `environment: npm` off the release job.** npm will refuse the token.
