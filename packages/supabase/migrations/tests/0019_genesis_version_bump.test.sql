-- @feat:versioned-writes
-- pgTAP test for 0019_genesis_version_bump.sql.
-- Copy into your app's `supabase/tests/database/` and run `supabase test db`.
-- It creates only its own temporary tables and rolls everything back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

select ok(not has_function_privilege('anon', 'public.genesis_version_bump()', 'execute'), 'anon cannot call it');
select ok(not has_function_privilege('authenticated', 'public.genesis_version_bump()', 'execute'), 'authenticated cannot call it');

create temp table vb_rows (id int primary key, title text, version bigint not null default 1);
create trigger vb_rows_bump before update on vb_rows
  for each row execute function public.genesis_version_bump('version');
insert into vb_rows values (1, 'a', 1), (2, 'b', 7);

update vb_rows set title = 'a2' where id = 1;
select is((select version from vb_rows where id = 1), 2::bigint, 'an update advances the version by one');

update vb_rows set title = 'a3', version = 100 where id = 1;
select is((select version from vb_rows where id = 1), 3::bigint, 'a written version is ignored: it can''t jump ahead');

update vb_rows set version = 0 where id = 1;
select is((select version from vb_rows where id = 1), 4::bigint, 'and it can''t be held back');

update vb_rows set title = title where id = 1;
select is((select version from vb_rows where id = 1), 5::bigint, 'an update that changes nothing still advances it');

select is((select version from vb_rows where id = 2), 7::bigint, 'rows not updated keep their version');

update vb_rows set title = title || '!';
select results_eq('select id, version from vb_rows order by id', $$ values (1, 6::bigint), (2, 8::bigint) $$,
  'a multi-row update advances each row from its own version');

-- A versioned update: what the data provider sends.
update vb_rows set title = 'stale' where id = 2 and version = 7;
select is((select title from vb_rows where id = 2), 'b!', 'an update at a stale version matches no row');

-- The column name is the argument; the default is `version`.
create temp table vb_named (id int primary key, rev bigint not null default 1);
create trigger vb_named_bump before update on vb_named
  for each row execute function public.genesis_version_bump('rev');
insert into vb_named values (1, 1);
update vb_named set rev = rev where id = 1;
select is((select rev from vb_named where id = 1), 2::bigint, 'the column is named by the trigger argument');

create temp table vb_missing (id int primary key, title text);
create trigger vb_missing_bump before update on vb_missing
  for each row execute function public.genesis_version_bump('version');
insert into vb_missing values (1, 'x');
select throws_ok($$ update vb_missing set title = 'y' $$, '42703', null, 'a missing column is an error, not a silent no-op');

create temp table vb_text (id int primary key, version timestamptz not null default now());
create trigger vb_text_bump before update on vb_text
  for each row execute function public.genesis_version_bump('version');
insert into vb_text values (1);
select throws_ok($$ update vb_text set id = 1 $$, '42804', null, 'a column that isn''t an integer is an error');

create temp table vb_numeric (id int primary key, version numeric not null default 1);
create trigger vb_numeric_bump before update on vb_numeric
  for each row execute function public.genesis_version_bump('version');
insert into vb_numeric values (1);
select throws_ok($$ update vb_numeric set id = 1 $$, '42804', null, 'a numeric column is refused by its type, not its value');

select * from finish();
rollback;
