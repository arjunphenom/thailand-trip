begin;

-- Per-person wishlist: what each traveller wants to do on the trip. Shared with the whole group.
create table if not exists public.wishes (
  id uuid primary key default gen_random_uuid(),
  traveller_id uuid not null references public.travellers(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  category text not null default 'activities'
    check (category in ('food', 'activities', 'sightseeing', 'nightlife', 'shopping', 'nature', 'misc')),
  created_at timestamptz not null default now()
);
create index if not exists wishes_traveller_idx on public.wishes(traveller_id);

alter table public.wishes enable row level security;
revoke all on public.wishes from anon;
grant select, insert, update, delete on public.wishes to authenticated;
grant all on public.wishes to service_role;
drop policy if exists invited_trip on public.wishes;
create policy invited_trip on public.wishes for all to authenticated
  using ((select public.is_trip_member())) with check ((select public.is_trip_member()));

alter table public.wishes replica identity full;
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'wishes'
  ) then
    alter publication supabase_realtime add table public.wishes;
  end if;
end $$;

commit;
