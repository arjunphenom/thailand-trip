begin;

-- Common trip documents (hotel bookings, e-tickets, vouchers) visible to the whole group.
-- File bytes live in the existing private "trip-docs" bucket under a "shared/" path prefix;
-- access flows only through the edge function (service role), same as personal documents.
create table if not exists public.shared_documents (
  id uuid primary key default gen_random_uuid(),
  traveller_id uuid references public.travellers(id) on delete set null,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  path text not null unique,
  mime text not null,
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  created_at timestamptz not null default now()
);
create index if not exists shared_documents_created_idx on public.shared_documents(created_at desc);

-- Lock the table to service_role only; the edge function enforces trip membership.
alter table public.shared_documents enable row level security;
revoke all on public.shared_documents from anon, authenticated;
grant all on public.shared_documents to service_role;

commit;
