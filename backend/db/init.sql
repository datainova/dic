-- Data Inova - Auth, RBAC e Multi-tenant (DDL Inicial)
-- Executar em um banco vazio (staging/prod) antes do seed.
-- Requisitos: PostgreSQL 13+ (ou compatível), extensões pgcrypto e citext.

-- Extensões
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- Função utilitária para RLS
CREATE OR REPLACE FUNCTION fn_current_tenant() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT current_setting('app.current_tenant', true)::uuid
$$;

-- =========================
-- Tenants e Domínios
-- =========================
CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  plan text NOT NULL CHECK (plan IN ('free','pro','enterprise')),
  status text NOT NULL CHECK (status IN ('active','suspended','deleted')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tenant_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  domain text NOT NULL,
  verified_at timestamptz,
  UNIQUE (tenant_id, domain)
);

-- =========================
-- Usuários e Identidades
-- =========================
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext UNIQUE NOT NULL,
  name text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_tenants (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','invited','disabled')),
  PRIMARY KEY (user_id, tenant_id)
);

CREATE TABLE identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('local','google','microsoft','github','saml')),
  provider_uid text,
  secret_hash text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_uid)
);

-- =========================
-- RBAC
-- =========================
CREATE TABLE roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  UNIQUE (tenant_id, code)
);

CREATE TABLE permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  description text
);

CREATE TABLE role_permissions (
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_roles (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, tenant_id, role_id)
);

-- =========================
-- Sessões, Tokens, MFA
-- =========================
CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id uuid,
  user_agent text,
  ip inet,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE TABLE refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  rotated_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, token_hash)
);

CREATE TABLE mfa_factors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('totp','webauthn')),
  secret text,
  webauthn_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

-- =========================
-- Auditoria e Segurança
-- =========================
CREATE TABLE login_attempts (
  id bigserial,
  email citext,
  user_id uuid,
  ip inet,
  result text NOT NULL CHECK (result IN ('success','invalid_credentials','locked','mfa_required')),
  created_at timestamptz NOT NULL DEFAULT now()
) PARTITION BY RANGE (created_at);
ALTER TABLE login_attempts ADD PRIMARY KEY (id, created_at);

CREATE TABLE audit_logs (
  id bigserial,
  tenant_id uuid,
  actor_user_id uuid,
  action text NOT NULL,
  target_type text,
  target_id text,
  ip inet,
  ua text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
) PARTITION BY RANGE (created_at);
ALTER TABLE audit_logs ADD PRIMARY KEY (id, created_at);

-- =========================
-- Integrações e Agentes
-- =========================
CREATE TABLE api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  name text NOT NULL,
  prefix text NOT NULL,
  token_hash text NOT NULL,
  scope text[] NOT NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (prefix)
);

CREATE TABLE agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL CHECK (status IN ('active','disabled')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE agent_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

-- =========================
-- Índices Principais
-- =========================
CREATE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email));
CREATE INDEX IF NOT EXISTS identities_provider_uid_idx ON identities (provider, provider_uid);
CREATE INDEX IF NOT EXISTS user_roles_user_tenant_idx ON user_roles (user_id, tenant_id);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS refresh_tokens_session_hash_idx ON refresh_tokens (session_id, token_hash);
CREATE INDEX IF NOT EXISTS api_keys_tenant_prefix_idx ON api_keys (tenant_id, prefix);

-- =========================
-- RLS: Habilitar e Políticas
-- =========================
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY p_tenant_isolation_roles ON roles
USING (tenant_id = fn_current_tenant());

CREATE POLICY p_tenant_isolation_user_roles ON user_roles
USING (tenant_id = fn_current_tenant());

CREATE POLICY p_tenant_isolation_api_keys ON api_keys
USING (tenant_id = fn_current_tenant());

CREATE POLICY p_tenant_isolation_agents ON agents
USING (tenant_id = fn_current_tenant());

-- Audit logs: globais (tenant_id NULL) ou do tenant corrente
CREATE POLICY p_tenant_isolation_audit ON audit_logs
USING (tenant_id IS NULL OR tenant_id = fn_current_tenant());

-- =========================
-- Partições Mensais (cria partições do mês corrente e próximo)
-- =========================
DO $$
DECLARE
  start_current date := date_trunc('month', now())::date;
  start_next    date := (date_trunc('month', now()) + interval '1 month')::date;
  start_after   date := (date_trunc('month', now()) + interval '2 month')::date;
  part_name text;
BEGIN
  -- login_attempts (mês corrente)
  part_name := format('login_attempts_%s', to_char(start_current, 'YYYY_MM'));
  EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF login_attempts FOR VALUES FROM (%L) TO (%L);', part_name, start_current, start_next);

  -- login_attempts (próximo mês)
  part_name := format('login_attempts_%s', to_char(start_next, 'YYYY_MM'));
  EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF login_attempts FOR VALUES FROM (%L) TO (%L);', part_name, start_next, start_after);

  -- audit_logs (mês corrente)
  part_name := format('audit_logs_%s', to_char(start_current, 'YYYY_MM'));
  EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF audit_logs FOR VALUES FROM (%L) TO (%L);', part_name, start_current, start_next);

  -- audit_logs (próximo mês)
  part_name := format('audit_logs_%s', to_char(start_next, 'YYYY_MM'));
  EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF audit_logs FOR VALUES FROM (%L) TO (%L);', part_name, start_next, start_after);
END $$;

-- Fim do init
