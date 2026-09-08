import pkg from 'pg'
const { Client } = pkg
const db = process.argv[2]
const c = new Client({ host: '127.0.0.1', port: 5433, user: 'postgres', database: db })
await c.connect()

let pass = 0, fail = 0
const check = async (label, sql, expect) => {
  const { rows } = await c.query(sql)
  const got = rows[0] ? Object.values(rows[0])[0] : null
  const ok = String(got) === String(expect)
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  (expected ${expect}, got ${got})`}`)
  ok ? pass++ : fail++
}

const col = (t, col) => `select count(*) from information_schema.columns where table_name='${t}' and column_name='${col}'`
const nn  = (t, col) => `select is_nullable from information_schema.columns where table_name='${t}' and column_name='${col}'`

console.log('— columns the client code depends on —')
await check('profiles.is_private exists',       col('profiles','is_private'), 1)
await check('ratings.recipe_key exists',        col('ratings','recipe_key'), 1)
await check('ratings.recipe_key is NOT NULL',   nn('ratings','recipe_key'), 'NO')
await check('ratings.recipe_name now nullable', nn('ratings','recipe_name'), 'YES')
await check('notes.recipe_key exists',          col('notes','recipe_key'), 1)
await check('shopping_list.checked exists',     col('shopping_list','checked'), 1)
await check('user_recipes.updated_at exists',   col('user_recipes','updated_at'), 1)
await check('favorites.recipe_key is text',
  `select data_type from information_schema.columns where table_name='favorites' and column_name='recipe_key'`, 'text')

console.log('— constraints upsert() infers ON CONFLICT from —')
const uniq = (t, cols) => `select count(*) from pg_constraint con join pg_class rel on rel.oid=con.conrelid
  where rel.relname='${t}' and con.contype='u'
  and (select array_agg(att.attname::text order by att.attname) from unnest(con.conkey) k
       join pg_attribute att on att.attrelid=con.conrelid and att.attnum=k) = '{${cols}}'::text[]`
await check('ratings unique(user_id,recipe_key)',       uniq('ratings','recipe_key,user_id'), 1)
await check('notes unique(user_id,recipe_key)',         uniq('notes','recipe_key,user_id'), 1)
await check('favorites unique(user_id,recipe_key)',     uniq('favorites','recipe_key,user_id'), 1)
await check('shopping_list unique(user_id,recipe_key)', uniq('shopping_list','recipe_key,user_id'), 1)
await check('list_items unique(list_id,recipe_key)',    uniq('list_items','list_id,recipe_key'), 1)

console.log('— triggers, checks, realtime —')
await check('on_user_recipe_deleted trigger', `select count(*) from pg_trigger where tgname='on_user_recipe_deleted'`, 1)
await check('on_user_recipe_updated trigger', `select count(*) from pg_trigger where tgname='on_user_recipe_updated'`, 1)
await check('activity_type_valid check',      `select count(*) from pg_constraint where conname='activity_type_valid'`, 1)
await check('activity in supabase_realtime',
  `select count(*) from pg_publication_tables where pubname='supabase_realtime' and tablename='activity'`, 1)
await check('follows.following_id index',     `select count(*) from pg_indexes where indexname='follows_following_id_idx'`, 1)
await check('profiles username trigram index',`select count(*) from pg_indexes where indexname='profiles_username_trgm'`, 1)

console.log('— RLS is enabled on every table —')
for (const t of ['profiles','favorites','ratings','notes','shopping_list','user_recipes','lists','list_items','follows','activity']) {
  await check(`rls on ${t}`, `select relrowsecurity from pg_class where relname='${t}'`, true)
}

await c.end()
console.log(`\n  ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
