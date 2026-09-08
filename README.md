# ate. 🍳

A cozy, vintage-style recipe app — browse a 300-recipe catalog, cook from your
own recipes, and follow what your friends are making.

**Built with:** Vite + React 18 + React Router (hash routing) + Tailwind CSS,
with Supabase for auth, Postgres storage and realtime. Installable as a PWA.
Deployed to GitHub Pages at `/ate/`.

**Live site:** https://praneeetha1.github.io/ate

## Features

- 300-recipe catalog across 12 categories, filterable by diet and cook time
- Search by recipe name, or by "what can I make?" from ingredients you have
- Create, edit and delete your own recipes
- Favourites, custom lists, per-recipe ratings and notes, and a shopping list
- Follow other cooks and see their activity in a live feed
- Public profiles at `/user/:username` with an optional private mode
- Works offline; local data syncs up the next time you log in

## Local development

```bash
npm install
npm run dev      # http://localhost:5173/ate/
npm run build
npm run lint
```

### Environment

Create a `.env.local` with your Supabase project credentials:

```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

Both are required — the app renders a setup message instead of booting if
either is missing. The same values are supplied to CI as repository secrets.

## Database

`supabase/schema.sql` is the **current** schema and is what you should run
against a fresh Supabase project — it already reflects every migration.

`supabase/migrations/*.sql` is the historical, ordered upgrade path for an
existing project. Run only the ones newer than your deployment. They are
idempotent and safe to re-run.

## Data pipeline

`scripts/clean_recipes.py` normalises a scraped `recipes_raw.json` (not
committed) into `src/data/recipes.json`. It is not part of the app build.
