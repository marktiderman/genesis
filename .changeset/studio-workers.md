---
"@marktiderman/genesis-studio-server": patch
"@marktiderman/genesis-cli": patch
---

The studio server runs on Cloudflare Workers, where Lovable deploys TanStack Start apps. A
database connection there belongs to the request that opened it, so the server now opens one
per transaction and closes it after (`createPostgresDatabase(url, { perRequest })`, on by
default on Workers), and one handler serves every request. `genesis studio init` writes
`process.env["X"]` (for `noPropertyAccessFromIndexSignature`) and says `bun add` for a text
`bun.lock`.
