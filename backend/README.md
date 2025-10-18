# Backend — DataInova Connect

Breve introdução e instruções para desenvolvimento e execução do backend.

Conteúdo
- `src/` — código-fonte do servidor (controllers, services, models, routes)
- `docs/` — documentação técnica (arquitetura, endpoints, env, fluxo de dados)

Como rodar (desenvolvimento)

1. Copie o `.env.example` para `.env` e configure as variáveis de ambiente.
2. Instale dependências: `npm install`
3. Rodar em modo dev: `npm run dev` (usa `ts-node-dev`)

Build e produção

1. `npm run build` — compila TypeScript em `dist/`
2. `npm start` — inicia `node dist/index.js`

Padrões de código

- Estrutura MVC: Controllers → Services → Models
- Middlewares para autenticação, validação e logging
- Separar código multi-tenant (tenantId) em middleware de contexto

