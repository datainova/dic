# API Integration — Frontend

Best practices

- Comunicar somente via HTTPS e enviar JWT no header `Authorization: Bearer <token>`
- Tratar erros de rede e autenticação globalmente com interceptors (fetch/axios)
- Evitar lógica de negócio no frontend; delegar ao backend

Exemplo (pseudo)

fetch('/api/tenants/1/indicators', { headers: { Authorization: `Bearer ${token}` } })
