---
"@marktiderman/genesis-supabase": minor
"@marktiderman/genesis-cli": minor
---

Zero config has a platform admin list. New migration `0022_genesis_platform_admins.sql` in the settings block (copy it with `genesis migrate`): `public.genesis_platform_admins`, which starts empty and only the service role reads or writes, and a default `private.genesis_platform_admin` hook that reads it, created only when the app has no hook of its own. Nobody is an admin until added by email (`insert into public.genesis_platform_admins (person) select id from auth.users where lower(email) = lower('you@example.com')`); never every signed-in person. An app that defines the hook later replaces the default with `create or replace function`.

New doctor rule `platform-admin-missing` (warn, read with the database layer through the linked project): the default list is in use and empty, so nobody can change a setting or answer support tickets. Its guided fix, `settings.first-admin`, gives the SQL to add the first admin by email.

The RN starter now ships the settings block (genesis-supabase 0020, 0021 and 0022), so `genesis init --template native` records it. Its README and the README `genesis init` writes say to run `genesis settings sync` on every deploy, after the migrations, and to add the first admin.
