import pkg from 'pg'; const { Client } = pkg
const A = '11111111-1111-4111-8111-111111111111'
const RID = '99999999-9999-4999-8999-999999999999'
const db = process.argv[2]
const c = new Client({ host:'127.0.0.1', port:5433, user:'postgres', database: db })
await c.connect()
const { rows: t } = await c.query(`select data_type from information_schema.columns
  where table_name='favorites' and column_name='recipe_key'`)
console.log('  favorites.recipe_key type:', t[0].data_type)

await c.query(`insert into auth.users(id,email) values($1,'a@x.com') on conflict do nothing`, [A])
await c.query(`insert into public.user_recipes(id,user_id,name,category,ingredients,steps)
               values($1,$2,'Doomed','Dessert','[]','{}') on conflict (id) do nothing`, [RID, A])
try {
  const r = await c.query(`delete from public.user_recipes where id=$1`, [RID])
  console.log('  DELETE ok, rows:', r.rowCount)
} catch (e) {
  console.log(`  DELETE FAILED -> ${e.code}: ${e.message}`)
  if (e.where) console.log('  CONTEXT:', e.where.split('\n')[0])
  if (e.hint) console.log('  HINT:', e.hint)
}
await c.end()
