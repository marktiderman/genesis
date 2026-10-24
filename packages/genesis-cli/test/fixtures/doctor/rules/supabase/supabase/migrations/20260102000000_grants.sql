alter function public.fixed_later() set search_path = '';
grant execute on all functions in schema public to authenticated;
alter default privileges in schema public grant execute on functions to anon;
alter default privileges in schema public revoke execute on functions from public;
grant execute on function private.do_thing(uuid) to anon, authenticated;
grant execute on function private.do_thing(uuid) to authenticated;
revoke execute on all functions in schema private from public, anon;
