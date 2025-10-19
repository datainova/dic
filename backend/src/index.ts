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
  const origin = process.env.WEBAPP_BASE_URL || 'http://localhost:5173'
  res.header('Access-Control-Allow-Origin', origin)
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

// Database (enable SSL automatically for cloud providers like Aiven)
const connStr = process.env.DATABASE_URL
const useSSL = (process.env.DATABASE_SSL === 'true') || (process.env.PGSSLMODE === 'require') || (connStr?.includes('aivencloud.com') ?? false)
const pool = new Pool({ connectionString: connStr, ssl: useSSL ? { rejectUnauthorized: false } : undefined })

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
    await ensureDefaultRoles(client, createdTenantId)
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
