-- @feat:media-resumable-uploads
-- pgTAP test for 0002_genesis_media_targets_key_grants.sql (with 0001 applied).
-- Copy into your app's `supabase/tests/database/` and run `supabase test db`.
-- Writes only its own upload, and rolls everything back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

select ok(not has_function_privilege('anon', 'genesis_media.targets_key(text[])', 'execute'), 'anon cannot call targets_key');
select ok(not has_function_privilege('authenticated', 'genesis_media.targets_key(text[])', 'execute'), 'a person cannot call targets_key');
select ok(has_function_privilege('service_role', 'genesis_media.targets_key(text[])', 'execute'), 'the service role can call targets_key');
select ok(
  not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where p.oid = 'genesis_media.targets_key(text[])'::regprocedure and a.grantee = 0),
  'targets_key has no PUBLIC execute'
);

-- The server still writes through the one-open-session index, which calls targets_key.
select set_config('role', 'service_role', true);
select lives_ok(
  $$ insert into genesis_media.uploads (id, owner_kind, owner_id, purpose, name, content_type, size, sha256, part_size, key, targets, target_upload_id, expires_at)
     values ('genesis-media-0002-tst', 'person', 'x', 'media', 'a.jpg', 'image/jpeg', 10, repeat('a', 64), 5, 'k/0002', array['working'], 'mpu-1', now() + interval '1 day') $$,
  'the service role can still create a session'
);

select * from finish();
rollback;
