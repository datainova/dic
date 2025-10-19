# Environment Variables — Backend

Variáveis de ambiente sugeridas (exemplo em `.env`)

DATABASE_URL=postgresql://user:pass@host:5432/dbname
JWT_SECRET=change_this_secret
REDIS_URL=redis://127.0.0.1:6379
PORT=4000

Notes
- Nunca commitar `.env` com segredos reais.
- Em produção, use secrets manager (Render/Aiven) e rotacione chaves.

Embedding
- `EMBEDDING_PROVIDER`: provedor de embedding para os jobs de ingestão (injection_jobs).
  - Padrão: `openai`
  - Outros: `local` (ou qualquer string interna que o worker reconheça)

Vector DB (Chroma/pgvector)
- Chroma (recomendado):
  - `CHROMA_URL`: URL base do servidor Chroma.
    - Ex.: `http://localhost:8000`
  - Subir local: `docker compose up -d chroma`
- pgvector (alternativo):
  - `VECTOR_DB_URL`: URL para o Postgres com pgvector.
    - Ex.: `postgres://vector:vector@localhost:5433/vector`
  - Subir local: `docker compose up -d vectordb` (schema em `backend/db/vector.sql`).
