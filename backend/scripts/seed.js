/*
  Seed script for multi-tenant auth + RBAC baseline
  - Inserts base permissions
  - Creates sample tenants (acme, globex) with domains
  - Adds default roles per tenant (owner, admin, analyst, viewer)
  - Maps role_permissions as per spec
  - Creates users per tenant with local identities (bcrypt hashed)
  - Assigns user_roles
  - Issues one API key per tenant and prints the token (shown once)

  Requirements
  - DATABASE_URL must point to a PostgreSQL database with the DDL already applied.
  - Tables and extensions from the provided spec must exist.
*/

const { Pool } = require('pg')
const bcrypt = require('bcrypt')
const crypto = require('crypto')

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('DATABASE_URL is required')
  process.exit(1)
}

const useSSL = (process.env.DATABASE_SSL === 'true') || (process.env.PGSSLMODE === 'require') || (DATABASE_URL?.includes('aivencloud.com'))
const pool = new Pool({ connectionString: DATABASE_URL, ssl: useSSL ? { rejectUnauthorized: false } : undefined })

const PERMISSIONS = [
  { code: 'kpi:read', description: 'Ler indicadores' },
  { code: 'kpi:write', description: 'Criar/alterar indicadores' },
  { code: 'user:invite', description: 'Convidar usuários' },
  { code: 'user:manage', description: 'Gerenciar usuários' },
  { code: 'role:manage', description: 'Gerenciar roles e permissões' },
]

const ROLE_TEMPLATES = {
  owner: {
    name: 'Owner',
    permissions: 'ALL', // shorthand for all permissions
  },
  admin: {
    name: 'Admin',
    permissions: ['kpi:read', 'kpi:write', 'user:invite', 'user:manage'],
  },
  analyst: {
    name: 'Analyst',
    permissions: ['kpi:read', 'kpi:write'],
  },
  viewer: {
    name: 'Viewer',
    permissions: ['kpi:read'],
  },
}

const TENANTS = [
  {
    slug: 'acme',
    name: 'Acme Inc.',
    plan: 'enterprise',
    status: 'active',
    domains: ['acme.data-inova.app'],
  },
  {
    slug: 'globex',
    name: 'Globex Corp.',
    plan: 'pro',
    status: 'active',
    domains: ['globex.data-inova.app'],
  },
]

function randomId(len = 6) {
  return crypto.randomBytes(len).toString('hex')
}

function makeApiToken(prefixBase = 'dinv_dev') {
  const prefix = `${prefixBase}_${randomId(3)}`
  const secret = crypto.randomBytes(24).toString('base64url')
  const token = `${prefix}.${secret}`
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
  return { prefix, token, tokenHash }
}

async function upsertPermissions(client) {
  for (const p of PERMISSIONS) {
    await client.query(
      `INSERT INTO permissions (code, description)
       VALUES ($1, $2)
       ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description`,
      [p.code, p.description]
    )
  }
  const { rows } = await client.query('SELECT id, code FROM permissions WHERE code = ANY($1)', [
    PERMISSIONS.map((p) => p.code),
  ])
  const map = Object.fromEntries(rows.map((r) => [r.code, r.id]))
  return map
}

async function upsertTenant(client, t) {
  const { rows } = await client.query(
    `INSERT INTO tenants (slug, name, plan, status)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, plan = EXCLUDED.plan, status = EXCLUDED.status
     RETURNING id, slug`,
    [t.slug, t.name, t.plan, t.status]
  )
  const tenant = rows[0]
  for (const d of t.domains || []) {
    await client.query(
      `INSERT INTO tenant_domains (tenant_id, domain)
       VALUES ($1,$2)
       ON CONFLICT (tenant_id, domain) DO NOTHING`,
      [tenant.id, d]
    )
  }
  return tenant
}

async function upsertRoles(client, tenantId, permMap) {
  const roleIds = {}
  for (const [code, def] of Object.entries(ROLE_TEMPLATES)) {
    const { rows } = await client.query(
      `INSERT INTO roles (tenant_id, code, name)
       VALUES ($1,$2,$3)
       ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [tenantId, code, def.name]
    )
    roleIds[code] = rows[0].id
  }

  // role_permissions
  const allPermIds = Object.values(permMap)
  for (const [code, def] of Object.entries(ROLE_TEMPLATES)) {
    const roleId = roleIds[code]
    const perms = def.permissions === 'ALL' ? allPermIds : def.permissions.map((c) => permMap[c])
    for (const permId of perms) {
      await client.query(
        `INSERT INTO role_permissions (role_id, permission_id)
         VALUES ($1,$2)
         ON CONFLICT (role_id, permission_id) DO NOTHING`,
        [roleId, permId]
      )
    }
  }
  return roleIds
}

async function upsertUserWithIdentity(client, { email, name, password, provider = 'local' }) {
  const { rows } = await client.query(
    `INSERT INTO users (email, name, is_active)
     VALUES ($1,$2,true)
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [email, name]
  )
  const userId = rows[0].id
  const saltRounds = 12
  const secretHash = await bcrypt.hash(password, saltRounds)
  await client.query(
    `INSERT INTO identities (user_id, provider, provider_uid, secret_hash)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (provider, provider_uid) DO UPDATE SET user_id = EXCLUDED.user_id, secret_hash = EXCLUDED.secret_hash`,
    [userId, provider, email, secretHash]
  )
  return userId
}

async function ensureUserTenantAndRole(client, { userId, tenantId, roleId }) {
  await client.query(
    `INSERT INTO user_tenants (user_id, tenant_id, status)
     VALUES ($1,$2,'active')
     ON CONFLICT (user_id, tenant_id) DO NOTHING`,
    [userId, tenantId]
  )
  await client.query(
    `INSERT INTO user_roles (user_id, tenant_id, role_id)
     VALUES ($1,$2,$3)
     ON CONFLICT (user_id, tenant_id, role_id) DO NOTHING`,
    [userId, tenantId, roleId]
  )
}

async function createApiKey(client, { tenantId, userId = null, name = 'CI Agent', scope = ['kpi:write', 'agent:ingest'] }) {
  const { prefix, token, tokenHash } = makeApiToken('dinv_dev')
  const { rows } = await client.query(
    `INSERT INTO api_keys (tenant_id, user_id, name, prefix, token_hash, scope)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (prefix) DO NOTHING
     RETURNING id, prefix`,
    [tenantId, userId, name, prefix, tokenHash, scope]
  )
  if (rows.length === 0) {
    // collision on prefix; retry recursively once
    return createApiKey(client, { tenantId, userId, name, scope })
  }
  return { id: rows[0].id, prefix, token }
}

async function main() {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Base permissions
    const permMap = await upsertPermissions(client)

    const outputs = []

  for (const t of TENANTS) {
    const tenant = await upsertTenant(client, t)
      // Set RLS tenant context for tenant-scoped tables
      await client.query('SET app.current_tenant = $1', [tenant.id])
      const roleIds = await upsertRoles(client, tenant.id, permMap)

      // Users for this tenant
      const users = [
        { role: 'owner', email: `owner@${t.slug}.com`, name: `${t.name} Owner` },
        { role: 'admin', email: `admin@${t.slug}.com`, name: `${t.name} Admin` },
        { role: 'analyst', email: `analyst@${t.slug}.com`, name: `${t.name} Analyst` },
        { role: 'viewer', email: `viewer@${t.slug}.com`, name: `${t.name} Viewer` },
      ]

      for (const u of users) {
        const password = `ChangeMe123!-${t.slug}`
        const userId = await upsertUserWithIdentity(client, {
          email: u.email,
          name: u.name,
          password,
        })
        await ensureUserTenantAndRole(client, {
          userId,
          tenantId: tenant.id,
          roleId: roleIds[u.role],
        })
        outputs.push({
          type: 'user',
          tenant: t.slug,
          email: u.email,
          password,
          role: u.role,
        })
      }

      // API key per tenant
      const apiKey = await createApiKey(client, { tenantId: tenant.id })
      outputs.push({ type: 'api_key', tenant: t.slug, name: 'CI Agent', token: apiKey.token })
    }

    await client.query('COMMIT')

    console.log('\nSeed completed successfully.')
    console.log('\nSummary:')
    for (const out of outputs) {
      if (out.type === 'user') {
        console.log(` - [${out.tenant}] ${out.role} -> ${out.email} / ${out.password}`)
      } else if (out.type === 'api_key') {
        console.log(` - [${out.tenant}] API key (${out.name}) -> ${out.token}  (store securely; shown once)`) 
      }
    }

  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Seed failed:', err)
    process.exitCode = 1
  } finally {
    client.release()
    await pool.end()
  }
}

main()
