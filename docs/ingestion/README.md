Ingestão e Embeddings — DataInova Connect

Visão geral
- Após concluir o wizard, o backend cria um job de ingestão (tabela `injection_jobs`) com os dados consolidados (missão, visão, etc.).
- O worker lê jobs `pending`, gera embeddings via OpenAI (LangChain) e faz upsert no Chroma. Em seguida marca o job como `completed`.

Pipeline
1. Backend (`POST /onboarding/complete`)
   - Consolida `input_text` do perfil (workspace/company/mission/vision).
   - Enfileira job: `source='onboarding'`, `subject='wizard_profile'`.
   - Idempotência e dedupe:
     - `idempotency_key`: chave determinística por tenant+subject+hash(texto).
     - `content_hash`: sha256 do `input_text`.
     - Índices únicos impedem duplicação/concorrência.
2. Worker (`worker/src/ingest.ts`)
   - Seleciona jobs `pending` com `FOR UPDATE SKIP LOCKED` e troca para `processing`.
   - Embedding com `OpenAIEmbeddings` (LangChain) — modelo default `text-embedding-3-small`.
   - Upsert no Chroma (coleção por tenant+subject), id = `job.id`.
   - Atualiza job `completed` (ou `failed` após 3 tentativas com `last_error`).

Tabelas e índices (resumo)
- `injection_jobs` — campos principais:
  - `tenant_id, user_id, subject, payload, input_text`
  - `idempotency_key`, `content_hash`, `embedding_provider`
  - `status` (pending/processing/completed/failed), `priority`, `attempts`
  - `vector_store_key`, `last_error`, timestamps
- Índices únicos para evitar duplicação:
  - `UNIQUE (tenant_id, subject) WHERE status IN ('pending','processing')`
  - `UNIQUE (tenant_id, subject, idempotency_key) WHERE idempotency_key IS NOT NULL`
  - `UNIQUE (tenant_id, subject, content_hash, embedding_provider) WHERE content_hash IS NOT NULL`

Execução local
1) Subir Chroma:
   - `docker compose up -d chroma`
   - ou `./scripts/start-chroma.sh`
2) Definir env do worker (`worker/.env`):
   - `DATABASE_URL=...` (mesma do backend)
   - `CHROMA_URL=http://localhost:8000`
   - `OPENAI_API_KEY=...` (não commitar; usar `.env` local)
   - `EMBEDDING_MODEL=text-embedding-3-small`
3) Rodar worker:
   - `npm --prefix worker install`
   - `npm --prefix worker run dev` (logs em `logs/worker.ingest.log` se usado nohup)

Limpeza para testes
- Script: `./scripts/clean-test.sh` — apaga tenant `datainova`, usuários de teste, limpa `injection_jobs` e dados do Chroma local.
- Manual:
  - `node backend/scripts/delete-tenant-by-slug.js datainova`
  - `node backend/scripts/delete-by-email.js "user@example.com"`
  - `node backend/scripts/clean-injection-jobs.js --tenant datainova --subject wizard_profile`
  - `docker stop dic-chroma && rm -rf ./.data/chroma`

Variáveis de ambiente
- Backend: `EMBEDDING_PROVIDER` (default `openai`), `DATABASE_URL`, `CHROMA_URL` (opcional no backend), `WEBAPP_BASE_URL` etc.
- Worker: `DATABASE_URL`, `CHROMA_URL`, `OPENAI_API_KEY`, `EMBEDDING_MODEL`, `INGEST_BATCH_SIZE`, `INGEST_SLEEP_MS`.

Soluções de problemas
- Chroma não responde `healthy`: o endpoint v1 `/api/v1/heartbeat` pode retornar “Unimplemented” nas versões novas — ainda assim a API v2 funciona. Aguarde alguns segundos após o start.
- Worker não inicia: verifique `OPENAI_API_KEY` no `worker/.env` e `DATABASE_URL` válido.
- Jobs duplicados: verifique as constraints únicas da tabela; `ON CONFLICT DO NOTHING` é usado no enfileiramento.

