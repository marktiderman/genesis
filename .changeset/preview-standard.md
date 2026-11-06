---
"@marktiderman/genesis-cli": minor
---

Doctor: new supabase-pack rule `exposed-schema-created-later` (warn). It flags a schema in `supabase/config.toml` `[api] schemas` (or `doctor.supabase.exposedSchemas`) that a new Supabase database doesn't have before migrations run, naming the migration that creates it or saying none does. A Supabase branch applies `[api]` before it runs migrations, so a fresh preview branch's Data API fails its health check on such a schema. The fix is Genesis's preview standard (docs/APP-CI.md, "Previews"): turn automatic branching off, keep supabase-ci as the per-pull-request database check, and create preview branches on demand; then `allow` the schema with that reason. `public`, `graphql_public` and the platform's own schemas never warn, and nothing is reported when `[api] enabled = false`.

**Strict apps:** the rule is a warning, so an app that runs the doctor with `--strict` (app-ci's `doctor-strict: true`) and exposes a schema a migration creates goes red on this release until it adds the `allow` entry (or stops exposing the schema).

Also in this release, outside the CLI: `templates/vercel/ignore-build.sh` (with a `vercel.json` snippet), a Vercel Ignored Build Step that always builds production and builds a preview only for a `preview/` branch, a `[preview]` commit or a `preview`-labelled pull request, and always builds production, custom environments and any deploy without system variables (`GENESIS_PREVIEWS`, `GENESIS_PREVIEW_LABEL`, `GENESIS_PREVIEW_BRANCH_PREFIX` override the defaults).
