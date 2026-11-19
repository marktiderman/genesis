---
"@marktiderman/genesis-cli": minor
---

`genesis mcp`: the doctor, the settings and fix plans as MCP tools over stdio, for an agent
session in the app. Read-only tools: `doctor_run`, `doctor_explain`, `settings_catalogue`,
`settings_get` (values with their sources; secrets by name as set, missing or unknown, never a
value), `upgrades_status`, `catalog_search`, `fix_plan` and `settings_propose` (each a plan and its
hash; nothing written). The one write tool, `fix_apply {fixId, hash}`, refuses a stale hash and
applies only after the person accepts an MCP elicitation that shows the plan; a client without
elicitation gets `genesis fix <id> --expect <hash>` to run instead, and a fix that needs a secret
returns `genesis fix <id>` for the person (`genesis setup --step <id>` and a `setup_steps` tool
arrive with the setup wizard). Every result and error is bounded in size and scrubbed of
secret-looking values, and while it serves no child process can write into the protocol. `genesis agents --mcp` writes the server's `.mcp.json`
entry (`npx --no genesis mcp`), keeping every other server.

New dependency: `@modelcontextprotocol/sdk` (1.32.2, pinned), the protocol's reference SDK.
