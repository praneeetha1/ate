-- ============================================================
-- 005: allow user-recipe keys ("u_<uuid>") in favorites/shopping_list,
-- and index follows.following_id for follower-count/lookup queries.
-- ============================================================

-- favorites/shopping_list.recipe_key were integer-only (catalog index),
-- so favoriting or shopping-listing a user-created recipe ("u_<uuid>")
-- silently failed to persist. Widen to text, matching list_items.recipe_key.
alter table public.favorites
  alter column recipe_key type text using recipe_key::text;

alter table public.shopping_list
  alter column recipe_key type text using recipe_key::text;

-- follower-count / "who follows this user" queries filter on following_id,
-- which isn't the leading column of the existing composite PK (follower_id, following_id).
create index if not exists follows_following_id_idx
  on public.follows (following_id);
