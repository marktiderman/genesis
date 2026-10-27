---
"@marktiderman/genesis-product": patch
---

`productNotifications`, from `/server` (a new entry) and the core: a genesis-notifications fragment the app spreads into its own `defineNotifications`, with type `product.idea_shipped` in category `product_updates` (not critical, not transactional; in the feed and by email, push as an opt-in) and a render with a title, body and url. `notifyShipped(notify, { release, feature, recipients })` sends one notification per shipped feature to everyone who asked, keyed `shipped:<release>:<feature>`, deduplicated and 1,000 recipients a call; its `url` must be a path on the app. `cancelShipped(cancel, { release, featureId })` stops what hasn't gone out when a release is withdrawn and archives the feed rows. On a GitHub-only repo the `--notify` comment is the notice, so don't call `notify()` there.
