begin;

-- Notify the group when a new traveller is added to the trip.
-- Reuses queue_trip_notification(): travellers fall through to topic 'tasks', route '/'.
drop trigger if exists trip_notify_travellers on public.travellers;
create trigger trip_notify_travellers after insert on public.travellers
  for each row execute function public.queue_trip_notification();

commit;
