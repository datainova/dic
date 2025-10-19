export type OnboardingState = {
  current_step: StepId
  data: Record<string, any>
  completed: boolean
  progress?: number
}

export const STEP_ORDER = ['workspace','country','companyName','segment','size','mission','vision','review'] as const
export type StepId = typeof STEP_ORDER[number]

export const SEGMENTS = [
  'Tecnologia','Agronegócio','Indústria','Varejo','Serviços','Saúde','Educação','Financeiro','Logística','Construção','Governo','Outro'
]

export const COMPANY_SIZES = [
  'Microempresa','Pequena empresa','Média empresa','Grande porte','Multinacional'
]

export type StepProps = {
  state: OnboardingState
  setState: (s: OnboardingState) => void
  apiBase: string
  token: string
  onSaved: (next?: StepId) => void
  onBack: () => void
  onComplete: () => void
}

export function normalizeSlug(input: string) {
  return input.toLowerCase().trim().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g,'').slice(0,50)
}
