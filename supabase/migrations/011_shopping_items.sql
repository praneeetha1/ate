-- ============================================================
-- 011: an item-keyed shopping list
--
-- The pantry was keyed by ingredient and the shopping list by *recipe*, so the
-- two halves of one question — what I have, what I don't — couldn't talk to
-- each other. There was nowhere to put "milk", no way to add a single
-- ingredient out of a recipe, and onions wanted by three recipes appeared
-- three times and had to be ticked three times.
--
-- Keyed by the same canonical name the pantry uses, so ticking something off
-- is a straight hand-over: bought -> have.
--
-- `sources` keeps the per-recipe contributions rather than summing them:
--   [{ "key": "12", "name": "Lemon Rice", "amount": "2", "unit": "cup" }, ...]
-- Summing would need cups converted to grams per ingredient, which is the
-- thing the notes deferred as "maybe never" — so the row shows "1 + 2" and
-- names both recipes instead of inventing a total. An empty array means you
-- added it by hand, which is also how removing a recipe knows to leave it.
--
-- The old `shopping_list` table is deliberately left in place. Expanding its
-- rows needs the recipe bodies, which live in the client bundle rather than
-- the database, so the conversion runs once on the client and this migration
-- has nothing to copy. Drop it by hand once you've seen your list survive.
--
-- Idempotent — safe to re-run.
-- ============================================================

create table if not exists public.shopping_items (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  -- canonicalItem() output — the pantry's vocabulary, so the two match
  item       text not null,
  -- shoppingName() output: what you'd actually look for in a shop
  display    text not null,
  sources    jsonb not null default '[]',
  checked    boolean not null default false,
  created_at timestamptz default now(),
  unique (user_id, item),
  constraint shopping_items_item_len    check (length(item) between 1 and 200),
  constraint shopping_items_display_len check (length(display) between 1 and 200),
  -- An object would break every consumer, which all assume a list.
  constraint shopping_items_sources_arr check (jsonb_typeof(sources) = 'array')
);

alter table public.shopping_items enable row level security;

-- Owner-only, like everything else after migration 010. Nothing in the app
-- shows one person's shopping list to anybody else.
drop policy if exists "Users can manage own shopping items" on public.shopping_items;
create policy "Users can manage own shopping items"
  on public.shopping_items for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists shopping_items_user_idx on public.shopping_items (user_id);
