-- ============================================================
-- 009: photos and provenance on user recipes
--
-- A recipe app is browsed by eye, and until now nothing in the catalog had a
-- photo at all — every card looked identical, so nothing could look worth
-- cooking. `image_url` fixes that for recipes you add.
--
-- A URL rather than a stored file, deliberately. An imported recipe's photo
-- already lives on the publisher's server: pointing at it costs no storage,
-- needs no bucket, and leaves the image where its owner put it rather than
-- copying it. Your own photos can move to Supabase Storage later — that only
-- changes what the URL points at, not this column.
--
-- `source_url` is where an imported recipe came from. Kept for the same reason
-- the Wikibooks rows carry one: so a recipe can always be traced back.
--
-- Idempotent — safe to re-run.
-- ============================================================

alter table public.user_recipes add column if not exists image_url  text;
alter table public.user_recipes add column if not exists source_url text;

-- Length caps rather than format validation: a wrong URL is the user's to fix
-- and shows as a broken image, but an unbounded text column is a way to put a
-- megabyte of data URI in a row that everything else then has to read.
do $$
begin
  alter table public.user_recipes
    add constraint user_recipes_image_url_len check (image_url is null or length(image_url) <= 2000);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.user_recipes
    add constraint user_recipes_source_url_len check (source_url is null or length(source_url) <= 2000);
exception when duplicate_object then null;
end $$;
