import pkg from 'pg'
const { Client } = pkg
import { readFileSync } from 'fs'

const [db, ...files] = process.argv.slice(2)

const c = new Client({ host: '127.0.0.1', port: 5433, user: 'postgres', database: db })
await c.connect()

let failed = false
for (const f of files) {
  const sql = readFileSync(f, 'utf8')
  const label = f.split('/').pop()
  try {
    await c.query(sql)
    console.log(`  ok    ${label}`)
  } catch (e) {
    failed = true
    console.log(`  FAIL  ${label}`)
    console.log(`        ${e.severity || 'ERROR'} ${e.code || ''}: ${e.message}`)
    if (e.hint)   console.log(`        HINT: ${e.hint}`)
    if (e.detail) console.log(`        DETAIL: ${e.detail}`)
    break
  }
}
await c.end()
process.exit(failed ? 1 : 0)
