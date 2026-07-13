create index if not exists chat_action_items_team_fk_idx
  on public.chat_action_items (team_id)
  where team_id is not null;

create index if not exists chat_action_items_created_by_fk_idx
  on public.chat_action_items (created_by)
  where created_by is not null;

create index if not exists chat_action_items_completed_by_fk_idx
  on public.chat_action_items (completed_by)
  where completed_by is not null;
