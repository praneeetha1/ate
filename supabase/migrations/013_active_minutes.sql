-- ============================================================
-- 013: hands-on time, separate from total time
--
-- `time_minutes` is the whole wait from start to plate, which for a dal that
-- soaks overnight is eight hours — true, and useless for deciding whether you
-- can make it tonight. `active_minutes` is the part you're actually at the
-- stove; the UI shows "20 min active + 7 h 40 min wait" when both are set.
--
-- Nullable: most recipes never say, and absent means "not split".
-- Idempotent — safe to re-run.
-- ============================================================

alter table public.user_recipes
  add column if not exists active_minutes integer;

alter table public.user_recipes
  drop constraint if exists user_recipes_active_minutes_check;
alter table public.user_recipes
  add constraint user_recipes_active_minutes_check
  check (active_minutes is null or (active_minutes > 0 and (time_minutes is null or active_minutes <= time_minutes)));
