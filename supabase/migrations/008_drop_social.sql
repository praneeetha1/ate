-- ============================================================
-- 008: drop the social feature
--
-- ate is a single-cook app now. The follow graph and the activity feed are
-- gone from the client, so the tables behind them go too — along with the
-- realtime publication entry that existed only to drive the friends feed.
--
-- `profiles` deliberately stays. It holds the bio, the avatar and the privacy
-- flag, and AuthContext creates a row on first sign-in, so it is not social
-- infrastructure. `profiles.username` also stays: existing accounts still
-- display theirs, it just can no longer be changed now that the prompt is
-- gone.
--
-- DESTRUCTIVE. Dropping these tables discards every follow relationship and
-- every feed event permanently. There is no undo. Take a backup first if
-- there is any chance you want the social feature back.
--
-- Idempotent — safe to re-run.
-- ============================================================

-- ── 1. stop replicating activity ─────────────────────────────
-- Mirrors the guard 006 used to add it: altering a publication requires
-- owning it, and on some projects that is a role you are not. Degrade to a
-- notice rather than aborting, since the drop below is what actually matters
-- — and dropping the table removes it from the publication regardless.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'supabase_realtime publication not found; nothing to remove';
  elsif exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'activity'
  ) then
    alter publication supabase_realtime drop table public.activity;
  end if;
exception when insufficient_privilege then
  raise notice 'insufficient privilege to alter supabase_realtime; the table drop below will remove it anyway';
end $$;

-- ── 2. drop the tables ───────────────────────────────────────
-- Their RLS policies, indexes and constraints go with them, so there is
-- nothing to drop separately. `follows` has no dependents; `activity` is
-- referenced only by the client code removed alongside this migration.
drop table if exists public.activity;
drop table if exists public.follows;

-- ── 3. the trigger that cleans up after a deleted user recipe ─────
-- It deleted matching rows from favorites, shopping_list, list_items,
-- activity, ratings and notes. `activity` no longer exists, and plpgsql
-- resolves table names when the body runs rather than when it is defined —
-- so leaving this alone would not fail now, it would fail the next time
-- somebody deleted one of their own recipes. Redefined without that line.
--
-- Same name and signature, so the existing on_user_recipe_deleted trigger
-- keeps pointing at it and does not need recreating.
create or replace function public.cleanup_user_recipe_refs()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  key text := 'u_' || old.id::text;
begin
  delete from public.favorites     where recipe_key = key;
  delete from public.shopping_list where recipe_key = key;
  delete from public.list_items    where recipe_key = key;
  delete from public.ratings       where recipe_key = key;
  delete from public.notes         where recipe_key = key;
  return old;
end;
$$;
