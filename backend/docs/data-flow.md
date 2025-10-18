# Data Flow — Backend

Descrição dos fluxos de dados entre camadas e serviços.

1. Ingestão de dados
- DataInova Agent (Enterprise) envia dados via POST /jobs/data-upload (TLS)
- API valida, armazena em bucket temporário e enfileira job para processamento

2. Processamento
- Worker consome job e processa transformações, normalizações e cálculos
- Resultados são gravados em PostgreSQL (tabelas de indicadores) e em vetor DB quando necessário

3. IA & Vetor DB
- Para extração semântica, dados relevantes são enviados ao Vector DB (Crohma)
- Modelos preditivos consultam o Vector DB e geram recomendações que são persistidas

4. Entrega
- Frontend consome APIs de leitura para dashboards e relatórios
