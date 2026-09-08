import pkg from 'pg'
const { Client } = pkg
const ALICE = '11111111-1111-4111-8111-111111111111'
const BOB   = '22222222-2222-4222-8222-222222222222'
const RECIPE = 'u_99999999-9999-4999-8999-999999999999'

const c = new Client({ host: '127.0.0.1', port: 5433, user: 'postgres', database: 'beh_db' })
await c.connect()
await c.query(`grant usage on schema public to anon, authenticated;
               grant all on all tables in schema public to anon, authenticated;
               grant all on all sequences in schema public to anon, authenticated;`)

let pass = 0, fail = 0
const t = (label, ok, extra = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : '  ' + extra}`)
  ok ? pass++ : fail++
}
/** Runs a query as a signed-in user (or anon), with RLS enforced. */
async function as(uid, sql) {
  await c.query('begin')
  try {
    await c.query(`set local role ${uid ? 'authenticated' : 'anon'}`)
    if (uid) await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid])
    const r = await c.query(sql)
    await c.query('commit')
    return r
  } catch (e) { await c.query('rollback'); throw e }
}

console.log('— migration preserved the data —')
for (const [table, n] of [['favorites',2],['shopping_list',1],['notes',1],['lists',1],['list_items',1],['user_recipes',1]]) {
  const { rows } = await c.query(`select count(*)::int from public.${table}`)
  t(`${table} still has ${n} row(s)`, rows[0].count === n, `got ${rows[0].count}`)
}
{
  const { rows } = await c.query(`select recipe_key, recipe_name from public.ratings order by recipe_name`)
  t('name-keyed ratings became resolvable legacy: sentinels',
    rows.length === 2 && rows.every(r => r.recipe_key === 'legacy:' + r.recipe_name),
    JSON.stringify(rows))
}
{
  const { rows } = await c.query(`select type from public.activity`)
  t('the invalid activity row was purged', rows.length === 1 && rows[0].type === 'created', JSON.stringify(rows))
}

console.log('— activity.type is now constrained —')
try { await c.query(`insert into public.activity (user_id,type) values ('${ALICE}','nonsense')`); t('rejects an invalid type', false, 'insert succeeded') }
catch (e) { t('rejects an invalid type', e.code === '23514', e.code) }

console.log('— upsert ON CONFLICT resolves (the partial-index worry) —')
try {
  await c.query(`insert into public.ratings (user_id, recipe_key, rating) values ('${ALICE}','5',3)
                 on conflict (user_id, recipe_key) do update set rating = excluded.rating`)
  await c.query(`insert into public.ratings (user_id, recipe_key, rating) values ('${ALICE}','5',1)
                 on conflict (user_id, recipe_key) do update set rating = excluded.rating`)
  const { rows } = await c.query(`select rating from public.ratings where user_id='${ALICE}' and recipe_key='5'`)
  t('ratings upsert updates in place', rows.length === 1 && rows[0].rating === 1, JSON.stringify(rows))
} catch (e) { t('ratings upsert updates in place', false, `${e.code}: ${e.message}`) }

console.log('— privacy gating (Alice public) —')
t('bob sees alice’s recipes',  (await as(BOB,  `select * from public.user_recipes`)).rows.length === 1)
t('anon sees alice’s recipes', (await as(null, `select * from public.user_recipes`)).rows.length === 1)
t('bob sees alice’s lists',    (await as(BOB,  `select * from public.lists`)).rows.length === 1)
t('bob sees alice’s activity', (await as(BOB,  `select * from public.activity`)).rows.length === 1)

console.log('— notes and ratings stay private even when the profile is public —')
t('bob cannot read alice’s notes',   (await as(BOB, `select * from public.notes`)).rows.length === 0)
t('bob cannot read alice’s ratings', (await as(BOB, `select * from public.ratings`)).rows.length === 0)
t('alice can read her own notes',    (await as(ALICE, `select * from public.notes`)).rows.length === 1)

console.log('— flipping Alice to private —')
await as(ALICE, `update public.profiles set is_private = true where id = '${ALICE}'`)
t('the owner could set is_private', (await c.query(`select is_private from public.profiles where id='${ALICE}'`)).rows[0].is_private === true)
t('bob no longer sees her recipes',  (await as(BOB,  `select * from public.user_recipes`)).rows.length === 0)
t('anon no longer sees her recipes', (await as(null, `select * from public.user_recipes`)).rows.length === 0)
t('bob no longer sees her lists',    (await as(BOB,  `select * from public.lists`)).rows.length === 0)
t('bob no longer sees her list items',(await as(BOB, `select * from public.list_items`)).rows.length === 0)
t('bob no longer sees her activity', (await as(BOB,  `select * from public.activity`)).rows.length === 0)
t('bob no longer sees her favorites',(await as(BOB,  `select * from public.favorites`)).rows.length === 0)
t('alice still sees her own recipes',(await as(ALICE,`select * from public.user_recipes`)).rows.length === 1)

console.log('— bob cannot write to alice’s data —')
try { await as(BOB, `update public.profiles set is_private=false where id='${ALICE}'`)
      const { rows } = await c.query(`select is_private from public.profiles where id='${ALICE}'`)
      t('bob cannot un-private alice', rows[0].is_private === true) }
catch (e) { t('bob cannot un-private alice', true) }
try { await as(BOB, `insert into public.favorites (user_id,recipe_key) values ('${ALICE}','7')`); t('bob cannot favourite as alice', false, 'insert succeeded') }
catch (e) { t('bob cannot favourite as alice', e.code === '42501', e.code) }

console.log('— orphan cleanup on recipe delete —')
await c.query(`update public.profiles set is_private=false where id='${ALICE}'`)
await as(ALICE, `delete from public.user_recipes where id='99999999-9999-4999-8999-999999999999'`)
for (const table of ['favorites','shopping_list','list_items','activity','ratings','notes']) {
  const { rows } = await c.query(`select count(*)::int from public.${table} where recipe_key = '${RECIPE}'`)
  t(`${table} references removed`, rows[0].count === 0, `got ${rows[0].count}`)
}
{
  const { rows } = await c.query(`select count(*)::int from public.favorites where recipe_key='5'`)
  t('unrelated favourites untouched', rows[0].count === 1, `got ${rows[0].count}`)
}

console.log('— updated_at trigger —')
{
  await c.query(`insert into public.user_recipes (id,user_id,name,category,ingredients,steps)
                 values ('77777777-7777-4777-8777-777777777777','${ALICE}','X','Dessert','[]','{}')`)
  const before = (await c.query(`select updated_at from public.user_recipes where id='77777777-7777-4777-8777-777777777777'`)).rows[0].updated_at
  await new Promise(r => setTimeout(r, 20))
  await c.query(`update public.user_recipes set name='Y' where id='77777777-7777-4777-8777-777777777777'`)
  const after = (await c.query(`select updated_at from public.user_recipes where id='77777777-7777-4777-8777-777777777777'`)).rows[0].updated_at
  t('updated_at advances on update', after > before, `${before} -> ${after}`)
}

console.log('— length limits —')
try { await c.query(`update public.profiles set bio = repeat('x',301) where id='${ALICE}'`); t('bio over 300 chars rejected', false, 'accepted') }
catch (e) { t('bio over 300 chars rejected', e.code === '23514', e.code) }

await c.end()
console.log(`\n  ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
