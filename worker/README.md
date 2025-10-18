# Worker — DataInova Connect

Component responsible por processamento assíncrono, jobs e integração com filas.

Como rodar

1. `npm install`
2. `npm run dev`

Notas
- Utilizar Redis como backend de filas
- Jobs devem ser idempotentes e com bom tratamento de erros
