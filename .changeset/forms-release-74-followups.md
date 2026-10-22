---
"@marktiderman/genesis-forms": patch
---

Destinations: the Google token cache is keyed by a SHA-256 digest of the private key as well as the email and scope, so a config with the right email and another key never gets a cached token. Two first deliveries to a new sheet no longer fail permanently: an "already exists" from adding the tab reuses it, and the header is read back and merged again after a concurrent write. A request that can never be sent (a malformed header value or URL) now fails for good instead of retrying as a network error.
