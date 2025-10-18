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

Observações
- Incluir exemplos de request/response e códigos de erro
- Documentar roles/permissions necessárias para cada rota
