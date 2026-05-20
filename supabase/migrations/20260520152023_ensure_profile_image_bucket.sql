insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'footballscience-profile-images',
  'footballscience-profile-images',
  true,
  1048576,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
