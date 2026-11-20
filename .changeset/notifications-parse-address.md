---
"@marktiderman/genesis-notifications": patch
---

`parseAddress` is linear in the header's length (a hostile `From:` no longer takes seconds), and
takes one address only: a header naming several (`a@x.test, b@y.test`, or an address in an
unquoted display name) is no sender, so `inboundEmailOf` returns null for it.
