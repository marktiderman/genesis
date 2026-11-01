-- Genesis media uploads 0002: genesis_media.targets_key loses PostgreSQL's default PUBLIC execute
-- and is for the service role only, like every other function in the schema. Apply after 0001.

revoke execute on function genesis_media.targets_key(text[]) from public, anon, authenticated;
grant execute on function genesis_media.targets_key(text[]) to service_role;
