-- An app installed before support 0020-0023, with hooks and functions of its own (support-upgrade-2b
-- suite): its own requester-names function under a name Genesis once used, a staff hook with its
-- own parameter name, and a ticket. 0020-0023 are applied after this, as `genesis migrate` would.
create or replace function public.support_reporters(ids uuid[])
returns table (user_id uuid, full_name text, email text)
language sql stable security definer set search_path = '' as $$
  -- app-own: names from the app's own people table
  select u.id, 'app name'::text, u.email::text from auth.users u where u.id = any (ids)
$$;
create function private.genesis_support_staff(p uuid) returns boolean
language sql stable set search_path = '' as $$ select p = '00000000-0000-4000-8000-0000000025b2'::uuid $$;
insert into auth.users (id, aud, role, email, instance_id)
values ('00000000-0000-4000-8000-0000000025a1', 'authenticated', 'authenticated', 'upgrade-2b-a1@example.test', '00000000-0000-0000-0000-000000000000'),
       ('00000000-0000-4000-8000-0000000025b2', 'authenticated', 'authenticated', 'upgrade-2b-b2@example.test', '00000000-0000-0000-0000-000000000000');
insert into public.tickets (user_id, type, message) values ('00000000-0000-4000-8000-0000000025a1', 'bug', 'filed before the upgrade');
