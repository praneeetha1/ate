-- ============================================================
-- 012: somewhere to put your own recipe photos
--
-- Migration 009 added `user_recipes.image_url` and imported recipes fill it
-- with a link to the publisher's picture — costing no storage and leaving the
-- image where its owner put it. That works for imports and does nothing for a
-- photo of the dish you actually cooked, which has to live somewhere.
--
-- A public bucket, because the column holds a plain URL that <img> loads
-- directly. Signed URLs would mean re-signing every photo on every render and
-- would break the shared recipe card, which is fetched by whoever you sent it
-- to. The path is unguessable (a uuid under your own user id), and nothing
-- here is sensitive — it is a picture of dinner.
--
-- Writes are owner-only: the first path segment must be your user id, so one
-- cook can never upload into, overwrite, or delete another's folder.
--
-- Idempotent — safe to re-run.
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recipe-photos', 'recipe-photos', true,
  5242880,                                        -- 5 MB; the client sends ~200 kB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Anyone can look. The URL is in the recipe row, and a shared recipe card is
-- opened by people who have no account here.
drop policy if exists "Recipe photos are publicly readable" on storage.objects;
create policy "Recipe photos are publicly readable"
  on storage.objects for select
  using (bucket_id = 'recipe-photos');

-- …but only into your own folder. storage.foldername() splits the object path,
-- so [1] is the first segment, which the client sets to the uploader's id.
drop policy if exists "Cooks upload their own recipe photos" on storage.objects;
create policy "Cooks upload their own recipe photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'recipe-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Cooks replace their own recipe photos" on storage.objects;
create policy "Cooks replace their own recipe photos"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'recipe-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Cooks delete their own recipe photos" on storage.objects;
create policy "Cooks delete their own recipe photos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'recipe-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
