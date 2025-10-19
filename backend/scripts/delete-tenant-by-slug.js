#!/usr/bin/env node
// Delete tenant(s) by slug or slug prefix (slug and slug-*)
// Usage: node backend/scripts/delete-tenant-by-slug.js datainova
const { Pool } = require('pg')
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

async function main(){
  const base = (process.argv[2] || '').toLowerCase().trim()
  if (!base) { console.error('Usage: node backend/scripts/delete-tenant-by-slug.js <slug-base>'); process.exit(1) }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: (process.env.DATABASE_SSL==='true'||process.env.PGSSLMODE==='require') ? { rejectUnauthorized: false } : undefined })
  const client = await pool.connect()
  try {
    const q = await client.query(`SELECT id, slug, name FROM tenants WHERE slug = $1 OR slug LIKE $1 || '-%' ORDER BY created_at DESC`, [base])
    if (!q.rowCount) { console.log(`[DeleteTenant] No tenants matched for base '${base}'.`); return }
    await client.query('BEGIN')
    for (const t of q.rows) {
      console.log(`[DeleteTenant] Deleting tenant ${t.name} (${t.slug})`)
      await client.query('DELETE FROM tenants WHERE id = $1', [t.id])
    }
    await client.query('COMMIT')
    console.log(`[DeleteTenant] Done. Deleted: ${q.rowCount}`)
  } catch (e) {
    await client.query('ROLLBACK')
    console.error('[DeleteTenant] Failed:', e.message)
    process.exitCode = 1
  } finally { client.release(); await pool.end() }
}

main().catch(e => { console.error(e); process.exit(1) })

