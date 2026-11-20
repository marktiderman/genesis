---
"@marktiderman/genesis-cli": patch
"@marktiderman/genesis-config": patch
"@marktiderman/genesis-support": patch
---

#848 review findings.

- genesis-cli: `genesis fix --expect` writes nothing when one of the target's fixes can't be
  planned. The fix engine removes only a file its own `wx` open created (an `EMFILE` open never
  deletes another process's file). `genesis settings sync` passes `--yes` to `supabase db query`
  after its own confirmation, so supabase's prompt can't default to No. `genesis-behind` keeps
  advisories read while npm failed (through the hour of backoff, at their level), apart from a
  cached release distance, which stays a note. The rename codemod dedupes pnpm-workspace.yaml
  entries only within one mapping, so a named catalog keeps its own renamed entry.
- genesis-config: `SettingsClientMessages.badAnswer` is optional (a complete messages object from
  before still typechecks). On the Settings screen a refreshed snapshot supersedes an upgrade
  check or an audit page still in flight (its busy state cleared). `resolveSettings` never throws on
  a value neither JSON nor `String` can write.
- genesis-support: the dump checks `diagnostics.enabled` again after collecting (a feedback goes
  alone when it turned off meanwhile); a dump made earlier is capped with the limits in force when
  sent, and no dump is capped above what the table stores; a shake's dump left unclaimed follows
  support's own `diagnostics.enabled`, and leaving the feedback screen while its report is being
  sent no longer sends the dump twice; the HTTP handler shares one settings read between requests.
