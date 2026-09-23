-- Preserve analyst object-class relabels as first-class tracking corrections.

alter table public.video_track_corrections
  drop constraint if exists video_track_corrections_correction_type_check;

alter table public.video_track_corrections
  add constraint video_track_corrections_correction_type_check
  check (correction_type in (
    'position',
    'identity',
    'entity',
    'occlusion',
    'split',
    'merge',
    'identity-swap',
    'reject',
    'restore'
  ));

comment on column public.video_track_corrections.correction_type is
  'Review operation: position, player identity, object entity type, occlusion, split, merge, identity-swap, false-positive reject, or restore.';
