-- @feat:support-chat
-- Genesis support 0034: the report's requester labels from one hook (after
-- 0015_genesis_support_agent_tools_bounds.sql).
--
-- support_agent_report's "open by requester" list now asks only the set-based hook 0015 added,
-- once for every open ticket:
--
--   private.genesis_support_requester_labels(reports uuid[]) returns table (report_id uuid, label text)
--
-- 0014's one-ticket hook, private.genesis_support_requester_label(report uuid), is no longer
-- called: define the set-based one instead (the one-ticket hook can be its body:
-- `select r, private.genesis_support_requester_label(r) from unnest(reports) r`). Without the
-- set-based hook the list is empty. by_requester_capped stays in the answer, always false.
--
-- Use: copy this file into your app's `supabase/migrations/` under a new timestamped name
-- (`genesis migrate` does it). Never edit it once applied; change it with a new migration.
--
-- Verify: the pgTAP test beside this file (`tests/0034_genesis_support_requester_labels.test.sql`).

create or replace function public.support_agent_report(tenant uuid default null, from_at timestamptz default null, to_at timestamptz default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  resolved uuid := private.genesis_support_inbox_tenant(tenant);
  hi timestamptz := coalesce(to_at, now());
  lo timestamptz := coalesce(from_at, coalesce(to_at, now()) - interval '30 days');
  result jsonb;
  groups jsonb := '[]'::jsonb;
  open_ids uuid[];
begin
  if hi <= lo or hi - lo > interval '366 days' then
    raise exception 'support_agent_report: from_at comes before to_at, at most 366 days apart' using errcode = '22023';
  end if;
  select jsonb_build_object(
           'from_at', lo,
           'to_at', hi,
           'opened', (select count(*)::integer from public.tickets t
                       where t.tenant_id = resolved and t.created_at >= lo and t.created_at < hi),
           'closed', (select count(*)::integer from public.tickets t
                       where t.tenant_id = resolved and t.status in ('addressed', 'wont_fix')
                         and t.resolved_at >= lo and t.resolved_at < hi),
           'open_now', (select count(*)::integer from public.tickets t
                         where t.tenant_id = resolved and t.status not in ('addressed', 'wont_fix')),
           'median_first_response_seconds',
             (select percentile_cont(0.5) within group (order by extract(epoch from (f.first_at - t.created_at)))
                from public.tickets t
                cross join lateral (
                  select min(m.created_at) as first_at
                    from genesis_chat.conversations c
                    join genesis_chat.messages m on m.conversation_id = c.id
                   where c.kind = 'support' and c.subject_type = 'support_report' and c.subject_id = t.id::text
                     and m.sender_role = 'observer' and m.visibility = 'everyone' and m.kind = 'text'
                     and m.deleted_at is null) f
               where t.tenant_id = resolved and t.created_at >= lo and t.created_at < hi and f.first_at is not null),
           'median_close_seconds',
             (select percentile_cont(0.5) within group (order by extract(epoch from (t.resolved_at - t.created_at)))
                from public.tickets t
               where t.tenant_id = resolved and t.status in ('addressed', 'wont_fix')
                 and t.resolved_at >= lo and t.resolved_at < hi)
         )
    into result;
  if to_regprocedure('private.genesis_support_requester_labels(uuid[])') is not null then
    -- One call for every open ticket.
    select coalesce(array_agg(t.id), '{}') into open_ids
      from public.tickets t
     where t.tenant_id = resolved and t.status not in ('addressed', 'wont_fix');
    select coalesce(jsonb_agg(jsonb_build_object('label', g.label, 'open', g.n) order by g.n desc, g.label), '[]'::jsonb)
      into groups
      from (select nullif(btrim(l.label), '') as label, count(*)::integer as n
              from unnest(open_ids) as o(id)
              left join (select distinct on (x.report_id) x.report_id, x.label
                           from private.genesis_support_requester_labels(open_ids) x
                          order by x.report_id) l on l.report_id = o.id
             group by 1) g;
  end if;
  return result || jsonb_build_object('by_requester', groups, 'by_requester_capped', false);
end;
$$;

comment on function public.support_agent_report(uuid, timestamptz, timestamptz) is
  'A tenant''s help desk over a date range, for its agents: opened, closed, median first response and time to close, open now, and open by requester (the app''s private.genesis_support_requester_labels hook; by_requester_capped is always false). Genesis support.';

revoke execute on function public.support_agent_report(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.support_agent_report(uuid, timestamptz, timestamptz) to authenticated;
