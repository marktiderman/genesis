-- @feat:media-resumable-uploads
-- pgTAP test for 0001_genesis_media_library.sql.
-- Copy into your app's `supabase/tests/database/` and run `supabase test db`.
-- It writes only its own users and uploads, and rolls everything back.
--
-- People: a1 owns uploads; b2 is someone else; anon is signed out. The upload handler runs as
-- the service role, which is the only writer.
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

insert into auth.users (id, aud, role, email, instance_id)
select ('00000000-0000-4000-8000-0000000ab0' || n)::uuid, 'authenticated', 'authenticated', 'genesis-media-library-' || n || '@example.test', '00000000-0000-0000-0000-000000000000'
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
create function pg_temp.upload_row(id text, kind text, owner text) returns genesis_media_library.uploads language sql as $$
  select (id, kind, owner, 'media', 'a.jpg', 'image/jpeg', 10, null, 5, 'k/' || id, array['working'], 'mpu-1', 'open', '[]'::jsonb, '[]'::jsonb, now(), now() + interval '7 days')::genesis_media_library.uploads
$$;
create function pg_temp.d(c text) returns text language sql immutable as $$ select 'sha-256=:' || repeat(c, 43) || '=:' $$;
grant execute on function pg_temp.person(text), pg_temp.sign_in(text), pg_temp.as_anon(), pg_temp.as_server(), pg_temp.upload_row(text, text, text), pg_temp.d(text) to anon, authenticated, service_role;

-- Shape and privileges
select has_table('genesis_media_library', 'uploads', 'uploads exists');
select has_table('genesis_media_library', 'upload_parts', 'upload_parts exists');
select ok((select relrowsecurity from pg_class where oid = 'genesis_media_library.uploads'::regclass), 'uploads has RLS on');
select ok((select relrowsecurity from pg_class where oid = 'genesis_media_library.upload_parts'::regclass), 'upload_parts has RLS on');
select ok(not has_function_privilege('authenticated', 'genesis_media_library.add_part(text, integer, bigint, text, text)', 'execute'), 'a person cannot call add_part');
select ok(not has_function_privilege('authenticated', 'genesis_media_library.update_upload(text, jsonb, text[])', 'execute'), 'a person cannot call update_upload');
select ok(not has_function_privilege('anon', 'genesis_media_library.add_part(text, integer, bigint, text, text)', 'execute'), 'anon cannot call add_part');
select ok(not has_table_privilege('authenticated', 'genesis_media_library.uploads', 'insert, update, delete'), 'a person cannot write uploads');
select ok(not has_table_privilege('authenticated', 'genesis_media_library.upload_parts', 'insert, update, delete'), 'a person cannot write parts');

-- The server writes, bound to the owner it names
select pg_temp.as_server();
select lives_ok($$ insert into genesis_media_library.uploads select (pg_temp.upload_row('AAAAAAAAAAAAAAAAAAAAA1', 'person', pg_temp.person('a1')::text)).* $$, 'the server starts a1''s upload');
insert into genesis_media_library.uploads select (pg_temp.upload_row('RRRRRRRRRRRRRRRRRRRRR1', 'respondent', pg_temp.person('b2')::text)).*;
select is(genesis_media_library.add_part('AAAAAAAAAAAAAAAAAAAAA1', 1, 5, pg_temp.d('A'), 'e1'), 'added', 'a part is added');
select is(genesis_media_library.add_part('AAAAAAAAAAAAAAAAAAAAA1', 1, 5, pg_temp.d('A'), 'e9'), 'same', 'the same part again is "same"');
select is((select etag from genesis_media_library.upload_parts where upload_id = 'AAAAAAAAAAAAAAAAAAAAA1' and n = 1), 'e9', '"same" takes the latest write''s etag');
select is(genesis_media_library.add_part('AAAAAAAAAAAAAAAAAAAAA1', 1, 5, pg_temp.d('B'), 'e2'), 'conflict', 'part 1 with another digest is a conflict');
select is((select digest from genesis_media_library.upload_parts where upload_id = 'AAAAAAAAAAAAAAAAAAAAA1' and n = 1), pg_temp.d('A'), 'the first part stands');
select is(genesis_media_library.update_upload('AAAAAAAAAAAAAAAAAAAAA1', ('{"state":"verifying","sha256":"' || repeat('0', 64) || '"}')::jsonb, array['open']), true, 'the upload moves to verifying');
select is(genesis_media_library.update_upload('AAAAAAAAAAAAAAAAAAAAA1', '{"state":"done"}'::jsonb, array['open']), false, 'a guarded update that no longer matches does nothing');
select throws_ok($$ select genesis_media_library.add_part('AAAAAAAAAAAAAAAAAAAAA1', 2, 5, pg_temp.d('A'), 'e3') $$, 'P0002', null, 'no part is added once it is verifying');
select throws_ok($$ select genesis_media_library.add_part('NOPENOPENOPENOPENOPEN1', 1, 5, pg_temp.d('A'), 'e3') $$, 'P0002', null, 'no part is added to an upload that doesn''t exist');

-- A person reads their own sessions, and writes nothing
select pg_temp.sign_in('a1');
select is((select count(*)::int from genesis_media_library.uploads), 1, 'a1 sees their upload');
select is((select count(*)::int from genesis_media_library.upload_parts), 1, 'a1 sees its part');
select throws_ok($$ update genesis_media_library.uploads set state = 'done', copies = '[{"target":"working"}]' $$, '42501', null, 'a1 cannot mark their own upload done or claim copies');
select throws_ok($$ insert into genesis_media_library.uploads select (pg_temp.upload_row('AAAAAAAAAAAAAAAAAAAAA2', 'person', pg_temp.person('a1')::text)).* $$, '42501', null, 'a1 cannot start a session directly');
select throws_ok($$ select genesis_media_library.add_part('AAAAAAAAAAAAAAAAAAAAA1', 3, 5, pg_temp.d('A'), 'x') $$, '42501', null, 'a1 cannot add parts directly');

-- Someone else sees nothing
select pg_temp.sign_in('b2');
select is((select count(*)::int from genesis_media_library.uploads), 0, 'b2 sees none of a1''s uploads, nor a respondent row carrying b2''s id');
select is((select count(*)::int from genesis_media_library.upload_parts), 0, 'b2 sees none of a1''s parts');

-- Signed out: nothing at all
select pg_temp.as_anon();
select throws_ok($$ select count(*) from genesis_media_library.uploads $$, '42501', null, 'anon cannot read uploads');

-- Parts go with their upload
select pg_temp.as_server();
delete from genesis_media_library.uploads where id = 'AAAAAAAAAAAAAAAAAAAAA1';
select is((select count(*)::int from genesis_media_library.upload_parts where upload_id = 'AAAAAAAAAAAAAAAAAAAAA1'), 0, 'removing an upload removes its parts');

select * from finish();
rollback;
