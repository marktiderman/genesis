-- The supabase-ci self-test: the migration ran, and the table it made has RLS on.
begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

select has_table('public', 'notes', 'the migration created public.notes');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.notes'::regclass),
  'public.notes has row level security on'
);

select * from finish();
rollback;
