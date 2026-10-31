-- @feat:media-resumable-uploads
-- pgTAP test for 0001_genesis_media.sql.
-- Copy into your app's `supabase/tests/database/` and run `supabase test db`.
-- It writes only its own users and uploads, and rolls everything back.
--
-- People: a1 owns uploads; b2 is someone else; anon is signed out. The upload handler runs as
-- the service role, which is the only writer.
begin;
create extension if not exists pgtap with schema extensions;
select plan(53);

insert into auth.users (id, aud, role, email, instance_id)
select ('00000000-0000-4000-8000-0000000ab0' || n)::uuid, 'authenticated', 'authenticated', 'genesis-media-' || n || '@example.test', '00000000-0000-0000-0000-000000000000'
from unnest(array['a1', 'b2']) n;

create function pg_temp.person(n text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-0000000ab0' || n)::uuid $$;
create function pg_temp.sign_in(n text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.person(n), 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', pg_temp.person(n)::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('role', 'anon', true);
end $$;
create function pg_temp.as_server() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('role', 'service_role', true);
end $$;
create function pg_temp.upload_row(id text, kind text, owner text) returns genesis_media.uploads language sql as $$
  select (id, kind, owner, 'media', 'a.jpg', 'image/jpeg', 10, null, 5, 'k/' || id, array['working'], 'mpu-1', 'open', '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, '{}'::jsonb, null, null, null, now(), now() + interval '7 days')::genesis_media.uploads
$$;
create function pg_temp.upload_with(id text, key text, sha text, targets text[]) returns genesis_media.uploads language sql as $$
  select (id, 'person', 'x', 'media', 'a.jpg', 'image/jpeg', 10, sha, 5, key, targets, 'mpu-1', 'open', '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, '{}'::jsonb, null, null, null, now(), now() + interval '7 days')::genesis_media.uploads
$$;
create function pg_temp.d(c text) returns text language sql immutable as $$ select 'sha-256=:' || repeat(c, 43) || '=:' $$;
grant execute on function pg_temp.person(text), pg_temp.sign_in(text), pg_temp.as_anon(), pg_temp.as_server(), pg_temp.upload_row(text, text, text), pg_temp.upload_with(text, text, text, text[]), pg_temp.d(text) to anon, authenticated, service_role;

-- Shape and privileges
select has_table('genesis_media', 'uploads', 'uploads exists');
select has_table('genesis_media', 'upload_parts', 'upload_parts exists');
select ok((select relrowsecurity from pg_class where oid = 'genesis_media.uploads'::regclass), 'uploads has RLS on');
select ok((select relrowsecurity from pg_class where oid = 'genesis_media.upload_parts'::regclass), 'upload_parts has RLS on');
select ok(not has_function_privilege('authenticated', 'genesis_media.reserve_part(text, integer, bigint, text, text, timestamptz, timestamptz)', 'execute'), 'a person cannot call reserve_part');
select ok(not has_function_privilege('authenticated', 'genesis_media.update_upload(text, jsonb, text[], text)', 'execute'), 'a person cannot call update_upload');
select ok(not has_function_privilege('authenticated', 'genesis_media.claim_verify(text, timestamptz, timestamptz, text)', 'execute'), 'a person cannot call claim_verify');
select ok(not has_function_privilege('authenticated', 'genesis_media.remove_upload(text, text[], timestamptz)', 'execute'), 'a person cannot call remove_upload');
select ok(not has_function_privilege('anon', 'genesis_media.reserve_part(text, integer, bigint, text, text, timestamptz, timestamptz)', 'execute'), 'anon cannot call reserve_part');
select ok(not has_function_privilege('anon', 'genesis_media.update_upload(text, jsonb, text[], text)', 'execute'), 'anon cannot call update_upload');
select ok(not has_table_privilege('anon', 'genesis_media.upload_parts', 'select'), 'anon cannot read upload_parts');
select ok(not has_table_privilege('authenticated', 'genesis_media.uploads', 'insert, update, delete'), 'a person cannot write uploads');
select ok(not has_table_privilege('authenticated', 'genesis_media.upload_parts', 'insert, update, delete'), 'a person cannot write parts');

-- The server writes, bound to the owner it names
select pg_temp.as_server();
select lives_ok($$ insert into genesis_media.uploads select (pg_temp.upload_row('AAAAAAAAAAAAAAAAAAAAA1', 'person', pg_temp.person('a1')::text)).* $$, 'the server starts a1''s upload');
insert into genesis_media.uploads select (pg_temp.upload_row('RRRRRRRRRRRRRRRRRRRRR1', 'respondent', pg_temp.person('b2')::text)).*;
select throws_ok($$ insert into genesis_media.uploads select (pg_temp.upload_with('AAAAAAAAAAAAAAAAAAAAA9', 'k/AAAAAAAAAAAAAAAAAAAAA1', null, array['working'])).* $$, '23505', null, 'no two uploads share a storage key');
select is(genesis_media.reserve_part('AAAAAAAAAAAAAAAAAAAAA1', 1, 5, pg_temp.d('A'), 'h1', now(), now() - interval '10 minutes'), 'reserved', 'a part is reserved for one request before it is written');
select is(genesis_media.reserve_part('AAAAAAAAAAAAAAAAAAAAA1', 1, 5, pg_temp.d('A'), 'h2', now(), now() - interval '10 minutes'), 'busy', 'another request for the same bytes while it is written is "busy" and writes nothing');
select is(genesis_media.reserve_part('AAAAAAAAAAAAAAAAAAAAA1', 1, 5, pg_temp.d('B'), 'h3', now(), now() - interval '10 minutes'), 'conflict', 'other bytes for a reserved part are a conflict, before anything is written');
select is(genesis_media.complete_part('AAAAAAAAAAAAAAAAAAAAA1', 1, 'h2', 'e2'), false, 'only the request that reserved it can complete the part');
select is(genesis_media.complete_part('AAAAAAAAAAAAAAAAAAAAA1', 1, 'h1', 'e1'), true, 'the request that reserved it completes it');
select is(genesis_media.reserve_part('AAAAAAAAAAAAAAAAAAAAA1', 1, 5, pg_temp.d('A'), 'h4', now(), now() - interval '10 minutes'), 'received', 'a received part again is "received"');
select is(genesis_media.reserve_part('AAAAAAAAAAAAAAAAAAAAA1', 2, 5, pg_temp.d('C'), 'h5', now(), now() - interval '10 minutes'), 'reserved', 'part 2 is reserved');
select lives_ok($$ select genesis_media.release_part('AAAAAAAAAAAAAAAAAAAAA1', 2, 'h5') $$, 'a failed write releases its own reservation');
select is(genesis_media.reserve_part('AAAAAAAAAAAAAAAAAAAAA1', 3, 5, pg_temp.d('D'), 'h6', now() - interval '20 minutes', now() - interval '30 minutes'), 'reserved', 'part 3 is reserved, twenty minutes ago');
select is(genesis_media.reserve_part('AAAAAAAAAAAAAAAAAAAAA1', 3, 5, pg_temp.d('D'), 'h7', now(), now() - interval '10 minutes'), 'reserved', 'a reservation left past the limit (its writer died) is taken over');
select is(genesis_media.complete_part('AAAAAAAAAAAAAAAAAAAAA1', 3, 'h6', 'e6'), false, 'the writer it was taken from can''t complete it');
select lives_ok($$ select genesis_media.release_part('AAAAAAAAAAAAAAAAAAAAA1', 3, 'h7') $$, 'the new holder gives it back');
select is((select count(*)::int from genesis_media.upload_parts where upload_id = 'AAAAAAAAAAAAAAAAAAAAA1'), 1, 'only the received part is left');
select is(genesis_media.update_upload('AAAAAAAAAAAAAAAAAAAAA1', ('{"state":"verifying","sha256":"' || repeat('0', 64) || '","verifying_since":"2026-11-01T00:00:00Z"}')::jsonb, array['open']), true, 'the upload moves to verifying');
select is(genesis_media.update_upload('AAAAAAAAAAAAAAAAAAAAA1', '{"state":"done"}'::jsonb, array['open']), false, 'a guarded update that no longer matches does nothing');
select throws_ok($$ select genesis_media.reserve_part('AAAAAAAAAAAAAAAAAAAAA1', 2, 5, pg_temp.d('A'), 'h8', now(), now() - interval '10 minutes') $$, 'P0002', null, 'no part is reserved once it is verifying');
select is(genesis_media.claim_verify('AAAAAAAAAAAAAAAAAAAAA1', now() + interval '10 minutes', now(), 'run-1'), true, 'one run takes the lease');
select is(genesis_media.claim_verify('AAAAAAAAAAAAAAAAAAAAA1', now() + interval '10 minutes', now(), 'run-2'), false, 'a second run can''t while it is live');
select is(genesis_media.claim_verify('AAAAAAAAAAAAAAAAAAAAA1', now() + interval '30 minutes', now() + interval '20 minutes', 'run-2'), true, 'it can once the lease lapsed');
select is(genesis_media.update_upload('AAAAAAAAAAAAAAAAAAAAA1', '{"state":"done"}'::jsonb, array['verifying'], 'run-1'), false, 'the run that lost the lease can''t finish it');
select is(genesis_media.remove_upload('AAAAAAAAAAAAAAAAAAAAA1', array['verifying'], now()), false, 'a stuck-session remove waits while a lease is live');
select is(genesis_media.update_upload('AAAAAAAAAAAAAAAAAAAAA1', '{"lease_until":null}'::jsonb), true, 'a null in the patch clears the lease');
select is((select lease_until from genesis_media.uploads where id = 'AAAAAAAAAAAAAAAAAAAAA1'), null, 'the lease is cleared');
select is(genesis_media.remove_upload('AAAAAAAAAAAAAAAAAAAAA1', array['open']), false, 'a remove for the state it no longer has removes nothing');
select is((select count(*)::int from genesis_media.stale_uploads(now() + interval '8 days', 10, '2026-11-02T00:00:00Z')), 2, 'the sweep lists the lapsed open one and the verifying one with no lease');

-- Two tabs, one open session per identity
insert into genesis_media.uploads select (pg_temp.upload_with('TTTTTTTTTTTTTTTTTTTTT1', 'k/tab1', repeat('1', 64), array['working', 'archive'])).*;
select throws_ok($$ insert into genesis_media.uploads select (pg_temp.upload_with('TTTTTTTTTTTTTTTTTTTTT2', 'k/tab2', repeat('1', 64), array['archive', 'working'])).* $$, '23505', null, 'a second open session for the same file and target set (in any order) is refused');
select lives_ok($$ insert into genesis_media.uploads select (pg_temp.upload_with('TTTTTTTTTTTTTTTTTTTTT3', 'k/tab3', repeat('1', 64), array['working'])).* $$, 'another target set is another session');

-- A person reads their own sessions, and writes nothing
select pg_temp.sign_in('a1');
select is((select count(*)::int from genesis_media.uploads), 1, 'a1 sees their upload');
select is((select count(*)::int from genesis_media.upload_parts), 1, 'a1 sees their part');
select throws_ok($$ update genesis_media.uploads set state = 'done', copies = '[{"target":"working"}]' $$, '42501', null, 'a1 cannot mark their own upload done or claim copies');
select throws_ok($$ insert into genesis_media.uploads select (pg_temp.upload_row('AAAAAAAAAAAAAAAAAAAAA2', 'person', pg_temp.person('a1')::text)).* $$, '42501', null, 'a1 cannot start a session directly');
select throws_ok($$ select genesis_media.reserve_part('AAAAAAAAAAAAAAAAAAAAA1', 3, 5, pg_temp.d('A'), 'h9', now(), now() - interval '10 minutes') $$, '42501', null, 'a1 cannot reserve parts directly');

-- Someone else sees nothing
select pg_temp.sign_in('b2');
select is((select count(*)::int from genesis_media.uploads), 0, 'b2 sees none of a1''s uploads, nor a respondent row carrying b2''s id');
select is((select count(*)::int from genesis_media.upload_parts), 0, 'b2 sees none of a1''s parts');

-- Signed out: nothing at all
select pg_temp.as_anon();
select throws_ok($$ select count(*) from genesis_media.uploads $$, '42501', null, 'anon cannot read uploads');
select throws_ok($$ select count(*) from genesis_media.upload_parts $$, '42501', null, 'anon cannot read parts');
select throws_ok($$ select genesis_media.update_upload('AAAAAAAAAAAAAAAAAAAAA1', '{"state":"done"}'::jsonb) $$, '42501', null, 'anon cannot call update_upload');

-- Parts go with their upload
select pg_temp.as_server();
delete from genesis_media.uploads where id = 'AAAAAAAAAAAAAAAAAAAAA1';
select is((select count(*)::int from genesis_media.upload_parts where upload_id = 'AAAAAAAAAAAAAAAAAAAAA1'), 0, 'removing an upload removes its parts');

select * from finish();
rollback;
