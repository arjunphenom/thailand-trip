begin;

update public.travellers as traveller
set name = roster.new_name
from (values
  ('00000000-0000-4000-8000-000000000001'::uuid, 'Arjun', 'ACHU (Admin)'),
  ('00000000-0000-4000-8000-000000000002'::uuid, 'Traveller 2', 'AJ'),
  ('00000000-0000-4000-8000-000000000003'::uuid, 'Traveller 3', 'DRUNK'),
  ('00000000-0000-4000-8000-000000000004'::uuid, 'Traveller 4', 'DK'),
  ('00000000-0000-4000-8000-000000000005'::uuid, 'Traveller 5', 'AMROWW')
) as roster(id, old_name, new_name)
where traveller.id = roster.id and traveller.name = roster.old_name;

commit;