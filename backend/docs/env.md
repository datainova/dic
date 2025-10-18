# Environment Variables — Backend

Variáveis de ambiente sugeridas (exemplo em `.env`)

DATABASE_URL=postgresql://user:pass@host:5432/dbname
JWT_SECRET=change_this_secret
REDIS_URL=redis://127.0.0.1:6379
PORT=4000

Notes
- Nunca commitar `.env` com segredos reais.
- Em produção, use secrets manager (Render/Aiven) e rotacione chaves.
