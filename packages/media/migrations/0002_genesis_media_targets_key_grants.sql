-- Genesis media uploads 0002: targets_key for the service role only
--
-- Builds on 0001 (never edited once released). genesis_media.targets_key, which the
-- one-open-session index uses to compare target sets, kept PostgreSQL's default PUBLIC execute.
-- It is harmless (it sorts the text it is given), but every other function in the schema is for
-- the service role only, so this one is too, by name.
--
-- Use: copy after 0001. Verify: tests/0002_genesis_media_targets_key_grants.test.sql.

revoke execute on function genesis_media.targets_key(text[]) from public, anon, authenticated;
grant execute on function genesis_media.targets_key(text[]) to service_role;
