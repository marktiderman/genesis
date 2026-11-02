---
"@marktiderman/genesis-notifications": patch
---

The pgTAP test's "push during quiet hours waits" case sets its quiet hours around the test's own
clock (an hour either side of now, in UTC). It used 00:00 to 23:59 with an exclusive end, so a run
between 23:59 and midnight UTC failed. Apps that copied `migrations/tests/0001_genesis_notifications.test.sql`
take the new copy with `genesis upgrade`.
