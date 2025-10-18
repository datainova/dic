# Arquitetura — Backend

Visão geral da arquitetura do backend do DataInova Connect.

Componentes principais
- API Layer (Express): expõe endpoints REST para o frontend e integrações.
- Controllers: roteiam requisições e validam parâmetros.
- Services: regra de negócio e orquestração entre models e infra.
- Models/ORM: acesso ao PostgreSQL (usar Prisma, TypeORM ou Sequelize).
- Worker Integration: filas (Redis/BullMQ ou RabbitMQ) para jobs assíncronos.
- Auth & Multi-tenant: middleware de autenticação JWT e resolução de tenant.

Fluxo simplificado
1. Requisição chega ao Controller.
2. Controller valida/normaliza dados e delega ao Service.
3. Service interage com Models/ORM e/ou enfileira jobs para o Worker.
4. Service retorna resultado ao Controller, que responde ao cliente.

Escalabilidade
- Separar leitura/escrita com read-replicas do PostgreSQL.
- Usar caching (Redis) para dashboards intensivos.
- Horizontal scaling com stateless API e autoscaling no Render.
