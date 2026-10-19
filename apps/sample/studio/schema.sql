-- The sample app's shop data, owned per staff member, with RLS on every
-- table. Three shapes the studio has to handle:
--   products     — editable; updated_at advanced by moddatetime
--   order_lines  — a composite key (order_id, line_no) and an integer version
--   categories   — no version field, so the studio keeps it read-only

create type public.product_status as enum ('Active', 'Draft', 'Archived');

create table public.products (
  id int generated always as identity primary key,
  owner_id uuid not null default auth.uid(),
  name text not null,
  status public.product_status not null default 'Draft',
  category text not null,
  price numeric(10, 2) not null check (price >= 0),
  internal_cost numeric(10, 2),
  updated_at timestamptz not null default now()
);
comment on table public.products is 'What the shop sells.';
create trigger products_updated_at before update on public.products
  for each row execute function extensions.moddatetime(updated_at);
alter table public.products enable row level security;
create policy products_select on public.products for select to authenticated using (owner_id = auth.uid());
create policy products_update on public.products for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
-- internal_cost is never granted, so the studio never shows it.
grant select (id, owner_id, name, status, category, price, updated_at) on public.products to authenticated;
grant update (name, status, category, price) on public.products to authenticated;

create table public.order_lines (
  order_id int not null,
  line_no int not null,
  owner_id uuid not null default auth.uid(),
  product text not null,
  quantity int not null check (quantity > 0),
  note text,
  version int not null default 1,
  primary key (order_id, line_no)
);
create function public.bump_version() returns trigger language plpgsql as $$
begin
  new.version := old.version + 1;
  return new;
end $$;
create trigger order_lines_version before update on public.order_lines
  for each row execute function public.bump_version();
alter table public.order_lines enable row level security;
create policy order_lines_select on public.order_lines for select to authenticated using (owner_id = auth.uid());
create policy order_lines_update on public.order_lines for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
grant select on public.order_lines to authenticated;
grant update (quantity, note) on public.order_lines to authenticated;

create table public.categories (id int primary key, name text not null);
alter table public.categories enable row level security;
create policy categories_select on public.categories for select to authenticated using (true);
grant select on public.categories to authenticated;
