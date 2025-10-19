-- Comentários do schema (Data Dictionary) — Auth/RBAC/Multi-tenant
-- Aplicar após o init.sql. Esses comentários ficam gravados no catálogo
-- e podem ser consultados via psql (\d+), PgAdmin, DBeaver, etc.

-- Tenants
COMMENT ON TABLE tenants IS 'Registro de tenants (clientes) com plano e status.';
COMMENT ON COLUMN tenants.id IS 'UUID do tenant (PK).';
COMMENT ON COLUMN tenants.slug IS 'Identificador textual curto e único do tenant (ex.: acme).';
COMMENT ON COLUMN tenants.name IS 'Nome amigável do tenant.';
COMMENT ON COLUMN tenants.plan IS 'Plano do tenant: free, pro ou enterprise.';
COMMENT ON COLUMN tenants.status IS 'Status operacional do tenant: active, suspended, deleted.';
COMMENT ON COLUMN tenants.created_at IS 'Timestamp de criação do tenant.';

COMMENT ON TABLE tenant_domains IS 'Domínios associados a um tenant (custom domain, subdomínios).';
COMMENT ON COLUMN tenant_domains.id IS 'UUID do domínio (PK).';
COMMENT ON COLUMN tenant_domains.tenant_id IS 'FK para tenants.id.';
COMMENT ON COLUMN tenant_domains.domain IS 'Nome de domínio (ex.: acme.data-inova.app ou custom).';
COMMENT ON COLUMN tenant_domains.verified_at IS 'Quando o domínio foi validado/propagado.';

-- Usuários e Identidades
COMMENT ON TABLE users IS 'Usuários do sistema (dados canônicos por e-mail).';
COMMENT ON COLUMN users.id IS 'UUID do usuário (PK).';
COMMENT ON COLUMN users.email IS 'E-mail único (citext).';
COMMENT ON COLUMN users.name IS 'Nome do usuário.';
COMMENT ON COLUMN users.is_active IS 'Usuário ativo ou desabilitado.';
COMMENT ON COLUMN users.created_at IS 'Timestamp de criação.';

COMMENT ON TABLE user_tenants IS 'Associação de usuários a tenants, com status de participação.';
COMMENT ON COLUMN user_tenants.user_id IS 'FK para users.id.';
COMMENT ON COLUMN user_tenants.tenant_id IS 'FK para tenants.id.';
COMMENT ON COLUMN user_tenants.status IS 'Status no tenant: active, invited, disabled.';

COMMENT ON TABLE identities IS 'Identidades/autenticações de usuários por provedor (local, OIDC, SAML, etc.).';
COMMENT ON COLUMN identities.id IS 'UUID da identidade (PK).';
COMMENT ON COLUMN identities.user_id IS 'FK para users.id.';
COMMENT ON COLUMN identities.provider IS 'Provedor: local, google, microsoft, github, saml.';
COMMENT ON COLUMN identities.provider_uid IS 'Identificador único no provedor (e-mail/subject/etc.).';
COMMENT ON COLUMN identities.secret_hash IS 'Hash do segredo (senha local, etc.).';
COMMENT ON COLUMN identities.metadata IS 'Metadados do provedor (claims, config SAML, etc.).';
COMMENT ON COLUMN identities.created_at IS 'Timestamp de criação.';

-- RBAC
COMMENT ON TABLE roles IS 'Roles definidas por tenant (ex.: owner, admin, analyst, viewer).';
COMMENT ON COLUMN roles.id IS 'UUID da role (PK).';
COMMENT ON COLUMN roles.tenant_id IS 'FK para tenants.id (RLS habilitado por tenant).';
COMMENT ON COLUMN roles.code IS 'Código curto da role (único por tenant).';
COMMENT ON COLUMN roles.name IS 'Nome amigável da role.';

COMMENT ON TABLE permissions IS 'Permissões atômicas do sistema (escopos de autorização).';
COMMENT ON COLUMN permissions.id IS 'UUID da permissão (PK).';
COMMENT ON COLUMN permissions.code IS 'Código único da permissão (ex.: kpi:read).';
COMMENT ON COLUMN permissions.description IS 'Descrição textual da permissão.';

COMMENT ON TABLE role_permissions IS 'Tabela de junção role ↔ permission.';
COMMENT ON COLUMN role_permissions.role_id IS 'FK para roles.id.';
COMMENT ON COLUMN role_permissions.permission_id IS 'FK para permissions.id.';

COMMENT ON TABLE user_roles IS 'Associação de usuários a roles em um tenant.';
COMMENT ON COLUMN user_roles.user_id IS 'FK para users.id.';
COMMENT ON COLUMN user_roles.tenant_id IS 'FK para tenants.id (RLS habilitado por tenant).';
COMMENT ON COLUMN user_roles.role_id IS 'FK para roles.id.';

-- Sessões e Tokens
COMMENT ON TABLE sessions IS 'Sessões de usuário (para correlação e auditoria).';
COMMENT ON COLUMN sessions.id IS 'UUID da sessão (PK).';
COMMENT ON COLUMN sessions.user_id IS 'FK para users.id.';
COMMENT ON COLUMN sessions.tenant_id IS 'Tenant corrente associado, quando aplicável.';
COMMENT ON COLUMN sessions.user_agent IS 'User-Agent do cliente (navegador/app).';
COMMENT ON COLUMN sessions.ip IS 'Endereço IP do cliente.';
COMMENT ON COLUMN sessions.created_at IS 'Timestamp de criação da sessão.';
COMMENT ON COLUMN sessions.expires_at IS 'Expiração da sessão.';

COMMENT ON TABLE refresh_tokens IS 'Refresh tokens por sessão (rotacionáveis, armazenados em hash).';
COMMENT ON COLUMN refresh_tokens.id IS 'UUID do refresh token (PK).';
COMMENT ON COLUMN refresh_tokens.session_id IS 'FK para sessions.id.';
COMMENT ON COLUMN refresh_tokens.token_hash IS 'Hash (SHA-256/argon2) do refresh token.';
COMMENT ON COLUMN refresh_tokens.rotated_at IS 'Quando o token foi rotacionado.';
COMMENT ON COLUMN refresh_tokens.revoked_at IS 'Quando o token foi revogado.';
COMMENT ON COLUMN refresh_tokens.created_at IS 'Timestamp de criação.';

COMMENT ON TABLE mfa_factors IS 'Fatores de MFA (TOTP/WebAuthn) vinculados ao usuário.';
COMMENT ON COLUMN mfa_factors.id IS 'UUID do fator (PK).';
COMMENT ON COLUMN mfa_factors.user_id IS 'FK para users.id.';
COMMENT ON COLUMN mfa_factors.type IS 'Tipo do fator: totp, webauthn.';
COMMENT ON COLUMN mfa_factors.secret IS 'Segredo TOTP (quando aplicável).';
COMMENT ON COLUMN mfa_factors.webauthn_data IS 'Dados do registrador WebAuthn (credencial pública).';
COMMENT ON COLUMN mfa_factors.created_at IS 'Timestamp de criação.';
COMMENT ON COLUMN mfa_factors.last_used_at IS 'Último uso do fator.';

-- Auditoria e Segurança
COMMENT ON TABLE login_attempts IS 'Tentativas de login para rate limit, detecção de abuso e forense.';
COMMENT ON COLUMN login_attempts.id IS 'Chave primária (bigserial).';
COMMENT ON COLUMN login_attempts.email IS 'E-mail informado.';
COMMENT ON COLUMN login_attempts.user_id IS 'Usuário correlacionado (se aplicável).';
COMMENT ON COLUMN login_attempts.ip IS 'IP de origem da tentativa.';
COMMENT ON COLUMN login_attempts.result IS 'Resultado: success, invalid_credentials, locked, mfa_required.';
COMMENT ON COLUMN login_attempts.created_at IS 'Timestamp do evento.';

COMMENT ON TABLE audit_logs IS 'Logs de auditoria (append-only), particionados por mês.';
COMMENT ON COLUMN audit_logs.id IS 'Chave primária (bigserial).';
COMMENT ON COLUMN audit_logs.tenant_id IS 'Tenant do evento (NULL para eventos globais).';
COMMENT ON COLUMN audit_logs.actor_user_id IS 'Usuário ator da ação (se houver).';
COMMENT ON COLUMN audit_logs.action IS 'Ação executada (ex.: user.invite, kpi.create).';
COMMENT ON COLUMN audit_logs.target_type IS 'Tipo do alvo (ex.: user, role, kpi).';
COMMENT ON COLUMN audit_logs.target_id IS 'Identificador do alvo (string).';
COMMENT ON COLUMN audit_logs.ip IS 'IP de origem.';
COMMENT ON COLUMN audit_logs.ua IS 'User-Agent do cliente.';
COMMENT ON COLUMN audit_logs.metadata IS 'Metadados estruturados (JSONb).';
COMMENT ON COLUMN audit_logs.created_at IS 'Timestamp do evento.';

-- Integrações e Agentes
COMMENT ON TABLE api_keys IS 'API keys por tenant/usuário, apenas hash armazenado.';
COMMENT ON COLUMN api_keys.id IS 'UUID da API key (PK).';
COMMENT ON COLUMN api_keys.tenant_id IS 'FK para tenants.id (RLS por tenant).';
COMMENT ON COLUMN api_keys.user_id IS 'FK para users.id (dono da key, opcional).';
COMMENT ON COLUMN api_keys.name IS 'Nome amigável (ex.: CI Agent).';
COMMENT ON COLUMN api_keys.prefix IS 'Prefixo para lookup (parte não secreta).';
COMMENT ON COLUMN api_keys.token_hash IS 'Hash do token (secreto não armazenado).';
COMMENT ON COLUMN api_keys.scope IS 'Lista de escopos/autorização concedidos.';
COMMENT ON COLUMN api_keys.expires_at IS 'Expiração opcional.';
COMMENT ON COLUMN api_keys.created_at IS 'Timestamp de criação.';
COMMENT ON COLUMN api_keys.revoked_at IS 'Revogação (se definido, a key é inválida).';

COMMENT ON TABLE agents IS 'Agentes (integrações internas/externas) por tenant.';
COMMENT ON COLUMN agents.id IS 'UUID do agente (PK).';
COMMENT ON COLUMN agents.tenant_id IS 'FK para tenants.id (RLS por tenant).';
COMMENT ON COLUMN agents.name IS 'Nome do agente.';
COMMENT ON COLUMN agents.status IS 'Status do agente: active, disabled.';
COMMENT ON COLUMN agents.created_at IS 'Timestamp de criação.';

COMMENT ON TABLE agent_tokens IS 'Tokens (hash) associados a um agente.';
COMMENT ON COLUMN agent_tokens.id IS 'UUID do token (PK).';
COMMENT ON COLUMN agent_tokens.agent_id IS 'FK para agents.id.';
COMMENT ON COLUMN agent_tokens.token_hash IS 'Hash do token do agente.';
COMMENT ON COLUMN agent_tokens.last_seen_at IS 'Último uso/heartbeat do token.';
COMMENT ON COLUMN agent_tokens.created_at IS 'Timestamp de criação.';
COMMENT ON COLUMN agent_tokens.revoked_at IS 'Revogação do token.';

-- Ingestion/Embedding Jobs
COMMENT ON TABLE injection_jobs IS 'Fila de jobs de ingestão/embedding para o worker (vetorial).';
COMMENT ON COLUMN injection_jobs.id IS 'UUID do job (PK).';
COMMENT ON COLUMN injection_jobs.tenant_id IS 'FK para tenants.id (RLS por tenant).';
COMMENT ON COLUMN injection_jobs.user_id IS 'Usuário que criou o job (opcional).';
COMMENT ON COLUMN injection_jobs.source IS 'Origem do job: onboarding, manual, api.';
COMMENT ON COLUMN injection_jobs.subject IS 'Assunto/contexto do job (ex.: wizard_profile).';
COMMENT ON COLUMN injection_jobs.payload IS 'Dados brutos em JSONb (ex.: campos do wizard).';
COMMENT ON COLUMN injection_jobs.input_text IS 'Texto consolidado e normalizado para gerar o embedding.';
COMMENT ON COLUMN injection_jobs.idempotency_key IS 'Chave idempotente enviada pelo cliente para evitar duplicação (única por tenant+subject).';
COMMENT ON COLUMN injection_jobs.content_hash IS 'Hash (sha256) do conteúdo de entrada; usado para deduplicação (único por tenant+subject+provider).';
COMMENT ON COLUMN injection_jobs.embedding_provider IS 'Provedor de embedding a ser usado (openai, local, etc.).';
COMMENT ON COLUMN injection_jobs.status IS 'Estado do job: pending, processing, completed, failed.';
COMMENT ON COLUMN injection_jobs.priority IS 'Prioridade (1=alta .. 9=baixa).';
COMMENT ON COLUMN injection_jobs.attempts IS 'Número de tentativas já realizadas.';
COMMENT ON COLUMN injection_jobs.vector_store_key IS 'Identificador/Chave do registro no banco vetorial (opcional).';
COMMENT ON COLUMN injection_jobs.last_error IS 'Mensagem de erro da última falha (se houver).';
COMMENT ON COLUMN injection_jobs.started_at IS 'Quando o processamento do job iniciou.';
COMMENT ON COLUMN injection_jobs.finished_at IS 'Quando o processamento do job finalizou.';
COMMENT ON COLUMN injection_jobs.created_at IS 'Timestamp de criação do job.';
COMMENT ON COLUMN injection_jobs.updated_at IS 'Última atualização do job.';

-- Onboarding
COMMENT ON TABLE onboarding_states IS 'Estado de onboarding por usuário (antes de possuir tenant).';
COMMENT ON COLUMN onboarding_states.user_id IS 'FK para users.id (PK).';
COMMENT ON COLUMN onboarding_states.current_step IS 'Passo atual do fluxo (ex.: workspace, country, ...).';
COMMENT ON COLUMN onboarding_states.data IS 'Dados consolidados do onboarding (JSONb).';
COMMENT ON COLUMN onboarding_states.completed IS 'Se true, onboarding concluído para o usuário.';
COMMENT ON COLUMN onboarding_states.started_at IS 'Quando o onboarding foi iniciado.';
COMMENT ON COLUMN onboarding_states.updated_at IS 'Última atualização/salvamento do onboarding.';

-- Perfil do Tenant
COMMENT ON TABLE tenant_profiles IS 'Perfil estendido do tenant (dados de empresa).';
COMMENT ON COLUMN tenant_profiles.tenant_id IS 'FK para tenants.id (PK).';
COMMENT ON COLUMN tenant_profiles.country IS 'País principal da operação.';
COMMENT ON COLUMN tenant_profiles.company_name IS 'Nome legal/comercial da empresa.';
COMMENT ON COLUMN tenant_profiles.segment IS 'Segmento principal.';
COMMENT ON COLUMN tenant_profiles.segment_other IS 'Especificação quando segmento = Outro.';
COMMENT ON COLUMN tenant_profiles.company_size IS 'Porte da empresa.';
COMMENT ON COLUMN tenant_profiles.mission IS 'Missão da empresa (20–500 chars).';
COMMENT ON COLUMN tenant_profiles.vision IS 'Visão da empresa (20–500 chars).';
COMMENT ON COLUMN tenant_profiles.created_at IS 'Timestamp de criação do perfil.';
COMMENT ON COLUMN tenant_profiles.updated_at IS 'Última atualização do perfil.';
