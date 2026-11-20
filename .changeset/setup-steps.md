---
"@marktiderman/genesis-cli": minor
"@marktiderman/genesis-config": minor
---

Guided setup steps that walk an outside service and end with a live check: `supabase.link`,
`github.issues`, `resend.domain`, `sentry`, `ai.key-budget` and `eas.push`.

- Each step is declared inside the CLI (`defineSetupStep`: what to do in the service, its values,
  the secrets it needs by name, links), and `checkSetupFields` checks the values a person typed.
- `<GenesisSettings>` shows a guided fix with a step as `genesis setup --step <id>`.
- `genesis setup --step <id>` at a terminal runs one step: the instructions and links, what is
  there now (the Supabase project list, say), the step's values, then the plan to approve. Each
  secret is asked for hidden, held in memory and sent on stdin only; the commands run through the
  fix engine; then the step's test call (GitHub reads the repository with the token, Sentry reads
  the project and sends a test event to the DSN, Resend reports the domain verified, the AI
  provider lists its models, Supabase has no pending migration and every function deployed).
  Headless, `--step` prints the step's instructions.
- The wizard's Guided steps tab runs the same runners (`step.start`, `step.submit`, then `apply`,
  and `step.verify` for "Check"), and lists `supabase.link` and `eas.push` when the app has a
  `supabase/` folder or an `eas.json`.
- `eas env:create` has no stdin input, so EAS secrets stay a line the person runs, and `eas.push`
  is a manual step: its instructions, and a check that the EAS CLI is signed in.
- Redaction no longer builds a regular expression from a secret: one past ~1,500 characters made
  it throw an error that spelled the value out. A value over 64 KiB is refused, and an error whose
  text can't be redacted is replaced by a generic line, never shown raw.
- `supabase db query --linked` (the Vault names and the settings table the doctor reads, and
  `genesis settings sync`'s manifest) gets its SQL from a temp file it removes, not `/dev/stdin`.
- `genesis mcp` redacts with the fix engine's matcher: every JSON-escaped form of a secret, and
  overlapping secrets, are caught in what it returns and logs.
- The wizard follows the system's dark mode, and its page header and form fields are genesis-ui's.
