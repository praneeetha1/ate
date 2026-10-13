-- ============================================================
-- 014: a photo per step
--
-- Imported recipes keep the photo a site published for each step, so the
-- method reads like the page did. Stored as a JSON array in step order, the
-- same length as `steps`, with null for a step that has no photo. Linked, not
-- copied — the same rule as image_url (migration 009).
--
-- Idempotent — safe to re-run.
-- ============================================================

alter table public.user_recipes
  add column if not exists step_images jsonb;

alter table public.user_recipes
  drop constraint if exists user_recipes_step_images_check;
alter table public.user_recipes
  add constraint user_recipes_step_images_check
  check (step_images is null or (jsonb_typeof(step_images) = 'array' and jsonb_array_length(step_images) <= 100));
