---
"@marktiderman/genesis-cli": patch
---

Release 1 review fixes.

- The Expo config plugin loads again under `require` (genesis-config's `/settings` is CommonJS-loadable);
  a test `require()`s the built plugin under `tsx/cjs`.
- The doctor treats a `planned` setting as dormant: no `secret-missing` and no `setup-incomplete` for
  it, so a zero-config app on `max` passes `genesis doctor --strict`.
- `genesis fix <rule> --expect <hash>` reads every plan first and refuses, writing nothing, when the
  target has more than one fix to apply. A package fix whose id is already taken is reported and left out.
- The genesis-features → genesis-config codemod keeps a production dependency a production one
  when genesis-config is only a dev dependency, never doubles a key genesis-config already has in
  `overrides`, `resolutions` or a pnpm-workspace.yaml catalog (flow mappings too), points an npm
  override of a direct dependency at it (`$@marktiderman/genesis-config`, no `EOVERRIDE`), and
  `genesis upgrade` runs it only for a release that has genesis-config (an older `--to` never gets
  npm's latest).
- `genesis-behind` honours `NPM_CONFIG_REGISTRY` in any case, and still checks advisories when
  `npm view` fails.
- Under `--base` with `doctor.ratchet: true`, a new `invalid-setting` keeps its level (the base pass
  no longer reads the head's genesis.config.json).
- Findings and `genesis fix settings.setup` no longer point to `genesis setup --step`, which isn't
  available yet: they name the setting and secret to set.
- The fix engine removes a partial new file or staging file a failed write leaves, and `verify`
  counts a finding it ran for that now names another fix as not fixed. `genesis mcp` keeps a
  result valid JSON after redaction and refuses an approval when a planned file changed since the plan.
- An invalid `release.environment` (or `release.easEnvironment`) is reported ("not checked: … isn't an
  environment name") instead of being dropped, which made gh read the repository's secrets instead.
