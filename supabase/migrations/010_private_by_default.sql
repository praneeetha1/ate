-- ============================================================
-- 010: stop publishing saves, lists and list items
--
-- These four tables were readable by anyone whose profile wasn't marked
-- private, and `profiles.is_private` defaults to FALSE — so the default was
-- public. That was the right shape when the app had a friends feed and public
-- profile pages to read them. Migration 008 removed both, which took away the
-- UI for browsing other people's data but not the access: the anon key ships
-- in the client bundle, so anyone holding it could still read those tables
-- straight off the REST API.
--
-- Saved recipes, lists and list items are nobody's business but their owner's
-- now that there is nothing in the app that displays them to anyone else.
--
-- `user_recipes` deliberately KEEPS its public-read policy. Sharing a recipe
-- by link (`?u=<uuid>`) is the one remaining feature that depends on someone
-- else's client reading a row, and an unguessable uuid is the access control.
-- `is_private` still switches that off, which is why the column and
-- is_public_profile() both stay.
--
-- Idempotent — safe to re-run.
-- ============================================================

drop policy if exists "Public can view public favorites"   on public.favorites;
drop policy if exists "Public can view public lists"       on public.lists;
drop policy if exists "Public can view public list items"  on public.list_items;

-- The owner-only select policies these sat alongside are already in place
-- ("Users can manage own ..."), so dropping the public ones leaves each table
-- readable by its owner and nobody else. Asserted rather than assumed: a table
-- with RLS on and no surviving select policy is readable by no one at all,
-- including the owner, which would break the app silently.
do $$
declare t text;
begin
  foreach t in array array['favorites', 'lists', 'list_items'] loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = t
        and cmd in ('SELECT', 'ALL')
    ) then
      raise exception 'no select policy left on public.% — owner reads would break', t;
    end if;
  end loop;
end $$;
