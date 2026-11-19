---
"@marktiderman/genesis-cli": minor
---

`genesis fix [rule|fixId] [--plan] [--yes] [--expect <hash>] [--json]`: every doctor finding now
declares its fix (`fix` in `--json`, `→ genesis fix <id>` in the report; `manual:<rule>` when
nothing runs). A plan lists the files it writes with the hash of the text each expects, the
commands it runs (allowlisted tools as argument lists, never a shell; secrets by name, on stdin),
and what is left to you, with a hash of the whole plan. Applying plans again and refuses a stale
plan or a file that changed, then re-runs the doctor for the fix's rules. The first fixes wrap the
scope-names, genesis-features and eslint-config codemods, `genesis agents` (and `--hooks`),
`genesis introspect`, `genesis migrate` (and `--forward`), `genesis upgrade --pr` (never merged) and
removing undeclared settings. Packages add fixes for their own rules with `genesis.doctor.fixes`.

New doctor rules: `migration-pending` and `migration-drift` (what `genesis migrate --dry-run`
reports), and `genesis-behind`: the installed `@marktiderman/genesis` release against npm's latest
(info a patch behind; a warning one or two minors behind that never fails `--strict`; a
strict-failing warning further, a major or 90 days behind) and an error for a published advisory
on an installed Genesis package (npm's bulk advisory endpoint, `gh api /advisories` as a fallback),
cached in `node_modules/.cache/genesis/behind.json` for a day. The CLI's doctor reaches the
network unless `--offline` (or `npm_config_offline=true`); the Vite plugin never does, and offline
the rule reports what its cache last knew as one info finding.
