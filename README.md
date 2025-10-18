# DataInova Connect (DIC)

DataInova Connect é uma plataforma SaaS de Indicadores Inteligentes. Este repositório é um monorepo simples com três camadas principais:

- `frontend/` — interface do usuário (React + Vite + Tailwind)
- `backend/` — API e lógica de negócio (Node.js + Express)
- `worker/` — processamento assíncrono (Redis-based queues)

Quickstart (local)

1. Instalar dependências em cada pasta:

```bash
cd frontend && npm install
cd ../backend && npm install
cd ../worker && npm install
```

2. Rodar em terminais separados:

```bash
cd backend && npm run dev   # API em http://localhost:4000
cd frontend && npm run dev  # Vite geralmente em http://localhost:5173 (ou 5174 se 5173 estiver em uso)
cd worker && npm run dev    # worker example
```

Stripe

Integrado para pagamentos. Variáveis de ambiente:

- backend: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (ver `backend/.env.example`)
- frontend: `VITE_STRIPE_PUBLISHABLE_KEY` (ver `frontend/.env` — não commitado)

CI

Um workflow básico de CI foi adicionado em `.github/workflows/ci.yml` que instala e builda cada pacote.

Contribuição

- Use branches de tópico e PRs para `main`.
- Adicione testes e documente endpoints em `backend/docs/endpoints.md`.

Licença

Projeto licenciado sob MIT — veja `LICENSE`.
# DIC

Workspace inicial criado automaticamente.

Conteúdo:
- `DIC.code-workspace` — arquivo de workspace do VS Code
- `.vscode/extensions.json` — recomendações de extensões
- `.github/copilot-instructions.md` — instruções para Copilot

Substitua este README com detalhes do projeto.
