-- ============================================================
-- 006: privacy controls, key normalisation, integrity + realtime
--
-- Idempotent — safe to re-run.
-- ============================================================

-- ── 1. profile privacy switch ────────────────────────────────
-- 004 made user_recipes / favorites / lists / list_items world-readable
-- unconditionally, with no way to opt out. Gate every public read on the
-- owner's profile instead, so a user can hide their content.
alter table public.profiles add column if not exists is_private boolean not null default false;

-- Length limits: these columns were unbounded text.
alter table public.profiles drop constraint if exists profiles_bio_len;
alter table public.profiles add constraint profiles_bio_len
  check (bio is null or length(bio) <= 300);

-- Helper: is this user's content publicly readable?
-- SECURITY DEFINER so the policies below can read profiles without recursing
-- through profiles' own RLS.
create or replace function public.is_public_profile(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select not is_private from public.profiles where id = uid), false);
$$;

revoke all on function public.is_public_profile(uuid) from public;
grant execute on function public.is_public_profile(uuid) to anon, authenticated;

-- Rewrite the 004 blanket-read policies to respect is_private.
drop policy if exists "Anyone can view user_recipes" on public.user_recipes;
drop policy if exists "Public can view public user_recipes" on public.user_recipes;
create policy "Public can view public user_recipes"
  on public.user_recipes for select
  using (auth.uid() = user_id or public.is_public_profile(user_id));

drop policy if exists "Anyone can view favorites" on public.favorites;
drop policy if exists "Public can view public favorites" on public.favorites;
create policy "Public can view public favorites"
  on public.favorites for select
  using (auth.uid() = user_id or public.is_public_profile(user_id));

drop policy if exists "Anyone can view lists" on public.lists;
drop policy if exists "Public can view public lists" on public.lists;
create policy "Public can view public lists"
  on public.lists for select
  using (auth.uid() = user_id or public.is_public_profile(user_id));

drop policy if exists "Anyone can view list items" on public.list_items;
drop policy if exists "Public can view public list items" on public.list_items;
create policy "Public can view public list items"
  on public.list_items for select
  using (exists (
    select 1 from public.lists l
    where l.id = list_items.list_id
      and (l.user_id = auth.uid() or public.is_public_profile(l.user_id))
  ));

drop policy if exists "Anyone can view activity" on public.activity;
drop policy if exists "Public can view public activity" on public.activity;
create policy "Public can view public activity"
  on public.activity for select
  using (auth.uid() = user_id or public.is_public_profile(user_id));


-- ── 2. constrain activity.type ───────────────────────────────
-- `type` was free text, so any authenticated client could insert arbitrary
-- strings that then render into other users' feeds.
delete from public.activity where type not in ('saved', 'created', 'rated', 'listed');

alter table public.activity drop constraint if exists activity_type_valid;
alter table public.activity add constraint activity_type_valid
  check (type in ('saved', 'created', 'rated', 'listed'));

alter table public.activity drop constraint if exists activity_recipe_name_len;
alter table public.activity add constraint activity_recipe_name_len
  check (recipe_name is null or length(recipe_name) <= 200);


-- ── 3. key ratings and notes by recipe_key, not recipe_name ──
-- recipe_name collides between a user's own recipe and a catalog recipe of the
-- same name. recipe_key ("5" or "u_<uuid>") is what every other table uses.
-- recipe_name is kept as a nullable display/legacy column; the client backfills
-- recipe_key for pre-existing rows on its next sync.
alter table public.ratings add column if not exists recipe_key text;
alter table public.notes   add column if not exists recipe_key text;

-- Existing rows get a resolvable sentinel rather than NULL. This keeps
-- recipe_key NOT NULL, which in turn allows a real unique CONSTRAINT — a
-- partial unique index would not be reliably inferable by the ON CONFLICT
-- clause that upsert() generates. The client rewrites 'legacy:<name>' to the
-- true key on its next sync, resolving the name against the recipe catalog.
update public.ratings set recipe_key = 'legacy:' || recipe_name where recipe_key is null;
update public.notes   set recipe_key = 'legacy:' || recipe_name where recipe_key is null;

-- Any row that somehow had a null name can't be attributed to a recipe at all.
delete from public.ratings where recipe_key is null;
delete from public.notes   where recipe_key is null;

alter table public.ratings alter column recipe_key set not null;
alter table public.notes   alter column recipe_key set not null;

-- Swap name-based uniqueness for key-based.
alter table public.ratings drop constraint if exists ratings_user_id_recipe_name_key;
alter table public.notes   drop constraint if exists notes_user_id_recipe_name_key;

alter table public.ratings drop constraint if exists ratings_user_recipe_key;
alter table public.ratings add constraint ratings_user_recipe_key unique (user_id, recipe_key);
alter table public.notes drop constraint if exists notes_user_recipe_key;
alter table public.notes add constraint notes_user_recipe_key unique (user_id, recipe_key);

-- recipe_name is now display-only, so it no longer needs to be present.
alter table public.ratings alter column recipe_name drop not null;
alter table public.notes   alter column recipe_name drop not null;


-- ── 4. persist shopping-list checkbox state ──────────────────
-- Checked ingredients lived only in localStorage, so they didn't follow the
-- user across devices like every other slice of state.
alter table public.shopping_list add column if not exists checked integer[] not null default '{}';


-- ── 5. clean up rows orphaned by a deleted user recipe ───────
-- recipe_key is plain text with no foreign key, so deleting a user_recipes row
-- left favorites / shopping_list / list_items / activity rows — belonging to
-- *any* user — pointing at a recipe that no longer exists.
create or replace function public.cleanup_user_recipe_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  key text := 'u_' || old.id::text;
begin
  delete from public.favorites     where recipe_key = key;
  delete from public.shopping_list where recipe_key = key;
  delete from public.list_items    where recipe_key = key;
  delete from public.activity      where recipe_key = key;
  delete from public.ratings       where recipe_key = key;
  delete from public.notes         where recipe_key = key;
  return old;
end;
$$;

drop trigger if exists on_user_recipe_deleted on public.user_recipes;
create trigger on_user_recipe_deleted
  after delete on public.user_recipes
  for each row execute procedure public.cleanup_user_recipe_refs();


-- ── 6. keep user_recipes.updated_at fresh ────────────────────
-- Recipes are now editable, so track when they last changed.
alter table public.user_recipes add column if not exists updated_at timestamptz default now();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists on_user_recipe_updated on public.user_recipes;
create trigger on_user_recipe_updated
  before update on public.user_recipes
  for each row execute procedure public.touch_updated_at();

alter table public.user_recipes drop constraint if exists user_recipes_name_len;
alter table public.user_recipes add constraint user_recipes_name_len
  check (length(name) between 1 and 200);


-- ── 7. indexes for the queries the app actually runs ─────────
create index if not exists user_recipes_user_created
  on public.user_recipes (user_id, created_at desc);
create index if not exists favorites_user_idx      on public.favorites (user_id);
create index if not exists shopping_list_user_idx  on public.shopping_list (user_id);
create index if not exists lists_user_idx          on public.lists (user_id);
create index if not exists list_items_list_idx     on public.list_items (list_id);
create index if not exists ratings_user_idx        on public.ratings (user_id);
create index if not exists notes_user_idx          on public.notes (user_id);
-- Username search uses ilike '%q%'; a trigram index keeps it from scanning the
-- whole table. Creating an extension needs elevated rights, so this degrades to
-- a notice rather than aborting the migration for a role that lacks them — the
-- search still works, just without the index.
do $$
begin
  create extension if not exists pg_trgm;
exception when insufficient_privilege then
  raise notice 'skipping pg_trgm: insufficient privilege; username search will not be indexed';
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_trgm') then
    create index if not exists profiles_username_trgm
      on public.profiles using gin (username gin_trgm_ops);
  end if;
end $$;


-- ── 8. enable realtime on activity ───────────────────────────
-- The Friends feed subscribes to postgres_changes on this table, but nothing
-- had ever added it to the realtime publication, so the live feed never fired.
-- Adding to a publication requires owning it, and on some projects that is a
-- role you are not. Degrade to a notice rather than aborting the whole
-- migration: everything else here matters more than the live feed, which can be
-- enabled from the dashboard (Database -> Replication) instead.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'supabase_realtime publication not found; skipping realtime for activity';
  elsif not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'activity'
  ) then
    alter publication supabase_realtime add table public.activity;
  end if;
exception when insufficient_privilege then
  raise notice 'insufficient privilege to add activity to supabase_realtime; enable it from the dashboard (Database -> Replication)';
end $$;
