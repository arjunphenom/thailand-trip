begin;

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

create or replace function public.request_push_dispatch() returns void
language plpgsql security definer set search_path = '' as $$
declare
  destination text;
  dispatch_secret text;
begin
  if not exists (
    select 1 from public.push_outbox where processed_at is null and attempts < 5
      and available_at <= now() and (locked_until is null or locked_until < now())
  ) then return; end if;
  select decrypted_secret into destination from vault.decrypted_secrets where name = 'trip_push_function_url';
  select decrypted_secret into dispatch_secret from vault.decrypted_secrets where name = 'trip_push_dispatch_secret';
  if destination is null or dispatch_secret is null then return; end if;
  perform net.http_post(
    url := destination,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-trip-dispatch-secret', dispatch_secret),
    body := '{"action":"dispatch"}'::jsonb,
    timeout_milliseconds := 5000
  );
exception when others then
  return;
end;
$$;
revoke all on function public.request_push_dispatch() from public, anon, authenticated;
grant execute on function public.request_push_dispatch() to service_role;

create or replace function public.wake_push_dispatch() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.request_push_dispatch();
  return null;
end;
$$;
revoke all on function public.wake_push_dispatch() from public, anon, authenticated;

drop trigger if exists wake_trip_push on public.push_outbox;
create trigger wake_trip_push after insert on public.push_outbox
  for each row execute function public.wake_push_dispatch();

select cron.schedule('trip-push-retry', '* * * * *', 'select public.request_push_dispatch();');
select cron.schedule('trip-push-retention', '15 3 * * *', $$
  delete from public.push_outbox where created_at < now() - interval '7 days' and (processed_at is not null or attempts >= 5);
  delete from public.push_rate_limits where bucket_at < now() - interval '1 day';
$$);

commit;