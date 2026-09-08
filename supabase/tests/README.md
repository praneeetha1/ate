# Schema verification

These scripts exercise `supabase/schema.sql` and `supabase/migrations/*` against a
real PostgreSQL instance, because a passing client test suite only proves the
app matches the schema it *expects* — not that the migration applies cleanly to
what's actually deployed.

`supabase_stub.sql` provides the pieces of Supabase the schema leans on: an
`auth.users` table, `auth.uid()`, the `anon` / `authenticated` roles and the
`supabase_realtime` publication.

## Running

Needs Postgres 16 with `pg_trgm` and `pgcrypto`, plus `npm i pg`.

```bash
# 1. reproduce the deployed schema, then migrate it
node run.mjs mydb supabase_stub.sql <original schema.sql> \
  ../migrations/001_username.sql ../migrations/002_social.sql \
  ../migrations/003_fix_trigger.sql ../migrations/004_public_content.sql \
  ../migrations/005_text_recipe_keys_and_index.sql \
  ../migrations/006_hardening.sql

# 2. assert the resulting shape is what the client expects
node verify.mjs mydb

# 3. seed pre-006 data, migrate, then assert behaviour (RLS, triggers, upserts)
node run.mjs mydb seed_pre006.sql ../migrations/006_hardening.sql
node behaviour.mjs
```

`verify.mjs` checks columns, unique constraints (the ones `upsert()` infers
`ON CONFLICT` from), triggers, the realtime publication and that RLS is enabled
everywhere. `behaviour.mjs` checks data survives the migration, privacy gating
actually hides content from other users and from `anon`, notes/ratings stay
private regardless, orphan cleanup fires, and the length limits bite.
