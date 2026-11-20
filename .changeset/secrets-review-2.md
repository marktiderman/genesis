---
"@marktiderman/genesis-cli": patch
"@marktiderman/genesis-supabase": patch
---

`genesis fix` secrets, second review: the hidden prompt refuses (and throws away) the rest of a
multi-line paste however slowly it arrives, input already waiting when it starts, and zero-width,
bidi and separator characters; it backspaces over whole characters, accepts a CRLF Enter split
across two reads, puts the terminal back on an external SIGINT, and stdin is drained before exit.
Redaction catches every JSON-escaped form of a value (Go's `&`-style escapes, either case),
and `--json` keeps a Date as its ISO string. genesis-supabase's README adds the jobs secret to Vault
in the dashboard rather than with SQL.
