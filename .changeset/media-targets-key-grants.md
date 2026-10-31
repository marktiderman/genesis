---
"@marktiderman/genesis-media": patch
---

Migration `0002_genesis_media_targets_key_grants.sql`: `genesis_media.targets_key` is for the
service role only, like the schema's other functions (it kept PostgreSQL's default PUBLIC execute).
Copy it after 0001; its pgTAP test is in `migrations/tests/`.
