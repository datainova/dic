# Wizard de Primeiro Acesso — DataInova Connect

Visão geral do fluxo de onboarding de primeiro acesso para criação de workspace (tenant) e perfil da empresa.

Objetivos
- Coletar dados mínimos para provisionar o tenant e o perfil da empresa.
- Experiência rápida, acessível (WCAG 2.1 AA) e responsiva.
- Persistência com autosave por passo e retomada no próximo login.

Arquitetura
- Frontend: React + TypeScript + Vite, TailwindCSS, Framer Motion.
- Backend: Node.js + Express + PostgreSQL.
- Tabelas: `onboarding_states` (progresso por usuário), `tenant_profiles` (perfil do tenant).
- UI Hero: fundo dedicado com gradiente da marca (aurora), textura sutil (grid) e linha animada leve; card do wizard no topo (z‑index).

Contratos de API
- GET `/me/onboarding-state` → `{ firstAccess: boolean, state?: { current_step, data, completed, progress } }`
- PUT `/onboarding/steps/{stepId}` → body com payload do passo. Retorna estado consolidado.
- GET `/onboarding/slug-availability?slug=...` → `{ available: boolean, slug }`
- POST `/onboarding/complete` → cria tenant, associa usuário, grava `tenant_profiles` e retorna tokens atrelados ao tenant.
- POST `/telemetry/onboarding` → eventos de telemetria (opcional, salva em `audit_logs`).

Passos e Validações (com storytelling)
1. Workspace — “Vamos batizar seu espaço”
   - `workspaceName` (2–50) obrigatório
   - `workspaceSlug` (opcional, gerado do nome; [a-z0-9-], 2–50). Validação em tempo real.
2. País — “Onde vocês operam?”
   - `country` (obrigatório; BR default; select)
3. Nome da empresa — “Qual é o nome da organização?”
   - `companyName` (2–100) obrigatório
4. Segmento — “Em que mercado atuam?”
   - `segment` (obrigatório; se “Outro” → `segmentOther` 2–40)
5. Porte — “Qual o porte da empresa?”
   - `companySize` (obrigatório; radio cards com dicas)
6. Missão — “Qual é a missão?”
   - `mission` (20–500)
7. Visão — “E a visão de futuro?”
   - `vision` (20–500)
8. Resumo — “Tudo pronto para começar”
   - Preview de todos os campos e ação de editar passo específico.

Acessibilidade
- Navegação por teclado: Alt+→ avançar, Alt+← voltar, Enter envia passo se válido.
- Foco vai ao primeiro erro; mensagens inline com `role=alert` e aria-live discreta para “Tudo salvo”.
- Stepper com breadcrumbs textuais (sr-only).

Persistência/Retomada
- Autosave no botão Avançar de cada passo (`PUT /onboarding/steps/{stepId}`).
- “Salvar e sair” oculta o wizard para a sessão atual (flag `onboarding_paused_session`). Novo login retoma do passo salvo.
- `GET /me/onboarding-state` retorna `{ firstAccess, state }` para gating no front.

Banco de Dados
- `onboarding_states(user_id PK, current_step text, data jsonb, completed boolean, started_at, updated_at)`
- `tenant_profiles(tenant_id PK, country, company_name, segment, segment_other, company_size, mission, vision, created_at, updated_at)`

Critérios de Aceite (DoD)
- Exibição apenas quando `firstAccess=true`; bloqueio do app até concluir ou salvar e sair.
- Validações inline com feedback acessível.
- Responsivo (mobile-first) e microinterações suaves (200–250ms).
- API conforme contrato e erros em toast/inline (amigáveis, sem culpar o usuário).
- Telemetria básica: `onboarding_step_view`, `onboarding_step_submit`, `onboarding_complete` (registrados em `audit_logs`).

Como testar localmente
1. Inicie os serviços: `./scripts/start-all.sh`.
2. Crie um usuário (registro por e‑mail) e capture o link no log (modo dev).
3. Ao entrar sem tenant, o wizard abre automaticamente.
4. Preencha os passos, avance para ver “Tudo salvo”, e escolha Concluir.
5. Verifique no banco as tabelas `tenants`, `tenant_profiles` e o vínculo do usuário.

Exemplos de API (curl)
- Estado do onboarding:
  - `curl -H "Authorization: Bearer $TOKEN" http://localhost:4000/me/onboarding-state`
- Salvar Workspace:
  - `curl -X PUT -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" \\
     -d '{"workspaceName":"Acme Analytics","workspaceSlug":"acme-analytics"}' \\
     http://localhost:4000/onboarding/steps/workspace`
- Concluir:
  - `curl -X POST -H "Authorization: Bearer $TOKEN" http://localhost:4000/onboarding/complete`

Hero — ajustes de intensidade e slogan
- Intensidade da “aurora”: edite `.bg-aurora` em `frontend/src/styles.css` (opacidade e keyframes `auroraShift`).
- Textura (grid) e linha: classes `.bg-grid` e `.bg-line` no mesmo arquivo; ajuste `opacity` e `animation`.
- Slogan/título: em `frontend/src/onboarding/Wizard.tsx` (hero central) — altere o texto direto ou leia de uma config.
