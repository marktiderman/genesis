-- @feat:media-resumable-uploads
-- pgTAP test for 0002_genesis_media_targets_key_grants.sql (with 0001 applied).
-- Copy into your app's `supabase/tests/database/` and run `supabase test db`.
-- Reads privileges only, and rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

select ok(not has_function_privilege('anon', 'genesis_media.targets_key(text[])', 'execute'), 'anon cannot call targets_key');
select ok(not has_function_privilege('authenticated', 'genesis_media.targets_key(text[])', 'execute'), 'a person cannot call targets_key');
select ok(has_function_privilege('service_role', 'genesis_media.targets_key(text[])', 'execute'), 'the service role can call targets_key');

select * from finish();
rollback;
