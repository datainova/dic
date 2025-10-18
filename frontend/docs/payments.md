# Pagamentos — Integração com Stripe (Frontend)

Variáveis de ambiente

- VITE_STRIPE_PUBLISHABLE_KEY — chave pública do Stripe (ex: pk_live_...)

Instalação

```bash
cd frontend
npm install @stripe/stripe-js @stripe/react-stripe-js
```

Uso básico (React)

```tsx
import {loadStripe} from '@stripe/stripe-js'
import {Elements} from '@stripe/react-stripe-js'

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)

function Checkout(){
  return (
    <Elements stripe={stripePromise}>
      {/* componente de pagamento */}
    </Elements>
  )
}
```

Notas

- O frontend só usa a chave publicável. Todas as operações sensíveis (criar PaymentIntent, assinaturas) devem ser feitas no backend.
