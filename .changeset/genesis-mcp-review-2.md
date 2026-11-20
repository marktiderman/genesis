---
"@marktiderman/genesis-cli": patch
---

`genesis mcp`: the approval a person sees is now exactly what applies. A plan whose message would
hold a secret's value or a secret-shaped literal, or whose changed lines pass 12,000 characters,
isn't offered for approval (`fix_apply` says why and gives the command); invisible and
direction-changing characters show as their codes; an unterminated private-key header no longer
redacts the rest of a text. Results are scrubbed before they're clipped, a file's own hashes aren't
returned, `*PASSPHRASE*`, `*_PWD` and `*SALT*` count as secret names, stderr is scrubbed, `fork`
and `spawn(cmd, null, …)` are guarded too, and `genesis agents --mcp` keeps `.mcp.json`'s mode.
