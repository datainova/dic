#!/usr/bin/env node
// Clean injection jobs (optionally by tenant slug) and/or subject
// Usage:
//   node backend/scripts/clean-injection-jobs.js                # delete all jobs
//   node backend/scripts/clean-injection-jobs.js --subject wizard_profile
//   node backend/scripts/clean-injection-jobs.js --tenant datainova --subject wizard_profile
const { Pool } = require('pg')
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

function arg(name){
  const i = process.argv.indexOf(`--${name}`)
  if (i >= 0 && process.argv[i+1]) return String(process.argv[i+1])
  return null
}

async function main(){
  const subject = arg('subject')
  const tenantSlug = arg('tenant')
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: (process.env.DATABASE_SSL==='true'||process.env.PGSSLMODE==='require'||(process.env.DATABASE_URL||'').includes('aivencloud.com')) ? { rejectUnauthorized: false } : undefined })
  const client = await pool.connect()
  try {
    let tenantId = null
    if (tenantSlug) {
      const t = await client.query('SELECT id FROM tenants WHERE slug = $1', [tenantSlug])
      if (t.rowCount) tenantId = t.rows[0].id
      else { console.log(`[clean-jobs] tenant slug not found: ${tenantSlug}`) }
    }

    const conds = []
    const vals = []
    if (tenantId) { vals.push(tenantId); conds.push(`tenant_id = $${vals.length}`) }
    if (subject)  { vals.push(subject);  conds.push(`subject = $${vals.length}`) }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
    const { rowCount } = await client.query(`DELETE FROM injection_jobs ${where}`, vals)
    console.log(`[clean-jobs] deleted ${rowCount} job(s) ${where||'(all)'} `)
  } finally {
    client.release(); await pool.end()
  }
}

main().catch(e => { console.error(e); process.exit(1) })

