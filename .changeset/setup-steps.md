---
"@marktiderman/genesis-cli": minor
"@marktiderman/genesis-config": minor
"@marktiderman/genesis-features": minor
---

Guided setup steps that walk an outside service and end with a live check: `supabase.link`,
`github.issues`, `resend.domain`, `sentry`, `ai.key-budget` and `eas.push`.

- `@marktiderman/genesis-config/setup` (ESM and CommonJS, no zod or React): `defineSetupStep`
  declares a step (what to do in the service, its values, the secrets it needs by name, links), and
  `checkSetupFields` checks the values a person typed. Also at the deprecated
  `@marktiderman/genesis-features/setup`.
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
- `supabase db query --linked` (the Vault names and the settings table the doctor reads) gets its
  SQL from a temp file it removes, not `/dev/stdin`.
