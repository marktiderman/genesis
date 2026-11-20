-- @feat:support-feedback
-- Genesis support 0028: two fixes to the context dump's table and settings (after 0019 and 0020).
--
-- 1. A whole number stored as `10.0` reads as 10. 0020's private.genesis_support_setting_int cast
--    the value as jsonb -> text -> integer. A stored `10.0` passes 0020's check (a whole number in
--    range), but `'10.0'::integer` raises, so with `diagnostics.perHour` at 10.0 every dump insert
--    failed, and with `diagnostics.retentionDays` at 30.0 the purge did. It now reads the value
--    through numeric first.
--
-- 2. A dump must say its schema. 0019's check compared `report ->> 'schema'` with
--    'genesis.diagnostics/1', which is NULL (and so passes) for `{}` or `{"schema": null}`. A new
--    check refuses those. It is added NOT VALID: rows already stored aren't read again, new and
--    updated rows are checked.
--
-- Use: copy this file into your app's `supabase/migrations/` under a new timestamped name, after
-- 0026's copy (`genesis migrate` does it). Never edit it once applied; change it with a new
-- migration.
--
-- Verify: the pgTAP test beside this file (`tests/0028_genesis_support_diagnostics_fixes.test.sql`).

create or replace function private.genesis_support_setting_int(setting_key text, fallback integer, lo integer, hi integer)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (private.genesis_support_setting_value(setting_key, to_jsonb(fallback), lo, hi))::text::numeric::integer
$$;

revoke execute on function private.genesis_support_setting_int(text, integer, integer, integer) from public, anon, authenticated;

alter table public.support_diagnostics
  add constraint support_diagnostics_report_schema
  check (report ->> 'schema' is not distinct from 'genesis.diagnostics/1') not valid;
