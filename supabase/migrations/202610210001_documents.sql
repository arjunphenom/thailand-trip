begin;

-- Private bucket for personal travel documents (passport, visa, tickets). Never public.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('trip-docs', 'trip-docs', false, 26214400,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update set public = false, file_size_limit = 26214400,
  allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'];

-- Per-traveller PIN that locks their vault (hash only; never the PIN itself).
create table if not exists public.document_vaults (
  traveller_id uuid primary key references public.travellers(id) on delete cascade,
  pin_hash text not null,
  pin_salt text not null,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now()
);

-- Document metadata. The file bytes live in the private bucket; access only via the edge function.
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  traveller_id uuid not null references public.travellers(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  path text not null unique,
  mime text not null,
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  created_at timestamptz not null default now()
);
create index if not exists documents_traveller_idx on public.documents(traveller_id);

-- Lock the tables down to service_role only. All access flows through the edge function,
-- which enforces trip membership AND the per-traveller PIN before releasing anything.
alter table public.document_vaults enable row level security;
alter table public.documents enable row level security;
revoke all on public.document_vaults from anon, authenticated;
revoke all on public.documents from anon, authenticated;
grant all on public.document_vaults to service_role;
grant all on public.documents to service_role;

-- No storage.objects policies are created for this bucket, so anon/authenticated are denied
-- direct access by default; only the service role (edge function) can read/write the files.

commit;
