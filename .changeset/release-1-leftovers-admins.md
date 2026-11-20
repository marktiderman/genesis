---
"@marktiderman/genesis-supabase": minor
"@marktiderman/genesis-support": minor
"@marktiderman/genesis-cli": minor
---

Zero config has a platform admin list.

- genesis-supabase: new migration `0022_genesis_platform_admins.sql` in the settings block (copy it with `genesis migrate`). `public.genesis_platform_admins` starts empty and only the service role reads or writes it. While the app has no `private.genesis_platform_admin` hook, Genesis's own wrappers (`private.genesis_person_is_platform_admin`, 0020's `private.genesis_is_platform_admin`, `set_genesis_setting`) read the list; no function under the app's hook name is Genesis's, so the app adds its own hook whenever and however it likes and the list is then unused. Nobody is an admin until added; never every signed-in person.
- genesis-support: new migration `0032_genesis_support_staff_admin_list.sql`: with no staff hook, support staff are the platform admins through that wrapper, so the people in the list are staff too.
- genesis-cli: new doctor rule `platform-admin-missing` (warn, read with the database layer through the linked project): the app has the list, no hook of its own, and the list is empty. Its guided fix, `settings.first-admin`, prints the SQL that adds the first admin by a confirmed email (`email_confirmed_at is not null`) and adds nobody when no confirmed person, or more than one, has it.
- The RN starter ships the settings block (genesis-supabase 0020, 0021 and 0022) and support's 0032, so `genesis init --template native` records it. Its README and the README `genesis init` writes say to run `genesis settings sync` on every deploy, after the migrations, and to add the first admin.
