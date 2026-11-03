---
"@marktiderman/genesis-cli": minor
---

A block's migration can name, in `needs`, a hook the app must define before it runs (`{ "function": "private.genesis_viewer_people", "how": "…" }`). `genesis add`, `migrate` and `upgrade` warn when they would copy such a migration into an app whose migrations don't define that function. Before, `supabase db push` was the first place this failed. genesis-chat's 0004 declares its tenancy hook this way.
