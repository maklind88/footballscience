begin;

alter table public.video_drawing_layers
  drop constraint if exists video_drawing_layers_tool_check;

alter table public.video_drawing_layers
  add constraint video_drawing_layers_tool_check
  check (tool in ('freehand', 'arrow', 'circle', 'spotlight', 'text', 'freeze', 'zoom'));

commit;
