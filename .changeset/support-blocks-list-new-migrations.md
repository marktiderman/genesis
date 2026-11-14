---
"@marktiderman/genesis-support": minor
---

The `support-chat` block now lists migrations 0013 (queues and pending), 0014 (agent tools: saved replies, mentions, reports) and 0015 (their bounds), so `genesis add support-chat` and `genesis migrate` copy them. In 0.7.0 they shipped in the package but no block named them, so `genesis migrate` skipped them: an app on 0.7.0 that copied them by hand keeps those files (the CLI matches them by their header), and `genesis migrate` adds only what's missing.
