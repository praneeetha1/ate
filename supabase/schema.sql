-- ============================================================
-- ate. — Supabase schema (current state, as of migration 006)
--
-- Run this ONCE in the SQL Editor of a fresh Supabase project. It already
-- includes every migration in supabase/migrations/, so you do not need to run
-- those as well.
--
-- For an EXISTING deployment, do NOT run this file — apply only the migrations
-- newer than what you already have.
-- ============================================================

-- Needs elevated rights; the trigram index below is skipped without it.
do $$
begin
  create extension if not exists pg_trgm;
exception when insufficient_privilege then
  raise notice 'skipping pg_trgm: username search will not be indexed';
end $$;

-- ── profiles ────────────────────────────────────────────────
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     text unique,
  username_set boolean default false,
  avatar_url   text,
  bio          text,
  -- When true, this user's recipes / saves / lists / activity are visible only
  -- to themselves. Public profile pages read through is_public_profile().
  is_private   boolean not null default false,
  created_at   timestamptz default now(),
  constraint username_format check (username is null or username ~ '^[a-z0-9_]{3,20}$'),
  constraint profiles_bio_len check (bio is null or length(bio) <= 300)
);

alter table public.profiles enable row level security;

drop policy if exists "Anyone can view profiles" on public.profiles;
create policy "Anyone can view profiles"
  on public.profiles for select
  using (true);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_trgm') then
    create index if not exists profiles_username_trgm
      on public.profiles using gin (username gin_trgm_ops);
  end if;
end $$;

-- Auto-create a profile row when a new user signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- username intentionally left NULL so UsernameModal prompts the user to choose
  -- one. Inserting a raw full_name / email prefix would violate username_format
  -- for any name containing spaces, capitals or periods, which would roll back
  -- the entire signup transaction.
  insert into public.profiles (id, avatar_url)
  values (new.id, new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Is this user's content publicly readable? SECURITY DEFINER so the policies
-- below can read profiles without recursing through profiles' own RLS.
create or replace function public.is_public_profile(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select not is_private from public.profiles where id = uid), false);
$$;

revoke all on function public.is_public_profile(uuid) from public;
grant execute on function public.is_public_profile(uuid) to anon, authenticated;


-- ── favorites ────────────────────────────────────────────────
-- recipe_key = catalog index as text ("5") OR "u_<uuid>" for a user recipe
create table if not exists public.favorites (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  recipe_key text not null,
  created_at timestamptz default now(),
  unique (user_id, recipe_key)
);

alter table public.favorites enable row level security;

drop policy if exists "Users can manage own favorites" on public.favorites;
create policy "Users can manage own favorites"
  on public.favorites for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Public can view public favorites" on public.favorites;
create policy "Public can view public favorites"
  on public.favorites for select
  using (auth.uid() = user_id or public.is_public_profile(user_id));

create index if not exists favorites_user_idx on public.favorites (user_id);


-- ── ratings ──────────────────────────────────────────────────
-- Keyed by recipe_key so a user recipe never collides with a catalog recipe of
-- the same name. recipe_name is retained for display only.
create table if not exists public.ratings (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  recipe_key  text not null,
  recipe_name text,
  rating      smallint not null check (rating between 1 and 5),
  created_at  timestamptz default now(),
  unique (user_id, recipe_key)
);

alter table public.ratings enable row level security;

create index if not exists ratings_user_idx on public.ratings (user_id);

drop policy if exists "Users can manage own ratings" on public.ratings;
create policy "Users can manage own ratings"
  on public.ratings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- ── notes ────────────────────────────────────────────────────
-- Private: no public read policy, unlike favorites/lists/activity.
create table if not exists public.notes (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  recipe_key  text not null,
  recipe_name text,
  body        text not null default '',
  updated_at  timestamptz default now(),
  unique (user_id, recipe_key)
);

alter table public.notes enable row level security;

create index if not exists notes_user_idx on public.notes (user_id);

drop policy if exists "Users can manage own notes" on public.notes;
create policy "Users can manage own notes"
  on public.notes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- ── shopping_list ────────────────────────────────────────────
create table if not exists public.shopping_list (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  recipe_key text not null,
  -- Indices of ingredients ticked off for this recipe, so checkbox state
  -- follows the user across devices.
  checked    integer[] not null default '{}',
  created_at timestamptz default now(),
  unique (user_id, recipe_key)
);

alter table public.shopping_list enable row level security;

drop policy if exists "Users can manage own shopping list" on public.shopping_list;
create policy "Users can manage own shopping list"
  on public.shopping_list for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists shopping_list_user_idx on public.shopping_list (user_id);


-- ── user_recipes ─────────────────────────────────────────────
create table if not exists public.user_recipes (
  id           uuid default gen_random_uuid() primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  category     text not null default 'My Recipes',
  dietary      text[] default '{}',
  ingredients  jsonb not null default '[]',
  steps        text[] not null default '{}',
  time_minutes integer,
  servings     integer,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),
  constraint user_recipes_name_len check (length(name) between 1 and 200)
);

alter table public.user_recipes enable row level security;

drop policy if exists "Users can manage own user_recipes" on public.user_recipes;
create policy "Users can manage own user_recipes"
  on public.user_recipes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Public can view public user_recipes" on public.user_recipes;
create policy "Public can view public user_recipes"
  on public.user_recipes for select
  using (auth.uid() = user_id or public.is_public_profile(user_id));

create index if not exists user_recipes_user_created
  on public.user_recipes (user_id, created_at desc);

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

-- recipe_key is plain text with no foreign key, so deleting a user recipe would
-- otherwise leave rows — belonging to any user — pointing at a recipe that no
-- longer exists.
create or replace function public.cleanup_user_recipe_refs()
returns trigger language plpgsql security definer set search_path = public as $$
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


-- ── lists ─────────────────────────────────────────────────────
create table if not exists public.lists (
  id         uuid default gen_random_uuid() primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  created_at timestamptz default now()
);

alter table public.lists enable row level security;

drop policy if exists "Users can manage own lists" on public.lists;
create policy "Users can manage own lists"
  on public.lists for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Public can view public lists" on public.lists;
create policy "Public can view public lists"
  on public.lists for select
  using (auth.uid() = user_id or public.is_public_profile(user_id));

create index if not exists lists_user_idx on public.lists (user_id);


-- ── list_items ────────────────────────────────────────────────
create table if not exists public.list_items (
  id         bigint generated always as identity primary key,
  list_id    uuid not null references public.lists(id) on delete cascade,
  recipe_key text not null,
  added_at   timestamptz default now(),
  unique (list_id, recipe_key)
);

alter table public.list_items enable row level security;

drop policy if exists "Users can manage own list items" on public.list_items;
create policy "Users can manage own list items"
  on public.list_items for all
  using (exists (
    select 1 from public.lists l
    where l.id = list_items.list_id and l.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.lists l
    where l.id = list_items.list_id and l.user_id = auth.uid()
  ));

drop policy if exists "Public can view public list items" on public.list_items;
create policy "Public can view public list items"
  on public.list_items for select
  using (exists (
    select 1 from public.lists l
    where l.id = list_items.list_id
      and (l.user_id = auth.uid() or public.is_public_profile(l.user_id))
  ));

create index if not exists list_items_list_idx on public.list_items (list_id);


-- ── follows ───────────────────────────────────────────────────
create table if not exists public.follows (
  follower_id  uuid not null references auth.users(id) on delete cascade,
  following_id uuid not null references auth.users(id) on delete cascade,
  created_at   timestamptz default now(),
  primary key (follower_id, following_id),
  check (follower_id != following_id)
);

alter table public.follows enable row level security;

drop policy if exists "Users can manage own follows" on public.follows;
create policy "Users can manage own follows"
  on public.follows for all
  using (auth.uid() = follower_id)
  with check (auth.uid() = follower_id);

drop policy if exists "Anyone can view follows" on public.follows;
create policy "Anyone can view follows"
  on public.follows for select using (true);

-- following_id is not the leading column of the PK, so follower-count queries
-- need their own index.
create index if not exists follows_following_id_idx on public.follows (following_id);


-- ── activity ──────────────────────────────────────────────────
create table if not exists public.activity (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  type        text not null,
  recipe_key  text,          -- catalog index as text, or "u_<uuid>"
  recipe_name text,
  list_name   text,
  rating      smallint,
  created_at  timestamptz default now(),
  constraint activity_type_valid check (type in ('saved', 'created', 'rated', 'listed')),
  constraint activity_recipe_name_len check (recipe_name is null or length(recipe_name) <= 200)
);

alter table public.activity enable row level security;

drop policy if exists "Users can insert own activity" on public.activity;
create policy "Users can insert own activity"
  on public.activity for insert
  with check (auth.uid() = user_id);

drop policy if exists "Public can view public activity" on public.activity;
create policy "Public can view public activity"
  on public.activity for select
  using (auth.uid() = user_id or public.is_public_profile(user_id));

drop policy if exists "Users can delete own activity" on public.activity;
create policy "Users can delete own activity"
  on public.activity for delete
  using (auth.uid() = user_id);

create index if not exists activity_user_created
  on public.activity (user_id, created_at desc);

-- The Friends feed subscribes to postgres_changes on this table.
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
