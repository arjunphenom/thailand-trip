-- Personal expense tracking and live location sharing.
-- Safe to run more than once. Expenses and locations both start empty.

alter table public.travellers
  add column if not exists budget_thb numeric(12,2) check (budget_thb is null or budget_thb >= 0);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  traveller_id uuid not null references public.travellers(id) on delete cascade,
  amount_thb numeric(12,2) not null check (amount_thb > 0),
  category text not null check (category in ('food', 'transport', 'stay', 'shopping', 'activities', 'misc')),
  note text check (char_length(note) <= 200),
  spent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists expenses_traveller_idx on public.expenses(traveller_id, spent_at desc);

alter table public.expenses add column if not exists split_with uuid[];

create table if not exists public.locations (
  traveller_id uuid primary key references public.travellers(id) on delete cascade,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  accuracy double precision check (accuracy is null or accuracy >= 0),
  updated_at timestamptz not null default now()
);

do $$
declare
  table_name text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach table_name in array array['expenses', 'locations'] loop
    execute format('alter table public.%I enable row level security', table_name);
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = table_name and policyname = 'shared_trip'
    ) then
      execute format('create policy shared_trip on public.%I for all to anon, authenticated using (true) with check (true)', table_name);
    end if;
    execute format('grant select, insert, update, delete on public.%I to anon, authenticated', table_name);
    execute format('alter table public.%I replica identity full', table_name);
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end;
$$;
