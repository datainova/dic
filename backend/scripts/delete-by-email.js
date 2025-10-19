#!/usr/bin/env node
// Delete users by email and drop any tenants where they are owner
// Usage: node backend/scripts/delete-by-email.js email1@example.com email2@example.com
const { Pool } = require('pg')
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

async function main(){
  const emails = process.argv.slice(2).map(s=>String(s||'').trim().toLowerCase()).filter(Boolean)
  if (emails.length === 0) {
    console.error('Usage: node backend/scripts/delete-by-email.js user1@example.com [user2@example.com ...]')
    process.exit(1)
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: (process.env.DATABASE_SSL==='true'||process.env.PGSSLMODE==='require') ? { rejectUnauthorized: false } : undefined })
  const client = await pool.connect()
  try {
    console.log(`[Delete] Starting for: ${emails.join(', ')}`)
    await client.query('BEGIN')
    for (const email of emails) {
      const u = await client.query('SELECT id FROM users WHERE lower(email) = lower($1)', [email])
      if (!u.rowCount) { console.log(`[Delete] User not found: ${email}`); continue }
      const userId = u.rows[0].id
      const tenants = await client.query(
        `SELECT DISTINCT t.id, t.slug, t.name
         FROM user_roles ur
         JOIN roles r ON r.id = ur.role_id AND r.code = 'owner'
         JOIN tenants t ON t.id = ur.tenant_id
         WHERE ur.user_id = $1`,
        [userId]
      )
      for (const t of tenants.rows) {
        console.log(`[Delete] Dropping tenant as owner: ${t.name} (${t.slug})`)
        await client.query('DELETE FROM tenants WHERE id = $1', [t.id])
      }
      console.log(`[Delete] Deleting user: ${email}`)
      await client.query('DELETE FROM users WHERE id = $1', [userId])
    }
    await client.query('COMMIT')
    console.log('[Delete] Done.')
  } catch (e) {
    await client.query('ROLLBACK')
    console.error('[Delete] Failed:', e.message)
    process.exitCode = 1
  } finally {
    client.release(); await pool.end()
  }
}

main().catch(e => { console.error(e); process.exit(1) })

