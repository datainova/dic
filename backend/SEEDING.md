**Seeding (Auth, RBAC e Multi‑Tenant)**

- Requisitos:
  - Banco com DDL aplicada (tabelas/índices/extensões do módulo de auth/RBAC).
  - `DATABASE_URL` apontando para o Postgres (Aiven ou local).
  - Node.js disponível (usa `pg` e `bcrypt` do backend).

- O que o seed faz:
  - Insere permissões base: `kpi:read`, `kpi:write`, `user:invite`, `user:manage`, `role:manage`.
  - Cria os tenants `acme` (enterprise) e `globex` (pro) com domínios.
  - Cria roles padrão por tenant: `owner`, `admin`, `analyst`, `viewer` e mapeia `role_permissions`.
  - Cria usuários por tenant com identidade `local` (senha bcrypt) e atribui `user_roles`.
  - Emite 1 API key por tenant e exibe o token completo (apenas uma vez) no console.

- Como rodar:
  1) Garanta que o DDL foi aplicado (ver documento de arquitetura). Ex.: extensões `pgcrypto`, `citext` e tabelas como `tenants`, `users`, `roles`, etc.
  2) Exporte a URL do banco: `export DATABASE_URL=postgres://user:pass@host:port/dbname`.
  3) Execute no backend: `npm run seed`.

- Saída esperada (exemplo):
  - `[acme] owner -> owner@acme.com / ChangeMe123!-acme`
  - `[acme] API key (CI Agent) -> dinv_dev_ab12cd.XXXX... (store securely; shown once)`
  - `[globex] admin -> admin@globex.com / ChangeMe123!-globex`

- Padrões aplicados (RBAC):
  - `owner` -> todas as permissões
  - `admin` -> `kpi:read`, `kpi:write`, `user:invite`, `user:manage`
  - `analyst` -> `kpi:read`, `kpi:write`
  - `viewer` -> `kpi:read`

- Observações de segurança:
  - Seeds usam senha bcrypt para `identities.secret_hash` por praticidade. Em produção, preferir Argon2id com pepper (aplicação).
  - API keys são exibidas somente uma vez e gravadas como hash SHA‑256 (`api_keys.token_hash`). Armazene o valor exibido em um cofre.
  - RLS: o seed não altera políticas; garanta que o middleware de tenant execute `SET app.current_tenant` antes das consultas.

- Testes rápidos (psql):
  - Obter IDs de tenants: `SELECT id, slug FROM tenants WHERE slug IN ('acme','globex');`
  - Fixar tenant no GUC: `SET app.current_tenant = '<uuid-de-acme>';`
  - Listar roles do tenant atual: `SELECT code FROM roles;`
  - Ver RBAC: `SELECT r.code, p.code FROM roles r JOIN role_permissions rp ON rp.role_id=r.id JOIN permissions p ON p.id=rp.permission_id;`

- Reset (ambiente de dev):
  - Para remover apenas dados de auth: `TRUNCATE identities, user_roles, user_tenants, users, role_permissions, roles, api_keys RESTART IDENTITY CASCADE;`

