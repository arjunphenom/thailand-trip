create table public.travellers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  colour text not null check (colour ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  detail text check (char_length(detail) <= 20000),
  category text not null check (category in ('urgent', 'booking', 'optional', 'admin')),
  status text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  owner_id uuid references public.travellers(id) on delete set null,
  due_date date,
  trip_day date,
  est_cost_thb numeric(12,2) check (est_cost_thb >= 0),
  actual_cost_thb numeric(12,2) check (actual_cost_thb >= 0),
  booking_url text check (booking_url is null or booking_url ~* '^https?://'),
  booking_ref text check (char_length(booking_ref) <= 200),
  is_everyone boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.task_completions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  traveller_id uuid not null references public.travellers(id) on delete cascade,
  completed_at timestamptz not null default now(),
  unique (task_id, traveller_id)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  traveller_id uuid references public.travellers(id) on delete set null,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create table public.itinerary_days (
  id uuid primary key default gen_random_uuid(),
  day_date date not null unique,
  city text not null,
  hotel text,
  title text not null,
  notes text,
  watch_out text,
  conflict_note text,
  created_at timestamptz not null default now()
);

create table public.activity (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.tasks(id) on delete set null,
  traveller_id uuid references public.travellers(id) on delete set null,
  action text not null,
  created_at timestamptz not null default now()
);

create index tasks_owner_idx on public.tasks(owner_id);
create index tasks_day_idx on public.tasks(trip_day);
create index completions_traveller_idx on public.task_completions(traveller_id);
create index comments_task_idx on public.comments(task_id, created_at);
create index activity_recent_idx on public.activity(created_at desc);

create function public.touch_task() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create trigger tasks_updated_at before update on public.tasks
for each row execute function public.touch_task();

do $$
declare
  table_name text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach table_name in array array['travellers', 'tasks', 'task_completions', 'comments', 'itinerary_days', 'activity'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('create policy shared_trip on public.%I for all to anon, authenticated using (true) with check (true)', table_name);
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

grant usage on schema public to anon, authenticated;

create function public.trip_mutate(p_actor_id uuid, p_action text, p_payload jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  before_task public.tasks%rowtype;
  after_task public.tasks%rowtype;
  task_id_value uuid;
  patch jsonb;
  action_text text;
  owner_name text;
begin
  if not exists (select 1 from public.travellers where id = p_actor_id) then
    raise exception 'Choose a traveller before making changes.';
  end if;
  if p_action not in ('create_task', 'cycle_status', 'update_task', 'set_completion', 'add_comment') then
    raise exception 'Unknown trip action.';
  end if;

  if p_action = 'create_task' then
    insert into public.tasks (
      title, detail, category, owner_id, due_date, trip_day, est_cost_thb, is_everyone, sort_order
    ) values (
      btrim(p_payload->>'title'), nullif(p_payload->>'detail', ''), p_payload->>'category',
      nullif(p_payload->>'owner_id', '')::uuid, nullif(p_payload->>'due_date', '')::date,
      nullif(p_payload->>'trip_day', '')::date, nullif(p_payload->>'est_cost_thb', '')::numeric,
      coalesce((p_payload->>'is_everyone')::boolean, false),
      (select coalesce(max(sort_order), 0) + 1 from public.tasks)
    ) returning * into after_task;
    task_id_value := after_task.id;
    action_text := 'added ' || after_task.title;
  else
    task_id_value := (p_payload->>'task_id')::uuid;
    select * into before_task from public.tasks where id = task_id_value for update;
    if not found then
      raise exception 'This task no longer exists. Refresh the trip.';
    end if;

    if p_action in ('cycle_status', 'update_task') and (
      p_payload->>'expected_updated_at' is null or
      (p_payload->>'expected_updated_at')::timestamptz <> before_task.updated_at
    ) then
      raise exception 'Someone just changed this task. The latest version has been loaded; try again.' using errcode = '40001';
    end if;

    if p_action = 'cycle_status' then
      if before_task.is_everyone then
        raise exception 'Each traveller must complete this task individually.';
      end if;
      update public.tasks set status = case before_task.status
        when 'todo' then 'doing' when 'doing' then 'done' else 'todo' end
      where id = task_id_value returning * into after_task;
      action_text := case after_task.status
        when 'doing' then 'started ' || after_task.title
        when 'done' then 'marked ' || after_task.title || ' done'
        else 'reopened ' || after_task.title end;

    elsif p_action = 'update_task' then
      patch := p_payload->'patch';
      if patch is null or jsonb_typeof(patch) <> 'object' or patch - array[
        'title', 'detail', 'category', 'owner_id', 'due_date', 'trip_day',
        'est_cost_thb', 'actual_cost_thb', 'booking_url', 'booking_ref'
      ] <> '{}'::jsonb then
        raise exception 'Invalid task fields.';
      end if;
      update public.tasks set
        title = case when patch ? 'title' then btrim(patch->>'title') else title end,
        detail = case when patch ? 'detail' then nullif(patch->>'detail', '') else detail end,
        category = case when patch ? 'category' then patch->>'category' else category end,
        owner_id = case when patch ? 'owner_id' then nullif(patch->>'owner_id', '')::uuid else owner_id end,
        due_date = case when patch ? 'due_date' then nullif(patch->>'due_date', '')::date else due_date end,
        trip_day = case when patch ? 'trip_day' then nullif(patch->>'trip_day', '')::date else trip_day end,
        est_cost_thb = case when patch ? 'est_cost_thb' then nullif(patch->>'est_cost_thb', '')::numeric else est_cost_thb end,
        actual_cost_thb = case when patch ? 'actual_cost_thb' then nullif(patch->>'actual_cost_thb', '')::numeric else actual_cost_thb end,
        booking_url = case when patch ? 'booking_url' then nullif(btrim(patch->>'booking_url'), '') else booking_url end,
        booking_ref = case when patch ? 'booking_ref' then nullif(btrim(patch->>'booking_ref'), '') else booking_ref end
      where id = task_id_value returning * into after_task;

      action_text := 'updated ' || after_task.title;
      if before_task.est_cost_thb is distinct from after_task.est_cost_thb or
         before_task.actual_cost_thb is distinct from after_task.actual_cost_thb then
        action_text := 'updated costs for ' || after_task.title;
      end if;
      if before_task.owner_id is distinct from after_task.owner_id then
        if action_text = 'updated costs for ' || after_task.title then
          insert into public.activity (task_id, traveller_id, action) values (task_id_value, p_actor_id, action_text);
        end if;
        select name into owner_name from public.travellers where id = after_task.owner_id;
        action_text := case
          when after_task.owner_id is null then 'unassigned ' || after_task.title
          when after_task.owner_id = p_actor_id then 'claimed ' || after_task.title
          else 'assigned ' || after_task.title || ' to ' || owner_name end;
      end if;

    elsif p_action = 'set_completion' then
      if not before_task.is_everyone then
        raise exception 'This is a group-owned task, not an individual completion.';
      end if;
      if (p_payload->>'completed')::boolean is true then
        insert into public.task_completions (task_id, traveller_id)
        values (task_id_value, p_actor_id) on conflict (task_id, traveller_id) do nothing;
        if found then
          action_text := 'marked ' || before_task.title || ' done for themselves';
        end if;
      elsif (p_payload->>'completed')::boolean is false then
        delete from public.task_completions where task_id = task_id_value and traveller_id = p_actor_id;
        if found then
          action_text := 'reopened ' || before_task.title || ' for themselves';
        end if;
      else
        raise exception 'Completion must be true or false.';
      end if;

    elsif p_action = 'add_comment' then
      insert into public.comments (task_id, traveller_id, body)
      values (task_id_value, p_actor_id, btrim(p_payload->>'body'));
      action_text := 'commented on ' || before_task.title;
    end if;
  end if;

  if action_text is not null then
    insert into public.activity (task_id, traveller_id, action)
    values (task_id_value, p_actor_id, action_text);
  end if;
  return task_id_value;
end;
$$;

revoke all on function public.trip_mutate(uuid, text, jsonb) from public;
grant execute on function public.trip_mutate(uuid, text, jsonb) to anon, authenticated;