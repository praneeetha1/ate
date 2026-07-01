-- Run this in Supabase SQL Editor

-- ── follows ───────────────────────────────────────────────────
create table if not exists public.follows (
  follower_id  uuid not null references auth.users(id) on delete cascade,
  following_id uuid not null references auth.users(id) on delete cascade,
  created_at   timestamptz default now(),
  primary key (follower_id, following_id),
  check (follower_id != following_id)
);

alter table public.follows enable row level security;

create policy "Users can manage own follows"
  on public.follows for all
  using (auth.uid() = follower_id)
  with check (auth.uid() = follower_id);

create policy "Anyone can view follows"
  on public.follows for select using (true);

-- ── activity ──────────────────────────────────────────────────
create table if not exists public.activity (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  type        text not null, -- 'saved', 'created', 'rated', 'listed'
  recipe_key  text,          -- catalog index as string or 'u_uuid'
  recipe_name text,
  list_name   text,
  rating      smallint,
  created_at  timestamptz default now()
);

alter table public.activity enable row level security;

create policy "Users can insert own activity"
  on public.activity for insert
  with check (auth.uid() = user_id);

create policy "Anyone can view activity"
  on public.activity for select using (true);

create policy "Users can delete own activity"
  on public.activity for delete
  using (auth.uid() = user_id);

-- Index for fast feed queries
create index if not exists activity_user_created
  on public.activity (user_id, created_at desc);
