import express from 'express'
import dotenv from 'dotenv'
import { Pool } from 'pg'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { URL } from 'url'
import { sendEmailLink, sendResetLink } from './email'
import bcrypt from 'bcrypt'

dotenv.config()

const app = express()
app.use(express.json())

// Minimal CORS for local dev
app.use((req, res, next) => {
  const reqOrigin = String(req.headers.origin || '')
  const webapp = process.env.WEBAPP_BASE_URL || 'http://localhost:5173'
  const localRegex = /^https?:\/\/(localhost|127\.0\.0\.1)(:\\d+)?$/
  const allowAnyLocal = localRegex.test(reqOrigin)
  const origin = allowAnyLocal ? reqOrigin : webapp
  res.header('Access-Control-Allow-Origin', origin)
  res.header('Vary', 'Origin')
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

// Database (enable SSL automatically for cloud providers like Aiven)
const connStr = process.env.DATABASE_URL
const useSSL = (process.env.DATABASE_SSL === 'true') || (process.env.PGSSLMODE === 'require') || (connStr?.includes('aivencloud.com') ?? false)
const pool = new Pool({ connectionString: connStr, ssl: useSSL ? { rejectUnauthorized: false } : undefined })

// Ensure minimal DDL for onboarding (idempotent; avoids external migration step in dev)
async function ensureOnboardingDDL() {
  if (!process.env.DATABASE_URL) return
  const client = await pool.connect()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS onboarding_states (
        user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        current_step text NOT NULL DEFAULT 'workspace',
        data jsonb NOT NULL DEFAULT '{}'::jsonb,
        completed boolean NOT NULL DEFAULT false,
        started_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `)
    await client.query(`
      CREATE TABLE IF NOT EXISTS tenant_profiles (
        tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
        country text NOT NULL,
        company_name text NOT NULL,
        segment text NOT NULL,
        segment_other text,
        company_size text NOT NULL,
        mission text NOT NULL,
        vision text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `)
    await client.query(`
      CREATE TABLE IF NOT EXISTS injection_jobs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        source text NOT NULL,
        subject text NOT NULL,
        payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        input_text text NOT NULL,
        idempotency_key text,
        content_hash text,
        embedding_provider text,
        status text NOT NULL DEFAULT 'pending',
        priority smallint NOT NULL DEFAULT 5,
        attempts int NOT NULL DEFAULT 0,
        vector_store_key text,
        last_error text,
        started_at timestamptz,
        finished_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `)
    await client.query(`CREATE INDEX IF NOT EXISTS injection_jobs_tenant_status_idx ON injection_jobs (tenant_id, status, created_at);`)
    await client.query(`CREATE INDEX IF NOT EXISTS injection_jobs_priority_idx ON injection_jobs (tenant_id, status, priority, created_at);`)
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS injection_jobs_active_subject_uidx ON injection_jobs (tenant_id, subject) WHERE status IN ('pending','processing');`)
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS injection_jobs_idempotency_uidx ON injection_jobs (tenant_id, subject, idempotency_key) WHERE idempotency_key IS NOT NULL;`)
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS injection_jobs_content_uidx ON injection_jobs (tenant_id, subject, content_hash, embedding_provider) WHERE content_hash IS NOT NULL;`)
  } catch (e) {
    console.error('ensureOnboardingDDL error', e)
  } finally { client.release() }
}

// JWT utils (RS256 if configured, otherwise HS256 dev secret)
const hasRSKeys = !!(process.env.JWT_PRIVATE_KEY && process.env.JWT_PUBLIC_KEY)
const HS_SECRET = process.env.JWT_SECRET || 'dev-insecure-secret'
const PASSWORD_PEPPER = process.env.PASSWORD_PEPPER || ''

async function hashPassword(plain: string) {
  const salted = plain + PASSWORD_PEPPER
  const saltRounds = 12
  return bcrypt.hash(salted, saltRounds)
}

async function verifyPassword(plain: string, hash: string | null) {
  if (!hash) return false
  const salted = plain + PASSWORD_PEPPER
  try { return await bcrypt.compare(salted, hash) } catch { return false }
}

function signJWT(payload: any, opts?: jwt.SignOptions) {
  if (hasRSKeys) {
    return jwt.sign(payload, process.env.JWT_PRIVATE_KEY as string, {
      algorithm: 'RS256',
      ...(opts || {}),
    })
  }
  return jwt.sign(payload, HS_SECRET, { algorithm: 'HS256', ...(opts || {}) })
}

function verifyJWT(token: string) {
  if (hasRSKeys) {
    return jwt.verify(token, process.env.JWT_PUBLIC_KEY as string, { algorithms: ['RS256'] })
  }
  return jwt.verify(token, HS_SECRET, { algorithms: ['HS256'] })
}

// Helpers
const STEP_ORDER = ['workspace','country','companyName','segment','size','mission','vision','review'] as const
type StepId = typeof STEP_ORDER[number]
const SEGMENTS = ['Tecnologia','Agronegócio','Indústria','Varejo','Serviços','Saúde','Educação','Financeiro','Logística','Construção','Governo','Outro']
const COMPANY_SIZES = ['Microempresa','Pequena empresa','Média empresa','Grande porte','Multinacional']

function normalizeSlug(input: string) {
  return input.toLowerCase().trim().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g,'').slice(0,50)
}

function assertLength(v: string, min: number, max: number) {
  const s = (v||'').trim()
  return s.length >= min && s.length <= max
}

async function ensurePermissions(client: any) {
  const permissions = [
    ['kpi:read', 'Ler indicadores'],
    ['kpi:write', 'Criar/alterar indicadores'],
    ['user:invite', 'Convidar usuários'],
    ['user:manage', 'Gerenciar usuários'],
    ['role:manage', 'Gerenciar roles e permissões'],
  ]
  for (const [code, description] of permissions) {
    await client.query(
      `INSERT INTO permissions(code, description) VALUES ($1,$2)
       ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description`,
      [code, description]
    )
  }
}

async function ensureDefaultRoles(client: any, tenantId: string) {
  // Ensure all following operations run under the tenant RLS context
  await client.query(`SELECT set_config('app.current_tenant', $1, true)`, [tenantId])
  const templates: Record<string, { name: string; perms: string[] | 'ALL' }> = {
    owner: { name: 'Owner', perms: 'ALL' },
    admin: { name: 'Admin', perms: ['kpi:read', 'kpi:write', 'user:invite', 'user:manage'] },
    analyst: { name: 'Analyst', perms: ['kpi:read', 'kpi:write'] },
    viewer: { name: 'Viewer', perms: ['kpi:read'] },
  }
  const roleIds: Record<string, string> = {}
  for (const code of Object.keys(templates)) {
    const { rows } = await client.query(
      `INSERT INTO roles(tenant_id, code, name)
       VALUES ($1,$2,$3)
       ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [tenantId, code, templates[code].name]
    )
    roleIds[code] = rows[0].id
  }
  const permRows = await client.query('SELECT id, code FROM permissions')
  const permMap = Object.fromEntries(permRows.rows.map((r: any) => [r.code, r.id]))
  const allPermIds = Object.values(permMap)
  for (const [code, def] of Object.entries(templates)) {
    const roleId = roleIds[code]
    const permIds = def.perms === 'ALL' ? (allPermIds as string[]) : (def.perms as string[]).map((c) => permMap[c])
    for (const p of permIds) {
      await client.query(
        `INSERT INTO role_permissions(role_id, permission_id)
         VALUES ($1,$2)
         ON CONFLICT (role_id, permission_id) DO NOTHING`,
        [roleId, p]
      )
    }
  }
  return roleIds
}

function randomToken(size = 32) {
  return crypto.randomBytes(size).toString('base64url')
}

function sha256Hex(text: string) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex')
}

function buildOnboardingInputText(d: any) {
  const parts: string[] = []
  if (d.workspaceName) parts.push(`Workspace: ${d.workspaceName}${d.workspaceSlug ? ` (slug: ${d.workspaceSlug})` : ''}.`)
  if (d.companyName) parts.push(`Empresa: ${d.companyName}.`)
  if (d.country) parts.push(`País: ${d.country}.`)
  if (d.segment) parts.push(`Segmento: ${d.segment}${d.segment === 'Outro' && d.segmentOther ? ` — ${d.segmentOther}` : ''}.`)
  if (d.companySize) parts.push(`Porte: ${d.companySize}.`)
  if (d.mission) parts.push(`Missão: ${d.mission}`)
  if (d.vision) parts.push(`Visão: ${d.vision}`)
  return parts.join('\n')
}

async function enqueueIngestionJob(client: any, tenantId: string, userId: string, subject: string, payload: any, inputText: string) {
  const idempotency = `ten:${tenantId}:sub:${subject}:hash:${sha256Hex(inputText)}`
  const contentHash = sha256Hex(inputText)
  const provider = process.env.EMBEDDING_PROVIDER || 'openai'
  await client.query(
    `INSERT INTO injection_jobs(tenant_id, user_id, source, subject, payload, input_text, idempotency_key, content_hash, embedding_provider, status, priority)
     VALUES ($1,$2,'onboarding',$3,$4,$5,$6,$7,$8,'pending',5)
     ON CONFLICT DO NOTHING`,
    [tenantId, userId, subject, payload, inputText, idempotency, contentHash, provider]
  )
}

async function issueSessionAndTokens(client: any, userId: string, tenantId?: string | null) {
  const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000) // 30d
  const { rows: sRows } = await client.query(
    `INSERT INTO sessions(user_id, tenant_id, expires_at) VALUES ($1,$2,$3) RETURNING id`,
    [userId, tenantId || null, expiresAt]
  )
  const sessionId = sRows[0].id

  const refresh = randomToken(32)
  const refreshHash = crypto.createHash('sha256').update(refresh).digest('hex')
  await client.query(
    `INSERT INTO refresh_tokens(session_id, token_hash) VALUES ($1,$2)
     ON CONFLICT (session_id, token_hash) DO NOTHING`,
    [sessionId, refreshHash]
  )

  let roles: string[] = []
  if (tenantId) {
    const rolesRows = await client.query(
      `SELECT r.code FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = $1 AND ur.tenant_id = $2`,
      [userId, tenantId]
    )
    roles = rolesRows.rows.map((r: any) => r.code)
  }
  const payload: any = { sub: userId, roles, sid: sessionId }
  if (tenantId) payload.ten = tenantId
  const access = signJWT(payload, { expiresIn: '15m' })
  return { access_token: access, refresh_token: refresh, expires_in: 900 }
}

// email sending handled by src/email.ts

app.get('/health', (_, res) => res.json({ status: 'ok' }))

// Registration: email-only -> sends verification link
app.post('/auth/register', async (req, res) => {
  const email = (req.body?.email || '').toString().trim().toLowerCase()
  if (!email) return res.status(400).json({ error: 'EMAIL_REQUIRED' })
  if (!process.env.DATABASE_URL) return res.status(500).json({ error: 'DB_NOT_CONFIGURED' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await ensurePermissions(client)

    // Upsert user
    const u = await client.query(
      `INSERT INTO users(email, is_active) VALUES ($1,false)
       ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
       RETURNING id, is_active`,
      [email]
    )
    const userId = u.rows[0].id

    // Generate verification token (email link) — without tenant; tenant will be created after verify
    const token = signJWT({ purpose: 'verify_email', email, user_id: userId }, { expiresIn: '24h' })
  const redirect = process.env.WEBAPP_BASE_URL ? new URL(process.env.WEBAPP_BASE_URL) : null
  const link = new URL(`/auth/verify-email`, `http://localhost:${process.env.PORT || 4000}`)
    link.searchParams.set('token', token)
  if (redirect) link.searchParams.set('redirect', `${redirect.origin}/auth/callback`)

    await client.query('COMMIT')
    await sendEmailLink(email, link.toString())

    const body: any = { ok: true }
    if (process.env.NODE_ENV !== 'production') body.dev_link = link.toString()
    return res.json(body)
  } catch (e: any) {
    await client.query('ROLLBACK')
    console.error('register error', e)
    return res.status(500).json({ error: 'REGISTER_FAILED' })
  } finally {
    client.release()
  }
})

// Verify email link -> activates user, creates identity if missing, issues tokens, optional redirect
app.get('/auth/verify-email', async (req, res) => {
  const { token, redirect } = req.query as Record<string, string>
  if (!token) return res.status(400).json({ error: 'TOKEN_REQUIRED' })
  let payload: any
  try {
    payload = verifyJWT(token)
    if (payload.purpose !== 'verify_email') throw new Error('INVALID_PURPOSE')
  } catch (e) {
    return res.status(401).json({ error: 'TOKEN_INVALID' })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { email, user_id: userId } = payload
    // activate user
    await client.query(`UPDATE users SET is_active = true WHERE id = $1`, [userId])
    // ensure identity (local, provider_uid=email)
    await client.query(
      `INSERT INTO identities(user_id, provider, provider_uid)
       VALUES ($1,'local',$2)
       ON CONFLICT (provider, provider_uid) DO UPDATE SET user_id = EXCLUDED.user_id`,
      [userId, email]
    )
    // If user already has a tenant, issue tokens with that tenant; otherwise issue tokens without tenant
    const ut = await client.query(`SELECT tenant_id FROM user_tenants WHERE user_id = $1 LIMIT 1`, [userId])
    const tenantId: string | null = ut.rowCount ? ut.rows[0].tenant_id : null
    if (tenantId) {
      await client.query(`SELECT set_config('app.current_tenant', $1, true)`, [tenantId])
    }
    const tokens = await issueSessionAndTokens(client, userId, tenantId)
    await client.query('COMMIT')
    if (redirect) {
      const url = new URL(redirect)
      url.hash = `access_token=${tokens.access_token}&refresh_token=${tokens.refresh_token}`
      return res.redirect(url.toString())
    }
    return res.json(tokens)
  } catch (e) {
    await client.query('ROLLBACK')
    console.error('verify error', e)
    return res.status(500).json({ error: 'VERIFY_FAILED' })
  } finally {
    client.release()
  }
})

// Forgot password: sends reset link
app.post('/auth/forgot-password', async (req, res) => {
  const email = (req.body?.email || '').toString().trim().toLowerCase()
  if (!email) return res.status(400).json({ error: 'EMAIL_REQUIRED' })
  const client = await pool.connect()
  try {
    const u = await client.query(`SELECT id FROM users WHERE email = $1`, [email])
    // Always respond ok to prevent user enumeration
    if (!u.rowCount) return res.json({ ok: true })
    const userId = u.rows[0].id
    const token = signJWT({ purpose: 'reset_password', user_id: userId, email }, { expiresIn: '1h' })
    const redirect = process.env.WEBAPP_BASE_URL ? new URL(process.env.WEBAPP_BASE_URL) : null
    const link = new URL(`/auth/reset-password`, `http://localhost:${process.env.PORT || 4000}`)
    link.searchParams.set('token', token)
    if (redirect) link.searchParams.set('redirect', `${redirect.origin}/reset`)
    await sendResetLink(email, link.toString())
    return res.json({ ok: true, ...(process.env.NODE_ENV !== 'production' ? { dev_link: link.toString() } : {}) })
  } catch (e) {
    console.error('forgot-password error', e)
    return res.status(500).json({ error: 'FORGOT_PASSWORD_FAILED' })
  } finally {
    client.release()
  }
})

// Reset password redirect/verify
app.get('/auth/reset-password', async (req, res) => {
  const { token, redirect } = req.query as Record<string, string>
  if (!token) return res.status(400).json({ error: 'TOKEN_REQUIRED' })
  try {
    const p = verifyJWT(token) as any
    if (p.purpose !== 'reset_password') throw new Error('INVALID_PURPOSE')
  } catch (e) {
    return res.status(401).json({ error: 'TOKEN_INVALID' })
  }
  if (redirect) {
    const url = new URL(redirect)
    url.hash = `reset_token=${token}`
    return res.redirect(url.toString())
  }
  return res.json({ ok: true })
})

// Reset password submit
app.post('/auth/reset-password', async (req, res) => {
  const { token, password } = (req.body || {}) as { token?: string; password?: string }
  if (!token || !password) return res.status(400).json({ error: 'TOKEN_AND_PASSWORD_REQUIRED' })
  let payload: any
  try {
    payload = verifyJWT(token)
    if (payload.purpose !== 'reset_password') throw new Error('INVALID_PURPOSE')
  } catch (e) {
    return res.status(401).json({ error: 'TOKEN_INVALID' })
  }
  const userId: string = payload.user_id
  const email: string = payload.email
  const client = await pool.connect()
  try {
    const u = await client.query(`SELECT id FROM users WHERE id = $1 AND email = $2`, [userId, email])
    if (!u.rowCount) return res.status(404).json({ error: 'USER_NOT_FOUND' })
    const newHash = await hashPassword(password)
    await client.query(
      `INSERT INTO identities(user_id, provider, provider_uid, secret_hash)
       VALUES ($1,'local',$2,$3)
       ON CONFLICT (provider, provider_uid) DO UPDATE SET user_id = EXCLUDED.user_id, secret_hash = EXCLUDED.secret_hash`,
      [userId, email, newHash]
    )
    return res.json({ ok: true })
  } catch (e) {
    console.error('reset-password error', e)
    return res.status(500).json({ error: 'RESET_PASSWORD_FAILED' })
  } finally {
    client.release()
  }
})

// OAuth/OIDC starts (stubs that redirect if configured)
app.get('/auth/oauth/google/start', (req, res) => {
  const base = process.env.GOOGLE_OAUTH_START_URL // e.g., your IdP authorize URL
  const redirect = (req.query.redirect as string) || process.env.WEBAPP_BASE_URL
  if (!base) return res.status(501).json({ error: 'SSO_NOT_CONFIGURED' })
  const url = new URL(base)
  if (redirect) url.searchParams.set('redirect_uri', redirect)
  return res.redirect(url.toString())
})

app.get('/auth/sso/start', (req, res) => {
  const base = process.env.SSO_START_URL // generic SSO start (SAML or broker)
  const redirect = (req.query.redirect as string) || process.env.WEBAPP_BASE_URL
  const email = (req.query.email as string) || ''
  if (!base) return res.status(501).json({ error: 'SSO_NOT_CONFIGURED' })
  const url = new URL(base)
  if (redirect) url.searchParams.set('redirect_uri', redirect)
  if (email) url.searchParams.set('login_hint', email)
  return res.redirect(url.toString())
})

// Login via email link (for existing users); identical to register but no tenant creation
app.post('/auth/login-email', async (req, res) => {
  const email = (req.body?.email || '').toString().trim().toLowerCase()
  if (!email) return res.status(400).json({ error: 'EMAIL_REQUIRED' })
  if (!process.env.DATABASE_URL) return res.status(500).json({ error: 'DB_NOT_CONFIGURED' })
  const client = await pool.connect()
  try {
    const u = await client.query(`SELECT id FROM users WHERE email = $1`, [email])
    if (!u.rowCount) return res.status(404).json({ error: 'USER_NOT_FOUND' })
    const userId = u.rows[0].id
    const ut = await client.query(`SELECT tenant_id FROM user_tenants WHERE user_id = $1 LIMIT 1`, [userId])
    if (!ut.rowCount) return res.status(409).json({ error: 'USER_NO_TENANT' })
    const tenantId = ut.rows[0].tenant_id
    const token = signJWT({ purpose: 'verify_email', email, user_id: userId, tenant_id: tenantId }, { expiresIn: '1h' })
    const link = new URL(`/auth/verify-email`, `http://localhost:${process.env.PORT || 4000}`)
    link.searchParams.set('token', token)
    const redirect = process.env.WEBAPP_BASE_URL ? new URL(process.env.WEBAPP_BASE_URL) : null
    if (redirect) link.searchParams.set('redirect', `${redirect.origin}/auth/callback`)
    await sendEmailLink(email, link.toString())
    const body: any = { ok: true }
    if (process.env.NODE_ENV !== 'production') body.dev_link = link.toString()
    return res.json(body)
  } catch (e) {
    console.error('login-email error', e)
    return res.status(500).json({ error: 'LOGIN_LINK_FAILED' })
  } finally {
    client.release()
  }
})

// Authenticated profile
app.get('/me', async (req, res) => {
  const auth = (req.headers['authorization'] || '').toString()
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return res.status(401).json({ error: 'NO_TOKEN' })
  let payload: any
  try {
    payload = verifyJWT(token)
  } catch (e) {
    return res.status(401).json({ error: 'TOKEN_INVALID' })
  }
  const { sub: userId, ten: tenantId } = payload as any
  const client = await pool.connect()
  try {
    const u = await client.query(`SELECT id, email, name, is_active, created_at FROM users WHERE id = $1`, [userId])
    if (!tenantId) {
      // No tenant yet — return user only
      return res.json({ user: u.rows[0], tenant: null, roles: [] })
    }
    await client.query(`SELECT set_config('app.current_tenant', $1, true)`, [tenantId])
    const t = await client.query(`SELECT id, slug, name, plan, status FROM tenants WHERE id = $1`, [tenantId])
    const r = await client.query(
      `SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = $1 AND ur.tenant_id = $2`,
      [userId, tenantId]
    )
    return res.json({ user: u.rows[0], tenant: t.rows[0], roles: r.rows.map((x: any) => x.code) })
  } catch (e) {
    console.error('me error', e)
    return res.status(500).json({ error: 'ME_FAILED' })
  } finally {
    client.release()
  }
})

// List user's tenants
app.get('/my/tenants', async (req, res) => {
  const auth = (req.headers['authorization'] || '').toString()
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return res.status(401).json({ error: 'NO_TOKEN' })
  let payload: any
  try { payload = verifyJWT(token) } catch { return res.status(401).json({ error: 'TOKEN_INVALID' }) }
  const userId: string = payload.sub
  const currentTen: string | undefined = payload.ten
  const client = await pool.connect()
  try {
    const q = await client.query(
      `SELECT t.id, t.slug, t.name, t.plan, t.status, ut.status as membership_status
       FROM user_tenants ut
       JOIN tenants t ON t.id = ut.tenant_id
       WHERE ut.user_id = $1
       ORDER BY t.created_at ASC`,
      [userId]
    )
    const list = q.rows.map((r: any) => ({ ...r, current: currentTen ? r.id === currentTen : false }))
    return res.json({ tenants: list })
  } catch (e) {
    console.error('list-tenants error', e)
    return res.status(500).json({ error: 'LIST_TENANTS_FAILED' })
  } finally {
    client.release()
  }
})

// Onboarding — state by user
app.get('/me/onboarding-state', async (req, res) => {
  const auth = (req.headers['authorization'] || '').toString()
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return res.status(401).json({ error: 'NO_TOKEN' })
  let payload: any
  try { payload = verifyJWT(token) } catch { return res.status(401).json({ error: 'TOKEN_INVALID' }) }
  const userId: string = payload.sub
  const client = await pool.connect()
  try {
    // If user already linked to a tenant, onboarding is not first access
    const ut = await client.query(`SELECT 1 FROM user_tenants WHERE user_id = $1 LIMIT 1`, [userId])
    if (ut.rowCount) return res.json({ firstAccess: false })
    const st = await client.query(`SELECT current_step, data, completed, started_at, updated_at FROM onboarding_states WHERE user_id = $1`, [userId])
    if (!st.rowCount) {
      return res.json({ firstAccess: true, state: { current_step: 'workspace', data: {}, completed: false, progress: 0 } })
    }
    const current_step: StepId = st.rows[0].current_step
    const idx = Math.max(0, STEP_ORDER.indexOf(current_step))
    const progress = Math.round((idx / (STEP_ORDER.length)) * 100)
    return res.json({ firstAccess: !st.rows[0].completed, state: { ...st.rows[0], progress } })
  } catch (e) {
    console.error('onboarding-state error', e)
    return res.status(500).json({ error: 'ONBOARDING_STATE_FAILED' })
  } finally { client.release() }
})

// Real-time slug availability
app.get('/onboarding/slug-availability', async (req, res) => {
  const slugRaw = (req.query.slug || '').toString()
  const slug = normalizeSlug(slugRaw)
  if (!slug || slug.length < 2) return res.json({ available: false, reason: 'INVALID' })
  const client = await pool.connect()
  try {
    const q = await client.query(`SELECT 1 FROM tenants WHERE slug = $1`, [slug])
    return res.json({ available: q.rowCount === 0, slug })
  } catch (e) {
    console.error('slug-availability error', e)
    return res.status(500).json({ error: 'SLUG_CHECK_FAILED' })
  } finally { client.release() }
})

// Save step (autosave on advance)
app.put('/onboarding/steps/:stepId', async (req, res) => {
  const auth = (req.headers['authorization'] || '').toString()
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return res.status(401).json({ error: 'NO_TOKEN' })
  let payload: any
  try { payload = verifyJWT(token) } catch { return res.status(401).json({ error: 'TOKEN_INVALID' }) }
  const userId: string = payload.sub
  const stepId = (req.params.stepId || '').toString() as StepId
  if (!STEP_ORDER.includes(stepId)) return res.status(400).json({ code: 'INVALID_STEP', message: 'Passo inválido.' })

  const body = req.body || {}
  const fieldErrors: Record<string,string> = {}
  const updates: any = {}

  if (stepId === 'workspace') {
    const name = (body.workspaceName || '').toString()
    const slugIn = (body.workspaceSlug || '').toString()
    if (!assertLength(name, 2, 50)) fieldErrors.workspaceName = 'Informe de 2 a 50 caracteres.'
    let slug = slugIn ? normalizeSlug(slugIn) : normalizeSlug(name)
    if (!assertLength(slug, 2, 50)) fieldErrors.workspaceSlug = 'Slug inválido.'
    if (Object.keys(fieldErrors).length) return res.status(422).json({ code:'VALIDATION', message:'Verifique os campos', fieldErrors })
    updates.workspaceName = name.trim()
    updates.workspaceSlug = slug
  }
  if (stepId === 'country') {
    const country = (body.country || '').toString().trim()
    if (!country) fieldErrors.country = 'Selecione um país.'
    if (Object.keys(fieldErrors).length) return res.status(422).json({ code:'VALIDATION', message:'Verifique os campos', fieldErrors })
    updates.country = country
  }
  if (stepId === 'companyName') {
    const companyName = (body.companyName || '').toString()
    if (!assertLength(companyName, 2, 100)) fieldErrors.companyName = 'Informe de 2 a 100 caracteres.'
    if (Object.keys(fieldErrors).length) return res.status(422).json({ code:'VALIDATION', message:'Verifique os campos', fieldErrors })
    updates.companyName = companyName.trim()
  }
  if (stepId === 'segment') {
    const segment = (body.segment || '').toString()
    const other = (body.segmentOther || '').toString()
    if (!SEGMENTS.includes(segment)) fieldErrors.segment = 'Selecione um segmento.'
    if (segment === 'Outro' && !assertLength(other, 2, 40)) fieldErrors.segmentOther = 'Descreva entre 2 e 40 caracteres.'
    if (Object.keys(fieldErrors).length) return res.status(422).json({ code:'VALIDATION', message:'Verifique os campos', fieldErrors })
    updates.segment = segment
    if (segment === 'Outro') updates.segmentOther = other.trim()
    else updates.segmentOther = null
  }
  if (stepId === 'size') {
    const companySize = (body.companySize || '').toString()
    if (!COMPANY_SIZES.includes(companySize)) fieldErrors.companySize = 'Selecione o porte.'
    if (Object.keys(fieldErrors).length) return res.status(422).json({ code:'VALIDATION', message:'Verifique os campos', fieldErrors })
    updates.companySize = companySize
  }
  if (stepId === 'mission') {
    const mission = (body.mission || '').toString().trim()
    if (!assertLength(mission, 20, 500)) fieldErrors.mission = 'Digite entre 20 e 500 caracteres.'
    if (Object.keys(fieldErrors).length) return res.status(422).json({ code:'VALIDATION', message:'Verifique os campos', fieldErrors })
    updates.mission = mission
  }
  if (stepId === 'vision') {
    const vision = (body.vision || '').toString().trim()
    if (!assertLength(vision, 20, 500)) fieldErrors.vision = 'Digite entre 20 e 500 caracteres.'
    if (Object.keys(fieldErrors).length) return res.status(422).json({ code:'VALIDATION', message:'Verifique os campos', fieldErrors })
    updates.vision = vision
  }
  if (stepId === 'review') {
    // no-op, only marks current step and keeps merged data
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // Upsert onboarding state, merge data
    const sel = await client.query(`SELECT data FROM onboarding_states WHERE user_id = $1`, [userId])
    const merged = { ...(sel.rowCount ? sel.rows[0].data || {} : {}), ...updates }
    const now = new Date()
    await client.query(
      `INSERT INTO onboarding_states(user_id, current_step, data, completed, started_at, updated_at)
       VALUES ($1,$2,$3,false, now(), $4)
       ON CONFLICT (user_id) DO UPDATE
         SET current_step = EXCLUDED.current_step,
             data = EXCLUDED.data,
             updated_at = EXCLUDED.updated_at`,
      [userId, stepId, merged, now]
    )
    await client.query('COMMIT')

    const idx = Math.max(0, STEP_ORDER.indexOf(stepId))
    const progress = Math.round((idx / (STEP_ORDER.length)) * 100)
    return res.json({ current_step: stepId, data: merged, completed: false, progress })
  } catch (e) {
    await client.query('ROLLBACK')
    console.error('onboarding-step error', e)
    return res.status(500).json({ error: 'ONBOARDING_STEP_FAILED' })
  } finally { client.release() }
})

// Complete onboarding: creates tenant + profile, links user, issues tokens and marks completed
app.post('/onboarding/complete', async (req, res) => {
  const auth = (req.headers['authorization'] || '').toString()
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return res.status(401).json({ error: 'NO_TOKEN' })
  let payload: any
  try { payload = verifyJWT(token) } catch { return res.status(401).json({ error: 'TOKEN_INVALID' }) }
  const userId: string = payload.sub

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const st = await client.query(`SELECT data FROM onboarding_states WHERE user_id = $1`, [userId])
    if (!st.rowCount) { await client.query('ROLLBACK'); return res.status(400).json({ code:'NO_STATE', message:'Onboarding não iniciado.' }) }
    const d = st.rows[0].data || {}
    const errors: Record<string,string> = {}
    // Validate all
    if (!assertLength(d.workspaceName || '', 2, 50)) errors.workspaceName = 'Informe de 2 a 50 caracteres.'
    const finalSlug = normalizeSlug(d.workspaceSlug || d.workspaceName || '')
    if (!assertLength(finalSlug, 2, 50)) errors.workspaceSlug = 'Slug inválido.'
    if (!assertLength(d.companyName || '', 2, 100)) errors.companyName = 'Informe de 2 a 100 caracteres.'
    if (!d.country) errors.country = 'Selecione um país.'
    if (!SEGMENTS.includes(d.segment || '')) errors.segment = 'Segmento inválido.'
    if ((d.segment || '') === 'Outro' && !assertLength(d.segmentOther || '', 2, 40)) errors.segmentOther = 'Descreva entre 2 e 40 caracteres.'
    if (!COMPANY_SIZES.includes(d.companySize || '')) errors.companySize = 'Selecione o porte.'
    if (!assertLength(d.mission || '', 20, 500)) errors.mission = 'Missão inválida.'
    if (!assertLength(d.vision || '', 20, 500)) errors.vision = 'Visão inválida.'
    if (Object.keys(errors).length) { await client.query('ROLLBACK'); return res.status(422).json({ code:'VALIDATION', message:'Verifique os campos', fieldErrors: errors }) }

    // Create tenant
    let slug = finalSlug
    let createdTenantId: string | null = null
    const t1 = await client.query(
      `INSERT INTO tenants(slug, name, plan, status) VALUES ($1,$2,'free','active')
       ON CONFLICT (slug) DO NOTHING RETURNING id`,
      [slug, d.workspaceName]
    )
    if (t1.rowCount) createdTenantId = t1.rows[0].id
    else {
      slug = `${finalSlug}-${Math.random().toString(36).slice(2,6)}`
      const t2 = await client.query(
        `INSERT INTO tenants(slug, name, plan, status) VALUES ($1,$2,'free','active') RETURNING id`,
        [slug, d.workspaceName]
      )
      createdTenantId = t2.rows[0].id
    }

    // Provision roles and add owner
    await ensurePermissions(client)
    await ensureDefaultRoles(client, createdTenantId!)
    const owner = await client.query(`SELECT id FROM roles WHERE tenant_id = $1 AND code = 'owner'`, [createdTenantId!])
    await client.query(
      `INSERT INTO user_tenants(user_id, tenant_id, status) VALUES ($1,$2,'active')
       ON CONFLICT (user_id, tenant_id) DO NOTHING`, [userId, createdTenantId!]
    )
    await client.query(
      `INSERT INTO user_roles(user_id, tenant_id, role_id) VALUES ($1,$2,$3)
       ON CONFLICT (user_id, tenant_id, role_id) DO NOTHING`, [userId, createdTenantId!, owner.rows[0].id]
    )

    // Save tenant profile
    await client.query(
      `INSERT INTO tenant_profiles(tenant_id, country, company_name, segment, segment_other, company_size, mission, vision)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (tenant_id) DO UPDATE SET country = EXCLUDED.country, company_name = EXCLUDED.company_name,
         segment = EXCLUDED.segment, segment_other = EXCLUDED.segment_other, company_size = EXCLUDED.company_size,
         mission = EXCLUDED.mission, vision = EXCLUDED.vision, updated_at = now()`,
      [createdTenantId!, d.country, d.companyName, d.segment, d.segment === 'Outro' ? (d.segmentOther || null) : null, d.companySize, d.mission, d.vision]
    )

    // Mark onboarding completed
    await client.query(`UPDATE onboarding_states SET completed = true, updated_at = now() WHERE user_id = $1`, [userId])

    await client.query(`SELECT set_config('app.current_tenant', $1, true)`, [createdTenantId])
    // Enqueue ingestion job for embeddings (wizard profile)
    const inputText = buildOnboardingInputText(d)
    await enqueueIngestionJob(client, createdTenantId, userId, 'wizard_profile', d, inputText)

    const tokens = await issueSessionAndTokens(client, userId, createdTenantId)
    await client.query('COMMIT')
    return res.json({ ok: true, tenant_id: createdTenantId, tokens })
  } catch (e) {
    await client.query('ROLLBACK')
    console.error('onboarding-complete error', e)
    return res.status(500).json({ error: 'ONBOARDING_COMPLETE_FAILED' })
  } finally { client.release() }
})

// Telemetry (lightweight): record onboarding events into audit_logs
app.post('/telemetry/onboarding', async (req, res) => {
  const auth = (req.headers['authorization'] || '').toString()
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return res.status(401).json({ error: 'NO_TOKEN' })
  let payload: any
  try { payload = verifyJWT(token) } catch { return res.status(401).json({ error: 'TOKEN_INVALID' }) }
  const userId: string = payload.sub
  const { event, step, duration_ms } = (req.body || {})
  const client = await pool.connect()
  try {
    await client.query(
      `INSERT INTO audit_logs(tenant_id, actor_user_id, action, target_type, target_id, metadata)
       VALUES (NULL, $1, $2, 'onboarding', $3, $4)`,
      [userId, String(event || 'onboarding_event'), String(step || ''), { duration_ms: Number(duration_ms||0) }]
    )
    return res.json({ ok: true })
  } catch (e) {
    console.error('telemetry-onboarding error', e)
    return res.status(500).json({ error: 'TELEMETRY_FAILED' })
  } finally { client.release() }
})

// Switch active tenant (issues new tokens tied to chosen tenant)
app.post('/auth/switch-tenant', async (req, res) => {
  const auth = (req.headers['authorization'] || '').toString()
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return res.status(401).json({ error: 'NO_TOKEN' })
  let payload: any
  try { payload = verifyJWT(token) } catch { return res.status(401).json({ error: 'TOKEN_INVALID' }) }
  const userId: string = payload.sub
  const { tenant_id, slug } = (req.body || {}) as { tenant_id?: string; slug?: string }
  if (!tenant_id && !slug) return res.status(400).json({ error: 'TENANT_ID_OR_SLUG_REQUIRED' })
  const client = await pool.connect()
  try {
    let tenantId: string | null = null
    if (tenant_id) {
      const q = await client.query(
        `SELECT t.id FROM user_tenants ut JOIN tenants t ON t.id = ut.tenant_id
         WHERE ut.user_id = $1 AND t.id = $2 AND t.status = 'active'`,
        [userId, tenant_id]
      )
      if (q.rowCount) tenantId = q.rows[0].id
    } else if (slug) {
      const q = await client.query(
        `SELECT t.id FROM user_tenants ut JOIN tenants t ON t.id = ut.tenant_id
         WHERE ut.user_id = $1 AND t.slug = $2 AND t.status = 'active'`,
        [userId, slug]
      )
      if (q.rowCount) tenantId = q.rows[0].id
    }
    if (!tenantId) return res.status(404).json({ error: 'TENANT_NOT_FOUND_OR_INACTIVE' })

    await client.query(`SELECT set_config('app.current_tenant', $1, true)`, [tenantId])
    const tokens = await issueSessionAndTokens(client, userId, tenantId)
    return res.json(tokens)
  } catch (e) {
    console.error('switch-tenant error', e)
    return res.status(500).json({ error: 'SWITCH_TENANT_FAILED' })
  } finally {
    client.release()
  }
})
// Create tenant after verification (user chooses a name)
// Body: { name: string, slug?: string }
app.post('/tenants', async (req, res) => {
  const auth = (req.headers['authorization'] || '').toString()
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return res.status(401).json({ error: 'NO_TOKEN' })
  let payload: any
  try { payload = verifyJWT(token) } catch { return res.status(401).json({ error: 'TOKEN_INVALID' }) }
  const userId: string = payload.sub
  const { name, slug } = req.body || {}
  if (!name || String(name).trim().length < 2) return res.status(400).json({ error: 'INVALID_TENANT_NAME' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const baseSlug = (slug && String(slug).toLowerCase().replace(/[^a-z0-9-]+/g, '-')) ||
      String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-')

    // Try create with provided/derived slug, ensure uniqueness
    let createdTenantId: string | null = null
    const t1 = await client.query(
      `INSERT INTO tenants(slug, name, plan, status) VALUES ($1,$2,'free','active')
       ON CONFLICT (slug) DO NOTHING RETURNING id`,
      [baseSlug, name]
    )
    if (t1.rowCount) {
      createdTenantId = t1.rows[0].id
    } else {
      const uniqueSlug = baseSlug + '-' + Math.random().toString(36).slice(2, 6)
      const t2 = await client.query(
        `INSERT INTO tenants(slug, name, plan, status) VALUES ($1,$2,'free','active') RETURNING id`,
        [uniqueSlug, name]
      )
      createdTenantId = t2.rows[0].id
    }

    // Provision roles and assign owner
    await ensureDefaultRoles(client, createdTenantId!)
    const owner = await client.query(`SELECT id FROM roles WHERE tenant_id = $1 AND code = 'owner'`, [createdTenantId])
    await client.query(
      `INSERT INTO user_tenants(user_id, tenant_id, status) VALUES ($1,$2,'active')
       ON CONFLICT (user_id, tenant_id) DO NOTHING`,
      [userId, createdTenantId]
    )
    await client.query(
      `INSERT INTO user_roles(user_id, tenant_id, role_id) VALUES ($1,$2,$3)
       ON CONFLICT (user_id, tenant_id, role_id) DO NOTHING`,
      [userId, createdTenantId, owner.rows[0].id]
    )

    await client.query('COMMIT')
    // Issue fresh tokens bound to the new tenant
    const tokens = await issueSessionAndTokens(client, userId, createdTenantId)
    return res.status(201).json({ tenant_id: createdTenantId, tokens })
  } catch (e) {
    await client.query('ROLLBACK')
    console.error('create-tenant error', e)
    return res.status(500).json({ error: 'CREATE_TENANT_FAILED' })
  } finally {
    client.release()
  }
})

// Set or change password (authenticated)
// Body: { password: string, current_password?: string }
app.post('/auth/set-password', async (req, res) => {
  const auth = (req.headers['authorization'] || '').toString()
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return res.status(401).json({ error: 'NO_TOKEN' })
  let payload: any
  try { payload = verifyJWT(token) } catch { return res.status(401).json({ error: 'TOKEN_INVALID' }) }
  const { sub: userId, ten: tenantId } = payload
  const { password, current_password } = req.body || {}
  if (!password || password.length < 8) return res.status(400).json({ error: 'WEAK_PASSWORD' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`SELECT set_config('app.current_tenant', $1, true)`, [tenantId])
    const ures = await client.query(`SELECT email FROM users WHERE id = $1`, [userId])
    if (!ures.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'USER_NOT_FOUND' }) }
    const email = ures.rows[0].email

    const ires = await client.query(`SELECT secret_hash FROM identities WHERE provider='local' AND provider_uid=$1`, [email])
    if (ires.rowCount && ires.rows[0].secret_hash) {
      if (!current_password) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'CURRENT_PASSWORD_REQUIRED' }) }
      const ok = await verifyPassword(current_password, ires.rows[0].secret_hash)
      if (!ok) { await client.query('ROLLBACK'); return res.status(401).json({ error: 'INVALID_CURRENT_PASSWORD' }) }
    }

    const newHash = await hashPassword(password)
    await client.query(
      `INSERT INTO identities(user_id, provider, provider_uid, secret_hash)
       VALUES ($1,'local',$2,$3)
       ON CONFLICT (provider, provider_uid) DO UPDATE SET user_id = EXCLUDED.user_id, secret_hash = EXCLUDED.secret_hash`,
      [userId, email, newHash]
    )
    await client.query('COMMIT')
    return res.json({ ok: true })
  } catch (e) {
    await client.query('ROLLBACK')
    console.error('set-password error', e)
    return res.status(500).json({ error: 'SET_PASSWORD_FAILED' })
  } finally {
    client.release()
  }
})

// Login with email + password
// Body: { email, password }
app.post('/auth/login', async (req, res) => {
  const email = (req.body?.email || '').toString().trim().toLowerCase()
  const password = (req.body?.password || '').toString()
  if (!email || !password) return res.status(400).json({ error: 'EMAIL_AND_PASSWORD_REQUIRED' })
  const client = await pool.connect()
  try {
    const u = await client.query(`SELECT id, is_active FROM users WHERE email = $1`, [email])
    if (!u.rowCount) return res.status(401).json({ error: 'INVALID_CREDENTIALS' })
    const userId = u.rows[0].id
    if (!u.rows[0].is_active) return res.status(403).json({ error: 'USER_DISABLED' })
    const idt = await client.query(`SELECT secret_hash FROM identities WHERE provider='local' AND provider_uid=$1`, [email])
    if (!idt.rowCount || !idt.rows[0].secret_hash) return res.status(409).json({ error: 'PASSWORD_NOT_SET' })
    const ok = await verifyPassword(password, idt.rows[0].secret_hash)
    if (!ok) return res.status(401).json({ error: 'INVALID_CREDENTIALS' })

    const ut = await client.query(`SELECT tenant_id FROM user_tenants WHERE user_id=$1 ORDER BY tenant_id LIMIT 1`, [userId])
    if (!ut.rowCount) return res.status(409).json({ error: 'USER_NO_TENANT' })
    const tenantId = ut.rows[0].tenant_id
    await client.query(`SELECT set_config('app.current_tenant', $1, true)`, [tenantId])
    const tokens = await issueSessionAndTokens(client, userId, tenantId)
    return res.json(tokens)
  } catch (e) {
    console.error('login error', e)
    return res.status(500).json({ error: 'LOGIN_FAILED' })
  } finally {
    client.release()
  }
})

const PORT = process.env.PORT || 4000
if (require.main === module) {
	app.listen(PORT, () => {
		console.log(`Backend listening on ${PORT}`)
		ensureOnboardingDDL().then(()=>console.log('[DB] Onboarding tables ensured')).catch(()=>{})
		if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
			console.log('[Email] SMTP not configured; using dev console fallback. Set SMTP_HOST/SMTP_USER/SMTP_PASS to send real emails.')
		}
		else {
			// try dynamic import to surface missing dep early
			import('nodemailer').then(() => {
				console.log('[Email] SMTP configured and nodemailer available.')
			}).catch(() => {
				console.log('[Email] SMTP configured but nodemailer not installed. Run: npm --prefix backend install nodemailer --omit=dev')
			})
		}
	})
}

export default app
