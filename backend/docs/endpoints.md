# Endpoints — Backend

Lista de endpoints principais (exemplos). Documente cada rota real do projeto aqui.

Autenticação
- POST /auth/login — login com email/senha, retorna JWT
- POST /auth/refresh — refresh token

Tenants & Usuários
- GET /tenants — listar tenants (admin)
- POST /tenants — criar tenant (admin)
- GET /tenants/:id/users — listar usuários do tenant

Indicadores
- GET /tenants/:tenantId/indicators — lista indicadores do tenant
- POST /tenants/:tenantId/indicators — criar indicador
- GET /tenants/:tenantId/indicators/:id — detalhar indicador

Jobs / Processamento
- POST /jobs/data-upload — endpoint para upload de dados (agent ou manual)

Onboarding
- GET /me/onboarding-state — retorna se é primeiro acesso e estado salvo
- GET /onboarding/slug-availability?slug=acme — checar disponibilidade de slug
- PUT /onboarding/steps/:stepId — salvar dados do passo (autosave)
- POST /onboarding/complete — concluir onboarding e provisionar tenant

Exemplos
- Estado:
```
GET /me/onboarding-state
Authorization: Bearer <access_token>

200 { "firstAccess": true, "state": { "current_step": "workspace", "data": {}, "completed": false, "progress": 0 } }
```
- Salvar workspace:
```
PUT /onboarding/steps/workspace
Authorization: Bearer <access_token>
Content-Type: application/json
{ "workspaceName": "Acme Analytics", "workspaceSlug": "acme-analytics" }

200 { "current_step": "workspace", "data": { ... }, "completed": false, "progress": 0 }
422 { "code": "VALIDATION", "fieldErrors": { "workspaceName": "Informe de 2 a 50 caracteres." } }
```
- Concluir:
```
POST /onboarding/complete
Authorization: Bearer <access_token>

200 { "ok": true, "tenant_id": "...", "tokens": { "access_token": "..." } }
422 { "code": "VALIDATION", "fieldErrors": { "vision": "Visão inválida." } }
```

Observações
- Incluir exemplos de request/response e códigos de erro
- Documentar roles/permissions necessárias para cada rota
