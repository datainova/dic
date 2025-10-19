**Autenticação — Email Link (Registro e Login)**

- Objetivo: permitir registro com e-mail (plano Free por padrão) e login por link mágico.
- Tecnologias: Express, PostgreSQL (tabelas conforme init.sql), JWT (RS256 se chaves fornecidas; fallback HS256 dev).

Endpoints
- POST /auth/register
  - Body: { "email": "user@empresa.com" }
  - Ações:
    - Upsert do usuário (is_active=false se novo).
    - Cria um tenant Free (slug derivado do e-mail) se o usuário não tiver tenant; aplica roles padrão e vincula como owner.
    - Emite token de verificação (24h) e envia link por e-mail (em dev, loga no console).
  - Response 200: { ok: true, dev_link?: "http://localhost:4000/auth/verify-email?..." }

- POST /auth/login-email
  - Body: { "email": "user@empresa.com" }
  - Ações: Emite link mágico (1h) para usuário existente e tenant atual; envia por e-mail (em dev, loga).
  - Response 200: { ok: true, dev_link?: "..." }

- GET /auth/verify-email?token=...&redirect=http://localhost:5173/auth/callback
  - Ações:
    - Valida token (purpose=verify_email), ativa o usuário e garante identidade local (provider_uid=email).
    - Cria session + refresh_token (hash em DB), emite access_token (15m).
    - Se redirect informado, redireciona para o front com tokens no hash: #access_token=...&refresh_token=...
  - Response 200 (se sem redirect): { access_token, refresh_token, expires_in }

- GET /me (protegido)
  - Header: Authorization: Bearer <access_token>
  - Retorna: { user, tenant, roles }

Segurança e Tenancy
- RLS: rotas autenticadas executam `SET app.current_tenant` com `ten` do JWT.
- Tokens: access_token ~15m; refresh_token persistido com hash (sha256) em refresh_tokens.
- E-mail: em dev, o “envio” é logado no console; em prod, configurar SMTP (Nodemailer) ou provedor externo.

Configuração
- DATABASE_URL=postgres://...
- WEBAPP_BASE_URL=http://localhost:5173
- JWT_PRIVATE_KEY=... (PEM) [opcional em dev]
- JWT_PUBLIC_KEY=... (PEM)  [opcional em dev]
- (dev fallback) JWT_SECRET=dev-insecure-secret

Fluxo de Onboarding (Free)
1) Usuário informa e-mail em “Registrar”.
2) Sistema cria tenant Free e atribui owner ao usuário.
3) Email com link de verificação é enviado.
4) Usuário clica, conta é ativada e tokens gerados.
5) Após login, upgrades de plano ocorrem dentro do sistema.

Observações
- Roles padrão e permissões são garantidas on-demand na criação do tenant.
- A estratégia de redirect via hash serve ao ambiente dev; em prod, preferir cookies HttpOnly e troca via front-channel/back-channel.

