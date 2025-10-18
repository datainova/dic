# Project Overview — DataInova Connect (DIC)

Resumo

DataInova Connect é uma plataforma SaaS de Indicadores Inteligentes. O repositório está organizado em três camadas principais:

- `frontend/` — interface do usuário (React + Vite + Tailwind)
- `backend/` — API e lógica de negócio (Node.js + Express)
- `worker/` — processamento assíncrono (Redis/filas)

Estrutura de documentação

- Cada pacote (frontend/backend/worker) possui um `README.md` e uma pasta `docs/` com documentação técnica por área.
- Este `project-overview.md` resume o propósito do projeto, arquitetura e como começar.

Como começar

1. Instalar dependências em cada subdiretório:

```bash
cd frontend && npm install
cd ../backend && npm install
cd ../worker && npm install
```

2. Rodar cada serviço em terminais separados (veja READMEs de cada pacote)

Próximos passos sugeridos

- Adicionar testes e pipeline de CI
- Configurar monorepo (opcional) com workspaces
- Conectar serviços gerenciados (Aiven, Render)

Integração com Stripe

Este projeto inclui integração com Stripe para pagamentos/subscriptions.

- Backend: usa `STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET` (ver `backend/.env.example`)
- Frontend: usa `VITE_STRIPE_PUBLISHABLE_KEY` em `frontend/.env`

Certifique-se de configurar as chaves de teste em dev e as chaves live em produção.
