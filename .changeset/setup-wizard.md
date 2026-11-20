---
"@marktiderman/genesis-cli": minor
"@marktiderman/genesis-config": patch
---

`genesis setup`: the setup wizard on localhost, on the doctor's engine. It shows the app's findings
with their fixes, its settings, secrets (by name) and upgrades through the shared Settings screen,
and the guided setup steps the installed packages' settings name; `--step <id>` opens on one.
`genesis init` with no name, at a terminal, opens it on an empty folder to make a new app (App,
Preset, Packages, Review), the same app `genesis init <slug> --template native` makes, then installs
its packages. Every write is a fix plan you read and apply by its hash; a stale plan, or one the
wizard didn't make, is refused. A secret is typed into a password field and reaches your signed-in
CLI on stdin only; no page, answer, event or log holds it. The server listens on 127.0.0.1 only and
refuses another Host (localhost included), a write without its own Origin, a cross-site fetch and
anything but JSON. Its session key never appears in a URL or a command line: the link carries a
one-time launch code that the page swaps for it.

`genesis setup --yes` runs headless: `--preset` and `--without`, every automatic fix, then the
dormant checklist (`genesis setup --step <id>`). Without `--yes` and without a terminal it applies
nothing: it prints the plans and the checklist and exits 1 when there is something to apply.
`--preset` and `--without` never imply `--yes`. `genesis init <name>
--template native --preset standard|min` sets a new app's preset (checked before anything is
written; refused without a template). With `CI` set the wizard never opens. `genesis mcp` adds the read-only `setup_steps` tool,
and a fix with a setup step now returns `genesis setup --step <id>`.

The Settings screen shows `genesis setup --step <id>` for a guided fix that has a step (else `genesis fix <id>`).
