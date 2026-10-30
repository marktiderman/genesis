-- @feat:media-resumable-uploads
-- pgTAP test for 0001_genesis_media_library.sql.
-- Copy into your app's `supabase/tests/database/` and run `supabase test db`.
-- It writes only its own users and uploads, and rolls everything back.
--
-- People: a1 owns uploads; b2 is someone else; anon is signed out.
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

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
grant execute on function pg_temp.person(text), pg_temp.sign_in(text), pg_temp.as_anon(), pg_temp.as_server(), pg_temp.upload_row(text, text, text) to anon, authenticated, service_role;

-- Shape
select has_table('genesis_media_library', 'uploads', 'uploads exists');
select has_table('genesis_media_library', 'upload_parts', 'upload_parts exists');
select ok((select relrowsecurity from pg_class where oid = 'genesis_media_library.uploads'::regclass), 'uploads has RLS on');
select ok((select relrowsecurity from pg_class where oid = 'genesis_media_library.upload_parts'::regclass), 'upload_parts has RLS on');
select ok(not has_function_privilege('anon', 'genesis_media_library.add_part(text, integer, bigint, text, text)', 'execute'), 'anon cannot call add_part');
select ok(not has_function_privilege('anon', 'genesis_media_library.update_upload(text, jsonb, text[])', 'execute'), 'anon cannot call update_upload');

-- A person starts their own upload, and no one else's
select pg_temp.sign_in('a1');
select lives_ok($$ insert into genesis_media_library.uploads select (pg_temp.upload_row('AAAAAAAAAAAAAAAAAAAAA1', 'person', pg_temp.person('a1')::text)).* $$, 'a1 starts an upload of their own');
select throws_ok($$ insert into genesis_media_library.uploads select (pg_temp.upload_row('AAAAAAAAAAAAAAAAAAAAA2', 'person', pg_temp.person('b2')::text)).* $$, '42501', null, 'a1 cannot start an upload for b2');
select throws_ok($$ insert into genesis_media_library.uploads select (pg_temp.upload_row('AAAAAAAAAAAAAAAAAAAAA3', 'respondent', 'attempt-1')).* $$, '42501', null, 'a person cannot start a respondent''s upload (the handler does, as the service role)');

-- Parts: added, same, conflict
select is(genesis_media_library.add_part('AAAAAAAAAAAAAAAAAAAAA1', 1, 5, 'sha-256=:' || repeat('A', 43) || '=:', 'e1'), 'added', 'a1 adds part 1');
select is(genesis_media_library.add_part('AAAAAAAAAAAAAAAAAAAAA1', 1, 5, 'sha-256=:' || repeat('A', 43) || '=:', 'e1'), 'same', 'the same part again is "same"');
select is(genesis_media_library.add_part('AAAAAAAAAAAAAAAAAAAAA1', 1, 5, 'sha-256=:' || repeat('B', 43) || '=:', 'e2'), 'conflict', 'part 1 with another digest is a conflict');
select is((select digest from genesis_media_library.upload_parts where upload_id = 'AAAAAAAAAAAAAAAAAAAAA1' and n = 1), 'sha-256=:' || repeat('A', 43) || '=:', 'the first part stands');
select is(genesis_media_library.update_upload('AAAAAAAAAAAAAAAAAAAAA1', ('{"state":"verifying","sha256":"' || repeat('0', 64) || '"}')::jsonb, array['open']), true, 'a1 moves their upload to verifying');
select is(genesis_media_library.update_upload('AAAAAAAAAAAAAAAAAAAAA1', '{"state":"done"}'::jsonb, array['open']), false, 'a guarded update that no longer matches does nothing');
select throws_ok($$ select genesis_media_library.add_part('AAAAAAAAAAAAAAAAAAAAA1', 2, 5, 'sha-256=:' || repeat('A', 43) || '=:', 'e3') $$, '42501', null, 'no part can be added once it is verifying');

-- Someone else sees nothing, changes nothing
select pg_temp.as_server();
insert into genesis_media_library.uploads select (pg_temp.upload_row('BBBBBBBBBBBBBBBBBBBBB1', 'person', pg_temp.person('a1')::text)).*;
insert into genesis_media_library.uploads select (pg_temp.upload_row('RRRRRRRRRRRRRRRRRRRRR1', 'respondent', pg_temp.person('b2')::text)).*;
select pg_temp.sign_in('b2');
select is((select count(*)::int from genesis_media_library.uploads), 0, 'b2 sees none of a1''s uploads, nor a respondent row carrying b2''s id');
select is((select count(*)::int from genesis_media_library.upload_parts), 0, 'b2 sees none of a1''s parts');
select is(genesis_media_library.update_upload('BBBBBBBBBBBBBBBBBBBBB1', '{"state":"done"}'::jsonb), false, 'b2 cannot change a1''s upload');
select throws_ok($$ select genesis_media_library.add_part('BBBBBBBBBBBBBBBBBBBBB1', 1, 5, 'sha-256=:' || repeat('A', 43) || '=:', 'x') $$, '42501', null, 'b2 cannot add a part to a1''s upload');
delete from genesis_media_library.uploads where id = 'BBBBBBBBBBBBBBBBBBBBB1';
select pg_temp.as_server();
select is((select count(*)::int from genesis_media_library.uploads where id = 'BBBBBBBBBBBBBBBBBBBBB1'), 1, 'b2''s delete removed nothing');

-- The owner, and the service role
select pg_temp.sign_in('a1');
select is((select count(*)::int from genesis_media_library.uploads), 2, 'a1 sees both of their uploads');
select pg_temp.as_server();
select is((select count(*)::int from genesis_media_library.uploads), 3, 'the service role sees every upload');
select is((select state from genesis_media_library.uploads where id = 'AAAAAAAAAAAAAAAAAAAAA1'), 'verifying', 'the state a1 set is stored');

-- Signed out: nothing at all
select pg_temp.as_anon();
select throws_ok($$ select count(*) from genesis_media_library.uploads $$, '42501', null, 'anon cannot read uploads');
select throws_ok($$ select genesis_media_library.add_part('AAAAAAAAAAAAAAAAAAAAA1', 1, 5, 'x', 'x') $$, '42501', null, 'anon cannot add parts');

-- Parts go with their upload
select pg_temp.as_server();
delete from genesis_media_library.uploads where id = 'AAAAAAAAAAAAAAAAAAAAA1';
select is((select count(*)::int from genesis_media_library.upload_parts where upload_id = 'AAAAAAAAAAAAAAAAAAAAA1'), 0, 'removing an upload removes its parts');

select * from finish();
rollback;
