---
"@marktiderman/genesis-forms": minor
---

**Breaking for conformance consumers: the shipped scenarios use neutral sample forms.** The `after-class` form is now `event-feedback` (hidden inputs `session` and `owner` instead of `class` and `coach`), and `monthly-pulse` is now `monthly-check-in`. The scenario files are renamed to match (`conformance/event-feedback-*.scenario.json`, `conformance/monthly-check-in-*.scenario.json`; `…-server-ignores-a-client-sent-coach` is now `…-server-ignores-a-client-sent-owner`). Each scenario covers the same logic as before; only ids, keys and copy changed. If you load the files by name, update the names.
