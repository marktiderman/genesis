-- Genesis Chat 0004: every conversation belongs to a tenant; subjects are typed per kind
--
-- Builds on 0001–0003 (never edited once released).
--
-- 1. Tenants. genesis_chat.conversations.tenant_id (uuid, not null, no foreign key: add your own
--    to your tenants table in a later migration if you want deletes to cascade). Who belongs to
--    which tenant is your app's answer, through the same hook genesis-supabase's viewer people
--    use (0016):
--
--      private.genesis_viewer_people(viewer uuid) returns table (tenant_id uuid, person_id uuid)
--
--    A single-tenant app returns its one tenant id for everyone. Without the hook nobody belongs
--    to any tenant: people can't start conversations, and no one observes one.
--
-- 2. Subjects. A kind's conversations about your records (a ticket, a cohort) register their
--    subject type with a resolver that names the record's tenant:
--
--      select genesis_chat.register_subject('support', 'ticket', 'private.ticket_tenant(text)',
--                                           p_aliases => array['support_report']);
--      -- private.ticket_tenant(subject_id text) returns uuid: the record's tenant, null if none.
--
--    ensure_conversation and start_conversation take the tenant from it (and refuse a subject
--    it doesn't know). An alias is an older name for the same type: calls using it reach the
--    same conversation, and new ones are stored under the type's own name. An unregistered
--    subject needs `p_tenant_id`.
--
-- 3. Starting one. start_conversation's members must all share the tenant, which is the
--    subject's, or the one they share (`p_tenant_id` chooses when they share several). People
--    with no tenant in common can't start one. add_members adds only people of the
--    conversation's tenant. A direct conversation is one per pair per tenant.
--
--    A kind registered with `p_cross_tenant => true` lets people with no tenant in common talk:
--    such a conversation takes its starter's tenant (`p_tenant_id` chooses among the starter's),
--    and its members may come from anywhere. The trade-off: it lives in that one tenant, so that
--    tenant's erase or export includes it, the other people's messages too. Such a kind has no
--    observer check (register_kind refuses one), so no tenant's staff read it.
--
-- 4. Observers. A kind's observer check is asked only about people of the conversation's tenant,
--    and never about anyone who is or was a member of it: the person who opened a ticket never
--    reads its internal notes, even if they are also staff.
--
-- Existing conversations get their tenant in this order: your optional hook
-- `private.genesis_chat_conversation_tenant(conversation_id uuid) returns uuid`; for one about a
-- record, a resolver named for its subject type, `private.genesis_chat_resolve_<subject_type>
-- (subject_id text) returns uuid`, when one exists (a block that owns the type ships it before
-- this, since register_subject is new here); then the one tenant all its members share, then its
-- creator's only tenant, then the only tenant of any one of its members. If one is still left without, this migration stops and says how many: add the
-- hook (it runs only here), then apply it again.
--
-- Ship it together with genesis-support's 0004 if you use genesis-support's chat: support's 0001
-- opens its conversations without a tenant, which this refuses.
--
-- Use: `genesis add chat` copies this after 0003. Verify: tests/0004_genesis_chat_tenants.test.sql.

-- ── Tenants ───────────────────────────────────────────────────────────────────

-- The tenants a person belongs to, from the app's hook. Empty without the hook, when it fails or
-- returns the wrong shape, or for nobody.
create or replace function genesis_chat.tenants_of(p_user_id uuid)
returns setof uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_user_id is null or to_regprocedure('private.genesis_viewer_people(uuid)') is null then
    return;
  end if;
  return query execute
    'select distinct r.tenant_id::uuid from private.genesis_viewer_people($1) r where r.tenant_id is not null'
    using p_user_id;
exception when others then
  return;
end;
$$;

-- The tenants every one of these people belongs to.
create or replace function genesis_chat.shared_tenants(p_user_ids uuid[])
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t
    from (select distinct u from unnest(p_user_ids) u where u is not null) people
   cross join lateral genesis_chat.tenants_of(people.u) t
   group by t
  having count(*) = (select count(distinct v) from unnest(p_user_ids) v where v is not null)
$$;

revoke execute on function genesis_chat.tenants_of(uuid), genesis_chat.shared_tenants(uuid[]) from public, anon, authenticated;
grant execute on function genesis_chat.tenants_of(uuid), genesis_chat.shared_tenants(uuid[]) to service_role;

comment on function genesis_chat.tenants_of(uuid) is
  'The tenants a person belongs to, from the app''s private.genesis_viewer_people(viewer) hook; empty without it. Genesis Chat.';

-- ── Kinds that cross tenants ──────────────────────────────────────────────────

alter table genesis_chat.kinds add column cross_tenant boolean not null default false;
comment on column genesis_chat.kinds.cross_tenant is
  'People with no tenant in common may start one; it takes the starter''s tenant. Never with an observer check.';

drop function genesis_chat.register_kind(text, text, integer, text, text, boolean, regprocedure, boolean, regprocedure, interval);

create function genesis_chat.register_kind(
  p_kind text,
  p_label text,
  p_max_members integer default null,
  p_who_posts text default 'members',
  p_membership text default 'app',
  p_threads boolean default true,
  p_observer_check regprocedure default null,
  p_observers_post boolean default false,
  p_start_check regprocedure default null,
  p_edit_window interval default null,
  p_cross_tenant boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_observer_check is not null and (
       pg_get_function_identity_arguments(p_observer_check) !~ '^[a-z_]* ?uuid, [a-z_]* ?uuid$'
       or (select prorettype from pg_proc where oid = p_observer_check) <> 'boolean'::regtype) then
    raise exception 'An observer check takes (conversation_id uuid, user_id uuid) and returns boolean' using errcode = '22023';
  end if;
  if p_start_check is not null and (
       pg_get_function_identity_arguments(p_start_check) !~ '^[a-z_]* ?uuid\[\], [a-z_]* ?text, [a-z_]* ?text, [a-z_]* ?uuid$'
       or (select prorettype from pg_proc where oid = p_start_check) <> 'boolean'::regtype) then
    raise exception 'A start check takes (member_ids uuid[], subject_type text, subject_id text, user_id uuid) and returns boolean' using errcode = '22023';
  end if;
  if coalesce(p_cross_tenant, false) and p_observer_check is not null then
    raise exception 'A kind that crosses tenants has no observers: no tenant''s staff may read it' using errcode = '22023';
  end if;
  insert into genesis_chat.kinds as k (kind, label, max_members, who_posts, membership, threads,
                                       observer_check, observers_post, start_check, edit_window, cross_tenant)
  values (p_kind, p_label, p_max_members, p_who_posts, p_membership, p_threads,
          p_observer_check, p_observers_post, p_start_check, p_edit_window, coalesce(p_cross_tenant, false))
  on conflict (kind) do update set
    label = excluded.label, max_members = excluded.max_members, who_posts = excluded.who_posts,
    membership = excluded.membership, threads = excluded.threads, observer_check = excluded.observer_check,
    observers_post = excluded.observers_post, start_check = excluded.start_check,
    edit_window = excluded.edit_window, cross_tenant = excluded.cross_tenant, updated_at = now();
end;
$$;

revoke execute on function genesis_chat.register_kind(text, text, integer, text, text, boolean, regprocedure, boolean, regprocedure, interval, boolean) from public, anon, authenticated;
grant execute on function genesis_chat.register_kind(text, text, integer, text, text, boolean, regprocedure, boolean, regprocedure, interval, boolean) to service_role;

comment on function genesis_chat.register_kind(text, text, integer, text, text, boolean, regprocedure, boolean, regprocedure, interval, boolean) is
  'Adds or replaces a kind of conversation and its rules. Run from a migration or the service role. Genesis Chat.';

-- ── Subjects ──────────────────────────────────────────────────────────────────

create table genesis_chat.subjects (
  kind text not null references genesis_chat.kinds (kind) on update cascade on delete cascade,
  subject_type text not null check (subject_type ~ '^[a-z][a-z0-9_]{0,39}$'),
  resolver regprocedure not null,
  aliases text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (kind, subject_type)
);

comment on table genesis_chat.subjects is
  'The record types a kind''s conversations are about, each with a resolver naming the record''s tenant. Written by register_subject. Genesis Chat.';
comment on column genesis_chat.subjects.resolver is 'f(subject_id text) returns uuid: the record''s tenant, null when there is no such record.';
comment on column genesis_chat.subjects.aliases is 'Older names for this type: calls using one reach the same conversations.';

alter table genesis_chat.subjects enable row level security;
create policy subjects_read on genesis_chat.subjects for select to authenticated using (true);
grant select on genesis_chat.subjects to authenticated;
grant select, insert, update, delete on genesis_chat.subjects to service_role;

create or replace function genesis_chat.register_subject(
  p_kind text,
  p_subject_type text,
  p_resolver regprocedure,
  p_aliases text[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  aliases text[];
  taken text;
begin
  if p_resolver is null
     or pg_get_function_identity_arguments(p_resolver) !~ '^[a-z_]* ?text$'
     or (select prorettype from pg_proc where oid = p_resolver) <> 'uuid'::regtype then
    raise exception 'A subject resolver takes (subject_id text) and returns uuid (the tenant)' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct a order by a), '{}') into aliases
    from unnest(coalesce(p_aliases, '{}')) a where a is not null and a <> p_subject_type;
  if exists (select 1 from unnest(aliases) a where a !~ '^[a-z][a-z0-9_]{0,39}$') then
    raise exception 'A subject alias is a subject type name' using errcode = '22023';
  end if;
  -- One name means one type within a kind.
  select n into taken from (
    select s.subject_type as n from genesis_chat.subjects s
     where s.kind = p_kind and s.subject_type <> p_subject_type
    union all
    select unnest(s.aliases) from genesis_chat.subjects s
     where s.kind = p_kind and s.subject_type <> p_subject_type
  ) x where n = p_subject_type or n = any(aliases) limit 1;
  if taken is not null then
    raise exception 'The subject type % is already registered for kind %', taken, p_kind using errcode = '23505';
  end if;
  insert into genesis_chat.subjects as s (kind, subject_type, resolver, aliases)
  values (p_kind, p_subject_type, p_resolver, aliases)
  on conflict (kind, subject_type) do update set
    resolver = excluded.resolver, aliases = excluded.aliases, updated_at = now();
end;
$$;

revoke execute on function genesis_chat.register_subject(text, text, regprocedure, text[]) from public, anon, authenticated;
grant execute on function genesis_chat.register_subject(text, text, regprocedure, text[]) to service_role;

comment on function genesis_chat.register_subject(text, text, regprocedure, text[]) is
  'Registers a record type a kind''s conversations are about, with the resolver that names its tenant. Run from a migration or the service role. Genesis Chat.';

-- The registration a kind's subject type (or one of its aliases) names, if any.
create or replace function genesis_chat.subject_of(p_kind text, p_subject_type text)
returns genesis_chat.subjects
language sql
stable
security definer
set search_path = ''
as $$
  select s.* from genesis_chat.subjects s
   where s.kind = p_kind and (s.subject_type = p_subject_type or p_subject_type = any(s.aliases))
$$;

-- The subject's tenant, from its resolver. Null for an unregistered type or an unknown record.
create or replace function genesis_chat.subject_tenant(p_kind text, p_subject_type text, p_subject_id text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s genesis_chat.subjects;
  tenant uuid;
begin
  s := genesis_chat.subject_of(p_kind, p_subject_type);
  if s.kind is null or p_subject_id is null then
    return null;
  end if;
  execute format('select %s($1::text)', s.resolver::regproc) into tenant using p_subject_id;
  return tenant;
end;
$$;

revoke execute on function genesis_chat.subject_of(text, text), genesis_chat.subject_tenant(text, text, text) from public, anon, authenticated;
grant execute on function genesis_chat.subject_of(text, text), genesis_chat.subject_tenant(text, text, text) to service_role;

-- ── conversations.tenant_id, filled for what's there ─────────────────────────

alter table genesis_chat.conversations add column tenant_id uuid;

do $$
declare
  hook boolean := to_regprocedure('private.genesis_chat_conversation_tenant(uuid)') is not null;
  r record;
  missing integer;
begin
  if hook then
    execute 'update genesis_chat.conversations c set tenant_id = private.genesis_chat_conversation_tenant(c.id) where c.tenant_id is null';
  end if;

  -- A record's tenant, from a resolver named for its subject type.
  for r in select distinct c.subject_type from genesis_chat.conversations c
            where c.tenant_id is null and c.subject_type is not null
              and to_regprocedure(format('private.%I(text)', 'genesis_chat_resolve_' || c.subject_type)) is not null loop
    execute format('update genesis_chat.conversations c set tenant_id = private.%I(c.subject_id)
                     where c.tenant_id is null and c.subject_type = $1', 'genesis_chat_resolve_' || r.subject_type)
      using r.subject_type;
  end loop;

  -- The one tenant all its members (past and present, observers aside) share.
  update genesis_chat.conversations c set tenant_id = x.t
    from (
      select m.conversation_id, (array_agg(s))[1] as t
        from (select conversation_id, array_agg(distinct user_id) as users
                from genesis_chat.members where role <> 'observer' group by conversation_id) m
        cross join lateral genesis_chat.shared_tenants(m.users) s
       group by m.conversation_id
      having count(*) = 1
    ) x
   where c.id = x.conversation_id and c.tenant_id is null;

  -- Its creator's only tenant.
  update genesis_chat.conversations c set tenant_id = (select t from genesis_chat.tenants_of(c.created_by) t)
   where c.tenant_id is null and c.created_by is not null
     and (select count(*) from genesis_chat.tenants_of(c.created_by)) = 1;

  -- The only tenant of any one of its members (a support conversation's one member).
  update genesis_chat.conversations c set tenant_id = (
      select (array_agg(distinct t))[1] from genesis_chat.members m
        cross join lateral genesis_chat.tenants_of(m.user_id) t
       where m.conversation_id = c.id and m.role <> 'observer'
         and (select count(*) from genesis_chat.tenants_of(m.user_id)) = 1
      having count(distinct t) = 1)
   where c.tenant_id is null;

  select count(*) into missing from genesis_chat.conversations where tenant_id is null;
  if missing > 0 then
    raise exception 'genesis-chat 0004: % conversation(s) have no tenant to take. Add private.genesis_viewer_people(viewer) (genesis-supabase 0016), or private.genesis_chat_conversation_tenant(conversation_id) for the ones it can''t place, then apply this again.', missing
      using errcode = '23502';
  end if;
end;
$$;

alter table genesis_chat.conversations alter column tenant_id set not null;
create index conversations_tenant_kind_idx on genesis_chat.conversations (tenant_id, kind, last_message_at desc);

-- A direct conversation is one per pair per tenant: its key names the tenant.
update genesis_chat.conversations c
   set direct_key = c.kind || ':' || c.tenant_id::text || ':' || substr(c.direct_key, length(c.kind) + 2)
 where c.direct_key is not null and c.direct_key not like c.kind || ':' || c.tenant_id::text || ':%';

-- ── Who observes ──────────────────────────────────────────────────────────────

-- The kind's observer check, asked only about people of the conversation's tenant who aren't,
-- and never were, members of it.
create or replace function genesis_chat.observes(p_conversation_id uuid, p_user_id uuid default auth.uid())
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  check_fn regprocedure;
  tenant uuid;
  result boolean;
begin
  if p_user_id is null then
    return false;
  end if;
  select k.observer_check, c.tenant_id into check_fn, tenant
  from genesis_chat.conversations c join genesis_chat.kinds k on k.kind = c.kind
  where c.id = p_conversation_id;
  if check_fn is null then
    return false;
  end if;
  if exists (select 1 from genesis_chat.members m
              where m.conversation_id = p_conversation_id and m.user_id = p_user_id and m.role <> 'observer') then
    return false;
  end if;
  if not exists (select 1 from genesis_chat.tenants_of(p_user_id) t where t = tenant) then
    return false;
  end if;
  execute format('select %s($1::uuid, $2::uuid)', check_fn::regproc) into result using p_conversation_id, p_user_id;
  return coalesce(result, false);
end;
$$;

-- ── Starting conversations ────────────────────────────────────────────────────

drop function genesis_chat.start_conversation(text, uuid[], text, text, text);

-- Starts a conversation of `p_kind` with these people, if the kind's start check says the
-- signed-in person may, in the tenant they all share: the subject's when there is one, else the
-- one they share (`p_tenant_id` chooses among several). A direct conversation with someone in a
-- tenant is found again, not made twice.
create function genesis_chat.start_conversation(
  p_kind text,
  p_member_ids uuid[],
  p_title text default null,
  p_subject_type text default null,
  p_subject_id text default null,
  p_tenant_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  k genesis_chat.kinds;
  s genesis_chat.subjects;
  others uuid[];
  everyone uuid[];
  shared uuid[];
  tenant uuid;
  stype text := p_subject_type;
  allowed boolean;
  key text;
  conv uuid;
begin
  if me is null then
    raise exception 'Sign in to start a conversation' using errcode = '42501';
  end if;
  select * into k from genesis_chat.kinds where kind = p_kind;
  if k.kind is null then
    raise exception 'No such kind of conversation: %', p_kind using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct x), '{}') into others
    from unnest(coalesce(p_member_ids, '{}')) x where x is not null and x <> me;
  if cardinality(others) = 0 then
    raise exception 'Choose someone to talk to' using errcode = '22023';
  end if;
  if k.max_members is not null and cardinality(others) + 1 > k.max_members then
    raise exception 'A % has at most % members', lower(k.label), k.max_members using errcode = '22023';
  end if;
  if k.start_check is null then
    raise exception 'You can''t start this kind of conversation' using errcode = '42501';
  end if;

  everyone := others || me;
  select coalesce(array_agg(t), '{}') into shared from genesis_chat.shared_tenants(everyone) t;
  s := genesis_chat.subject_of(p_kind, p_subject_type);
  if s.kind is not null then
    stype := s.subject_type;
    tenant := genesis_chat.subject_tenant(p_kind, stype, p_subject_id);
    if tenant is null then
      raise exception 'No such %', replace(stype, '_', ' ') using errcode = '22023';
    end if;
    if p_tenant_id is not null and p_tenant_id <> tenant then
      raise exception 'That % belongs to another workspace', replace(stype, '_', ' ') using errcode = '22023';
    end if;
    if not (tenant = any(shared)
            or (k.cross_tenant and exists (select 1 from genesis_chat.tenants_of(me) t where t = tenant))) then
      raise exception 'You can''t start a conversation with these people' using errcode = '42501';
    end if;
  elsif p_tenant_id is not null then
    if not (p_tenant_id = any(shared)
            or (k.cross_tenant and exists (select 1 from genesis_chat.tenants_of(me) t where t = p_tenant_id))) then
      raise exception 'You can''t start a conversation with these people' using errcode = '42501';
    end if;
    tenant := p_tenant_id;
  elsif cardinality(shared) = 1 then
    tenant := shared[1];
  elsif cardinality(shared) > 1 then
    raise exception 'Choose the workspace this conversation is in' using errcode = '22023';
  elsif k.cross_tenant then
    -- No tenant in common, and the kind allows that: the starter's (their only one).
    select coalesce(array_agg(t), '{}') into shared from genesis_chat.tenants_of(me) t;
    if cardinality(shared) = 1 then
      tenant := shared[1];
    elsif cardinality(shared) > 1 then
      raise exception 'Choose the workspace this conversation is in' using errcode = '22023';
    else
      raise exception 'You can''t start a conversation with these people' using errcode = '42501';
    end if;
  else
    raise exception 'You can''t start a conversation with these people' using errcode = '42501';
  end if;

  execute format('select %s($1::uuid[], $2::text, $3::text, $4::uuid)', k.start_check::regproc)
    into allowed using others, stype, p_subject_id, me;
  if not coalesce(allowed, false) then
    raise exception 'You can''t start a conversation with these people' using errcode = '42501';
  end if;

  if k.max_members = 2 then
    key := p_kind || ':' || tenant::text || ':' || least(me, others[1])::text || ':' || greatest(me, others[1])::text;
    perform pg_advisory_xact_lock(hashtextextended(key, 0));
    select id into conv from genesis_chat.conversations where direct_key = key;
    if conv is not null then
      insert into genesis_chat.members (conversation_id, user_id, role)
      select conv, u, 'member' from unnest(array[me, others[1]]) u
      on conflict (conversation_id, user_id) do update set left_at = null, role = 'member', joined_at =
        case when genesis_chat.members.left_at is null then genesis_chat.members.joined_at else now() end;
      return conv;
    end if;
  end if;

  insert into genesis_chat.conversations (kind, tenant_id, title, subject_type, subject_id, direct_key, created_by)
  values (p_kind, tenant, nullif(btrim(p_title), ''), stype, p_subject_id, key, me)
  returning id into conv;
  insert into genesis_chat.members (conversation_id, user_id, role)
  values (conv, me, case when k.max_members = 2 then 'member' else 'owner' end);
  insert into genesis_chat.members (conversation_id, user_id, role)
  select conv, u, 'member' from unnest(others) u;
  return conv;
end;
$$;

drop function genesis_chat.ensure_conversation(text, text, text, text, jsonb);

-- The server's side: the conversation for one of the app's records, made once, in the record's
-- tenant (its resolver's, or `p_tenant_id` for a type that isn't registered).
create function genesis_chat.ensure_conversation(
  p_kind text,
  p_subject_type text,
  p_subject_id text,
  p_title text default null,
  p_settings jsonb default '{}',
  p_tenant_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  s genesis_chat.subjects;
  names text[];
  stype text := p_subject_type;
  tenant uuid := p_tenant_id;
  conv uuid;
begin
  if p_subject_type is null or p_subject_id is null then
    raise exception 'A subject (type and id) is required' using errcode = '22023';
  end if;
  s := genesis_chat.subject_of(p_kind, p_subject_type);
  if s.kind is not null then
    stype := s.subject_type;
    names := s.subject_type || s.aliases;
    tenant := genesis_chat.subject_tenant(p_kind, stype, p_subject_id);
    if tenant is null then
      raise exception 'No such %: %', replace(stype, '_', ' '), p_subject_id using errcode = '22023';
    end if;
    if p_tenant_id is not null and p_tenant_id <> tenant then
      raise exception 'The % belongs to tenant %, not %', replace(stype, '_', ' '), tenant, p_tenant_id using errcode = '22023';
    end if;
  else
    names := array[p_subject_type];
    if tenant is null then
      raise exception 'A conversation needs its tenant: register the subject type % for kind % (genesis_chat.register_subject), or pass p_tenant_id', p_subject_type, p_kind
        using errcode = '22023';
    end if;
  end if;

  -- Under any of its names: conversations made before a type was renamed are found too.
  select id into conv from genesis_chat.conversations
   where kind = p_kind and subject_type = any(names) and subject_id = p_subject_id
   order by (subject_type = stype) desc, created_at limit 1;
  if conv is null then
    insert into genesis_chat.conversations (kind, tenant_id, subject_type, subject_id, title, settings)
    values (p_kind, tenant, stype, p_subject_id, nullif(btrim(p_title), ''), coalesce(p_settings, '{}'))
    on conflict (kind, subject_type, subject_id) where subject_type is not null do nothing
    returning id into conv;
    if conv is null then
      select id into conv from genesis_chat.conversations
       where kind = p_kind and subject_type = stype and subject_id = p_subject_id;
    end if;
  else
    if exists (select 1 from genesis_chat.conversations where id = conv and tenant_id <> tenant) then
      raise exception 'The conversation for this % is in another tenant', replace(stype, '_', ' ') using errcode = '22023';
    end if;
    if p_title is not null then
      update genesis_chat.conversations set title = nullif(btrim(p_title), '')
       where id = conv and title is distinct from nullif(btrim(p_title), '');
    end if;
  end if;
  return conv;
end;
$$;

-- ── Adding people ─────────────────────────────────────────────────────────────

-- As in 0001, and only people of the conversation's tenant (anyone, for a kind that crosses tenants).
create or replace function genesis_chat.add_members(p_conversation_id uuid, p_user_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  c genesis_chat.conversations;
  k genesis_chat.kinds;
  adding uuid[];
  allowed boolean;
begin
  select * into c from genesis_chat.conversations where id = p_conversation_id;
  select * into k from genesis_chat.kinds where kind = c.kind;
  if c.id is null or coalesce(genesis_chat.my_role(c.id), '') not in ('owner', 'admin') or k.membership <> 'admins' then
    raise exception 'You can''t add people to this conversation' using errcode = '42501';
  end if;
  select coalesce(array_agg(distinct x), '{}') into adding from unnest(coalesce(p_user_ids, '{}')) x where x is not null;
  if k.start_check is null then
    raise exception 'You can''t add people to this conversation' using errcode = '42501';
  end if;
  if not k.cross_tenant and exists (select 1 from unnest(adding) u
              where not exists (select 1 from genesis_chat.tenants_of(u) t where t = c.tenant_id)) then
    raise exception 'You can''t add these people' using errcode = '42501';
  end if;
  execute format('select %s($1::uuid[], $2::text, $3::text, $4::uuid)', k.start_check::regproc)
    into allowed using adding, c.subject_type, c.subject_id, me;
  if not coalesce(allowed, false) then
    raise exception 'You can''t add these people' using errcode = '42501';
  end if;
  insert into genesis_chat.members as m (conversation_id, user_id, role)
  select c.id, u, 'member' from unnest(adding) u
  on conflict (conversation_id, user_id) do update set left_at = null, role = 'member', joined_at = now()
    where m.left_at is not null or m.role = 'observer';
  if k.max_members is not null and (select count(*) from genesis_chat.members
       where conversation_id = c.id and left_at is null and role <> 'observer') > k.max_members then
    raise exception 'A % has at most % members', lower(k.label), k.max_members using errcode = '22023';
  end if;
end;
$$;

-- ── Grants, by name ───────────────────────────────────────────────────────────

revoke execute on function genesis_chat.start_conversation(text, uuid[], text, text, text, uuid) from public, anon;
grant execute on function genesis_chat.start_conversation(text, uuid[], text, text, text, uuid) to authenticated, service_role;
revoke execute on function genesis_chat.ensure_conversation(text, text, text, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function genesis_chat.ensure_conversation(text, text, text, text, jsonb, uuid) to service_role;
