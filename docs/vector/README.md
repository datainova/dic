Vector DB (Local Dev) — Chroma

Objetivo
- Subir um banco vetorial local (Chroma) para desenvolvimento do fluxo de embeddings (worker). Em produção, ficará no Render em /Data.

Como subir localmente
1) Requisitos: Docker + Docker Compose
2) Execute:
   - `docker compose up -d chroma`
   - Alternativa: `./scripts/start-chroma.sh`
3) A conexão local fica em: `http://localhost:8000`

Variáveis de ambiente (backend/worker)
- `CHROMA_URL=http://localhost:8000`
- `EMBEDDING_PROVIDER=openai` (default já configurado)

Uso básico (HTTP API)
- Heartbeat: `GET /api/v1/heartbeat`
- A API do Chroma fornece endpoints para criar coleções, inserir documentos/embeddings e realizar buscas. Consulte a documentação oficial para a versão do servidor em uso.

Alternativa (pgvector)
- O repositório mantém também uma opção pgvector (serviço `vectordb` no `docker-compose.yml`) caso desejado para testes comparativos. Ver `backend/db/vector.sql` e `VECTOR_DB_URL` em `backend/.env.example`.

