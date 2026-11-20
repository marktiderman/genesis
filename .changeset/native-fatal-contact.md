---
"@marktiderman/genesis-native": minor
---

`FatalScreen` takes `contact` (an email and/or an https support page) and shows "Contact support"
under "Try again"; `createScreenErrorBoundary` takes `contact` (a value or a function) for its default
fallback. `contactHref` and the `FatalScreenContact` type are exported.

The contact page needs an https URL with a host, the mailbox is encoded in the `mailto:` link, and
the address is checked in one pass (no backtracking on a hostile value).
