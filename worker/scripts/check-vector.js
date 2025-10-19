#!/usr/bin/env node
// Verifica embeddings no Chroma para um tenant/assunto
// Uso:
//  node worker/scripts/check-vector.js --tenant-slug datainova --subject wizard_profile
//  node worker/scripts/check-vector.js --tenant-id <uuid> --subject wizard_profile
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })
const { Pool } = require('pg')
const { ChromaClient } = require('chromadb')

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i+1] : def
}

function collectionName(tenantId, subject) {
  return `dic_${tenantId}_${subject}`.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 63)
}

async function resolveTenantId(pool, slug, id) {
  if (id) return id
  if (!slug) throw new Error('Informe --tenant-slug ou --tenant-id')
  const q = await pool.query('SELECT id FROM tenants WHERE slug = $1', [slug])
  if (!q.rowCount) throw new Error(`Tenant não encontrado (slug=${slug})`)
  return q.rows[0].id
}

async function main(){
  const subject = arg('subject', 'wizard_profile')
  const tenantSlug = arg('tenant-slug')
  const tenantIdArg = arg('tenant-id')
  const CHROMA_URL = process.env.CHROMA_URL || 'http://localhost:8000'
  const DATABASE_URL = process.env.DATABASE_URL
  if (!DATABASE_URL) throw new Error('Defina DATABASE_URL no worker/.env')

  const pool = new Pool({ connectionString: DATABASE_URL, ssl: (process.env.DATABASE_SSL==='true'||process.env.PGSSLMODE==='require'||(DATABASE_URL||'').includes('aivencloud.com')) ? { rejectUnauthorized: false } : undefined })
  const tenantId = await resolveTenantId(pool, tenantSlug, tenantIdArg)

  const name = collectionName(tenantId, subject)
  const chroma = new ChromaClient({ path: CHROMA_URL })

  // Status dos jobs
  const jobs = await pool.query(
    `SELECT id, status, vector_store_key, created_at
     FROM injection_jobs
     WHERE tenant_id = $1 AND subject = $2
     ORDER BY created_at DESC LIMIT 10`,
    [tenantId, subject]
  )
  console.log('\nJobs recentes:')
  console.table(jobs.rows)

  // Conteúdo no Chroma
  try {
    const col = await chroma.getCollection({ name })
    const count = await col.count()
    console.log(`\nColeção: ${name} • Itens: ${count}`)
    const sample = await col.get({ include: ['metadatas','documents','ids'], limit: 3, offset: 0 })
    console.log('\nAmostra JSON (até 3 itens):')
    const items = []
    const ids = sample.ids || []
    for (let i=0; i<ids.length; i++) {
      items.push({ id: sample.ids[i], metadata: sample.metadatas?.[i] || null, document: sample.documents?.[i] || '' })
    }
    console.log(JSON.stringify(items, null, 2))
  } catch (e) {
    console.error(`\nNão foi possível abrir a coleção '${name}'. Talvez ainda não existam embeddings.`, e && e.message ? e.message : e)
  } finally {
    await pool.end()
  }
}

main().catch(e => { console.error(e); process.exit(1) })
