# Pagamentos — Integração com Stripe (Backend)

Visão geral

O backend é responsável por operações sensíveis da Stripe:
- Criar e gerenciar Customers
- Criar PaymentIntents para cobranças
- Criar Sessions para Checkout
- Validar webhooks (assinaturas) e processar eventos

Variáveis de ambiente

- STRIPE_SECRET_KEY — chave secreta do Stripe (ex: sk_live_...)
- STRIPE_WEBHOOK_SECRET — segredo do endpoint de webhook (para validar assinaturas)

Instalação

```bash
cd backend
npm install stripe
```

Exemplo básico (Node.js/Express)

```ts
import Stripe from 'stripe'
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-08-16' })

// criar customer
const customer = await stripe.customers.create({ email: 'user@example.com' })

// criar PaymentIntent
const pi = await stripe.paymentIntents.create({
  amount: 1000,
  currency: 'brl',
  customer: customer.id,
})
```

Webhooks

- Assine e valide eventos com `stripe.webhooks.constructEvent(payload, sig, STRIPE_WEBHOOK_SECRET)`
- Exemplos de eventos relevantes: `payment_intent.succeeded`, `invoice.paid`, `checkout.session.completed`

Segurança

- Nunca expor `STRIPE_SECRET_KEY` no frontend
- Use HTTPS e verifique assinaturas de webhook
