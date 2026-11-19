---
"@marktiderman/genesis-cli": minor
"@marktiderman/genesis-config": minor
---

`genesis doctor` checks setup and secrets, and `genesis fix` sets secrets safely.

- New rules from the `settings` check: `setting-requires` (a key on while one it requires is off,
  moved out of `invalid-setting`), `setup-incomplete` (a feature that needs an outside service and
  isn't set up yet: info, naming `genesis setup --step <id>`) and `secret-missing` (a secret an on
  key or a deployed Edge Function needs isn't in its store). Secrets are checked by name only,
  through the developer's own signed-in `supabase`, `gh` and `eas`, and only when the network is
  on; a store that can't be checked is an info.
- `genesis doctor --database` also checks the settings' database layer through the linked project
  (read anyway when the app is linked).
- New guided fixes: `settings.reset`, `settings.requires`, `settings.setup` and `secrets.set`
  (replacing the manual `settings.review`). `secrets.set` asks for each value at the terminal
  without echoing it, holds it in memory only, sends it to `supabase secrets set --env-file
  /dev/stdin`, Vault SQL on stdin, or `gh secret set` on stdin (never in argv), redacts it from
  everything printed, and prints the `eas env:create` command for you to run.
- genesis-config: a settings key may name the guided `setup` step that configures it
  (`setup: "github.issues"`).
