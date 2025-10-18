**Data Layer Documentation**

- Objetivo: documentar 100% o schema de autenticação/RBAC/multi-tenant para onboarding rápido e operação segura.

- Fontes de verdade:
  - SQL DDL: `backend/db/init.sql` (estrutura, RLS, índices, partições)
  - Comentários SQL: `backend/db/comments.sql` (data dictionary no catálogo)
  - Seed: `backend/scripts/seed.js` + `backend/SEEDING.md`
  - Dicionário gerado: `docs/data/SCHEMA_CURRENT.md` (extraído do banco via catálogo)
  - ERD: `docs/data/ERD.md`

- Como gerar a documentação a partir do banco:
  1) Aplique init e comments no banco (uma vez):
     - `psql "$DATABASE_URL" -f backend/db/init.sql`
     - `psql "$DATABASE_URL" -f backend/db/comments.sql`
  2) Gere o dicionário atual: `npm --prefix backend run db:docs`
  3) Abra `docs/data/SCHEMA_CURRENT.md`

- Como manter sincronizado:
  - Ao alterar o schema, atualize `init.sql` e os comentários correspondentes em `comments.sql`.
  - Reaplique os comentários (`psql -f backend/db/comments.sql`) em staging/prod quando houver novas colunas.
  - Rode `db:docs` para atualizar o markdown gerado e revise no PR.

- Convenções de design:
  - Tenancy: shared schema + RLS com `SET app.current_tenant` e `fn_current_tenant()`.
  - Identidades: `identities` agrega provedores (`local`, OIDC, SAML); armazenar apenas hash.
  - RBAC: roles por tenant + permissions globais + tabelas de junção; índices críticos para lookups.
  - Auditoria: `audit_logs` e `login_attempts` particionados por mês.
  - Segurança: RLS habilitado para tabelas multi-tenant; chaves/API em hash; sessões e refresh rotacionáveis.

- Processo de mudança (mutações de schema):
  - Criar migração incremental (nova .sql) baseada em `init.sql`.
  - Adicionar comentários das novas colunas/tabelas em `comments.sql`.
  - Rodar em staging, gerar `SCHEMA_CURRENT.md` e revisar.
  - Executar smoke tests de RLS e RBAC.

