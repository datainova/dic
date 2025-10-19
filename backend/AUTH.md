**Autenticação — Email Link (Registro e Login)**

- Objetivo: permitir registro com e-mail (plano Free por padrão) e login por link mágico.
- Tecnologias: Express, PostgreSQL (tabelas conforme init.sql), JWT (RS256 se chaves fornecidas; fallback HS256 dev).

Endpoints
- POST /auth/register
  - Body: { "email": "user@empresa.com" }
  - Ações:
    - Upsert do usuário (is_active=false se novo).
    - Não cria tenant nesta etapa. Emite token de verificação (24h) e envia link por e-mail (em dev, loga no console).
  - Response 200: { ok: true, dev_link?: "http://localhost:4000/auth/verify-email?..." }

- POST /auth/login-email
  - Body: { "email": "user@empresa.com" }
  - Ações: Emite link mágico (1h) para usuário existente e tenant atual; envia por e-mail (em dev, loga).
  - Response 200: { ok: true, dev_link?: "..." }

- GET /auth/verify-email?token=...&redirect=http://localhost:5173/auth/callback
  - Ações:
    - Valida token (purpose=verify_email), ativa o usuário e garante identidade local (provider_uid=email).
    - Se o usuário já possuir tenant, seta RLS e emite tokens ligados a esse tenant.
    - Caso contrário, emite tokens sem tenant (ten ausente). O app deve chamar POST /tenants para o onboarding do workspace.
    - Se redirect informado, redireciona para o front com tokens no hash: #access_token=...&refresh_token=...
  - Response 200 (se sem redirect): { access_token, refresh_token, expires_in }

- GET /me (protegido)
  - Header: Authorization: Bearer <access_token>
  - Retorna: { user, tenant, roles } — quando não houver tenant, retorna tenant=null e roles=[].

- POST /tenants (protegido)
  - Body: { name: string, slug?: string }
  - Ações: cria tenant Free com slug único, provisiona roles padrão, vincula usuário como owner e retorna novos tokens já ligados ao tenant.
  - Response 201: { tenant_id, tokens: { access_token, refresh_token, expires_in } }

- GET /my/tenants (protegido)
  - Lista todos os tenants nos quais o usuário participa.
  - Response 200: { tenants: [{ id, slug, name, plan, status, membership_status, current }] }

- POST /auth/switch-tenant (protegido)
  - Body: { tenant_id?: uuid, slug?: string } (um dos dois é obrigatório)
  - Ações: valida membership e status=active, seta GUC e emite novos tokens atrelados ao tenant.
  - Response 200: { access_token, refresh_token, expires_in }

- POST /auth/set-password (protegido)
  - Body: { password: string, current_password?: string }
  - Se o usuário já tiver senha, exige current_password.
  - Persiste hash (bcrypt + pepper) em identities.secret_hash.
  - Response 200: { ok: true }

- POST /auth/login (email + senha)
  - Body: { email, password }
  - Valida hash e emite tokens (mesma estrutura do verify-email).
  - Erros: 401 INVALID_CREDENTIALS | 409 PASSWORD_NOT_SET | 403 USER_DISABLED

Segurança e Tenancy
- RLS: rotas autenticadas executam `SET app.current_tenant` com `ten` do JWT.
- Tokens: access_token ~15m; refresh_token persistido com hash (sha256) em refresh_tokens.
- E-mail: em dev, o “envio” é logado no console; em prod, configurar SMTP (Nodemailer) ou provedor externo.
- Senhas: bcrypt + pepper (`PASSWORD_PEPPER`); recomenda-se Argon2id em produção.

Configuração
- DATABASE_URL=postgres://...
- WEBAPP_BASE_URL=http://localhost:5173
- JWT_PRIVATE_KEY=... (PEM) [opcional em dev]
- JWT_PUBLIC_KEY=... (PEM)  [opcional em dev]
- (dev fallback) JWT_SECRET=dev-insecure-secret
- E-mail (SMTP) — para envio real dos links:
  - SMTP_HOST, SMTP_PORT (465/587), SMTP_SECURE=(true|false)
  - SMTP_USER, SMTP_PASS
  - EMAIL_FROM="DataInova <no-reply@dominio>"
  - Dica: use Mailtrap para sandbox (host=sandbox.smtp.mailtrap.io, port=2525, secure=false).
- Se SMTP não estiver configurado, o backend usa fallback e apenas registra o link no console/dev_link.
- Senhas
  - PASSWORD_PEPPER=... (pepper global gerenciado por Secrets Manager/KMS)

Fluxo de Onboarding (Free)
1) Usuário informa e-mail em “Registrar”.
2) Sistema cria tenant Free e atribui owner ao usuário.
3) Email com link de verificação é enviado.
4) Usuário clica, conta é ativada e tokens gerados.
5) Após login, upgrades de plano ocorrem dentro do sistema.

Observações
- Roles padrão e permissões são garantidas on-demand na criação do tenant.
- A estratégia de redirect via hash serve ao ambiente dev; em prod, preferir cookies HttpOnly e troca via front-channel/back-channel.
- POST /auth/forgot-password
  - Body: { email }
  - Ações: gera token (1h) e envia link de redefinição por e‑mail. Sempre retorna 200 para evitar enumeração.
  - Response 200: { ok: true }

- GET /auth/reset-password?token=...&redirect=http://localhost:5173/reset
  - Valida o token e redireciona para o front com `#reset_token=...`.
  - Response 200 (sem redirect): { ok: true }

- POST /auth/reset-password
  - Body: { token, password }
  - Ações: valida token, persiste nova senha (bcrypt + pepper) e retorna { ok: true }.
