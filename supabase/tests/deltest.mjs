import pkg from 'pg'; const { Client } = pkg
import { readFileSync } from 'fs'
const ALICE = '11111111-1111-4111-8111-111111111111'
const RID   = '99999999-9999-4999-8999-999999999999'
const KEY   = 'u_' + RID
const R = '/Users/praneetha.rao/Documents/personal/ate'

const c = new Client({ host:'127.0.0.1', port:5433, user:'postgres', database:'sb_db' })
await c.connect()
await c.query('set role sb_owner')
try { await c.query(readFileSync(`${R}/supabase/migrations/006_hardening.sql`,'utf8'))
      console.log('  ok    006 applied as NON-superuser sb_owner') }
catch(e){ console.log('  FAIL  006:', e.code, e.message); process.exit(1) }
await c.query('reset role')

await c.query('grant usage on schema public to anon, authenticated')
await c.query('grant all on all tables in schema public to anon, authenticated')
await c.query('grant all on all sequences in schema public to anon, authenticated')
await c.query(`insert into auth.users(id,email) values($1,'a@x.com') on conflict do nothing`, [ALICE])
await c.query(`update public.profiles set username='alice', username_set=true where id=$1`, [ALICE])
await c.query(`insert into public.user_recipes(id,user_id,name,category,ingredients,steps)
               values($1,$2,'Doomed','Dessert','[]','{}') on conflict (id) do nothing`, [RID, ALICE])
await c.query(`insert into public.favorites(user_id,recipe_key) values($1,$2)`, [ALICE, KEY])
await c.query(`insert into public.activity(user_id,type,recipe_key) values($1,'created',$2)`, [ALICE, KEY])
await c.query(`insert into public.ratings(user_id,recipe_key,rating) values($1,$2,5)`, [ALICE, KEY])

await c.query('begin')
await c.query('set local role authenticated')
await c.query(`select set_config('request.jwt.claim.sub',$1,true)`, [ALICE])
try {
  const r = await c.query(`delete from public.user_recipes where id=$1 and user_id=$2`, [RID, ALICE])
  await c.query('commit')
  console.log('  PASS  DELETE succeeded as authenticated, rows:', r.rowCount)
} catch (e) {
  await c.query('rollback')
  console.log('  FAIL  DELETE ->', e.code, e.message)
  if (e.hint) console.log('        HINT:', e.hint)
}
for (const t of ['favorites','activity','ratings']) {
  const { rows } = await c.query(`select count(*)::int from public.${t} where recipe_key=$1`, [KEY])
  console.log(`  ${rows[0].count === 0 ? 'PASS' : 'FAIL'}  ${t} orphans cleaned (${rows[0].count} left)`)
}
await c.end()
