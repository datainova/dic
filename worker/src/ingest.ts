import dotenv from 'dotenv'
import { Pool } from 'pg'
import { ChromaClient } from 'chromadb'
import { OpenAIEmbeddings } from '@langchain/openai'

dotenv.config()

const DATABASE_URL = process.env.DATABASE_URL as string
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set')
  process.exit(1)
}
const CHROMA_URL = process.env.CHROMA_URL || 'http://localhost:8000'
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-small'
const BATCH_SIZE = parseInt(process.env.INGEST_BATCH_SIZE || '3', 10)
const SLEEP_MS = parseInt(process.env.INGEST_SLEEP_MS || '1500', 10)
const SSL = (process.env.DATABASE_SSL === 'true') || (process.env.PGSSLMODE === 'require') || (DATABASE_URL.includes('aivencloud.com'))

const pool = new Pool({ connectionString: DATABASE_URL, ssl: SSL ? { rejectUnauthorized: false } : undefined })
const chroma = new ChromaClient({ path: CHROMA_URL })
const embeddings = new OpenAIEmbeddings({ model: EMBEDDING_MODEL })

type Job = {
  id: string
  tenant_id: string
  user_id: string | null
  subject: string
  payload: any
  input_text: string
}

async function fetchPending(batch: number): Promise<Job[]> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const q = await client.query(
      `SELECT id, tenant_id, user_id, subject, payload, input_text
       FROM injection_jobs
       WHERE status = 'pending'
       ORDER BY created_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT $1`,
      [batch]
    )
    const ids = q.rows.map(r => r.id)
    if (ids.length) {
      await client.query(`UPDATE injection_jobs SET status = 'processing', started_at = now(), updated_at = now() WHERE id = ANY($1::uuid[])`, [ids])
    }
    await client.query('COMMIT')
    return q.rows
  } catch (e) {
    await client.query('ROLLBACK').catch(()=>{})
    console.error('fetchPending error', e)
    return []
  } finally {
    client.release()
  }
}

function collectionName(tenantId: string, subject: string) {
  return `dic_${tenantId}_${subject}`.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 63)
}

async function processJob(job: Job) {
  const collName = collectionName(job.tenant_id, job.subject)
  const collection = await chroma.getOrCreateCollection({ name: collName, metadata: { tenant_id: job.tenant_id, subject: job.subject } })

  const vec = await embeddings.embedQuery(job.input_text)
  await collection.upsert({ ids: [job.id], embeddings: [vec], documents: [job.input_text], metadatas: [job.payload || {}] })

  const client = await pool.connect()
  try {
    await client.query(
      `UPDATE injection_jobs
       SET status = 'completed', finished_at = now(), updated_at = now(), vector_store_key = $2
       WHERE id = $1`,
      [job.id, job.id]
    )
  } finally {
    client.release()
  }
}

async function failJob(jobId: string, reason: string) {
  const client = await pool.connect()
  try {
    await client.query(
      `UPDATE injection_jobs
       SET attempts = attempts + 1, last_error = $2, updated_at = now(),
           status = CASE WHEN attempts + 1 >= 3 THEN 'failed' ELSE 'pending' END
       WHERE id = $1`,
      [jobId, reason?.toString().slice(0, 1000) || 'unknown']
    )
  } finally {
    client.release()
  }
}

async function loop() {
  console.log('[ingest] starting loop; chroma=%s model=%s', CHROMA_URL, EMBEDDING_MODEL)
  for (;;) {
    const jobs = await fetchPending(BATCH_SIZE)
    if (jobs.length === 0) {
      await new Promise(r => setTimeout(r, SLEEP_MS))
      continue
    }
    for (const job of jobs) {
      try {
        await processJob(job)
        console.log('[ingest] completed job', job.id)
      } catch (e: any) {
        console.error('[ingest] job failed', job.id, e?.message || e)
        await failJob(job.id, e?.message || String(e))
      }
    }
  }
}

loop().catch(err => { console.error(err); process.exit(1) })

