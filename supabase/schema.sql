-- ============================================================
-- ate. — Supabase schema
-- Run this in the Supabase SQL Editor (one-shot)
-- ============================================================

-- ── profiles ────────────────────────────────────────────────
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     text unique,
  username_set boolean default false,
  avatar_url   text,
  bio          text,
  created_at   timestamptz default now(),
  constraint username_format check (username ~ '^[a-z0-9_]{3,20}$')
);

alter table public.profiles enable row level security;

-- Anyone can view profiles (needed for social features)
create policy "Anyone can view profiles"
  on public.profiles for select
  using (true);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Auto-create profile row when a new user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ── favorites ────────────────────────────────────────────────
-- recipe_key = recipe index (integer) matching the JSON array position
create table if not exists public.favorites (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  recipe_key integer not null,
  created_at timestamptz default now(),
  unique (user_id, recipe_key)
);

alter table public.favorites enable row level security;

create policy "Users can manage own favorites"
  on public.favorites for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- ── ratings ──────────────────────────────────────────────────
-- recipe_name used as stable key (name doesn't change)
create table if not exists public.ratings (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  recipe_name text not null,
  rating      smallint not null check (rating between 1 and 5),
  created_at  timestamptz default now(),
  unique (user_id, recipe_name)
);

alter table public.ratings enable row level security;

create policy "Users can manage own ratings"
  on public.ratings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- ── notes ────────────────────────────────────────────────────
create table if not exists public.notes (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  recipe_name text not null,
  body        text not null default '',
  updated_at  timestamptz default now(),
  unique (user_id, recipe_name)
);

alter table public.notes enable row level security;

create policy "Users can manage own notes"
  on public.notes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- ── shopping_list ────────────────────────────────────────────
create table if not exists public.shopping_list (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  recipe_key integer not null,
  created_at timestamptz default now(),
  unique (user_id, recipe_key)
);

alter table public.shopping_list enable row level security;

create policy "Users can manage own shopping list"
  on public.shopping_list for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


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
  created_at   timestamptz default now()
);

alter table public.user_recipes enable row level security;

create policy "Users can manage own user_recipes"
  on public.user_recipes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- ── lists ─────────────────────────────────────────────────────
create table if not exists public.lists (
  id         uuid default gen_random_uuid() primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  created_at timestamptz default now()
);

alter table public.lists enable row level security;

create policy "Users can manage own lists"
  on public.lists for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- ── list_items ────────────────────────────────────────────────
-- recipe_key: catalog index as string ("5") OR "u_<uuid>" for user recipes
create table if not exists public.list_items (
  id         bigint generated always as identity primary key,
  list_id    uuid not null references public.lists(id) on delete cascade,
  recipe_key text not null,
  added_at   timestamptz default now(),
  unique (list_id, recipe_key)
);

alter table public.list_items enable row level security;

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
