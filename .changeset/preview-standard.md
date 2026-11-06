---
"@marktiderman/genesis-cli": minor
---

Doctor: new supabase-pack rule `exposed-schema-created-later` (warn). It flags a schema in `supabase/config.toml` `[api] schemas` (or `doctor.supabase.exposedSchemas`) that a new Supabase database doesn't have before migrations run, naming the migration that creates it or saying none does. A Supabase branch applies `[api]` before it runs migrations, so a fresh preview branch's Data API fails its health check on such a schema. The fix is Genesis's preview standard (docs/APP-CI.md, "Previews"): turn automatic branching off, keep supabase-ci as the per-pull-request database check, and create preview branches on demand; then `allow` the schema with that reason. `public`, `graphql_public` and the platform's own schemas never warn, and nothing is reported when `[api] enabled = false`.

Also in this release, outside the CLI: `templates/vercel/ignore-build.sh` (with a `vercel.json` snippet), a Vercel Ignored Build Step that always builds production and builds a preview only for a `preview/` branch, a `[preview]` commit or a `preview`-labelled pull request (`GENESIS_PREVIEWS`, `GENESIS_PREVIEW_LABEL`, `GENESIS_PREVIEW_BRANCH_PREFIX` override the defaults).
