-- Coaches may add their own clients (Data Studio P1 adoption test).
create policy clients_insert on public.clients for insert to authenticated
  with check (coach_id = (select auth.uid()));
grant insert (full_name, email, status, plan_id, goals) on public.clients to authenticated;
