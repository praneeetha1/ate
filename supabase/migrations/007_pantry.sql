-- ============================================================
-- 007: pantry
--
-- Idempotent — safe to re-run.
-- ============================================================

-- ── pantry ───────────────────────────────────────────────────
-- One row per (user, ingredient), and only for ingredients the user has
-- actually answered for. Absence of a row means "unknown", which the client
-- reports as `have` for a staple (salt, oil, flour…) and as unknown otherwise
-- — so a full kitchen needs almost no rows.
--
-- `item` holds the output of canonicalItem() in src/utils/ingredients.js, not
-- the recipe's raw ingredient text: "Kosher salt", "coarse salt" and "salt,
-- to taste" all reduce to 'salt' so they share one pantry entry.
--
-- No quantity column, on purpose. 26% of catalog ingredient lines have no unit
-- at all, cross-unit conversion needs a per-ingredient density, and real
-- depletion is unknowable without the user re-measuring after every meal.
create table if not exists public.pantry (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  item       text not null,
  state      text not null check (state in ('have', 'low', 'out')),
  updated_at timestamptz default now(),
  unique (user_id, item),
  constraint pantry_item_len check (length(item) between 1 and 200)
);

alter table public.pantry enable row level security;

-- Unlike favorites and lists, a pantry has no public-view policy: what's in
-- someone's kitchen isn't part of their public profile, so there is no
-- is_public_profile() branch here by design.
drop policy if exists "Users can manage own pantry" on public.pantry;
create policy "Users can manage own pantry"
  on public.pantry for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists pantry_user_idx on public.pantry (user_id);
