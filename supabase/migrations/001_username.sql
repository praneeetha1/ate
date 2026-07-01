-- Run this in Supabase SQL Editor

-- Add username_set flag and bio to existing profiles table
alter table public.profiles add column if not exists username_set boolean default false;
alter table public.profiles add column if not exists bio text;

-- Make username unique
alter table public.profiles drop constraint if exists profiles_username_key;
alter table public.profiles add constraint profiles_username_key unique (username);

-- Add format constraint (lowercase, letters/numbers/underscores, 3-20 chars)
alter table public.profiles drop constraint if exists username_format;
alter table public.profiles add constraint username_format
  check (username is null or username ~ '^[a-z0-9_]{3,20}$');

-- Allow anyone to view profiles (for social features)
drop policy if exists "Users can view own profile" on public.profiles;
create policy if not exists "Anyone can view profiles"
  on public.profiles for select using (true);
