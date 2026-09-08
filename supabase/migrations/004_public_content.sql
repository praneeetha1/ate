-- SUPERSEDED BY 006: these blanket `using (true)` read policies are replaced
-- there by ones gated on profiles.is_private. If you are setting up from
-- scratch, run supabase/schema.sql instead of this migration chain.

-- Allow anyone to view user_recipes, favorites, lists, and list_items so public
-- profile pages (UserProfile) can show another user's recipes, saved recipes, and lists.
-- Write operations (insert/update/delete) remain owner-only via the existing policies.

-- user_recipes: public read
drop policy if exists "Anyone can view user_recipes" on public.user_recipes;
create policy "Anyone can view user_recipes"
  on public.user_recipes for select using (true);

-- favorites: public read (activity feed already exposes save events publicly)
drop policy if exists "Anyone can view favorites" on public.favorites;
create policy "Anyone can view favorites"
  on public.favorites for select using (true);

-- lists: public read
drop policy if exists "Anyone can view lists" on public.lists;
create policy "Anyone can view lists"
  on public.lists for select using (true);

-- list_items: the existing policy is `for all` (which includes select).
-- Adding an explicit select policy so non-owners can read items in any public list.
drop policy if exists "Anyone can view list items" on public.list_items;
create policy "Anyone can view list items"
  on public.list_items for select using (true);
