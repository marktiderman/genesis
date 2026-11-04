-- @feat:support-helpdesk
-- Genesis support 0010: a tenant's help center and its AI answers (after 0004_genesis_support_tickets.sql).
--
--   public.help_collections, public.help_articles
--     A tenant's articles, in collections. An article is a draft or published. Its body is plain
--     text; the client and the public site turn its blank lines into paragraphs.
--     Published articles are read by the tenant's people once its help desk is on (the app's own
--     tenant: by everyone signed in). Agents read drafts too, and write through the named functions.
--     Anon reads nothing here: a public help center is pages on the app's site (helpCenterPages).
--   public.help_questions
--     A question put to the AI: what was asked, what it answered, the articles it cited, and how it
--     ended. `resolved` means the person said the answer helped: the usage count for answers. What
--     a safety protocol routed elsewhere, or someone asked without having agreed to share, isn't
--     kept. Only the server records an answer.
--
-- AI answers are off until a tenant opts in, the app's own tenant included: an enabled
-- `support-helpdesk-ai` row in genesis-supabase 0004's tenant_features. Unlike 0004's usual reading,
-- no row means off here, because each answer spends the tenant's AI budget. The model runs in the app's
-- server, through genesis-ai (`supportHelpAnswerTask`); an answer is kept only when it cites published
-- articles of the question's tenant.
--
-- Use: copy this file into your app's `supabase/migrations/` under a new timestamped name
-- (`genesis migrate` does it). Never edit it once applied; change it with a new migration.
--
-- Verify: the pgTAP test beside this file (`tests/0010_genesis_support_help_center.test.sql`).

create table public.help_collections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  title text not null constraint help_collections_title check (title ~ '\S' and char_length(btrim(title)) <= 120 and title !~ '[\r\n]'),
  description text constraint help_collections_description check (char_length(description) <= 400),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id)
);

create table public.help_articles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  collection_id uuid,
  slug text not null constraint help_articles_slug check (char_length(slug) <= 80 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and slug !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  title text not null constraint help_articles_title check (title ~ '\S' and char_length(btrim(title)) <= 90 and title !~ '[\r\n]'),
  summary text constraint help_articles_summary check (char_length(summary) <= 200),
  body text not null default '' constraint help_articles_body check (char_length(body) <= 100000),
  status text not null default 'draft' constraint help_articles_status check (status in ('draft', 'published')),
  constraint help_articles_published_has_words check (status <> 'published' or body ~ '\S'),
  published_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search tsvector generated always as (
    setweight(to_tsvector('simple'::regconfig, title), 'A')
    || setweight(to_tsvector('simple'::regconfig, coalesce(summary, '')), 'B')
    || setweight(to_tsvector('simple'::regconfig, body), 'C')
  ) stored,
  unique (tenant_id, slug),
  -- A collection of the same tenant; deleting it leaves its articles without one.
  foreign key (tenant_id, collection_id) references public.help_collections (tenant_id, id) on delete set null (collection_id)
);

create index help_articles_search_idx on public.help_articles using gin (search);
create index help_articles_tenant_idx on public.help_articles (tenant_id, status, title);

create table public.help_questions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  question text not null constraint help_questions_question check (question ~ '\S' and char_length(question) <= 2000),
  answer text constraint help_questions_answer check (char_length(answer) <= 8000),
  article_ids uuid[] not null default '{}',
  outcome text not null default 'asked' constraint help_questions_outcome check (outcome in ('asked', 'answering', 'answered', 'no_answer', 'no_consent', 'safety_routed', 'resolved', 'handed_off')),
  ticket_id uuid references public.tickets (id) on delete set null,
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  closed_at timestamptz
);

create index help_questions_tenant_idx on public.help_questions (tenant_id, created_at desc);
create index help_questions_user_idx on public.help_questions (user_id);

comment on table public.help_collections is 'A tenant''s help center collections. Written through support_save_collection. Genesis support.';
comment on table public.help_articles is 'A tenant''s help center articles. Written through support_save_article. Genesis support.';
comment on table public.help_questions is 'Questions put to the help center''s AI, and how they ended. Genesis support.';

alter table public.help_collections enable row level security;
alter table public.help_articles enable row level security;
alter table public.help_questions enable row level security;

-- May the signed-in person read this tenant's published help? One of its people, and its help desk on.
create or replace function public.support_help_readable(tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.support_in_tenant(tenant) and private.genesis_support_helpdesk_on(tenant)
$$;

comment on function public.support_help_readable(uuid) is
  'Whether the signed-in person may read this tenant''s published help articles. Genesis support.';

create policy help_collections_read on public.help_collections
  for select to authenticated
  using (public.support_help_readable(tenant_id) or public.support_is_agent(tenant_id));

create policy help_articles_read on public.help_articles
  for select to authenticated
  using ((status = 'published' and public.support_help_readable(tenant_id)) or public.support_is_agent(tenant_id));

create policy help_questions_read on public.help_questions
  for select to authenticated
  using (user_id = (select auth.uid()) or public.support_is_agent(tenant_id));

-- Reads: named functions that check the tenant once, so a list doesn't run the check per row ------

-- May the signed-in person read here at all, and as an agent? The app's own tenant when none is named.
create or replace function private.genesis_support_help_access(tenant uuid, out resolved uuid, out agent boolean, out readable boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  resolved := coalesce(tenant, private.genesis_support_default_tenant_id());
  agent := private.genesis_support_agent(resolved, auth.uid());
  readable := agent or public.support_help_readable(resolved);
end;
$$;

revoke execute on function private.genesis_support_help_access(uuid) from public, anon, authenticated;

create or replace function public.support_help_collections(tenant uuid default null)
returns table (id uuid, title text, description text, position_in_list integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  access record := private.genesis_support_help_access(tenant);
begin
  if not access.readable then
    return;
  end if;
  return query
    select c.id, c.title, c.description, c.position
      from public.help_collections c
     where c.tenant_id = access.resolved
     order by c.position, c.title, c.id;
end;
$$;

-- A tenant's articles, without their bodies. Drafts only when asked, and only for an agent.
create or replace function public.support_help_articles(tenant uuid default null, collection uuid default null, include_drafts boolean default false)
returns table (id uuid, collection_id uuid, slug text, title text, summary text, status text, published_at timestamptz, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  access record := private.genesis_support_help_access(tenant);
begin
  if not access.readable then
    return;
  end if;
  return query
    select a.id, a.collection_id, a.slug, a.title, a.summary, a.status, a.published_at, a.updated_at
      from public.help_articles a
     where a.tenant_id = access.resolved
       and (collection is null or a.collection_id = collection)
       and (a.status = 'published' or (include_drafts and access.agent))
     order by a.title, a.id
     limit 500;
end;
$$;

-- One article, by its slug or id. What the caller can't read isn't there.
create or replace function public.support_help_article(tenant uuid default null, article text default null)
returns table (id uuid, collection_id uuid, slug text, title text, summary text, body text, status text, published_at timestamptz, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  access record := private.genesis_support_help_access(tenant);
  by_id uuid := case when article ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then article::uuid end;
begin
  if not access.readable then
    return;
  end if;
  return query
    select a.id, a.collection_id, a.slug, a.title, a.summary, a.body, a.status, a.published_at, a.updated_at
      from public.help_articles a
     where a.tenant_id = access.resolved
       and (a.status = 'published' or access.agent)
       and (case when by_id is not null then a.id = by_id else a.slug = article end);
end;
$$;

-- Published articles for what someone typed: any of its words, best match first, so a whole question
-- finds its article. The last word may still be being typed, so its start counts. Common English
-- words and single letters don't count: they'd match nearly everything. Language-neutral otherwise
-- ('simple'), as chat's search is.
create or replace function public.support_search_articles(tenant uuid default null, query text default null, max_rows integer default 10)
returns table (id uuid, collection_id uuid, slug text, title text, summary text, rank real)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  access record := private.genesis_support_help_access(tenant);
  q tsquery;
  terms text;
begin
  if not access.readable then
    return;
  end if;
  with words as (
    select t.lexeme, (select max(n) from unnest(t.positions) as n) as at
      from unnest(to_tsvector('simple'::regconfig, left(coalesce(query, ''), 500))) as t(lexeme, positions, weights)
  )
  select string_agg(quote_literal(w.lexeme) || case when w.at = (select max(a.at) from words a) then ':*' else '' end, ' | ') into terms
    from words w
   where char_length(w.lexeme) > 1
     and w.lexeme <> all (array['an','and','are','as','at','be','but','by','can','could','did','do','does','for','from','get','give','had','has','have','how','if','in','into','is','it','its','me','my','no','not','of','on','or','our','please','should','so','some','than','that','the','their','them','then','there','these','they','this','to','us','was','we','were','what','when','where','which','who','why','will','with','would','you','your']);
  if terms is null then
    return;
  end if;
  q := to_tsquery('simple'::regconfig, terms);
  return query
    select a.id, a.collection_id, a.slug, a.title, a.summary, ts_rank(a.search, q)
      from public.help_articles a
     where a.tenant_id = access.resolved
       and a.status = 'published'
       and a.search @@ q
     order by ts_rank(a.search, q) desc, a.title, a.id
     limit least(greatest(coalesce(max_rows, 10), 1), 50);
end;
$$;

-- Writes: a tenant's agents -----------------------------------------------------------------

create or replace function public.support_save_collection(collection uuid default null, tenant uuid default null, title text default null, description text default null, list_position integer default 0)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  owner_tenant uuid;
  saved uuid;
begin
  if collection is null then
    owner_tenant := coalesce(tenant, private.genesis_support_default_tenant_id());
  else
    select c.tenant_id into owner_tenant from public.help_collections c where c.id = collection;
  end if;
  if not private.genesis_support_agent(owner_tenant, me) then
    raise exception 'support_save_collection: only an agent of this tenant' using errcode = '42501';
  end if;
  if collection is null then
    insert into public.help_collections (tenant_id, title, description, position)
    values (owner_tenant, btrim(support_save_collection.title), nullif(btrim(support_save_collection.description), ''), coalesce(list_position, 0))
    returning id into saved;
  else
    update public.help_collections c
       set title = btrim(support_save_collection.title), description = nullif(btrim(support_save_collection.description), ''),
           position = coalesce(list_position, 0), updated_at = clock_timestamp()
     where c.id = collection
    returning c.id into saved;
  end if;
  return saved;
end;
$$;

create or replace function public.support_delete_collection(collection uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_tenant uuid;
begin
  select c.tenant_id into owner_tenant from public.help_collections c where c.id = collection;
  if not private.genesis_support_agent(owner_tenant, auth.uid()) then
    raise exception 'support_delete_collection: only an agent of this tenant' using errcode = '42501';
  end if;
  delete from public.help_collections c where c.id = collection;
end;
$$;

-- Create (no article) or change an article. A tenant never changes. `expected_updated_at`: the save
-- the editor started from, so a second agent's save isn't lost without anyone knowing (40001). It
-- returns the copy it made, for the editor's next save.
create or replace function public.support_save_article(
  article uuid default null,
  tenant uuid default null,
  collection uuid default null,
  slug text default null,
  title text default null,
  summary text default null,
  body text default null,
  status text default 'draft',
  expected_updated_at timestamptz default null,
  out saved_id uuid,
  out saved_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  owner_tenant uuid;
  was public.help_articles;
begin
  if article is null then
    owner_tenant := coalesce(tenant, private.genesis_support_default_tenant_id());
  else
    select * into was from public.help_articles a where a.id = article for update;
    owner_tenant := was.tenant_id;
  end if;
  if not private.genesis_support_agent(owner_tenant, me) then
    raise exception 'support_save_article: only an agent of this tenant' using errcode = '42501';
  end if;
  if article is null then
    insert into public.help_articles as a (tenant_id, collection_id, slug, title, summary, body, status, published_at, created_by, updated_by)
    values (owner_tenant, collection, support_save_article.slug, btrim(support_save_article.title), nullif(btrim(support_save_article.summary), ''),
            coalesce(support_save_article.body, ''), support_save_article.status,
            case when support_save_article.status = 'published' then clock_timestamp() end, me, me)
    returning a.id, a.updated_at into saved_id, saved_at;
  else
    if expected_updated_at is not null and was.updated_at is distinct from expected_updated_at then
      raise exception 'support_save_article: someone else changed this article' using errcode = '40001';
    end if;
    update public.help_articles a
       set collection_id = collection,
           slug = support_save_article.slug,
           title = btrim(support_save_article.title),
           summary = nullif(btrim(support_save_article.summary), ''),
           body = coalesce(support_save_article.body, ''),
           status = support_save_article.status,
           published_at = case when support_save_article.status = 'published' then coalesce(a.published_at, clock_timestamp()) end,
           updated_by = me,
           updated_at = clock_timestamp()
     where a.id = article
    returning a.id, a.updated_at into saved_id, saved_at;
  end if;
end;
$$;

create or replace function public.support_delete_article(article uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_tenant uuid;
begin
  select a.tenant_id into owner_tenant from public.help_articles a where a.id = article;
  if not private.genesis_support_agent(owner_tenant, auth.uid()) then
    raise exception 'support_delete_article: only an agent of this tenant' using errcode = '42501';
  end if;
  delete from public.help_articles a where a.id = article;
end;
$$;

-- AI answers --------------------------------------------------------------------------------

-- Has this tenant opted in? Off without tenant_features, and for the app's own tenant until it does.
create or replace function private.genesis_support_ai_on(tenant uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if tenant is null or to_regclass('public.tenant_features') is null then
    return false;
  end if;
  return private.genesis_support_helpdesk_on(tenant)
     and exists (select 1 from public.tenant_features f
                  where f.tenant_id = tenant and f.feature_id = 'support-helpdesk-ai' and f.enabled);
end;
$$;

revoke execute on function private.genesis_support_ai_on(uuid) from public, anon, authenticated;

create or replace function public.support_ai_enabled(tenant uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.support_help_readable(coalesce(tenant, private.genesis_support_default_tenant_id()))
     and private.genesis_support_ai_on(coalesce(tenant, private.genesis_support_default_tenant_id()))
$$;

comment on function public.support_ai_enabled(uuid) is
  'Whether the signed-in person can ask this tenant''s help center''s AI. Genesis support.';

-- Keep a question for the AI to answer. 30 an hour per person, as each one spends the tenant's budget.
create or replace function public.support_ask(tenant uuid default null, question text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  resolved uuid := coalesce(tenant, private.genesis_support_default_tenant_id());
  words text := btrim(coalesce(question, ''));
  saved uuid;
begin
  if me is null or not public.support_ai_enabled(resolved) then
    raise exception 'support_ask: AI answers aren''t on here' using errcode = '42501';
  end if;
  if words !~ '\S' or char_length(words) > 2000 then
    raise exception 'support_ask: a question is 1 to 2000 characters' using errcode = '22023';
  end if;
  perform private.genesis_support_rate_limit(me, 'question', 30, interval '1 hour');
  insert into public.help_questions (tenant_id, user_id, question) values (resolved, me, words) returning id into saved;
  return saved;
end;
$$;

-- The AI task takes the person's question to answer it, once: a question id can't run the model
-- twice, so support_ask's limit is the limit on model calls.
create or replace function public.support_claim_question(question uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  q public.help_questions;
begin
  select * into q from public.help_questions h where h.id = $1 for update;
  if q.id is null or q.user_id is distinct from auth.uid() then
    raise exception 'support_claim_question: not your question' using errcode = '42501';
  end if;
  if q.outcome <> 'asked' then
    raise exception 'support_claim_question: already taken' using errcode = '22023';
  end if;
  update public.help_questions h set outcome = 'answering' where h.id = $1;
end;
$$;

-- The server keeps what came of a question (answerHelpQuestion, with a service-role client). An
-- answer has to cite published articles of the question's tenant, or it's refused (22023); no
-- citations or no words means no answer. What a safety protocol routed elsewhere isn't kept.
create or replace function public.support_record_answer(question uuid, outcome text, answer text default null, article_ids uuid[] default '{}')
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  q public.help_questions;
  cited uuid[] := coalesce(article_ids, '{}');
  words text := btrim(coalesce(answer, ''));
begin
  select * into q from public.help_questions h where h.id = $1 for update;
  if q.id is null then
    raise exception 'support_record_answer: no such question' using errcode = '22023';
  end if;
  -- Their words go whatever else has happened to the question.
  if $2 in ('safety_routed', 'no_consent') then
    update public.help_questions h
       set question = '(not kept)',
           outcome = case when h.outcome in ('asked', 'answering', 'no_answer') then $2 else h.outcome end,
           answered_at = coalesce(h.answered_at, clock_timestamp())
     where h.id = $1;
    return $2;
  end if;
  if q.outcome not in ('asked', 'answering') then
    raise exception 'support_record_answer: no open question' using errcode = '22023';
  end if;
  if $2 not in ('answered', 'no_answer') then
    raise exception 'support_record_answer: unknown outcome' using errcode = '22023';
  end if;
  if $2 = 'no_answer' or words !~ '\S' or cardinality(cited) = 0 then
    update public.help_questions h set outcome = 'no_answer', answered_at = clock_timestamp() where h.id = $1;
    return 'no_answer';
  end if;
  if char_length(words) > 8000 then
    raise exception 'support_record_answer: too long' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(cited) as c(id)
              where not exists (select 1 from public.help_articles a
                                 where a.id = c.id and a.tenant_id = q.tenant_id and a.status = 'published')) then
    raise exception 'support_record_answer: it cites something that isn''t a published article here' using errcode = '22023';
  end if;
  update public.help_questions h
     set answer = words, article_ids = cited, outcome = 'answered', answered_at = clock_timestamp()
   where h.id = $1;
  return 'answered';
end;
$$;

-- How it ended: `resolved` (the answer helped) or `handed_off` (to a person, with their ticket).
create or replace function public.support_close_question(question uuid, outcome text, ticket uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  q public.help_questions;
begin
  select * into q from public.help_questions h where h.id = $1 for update;
  if q.id is null or q.user_id is distinct from auth.uid() then
    raise exception 'support_close_question: not your question' using errcode = '42501';
  end if;
  if support_close_question.outcome not in ('resolved', 'handed_off')
     or q.outcome in ('resolved', 'handed_off')
     or q.outcome = 'safety_routed' and support_close_question.outcome = 'resolved'
     or (support_close_question.outcome = 'resolved' and q.outcome <> 'answered') then
    raise exception 'support_close_question: it can''t end that way now' using errcode = '22023';
  end if;
  if ticket is not null and not exists (select 1 from public.tickets t where t.id = ticket and t.user_id = q.user_id and t.tenant_id = q.tenant_id) then
    raise exception 'support_close_question: not your ticket' using errcode = '42501';
  end if;
  update public.help_questions h
     set outcome = support_close_question.outcome, ticket_id = ticket, closed_at = clock_timestamp()
   where h.id = $1;
end;
$$;

-- Grants --------------------------------------------------------------------------------------

revoke all on table public.help_collections, public.help_articles, public.help_questions from public, anon, authenticated;
grant select (id, tenant_id, title, description, position, created_at, updated_at) on table public.help_collections to authenticated;
grant select (id, tenant_id, collection_id, slug, title, summary, body, status, published_at, created_at, updated_at, search) on table public.help_articles to authenticated;
grant select (id, tenant_id, user_id, question, answer, article_ids, outcome, ticket_id, created_at, answered_at, closed_at) on table public.help_questions to authenticated;
grant select, insert, update, delete on table public.help_collections, public.help_articles, public.help_questions to service_role;

revoke execute on function public.support_help_readable(uuid) from public, anon;
grant execute on function public.support_help_readable(uuid) to authenticated, service_role;
revoke execute on function public.support_help_collections(uuid) from public, anon;
grant execute on function public.support_help_collections(uuid) to authenticated;
revoke execute on function public.support_help_articles(uuid, uuid, boolean) from public, anon;
grant execute on function public.support_help_articles(uuid, uuid, boolean) to authenticated;
revoke execute on function public.support_help_article(uuid, text) from public, anon;
grant execute on function public.support_help_article(uuid, text) to authenticated;
revoke execute on function public.support_search_articles(uuid, text, integer) from public, anon;
grant execute on function public.support_search_articles(uuid, text, integer) to authenticated;
revoke execute on function public.support_save_collection(uuid, uuid, text, text, integer) from public, anon;
grant execute on function public.support_save_collection(uuid, uuid, text, text, integer) to authenticated;
revoke execute on function public.support_delete_collection(uuid) from public, anon;
grant execute on function public.support_delete_collection(uuid) to authenticated;
revoke execute on function public.support_save_article(uuid, uuid, uuid, text, text, text, text, text, timestamptz) from public, anon;
grant execute on function public.support_save_article(uuid, uuid, uuid, text, text, text, text, text, timestamptz) to authenticated;
revoke execute on function public.support_delete_article(uuid) from public, anon;
grant execute on function public.support_delete_article(uuid) to authenticated;
revoke execute on function public.support_ai_enabled(uuid) from public, anon;
grant execute on function public.support_ai_enabled(uuid) to authenticated, service_role;
revoke execute on function public.support_ask(uuid, text) from public, anon;
grant execute on function public.support_ask(uuid, text) to authenticated;
revoke execute on function public.support_claim_question(uuid) from public, anon;
grant execute on function public.support_claim_question(uuid) to authenticated;
revoke execute on function public.support_record_answer(uuid, text, text, uuid[]) from public, anon, authenticated;
grant execute on function public.support_record_answer(uuid, text, text, uuid[]) to service_role;
revoke execute on function public.support_close_question(uuid, text, uuid) from public, anon;
grant execute on function public.support_close_question(uuid, text, uuid) to authenticated;
