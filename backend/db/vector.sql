-- Local Vector DB schema (pgvector)
-- This file is mounted into the vector Postgres container on first boot

-- Extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Embeddings table
-- Note: This DB is independent from the main app DB, so we do not declare
-- foreign keys to tenants/users here. We still store tenant_id for isolation.
CREATE TABLE IF NOT EXISTS vector_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  namespace text NOT NULL DEFAULT 'default',
  subject text NOT NULL,               -- e.g., 'wizard_profile'
  record_id text,                      -- optional external id (origin)
  content text NOT NULL,               -- human-readable/generative content
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  embedding vector(1536) NOT NULL,     -- 1536 for OpenAI text-embedding-3-* (adjust if needed)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Similarity index (IVFFlat over cosine distance)
-- Note: Requires ANALYZE after bulk inserts for best performance.
CREATE INDEX IF NOT EXISTS vector_embeddings_embedding_ivfflat
  ON vector_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Helpful filters
CREATE INDEX IF NOT EXISTS vector_embeddings_tenant_filter_idx
  ON vector_embeddings (tenant_id, namespace, subject);

COMMENT ON TABLE vector_embeddings IS 'Armazena embeddings de texto por tenant/namespace/assunto.';
COMMENT ON COLUMN vector_embeddings.embedding IS 'Vetor de embedding (dimensão 1536 por padrão, ajuste conforme o modelo).';

