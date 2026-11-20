---
"@marktiderman/genesis-cli": minor
---

`genesis setup`: the setup wizard on localhost, on the doctor's engine. It shows the app's findings
with their fixes, its settings, secrets (by name) and upgrades through the shared Settings screen,
and the guided setup steps the installed packages' settings name; `--step <id>` opens on one.
`genesis init` with no name, at a terminal, opens it on an empty folder to make a new app (App,
Preset, Packages, Review), the same app `genesis init <slug> --template native` makes, then installs
its packages. Every write is a fix plan you read and apply by its hash; a stale plan, or one the
wizard didn't make, is refused. A secret is typed into a password field and reaches your signed-in
CLI on stdin only; no page, answer, event or log holds it. The server listens on 127.0.0.1 only,
with a per-run key in the link's fragment, and refuses another Host, a write without its own
Origin, a cross-site fetch and anything but JSON.

`genesis setup --yes` (the default without a terminal) runs headless: `--preset` and `--without`,
every automatic fix, then the dormant checklist (`genesis setup --step <id>`). `genesis init <name>
--preset standard|min` sets a new app's preset. `genesis mcp` adds the read-only `setup_steps` tool,
and a fix with a setup step now returns `genesis setup --step <id>`.
