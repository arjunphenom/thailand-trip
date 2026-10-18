begin;

-- Store a human "who did what" summary on each queued notification.
alter table public.push_outbox add column if not exists body text;

-- Rebuild the trigger to capture the actor's name and the change, per table.
create or replace function public.queue_trip_notification() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  event_topic text;
  event_route text;
  event_body text;
  who text;
begin
  if auth.uid() is null then return null; end if;
  if tg_table_name = 'activity' then
    event_topic := 'tasks';
    event_route := '/';
    select name into who from public.travellers where id = new.traveller_id;
    event_body := left(coalesce(who, 'Someone') || ' ' || coalesce(new.action, 'updated the trip'), 180);
  elsif tg_table_name = 'expenses' then
    event_topic := 'money';
    event_route := '/money';
    select name into who from public.travellers where id = coalesce(new.traveller_id, old.traveller_id);
    event_body := coalesce(who, 'Someone') || case tg_op
      when 'INSERT' then ' added an expense'
      when 'UPDATE' then ' updated an expense'
      else ' removed an expense' end;
  elsif tg_table_name = 'repayments' then
    event_topic := 'money';
    event_route := '/money';
    select name into who from public.travellers where id = coalesce(new.from_id, old.from_id);
    event_body := coalesce(who, 'Someone') || case tg_op when 'INSERT' then ' settled up' else ' updated a settlement' end;
  elsif tg_table_name = 'itinerary_days' then
    event_topic := 'itinerary';
    event_route := '/itinerary';
    event_body := 'The itinerary was updated';
  elsif tg_table_name = 'travellers' then
    event_topic := 'tasks';
    event_route := '/';
    event_body := coalesce(new.name, 'Someone') || ' joined the trip';
  else
    event_topic := 'tasks';
    event_route := '/';
    event_body := 'Trip updated';
  end if;
  insert into public.push_outbox(event_key, topic, route, actor_user_id, body)
    values (txid_current()::text || ':' || event_topic, event_topic, event_route, auth.uid(), event_body)
    on conflict (event_key) do nothing;
  return null;
end;
$$;
revoke all on function public.queue_trip_notification() from public, anon, authenticated;

commit;
