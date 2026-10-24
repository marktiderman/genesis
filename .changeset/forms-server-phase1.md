---
"@marktiderman/genesis-forms": minor
"@marktiderman/genesis-forms-web": minor
"@marktiderman/genesis-forms-studio": minor
---

Edit links, rate-limit keys and clean form links, moved up from Breakthrough's forms.

- `genesis-forms/server`: signed edit links (`signEditToken`, `verifyEditToken`, `editLinkUrl`,
  `withEditToken`, `createEditSecretReader`, `isEditLinkRequest`, `withEditLinkHeaders` and their
  constants), byte-for-byte the format Breakthrough signs, so its links keep working. Rate-limit
  pieces without the counter: `clientIp`, `addressPrefix`, `rateLimitKey` (an HMAC of the address's
  /64, never the address), `allow` (fails open) and `RATE_LIMIT_DEFAULTS`. Web Crypto only.
- `genesis-forms`: `carryAnswers` moves here from genesis-forms-studio, which re-exports it from its
  `rules` entry unchanged; studio now needs genesis-forms `>=0.6.0`.
- `genesis-forms-web`: `hideQueryOnLoad`, `wasReload` and `HIDDEN_QUERY_KEEP_MS` take a link's query
  out of the address bar. The ending slot takes `actions` (shown in a row under the default ending),
  and `DefaultEnding` is exported.
- `genesis-forms-studio/rules`: `slugFromTitle`, `SLUG_PATTERN`, `validateSlug`, `copyTitle`,
  `freeSlug` and `offersSubmitAnother`.
