# Job Processes — Worker

Tipos de jobs
- Data ingestion: validação e normalização
- Indicator calculation: cálculos periódicos e atualizações preditivas
- Model training: treinamento e atualização de modelos
- Notifications: envio de e-mails e alertas

Práticas
- Jobs idempotentes
- Retries exponenciais
- Dead-letter queue para falhas persistentes
