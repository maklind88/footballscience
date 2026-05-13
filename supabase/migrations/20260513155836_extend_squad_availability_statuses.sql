alter table public.squad_roster_memberships
  drop constraint if exists squad_roster_memberships_availability_status_check;

alter table public.squad_roster_memberships
  add constraint squad_roster_memberships_availability_status_check
  check (
    availability_status in (
      'available',
      'injured',
      'managed',
      'rehab',
      'unavailable',
      'national-team',
      'vacation',
      'personal',
      'suspended',
      'loan',
      'unknown'
    )
  );
