-- @feat:support-helpdesk
-- Genesis support 0012: a question the safety protocol routes elsewhere keeps nothing (after
-- 0010_genesis_support_help_center.sql).
--
-- When a help question ends `safety_routed` or `no_consent`, 0010 dropped the person's words but
-- kept an answer recorded earlier and the articles it cited. Now support_record_answer clears the
-- answer and its article ids too, and the rows already ended that way are cleared here.
--
-- A question answered first and routed later keeps its outcome (`answered`, `resolved` or
-- `handed_off`) with a null answer and no articles: show it as "not kept", never as an empty answer.
--
-- Use: copy this file into your app's `supabase/migrations/` under a new timestamped name
-- (`genesis migrate` does it). Never edit it once applied; change it with a new migration.
--
-- Verify: the pgTAP test beside this file (`tests/0012_genesis_support_help_answers.test.sql`).

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
  -- Their words go whatever else has happened to the question, and so does any answer to them.
  if $2 in ('safety_routed', 'no_consent') then
    update public.help_questions h
       set question = '(not kept)',
           answer = null,
           article_ids = '{}',
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

revoke execute on function public.support_record_answer(uuid, text, text, uuid[]) from public, anon, authenticated;
grant execute on function public.support_record_answer(uuid, text, text, uuid[]) to service_role;

-- Questions already routed elsewhere, or asked without consent, keep no answer either.
update public.help_questions
   set answer = null, article_ids = '{}'
 where outcome in ('safety_routed', 'no_consent')
    or (question = '(not kept)' and (answer is not null or cardinality(article_ids) > 0));
