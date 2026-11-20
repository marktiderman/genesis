-- An app with hooks of its own (as Growth90 has), applied after support's migrations, so the pgTAP
-- files an app copies are run where those hooks exist: each must set them aside itself. The
-- `support-app-hooks` suite applies it. One app table's policy depends on a hook, as real ones do.
create schema if not exists private;

create table public.app_teams (id uuid primary key, name text not null);
create table public.app_team_people (team_id uuid not null references public.app_teams (id), person_id uuid not null, login uuid not null, admin boolean not null default false, primary key (team_id, person_id));
insert into public.app_teams values ('a0000000-0000-4000-8000-000000000001', 'Growth');

create function private.genesis_support_default_tenant() returns uuid
language sql stable set search_path = '' as $$ select 'a0000000-0000-4000-8000-000000000001'::uuid $$;
create function private.genesis_viewer_people(viewer uuid) returns table (tenant_id uuid, person_id uuid)
language sql stable set search_path = '' as $$ select p.team_id, p.person_id from public.app_team_people p where p.login = viewer $$;
create function private.genesis_support_staff(person uuid) returns boolean
language sql stable set search_path = '' as $$ select exists (select 1 from public.app_team_people p where p.login = person and p.admin) $$;
create function private.genesis_platform_admin(person uuid) returns boolean
language sql stable set search_path = '' as $$ select exists (select 1 from public.app_team_people p where p.login = person and p.admin) $$;
create function private.genesis_tenant_admin(tenant uuid, person uuid) returns boolean
language sql stable set search_path = '' as $$ select exists (select 1 from public.app_team_people p where p.team_id = tenant and p.login = person and p.admin) $$;
create function private.genesis_tenant_member(tenant uuid, person uuid) returns boolean
language sql stable set search_path = '' as $$ select exists (select 1 from public.app_team_people p where p.team_id = tenant and p.login = person) $$;
create function private.genesis_tenant_admin_list(tenant uuid) returns setof uuid
language sql stable set search_path = '' as $$ select p.login from public.app_team_people p where p.team_id = tenant and p.admin $$;
create function private.genesis_tenant_label(tenant uuid) returns text
language sql stable set search_path = '' as $$ select t.name from public.app_teams t where t.id = tenant $$;
create function private.genesis_person_name(person uuid) returns text
language sql stable set search_path = '' as $$ select 'App person' $$;
create function private.genesis_support_staff_list() returns setof uuid
language sql stable set search_path = '' as $$ select p.login from public.app_team_people p where p.admin $$;
create function private.genesis_support_report_handler(report uuid, person uuid) returns boolean
language sql stable set search_path = '' as $$ select false $$;

alter table public.app_teams enable row level security;
create policy app_teams_admin on public.app_teams for update to authenticated
  using (private.genesis_tenant_admin(id, auth.uid()));
