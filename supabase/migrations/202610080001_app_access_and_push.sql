begin;

create table if not exists public.trip_memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now()
);

alter table public.trip_memberships enable row level security;
revoke all on public.trip_memberships from anon, authenticated;
grant select on public.trip_memberships to authenticated;
grant all on public.trip_memberships to service_role;
drop policy if exists own_membership on public.trip_memberships;
create policy own_membership on public.trip_memberships for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.is_trip_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.trip_memberships where user_id = auth.uid());
$$;
revoke all on function public.is_trip_member() from public, anon;
grant execute on function public.is_trip_member() to authenticated, service_role;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'travellers', 'tasks', 'task_completions', 'comments', 'itinerary_days',
    'activity', 'expenses', 'locations', 'repayments'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists shared_trip on public.%I', table_name);
    execute format('drop policy if exists invited_trip on public.%I', table_name);
    execute format('create policy invited_trip on public.%I for all to authenticated using ((select public.is_trip_member())) with check ((select public.is_trip_member()))', table_name);
    execute format('revoke all on public.%I from anon', table_name);
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
    execute format('grant all on public.%I to service_role', table_name);
  end loop;
end;
$$;

revoke all on function public.trip_mutate(uuid, text, jsonb) from anon;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.trip_memberships(user_id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) between 20 and 4096),
  keys jsonb not null check (jsonb_typeof(keys) = 'object'),
  topics text[] not null default array['tasks', 'money', 'itinerary']
    check (topics <@ array['tasks', 'money', 'itinerary']),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);

create table if not exists public.push_outbox (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  topic text not null check (topic in ('tasks', 'money', 'itinerary')),
  route text not null check (route in ('/', '/money', '/itinerary')),
  actor_user_id uuid,
  created_at timestamptz not null default now(),
  available_at timestamptz not null default now(),
  locked_until timestamptz,
  attempts integer not null default 0,
  processed_at timestamptz,
  last_error text
);
create index if not exists push_outbox_pending_idx on public.push_outbox(available_at)
  where processed_at is null;

create table if not exists public.push_deliveries (
  job_id uuid not null references public.push_outbox(id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  delivered_at timestamptz not null default now(),
  primary key (job_id, subscription_id)
);

create table if not exists public.push_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  bucket_at timestamptz not null,
  uses integer not null default 1,
  primary key (user_id, action)
);

do $$
declare
  table_name text;
begin
  foreach table_name in array array['push_subscriptions', 'push_outbox', 'push_deliveries', 'push_rate_limits'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from anon, authenticated', table_name);
    execute format('grant all on public.%I to service_role', table_name);
  end loop;
end;
$$;

create or replace function public.queue_trip_notification() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  event_topic text;
  event_route text;
begin
  if auth.uid() is null then return null; end if;
  if tg_table_name in ('expenses', 'repayments') then
    event_topic := 'money';
    event_route := '/money';
  elsif tg_table_name = 'itinerary_days' then
    event_topic := 'itinerary';
    event_route := '/itinerary';
  else
    event_topic := 'tasks';
    event_route := '/';
  end if;
  insert into public.push_outbox(event_key, topic, route, actor_user_id)
    values (txid_current()::text || ':' || event_topic, event_topic, event_route, auth.uid())
    on conflict (event_key) do nothing;
  return null;
end;
$$;
revoke all on function public.queue_trip_notification() from public, anon, authenticated;

drop trigger if exists trip_notify_activity on public.activity;
create trigger trip_notify_activity after insert on public.activity
  for each row execute function public.queue_trip_notification();
drop trigger if exists trip_notify_expenses on public.expenses;
create trigger trip_notify_expenses after insert or update or delete on public.expenses
  for each row execute function public.queue_trip_notification();
drop trigger if exists trip_notify_repayments on public.repayments;
create trigger trip_notify_repayments after insert or delete on public.repayments
  for each row execute function public.queue_trip_notification();
drop trigger if exists trip_notify_itinerary on public.itinerary_days;
create trigger trip_notify_itinerary after insert or update or delete on public.itinerary_days
  for each row execute function public.queue_trip_notification();

create or replace function public.claim_push_jobs() returns setof public.push_outbox
language sql security definer set search_path = '' as $$
  update public.push_outbox set locked_until = now() + interval '2 minutes', attempts = attempts + 1
  where id in (
    select id from public.push_outbox
    where processed_at is null and attempts < 5 and available_at <= now()
      and (locked_until is null or locked_until < now())
    order by created_at for update skip locked limit 20
  ) returning *;
$$;
revoke all on function public.claim_push_jobs() from public, anon, authenticated;
grant execute on function public.claim_push_jobs() to service_role;

create or replace function public.allow_push_action(p_user_id uuid, p_action text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  affected integer;
begin
  if p_action not in ('join', 'test', 'subscribe') then return false; end if;
  insert into public.push_rate_limits(user_id, action, bucket_at, uses)
    values (p_user_id, p_action, date_trunc('minute', now()), 1)
  on conflict (user_id, action) do update
    set bucket_at = excluded.bucket_at,
      uses = case when push_rate_limits.bucket_at < excluded.bucket_at then 1 else push_rate_limits.uses + 1 end
    where push_rate_limits.bucket_at < excluded.bucket_at or push_rate_limits.uses < 5;
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;
revoke all on function public.allow_push_action(uuid, text) from public, anon, authenticated;
grant execute on function public.allow_push_action(uuid, text) to service_role;

commit;