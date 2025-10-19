import React, { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { COUNTRIES } from './countries'
import { COMPANY_SIZES, OnboardingState, SEGMENTS, STEP_ORDER, StepId, normalizeSlug } from './types'

type Props = {
  apiBase: string
  token: string
  initial: OnboardingState
  onDismissForSession: () => void
  onCompleted: (tokens?: { access_token: string; refresh_token: string }) => void
}

const fadeSlide = {
  initial: { opacity: 0, x: 16 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.22 } },
  exit: { opacity: 0, x: -16, transition: { duration: 0.18 } }
}

function useAutosave(apiBase: string, token: string) {
  async function save(stepId: StepId, payload: any) {
    const res = await fetch(`${apiBase}/onboarding/steps/${stepId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload)
    })
    const data = await res.json().catch(()=>({}))
    if (!res.ok) throw data
    return data as OnboardingState
  }
  async function complete() {
    const res = await fetch(`${apiBase}/onboarding/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    })
    const data = await res.json().catch(()=>({}))
    if (!res.ok) throw data
    return data as { ok: true; tenant_id: string; tokens: { access_token: string; refresh_token: string } }
  }
  async function slugAvailability(slug: string) {
    const url = new URL(`${apiBase}/onboarding/slug-availability`)
    url.searchParams.set('slug', slug)
    const res = await fetch(url.toString())
    return res.json()
  }
  async function telemetry(event: string, step?: string, duration_ms?: number) {
    try {
      await fetch(`${apiBase}/telemetry/onboarding`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ event, step, duration_ms })
      })
    } catch { /* ignore */ }
  }
  return { save, complete, slugAvailability, telemetry }
}

function Stepper({ current, completed, onJump, remaining }: { current: StepId; completed: StepId[]; onJump?: (s: StepId)=>void; remaining?: string }){
  const idx = STEP_ORDER.indexOf(current)
  const pct = Math.round((idx)/(STEP_ORDER.length)*100)
  return (
    <div aria-label="Progresso do onboarding" className="w-full">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-white/70">Passo {idx+1} de {STEP_ORDER.length}</div>
        <div className="text-xs text-white/70">{pct}% {remaining? `• ${remaining}`:''}</div>
      </div>
      <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
        <div className="h-full bg-white/80" style={{ width: `${pct}%` }} />
      </div>
      <div className="hidden md:flex items-center justify-between mt-3">
        {STEP_ORDER.map((s,i)=>{
          const isDone = completed.includes(s) || i < idx
          const isCurrent = i === idx
          const clickable = isDone && onJump && !isCurrent
          return (
            <button key={s} type="button" onClick={() => clickable && onJump(s)}
              className={`flex items-center gap-2 group ${clickable?'cursor-pointer':'cursor-default'} bg-transparent`} aria-disabled={!clickable} title={labelForStep(s)}>
              <motion.div layout className={`h-6 w-6 grid place-items-center rounded-full ${isCurrent? 'bg-white text-brand-600':'bg-white/15 text-white'} ${isDone? 'ring-2 ring-white/80':''}`}
                animate={isDone?{ scale:[1,1.12,1]}: {}} transition={{ duration: .25 }} aria-hidden>
                {isDone? '✓' : i+1}
              </motion.div>
              <span className={`text-xs ${isCurrent? 'text-white':'text-white/70 group-hover:text-white'}`}>{labelForStep(s)}</span>
            </button>
          )
        })}
      </div>
      <div className="sr-only" role="navigation" aria-label="Breadcrumb">
        {STEP_ORDER.map((s,i)=> (
          <span key={s}>{i+1}. {labelForStep(s)}{i<STEP_ORDER.length-1? ' > ':''}</span>
        ))}
      </div>
    </div>
  )
}

function labelForStep(s: StepId){
  switch(s){
    case 'workspace': return 'Workspace'
    case 'country': return 'País'
    case 'companyName': return 'Empresa'
    case 'segment': return 'Segmento'
    case 'size': return 'Porte'
    case 'mission': return 'Missão'
    case 'vision': return 'Visão'
    case 'review': return 'Resumo'
  }
}

export default function Wizard({ apiBase, token, initial, onDismissForSession, onCompleted }: Props){
  const logoWhite = new URL('../image/white_icon_transparent_background.png', import.meta.url).href
  const logoBlack = new URL('../image/black_icon_transparent_background.png', import.meta.url).href
  // Current hero uses dark background, so pick white logo by default
  const heroLogo = logoWhite
  const [state, setState] = useState<OnboardingState>(initial)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string,string>>({})
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const { save, complete, slugAvailability, telemetry } = useAutosave(apiBase, token)
  const [completedSteps, setCompletedSteps] = useState<StepId[]>([])
  const startedAt = useRef(Date.now())
  const [toast, setToast] = useState<{ msg: string; retry: 'next'|'complete' } | null>(null)
  const [isCompleting, setIsCompleting] = useState(false)
  const [progressPct, setProgressPct] = useState(0)
  const progressTimer = useRef<number | null>(null)
  const prevStepRef = useRef<StepId>(initial.current_step)
  const containerRef = useRef<HTMLDivElement | null>(null)

  // keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent){
      if (e.altKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        e.preventDefault()
        if (e.key === 'ArrowRight') handleNext()
        if (e.key === 'ArrowLeft') handleBack()
      }
      // Ctrl/Cmd+Enter para textareas; Enter para demais campos
      if (e.key === 'Enter') {
        // submit on Enter when focused within wizard
        const active = document.activeElement as HTMLElement | null
        if (active && active.closest('#onboarding_wizard')) {
          const inTextarea = active.tagName.toLowerCase() === 'textarea'
          if (inTextarea) {
            if (e.ctrlKey || e.metaKey) { e.preventDefault(); handleNext() }
          } else { e.preventDefault(); handleNext() }
        }
      }
      // ESC = salvar e sair
      if (e.key === 'Escape') { e.preventDefault(); onDismissForSession() }
      // Alt+O = toggle segmento "Outro"
      if (e.altKey && (e.key.toLowerCase() === 'o')) {
        if (state.current_step === 'segment') {
          setState(s => {
            const isOther = s.data.segment === 'Outro'
            const next = { ...s, data: { ...s.data, segment: isOther ? '' : 'Outro' } }
            return next
          })
          setTimeout(() => { const el = document.getElementById('field_segmentOther') as HTMLElement | null; if (el) el.focus() }, 0)
        }
      }
      // Digitos 1..8: navegar para passos concluídos
      if (/^[1-9]$/.test(e.key)) {
        const num = parseInt(e.key, 10)
        const s = STEP_ORDER[num-1]
        if (s && (completedSteps.includes(s) || STEP_ORDER.indexOf(s) < STEP_ORDER.indexOf(state.current_step))) {
          e.preventDefault(); setState(prev => ({ ...prev, current_step: s }))
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state])

  // Telemetry for step view
  useEffect(() => {
    if (prevStepRef.current !== state.current_step) {
      telemetry('onboarding_step_view', state.current_step)
      prevStepRef.current = state.current_step
    }
  }, [state.current_step])

  // Focus trap simple implementation
  useEffect(() => {
    const root = containerRef.current
    if (!root) return
    const selector = 'a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"])'
    function onKeyDown(e: KeyboardEvent){
      if (e.key !== 'Tab') return
      const nodes = Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(el => !el.hasAttribute('disabled'))
      if (nodes.length === 0) return
      const first = nodes[0]
      const last = nodes[nodes.length-1]
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus() }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    root.addEventListener('keydown', onKeyDown)
    // set initial focus
    setTimeout(() => {
      const initial = root.querySelector<HTMLElement>('input, select, textarea, button')
      if (initial) initial.focus()
    }, 0)
    return () => root.removeEventListener('keydown', onKeyDown)
  }, [containerRef])

  function updateSaved(data: OnboardingState){
    setState(data)
    setSavedAt(Date.now())
    telemetry('onboarding_step_submit', data.current_step)
  }

  function currentIndex(){
    return Math.max(0, STEP_ORDER.indexOf(state.current_step))
  }

  async function handleNext(){
    const s = state.current_step
    const payload: any = {}
    const d = state.data || {}
    setErrors({})
    // gather by step
    if (s === 'workspace') { payload.workspaceName = d.workspaceName || ''; payload.workspaceSlug = d.workspaceSlug || '' }
    if (s === 'country') { payload.country = d.country || '' }
    if (s === 'companyName') { payload.companyName = d.companyName || '' }
    if (s === 'segment') { payload.segment = d.segment || ''; payload.segmentOther = d.segment==='Outro' ? (d.segmentOther||'') : '' }
    if (s === 'size') { payload.companySize = d.companySize || '' }
    if (s === 'mission') { payload.mission = d.mission || '' }
    if (s === 'vision') { payload.vision = d.vision || '' }
    if (s === 'review') { /* no-op, only to mark step */ }
    try {
      setSaving(true)
      const saved = await save(s, payload)
      updateSaved(saved)
      const idx = currentIndex()
      const next = STEP_ORDER[Math.min(STEP_ORDER.length-1, idx+1)]
      setCompletedSteps(prev=> Array.from(new Set([...prev, s])))
      // advance unless last step
      if (s !== 'review') setState({ ...saved, current_step: next })
    } catch (e: any) {
      setErrors(e?.fieldErrors || { _root: e?.message || 'Erro ao salvar' })
      telemetry('onboarding_error', state.current_step)
      const firstField = Object.keys(e?.fieldErrors||{})[0]
      if (firstField) {
        const el = document.getElementById(`field_${firstField}`)
        if (el) (el as HTMLElement).focus()
      }
      if (!e?.fieldErrors) setToast({ msg: 'Falha de rede ao salvar. Tentar novamente?', retry: 'next' })
    } finally { setSaving(false) }
  }

  async function handleBack(){
    const idx = currentIndex()
    if (idx > 0) {
      const prev = STEP_ORDER[idx-1]
      setState(s => ({ ...s, current_step: prev }))
    }
  }

  async function handleComplete(){
    try {
      setSaving(true)
      setIsCompleting(true)
      setProgressPct(6)
      // Animate progress to ~88% while server processes
      if (progressTimer.current) window.clearInterval(progressTimer.current)
      progressTimer.current = window.setInterval(() => {
        setProgressPct((p) => (p < 88 ? p + Math.max(1, Math.floor((90 - p) / 8)) : p))
      }, 250)
      const totalMs = Date.now() - (startedAt.current || Date.now())
      const data = await complete()
      // Finish progress
      if (progressTimer.current) window.clearInterval(progressTimer.current)
      setProgressPct(100)
      await telemetry('onboarding_complete', 'success', totalMs)
      onCompleted(data.tokens)
    } catch (e: any) {
      setErrors(e?.fieldErrors || { _root: e?.message || 'Erro ao concluir' })
      telemetry('onboarding_error', 'complete')
      if (!e?.fieldErrors) setToast({ msg: 'Falha de rede ao concluir. Tentar novamente?', retry: 'complete' })
    } finally {
      setSaving(false)
      // Keep isCompleting true until parent onCompleted closes wizard; no-op here
    }
  }

  const stepKey = state.current_step
  const helpByStep: Record<StepId, string> = {
    workspace: 'Dê um nome ao seu espaço — é como sua empresa/área aparecerá para a equipe.',
    country: 'Escolha o país-base para formatos de data/número e configurações locais.',
    companyName: 'Nome oficial/comercial da empresa para o perfil do workspace.',
    segment: 'Qual é o segmento principal? Se “Outro”, descreva brevemente.',
    size: 'Ajude-nos a calibrar a experiência selecionando o porte aproximado.',
    mission: 'Conte a missão da empresa em poucas linhas — o porquê de existir.',
    vision: 'Descreva a visão — onde querem chegar nos próximos anos.',
    review: 'Revise tudo rapidamente. Edite qualquer item antes de concluir.'
  }

  const storyTitle: Record<StepId, string> = {
    workspace: 'Vamos batizar seu espaço',
    country: 'Onde vocês operam?',
    companyName: 'Qual é o nome da organização?',
    segment: 'Em que mercado atuam?',
    size: 'Qual o porte da empresa?',
    mission: 'Qual é a missão?',
    vision: 'E a visão de futuro?',
    review: 'Tudo pronto para começar'
  }

  function labelForNextStep(s: StepId) {
    const order = STEP_ORDER
    const idx = order.indexOf(s)
    if (idx < 0 || idx === order.length - 1) return 'Avançar'
    const next = order[idx + 1]
    return next === 'review' ? 'Avançar para resumo' : `Avançar para ${labelForStep(next)}`
  }

  // slug check on change
  const [slugCheck, setSlugCheck] = useState<{ slug?: string; available?: boolean; checking?: boolean }|null>(null)
  useEffect(() => {
    const d = state.data || {}
    if (state.current_step !== 'workspace') return
    const slug = normalizeSlug(d.workspaceSlug || d.workspaceName || '')
    if (!slug) return
    const t = setTimeout(async () => {
      setSlugCheck({ slug, checking: true })
      const r = await slugAvailability(slug)
      setSlugCheck({ ...r, checking: false })
    }, 250)
    return () => clearTimeout(t)
  }, [state.data?.workspaceName, state.data?.workspaceSlug, state.current_step])

  // Ensure default country = BR when entering the country step
  useEffect(() => {
    if (state.current_step === 'country' && !state.data?.country) {
      setState(s => ({ ...s, data: { ...s.data, country: 'BR' } }))
    }
  }, [state.current_step])

  return (
    <>
    <div id="onboarding_wizard" ref={containerRef} className="hero-vibrant fixed inset-0 z-50 flex items-center justify-center px-4 bg-gradient-to-br from-brand-700 via-brand-600 to-black" role="dialog" aria-modal="true" aria-labelledby="onb-title">
      <div aria-hidden className="bg-aurora" />
      <div aria-hidden className="absolute inset-0 bg-grid opacity-20 pointer-events-none z-0" />
      <div aria-hidden className="bg-blob one absolute -top-10 -left-10 pointer-events-none z-0"/>
      <div aria-hidden className="bg-blob two absolute bottom-0 right-0 pointer-events-none z-0"/>
      <div aria-hidden className="bg-line pointer-events-none z-0" />
      <div aria-hidden className="bg-line alt pointer-events-none z-0" />
      <div aria-hidden className="bg-line alt2 pointer-events-none z-0" />
      <div className="pointer-events-none select-none absolute inset-0 grid place-items-center z-0">
        <div className="text-center">
          <img src={heroLogo} alt="" className="mx-auto w-20 h-20 md:w-28 md:h-28 opacity-90" />
          <h1 className="mt-3 text-white font-display text-xl md:text-2xl tracking-tight">DataInova Connect</h1>
          <p className="mt-1 text-white/80 text-xs md:text-sm">Seu ambiente inteligente de dados — pronto em minutos.</p>
        </div>
      </div>
      <div className="relative z-10 w-full max-w-2xl bg-white rounded-3xl shadow-2xl ring-1 ring-black/5 overflow-hidden pointer-events-auto">
        <div className="p-6 bg-brand-600 text-white">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="onb-title" className="text-xl font-semibold font-display">Bem-vindo ao DataInova Connect</h2>
              <p className="text-white/80 text-sm">{storyTitle[state.current_step]}</p>
            </div>
            <div className="hidden md:block text-xs text-white/80 pt-1">Dica: Alt+→ avançar</div>
          </div>
          <div className="mt-4"><Stepper current={state.current_step} completed={completedSteps} onJump={(s)=> setState(prev=>({ ...prev, current_step: s }))} remaining={useMemo(()=>{
            const idx = STEP_ORDER.indexOf(state.current_step)
            const elapsed = (Date.now() - (startedAt.current||Date.now())) / 1000
            const avg = Math.max(8, elapsed / Math.max(1, idx))
            const remainingSec = Math.round(avg * (STEP_ORDER.length - idx))
            if (!isFinite(remainingSec) || remainingSec <= 0) return undefined
            const m = Math.max(1, Math.round(remainingSec/60))
            return `~${m} min restantes`
          }, [state.current_step])} /></div>
        </div>
        <div className="p-6">
          <AnimatePresence mode="wait">
            <motion.div key={stepKey} {...fadeSlide}>
              <div className="space-y-4">
                {stepKey === 'workspace' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-800">Nome do workspace</label>
                    <input id="field_workspaceName" aria-invalid={!!errors.workspaceName} aria-describedby={errors.workspaceName?'err_workspaceName':undefined}
                      value={state.data.workspaceName||''}
                      onChange={e=> setState(s=>({...s, data:{...s.data, workspaceName: e.target.value, workspaceSlug: normalizeSlug(e.target.value)}}))}
                      onBlur={async()=>{ if (state.current_step==='workspace') { try { await save('workspace', { workspaceName: state.data.workspaceName||'', workspaceSlug: state.data.workspaceSlug||'' }); setSavedAt(Date.now()) } catch{} } }}
                      maxLength={50} placeholder="Ex.: Acme Analytics, Squad Agro, Comercial BR"
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-brand-400" />
                    {errors.workspaceName && <p id="err_workspaceName" role="alert" className="mt-1 text-sm text-red-600">{errors.workspaceName}</p>}
                    <div className="mt-3">
                      <label className="block text-sm font-medium text-slate-800">Slug/Subdomínio</label>
                      <div className="relative">
                        <input id="field_workspaceSlug" aria-invalid={!!errors.workspaceSlug} aria-describedby={errors.workspaceSlug?'err_workspaceSlug':undefined}
                          value={state.data.workspaceSlug||''}
                          onChange={e=> setState(s=>({...s, data:{...s.data, workspaceSlug: normalizeSlug(e.target.value)}}))}
                          onBlur={async()=>{ if (state.current_step==='workspace') { try { await save('workspace', { workspaceName: state.data.workspaceName||'', workspaceSlug: state.data.workspaceSlug||'' }); setSavedAt(Date.now()) } catch{} } }}
                          maxLength={50} placeholder="ex.: acme-analytics"
                          className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 pr-9 outline-none focus:ring-2 focus:ring-brand-400" />
                        {slugCheck && (
                          <span className={`absolute right-2 top-2 text-sm ${slugCheck.checking? 'text-white/70' : slugCheck.available? 'text-emerald-600':'text-red-600'}`} aria-live="polite">
                            {slugCheck.checking? 'checando…' : slugCheck.available? 'disponível':'indisponível'}
                          </span>
                        )}
                      </div>
                      {errors.workspaceSlug && <p id="err_workspaceSlug" role="alert" className="mt-1 text-sm text-red-600">{errors.workspaceSlug}</p>}
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{helpByStep.workspace}</p>
                  </div>
                )}
                {stepKey === 'country' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-800">País</label>
                    <select id="field_country" aria-invalid={!!errors.country} aria-describedby={errors.country?'err_country':undefined}
                      value={state.data.country||'BR'} onChange={e=> setState(s=>({...s, data:{...s.data, country: e.target.value}}))}
                      onBlur={async()=>{ if (state.current_step==='country') { try { await save('country', { country: state.data.country||'' }); setSavedAt(Date.now()) } catch{} } }}
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-brand-400">
                      {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                    </select>
                    {errors.country && <p id="err_country" role="alert" className="mt-1 text-sm text-red-600">{errors.country}</p>}
                    <p className="mt-2 text-sm text-slate-600">{helpByStep.country}</p>
                  </div>
                )}
                {stepKey === 'companyName' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-800">Nome da empresa</label>
                    <input id="field_companyName" aria-invalid={!!errors.companyName} aria-describedby={errors.companyName?'err_companyName':undefined}
                      value={state.data.companyName||''} onChange={e=> setState(s=>({...s, data:{...s.data, companyName: e.target.value}}))}
                      onBlur={async()=>{ if (state.current_step==='companyName') { try { await save('companyName', { companyName: state.data.companyName||'' }); setSavedAt(Date.now()) } catch{} } }}
                      maxLength={100} placeholder="Ex.: DataInova Tecnologia Ltda., ACME S.A."
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-brand-400" />
                    {errors.companyName && <p id="err_companyName" role="alert" className="mt-1 text-sm text-red-600">{errors.companyName}</p>}
                  </div>
                )}
                {stepKey === 'segment' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-800">Segmento</label>
                    <select id="field_segment" aria-invalid={!!errors.segment} aria-describedby={errors.segment?'err_segment':undefined}
                      value={state.data.segment||''} onChange={e=> setState(s=>({...s, data:{...s.data, segment: e.target.value}}))}
                      onBlur={async()=>{ if (state.current_step==='segment') { try { await save('segment', { segment: state.data.segment||'', segmentOther: state.data.segment==='Outro' ? (state.data.segmentOther||'') : '' }); setSavedAt(Date.now()) } catch{} } }}
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-brand-400">
                      <option value="" disabled>Selecione</option>
                      {SEGMENTS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    {state.data.segment==='Outro' && (
                      <div className="mt-3">
                        <label className="block text-sm font-medium text-slate-800">Descreva o segmento</label>
                        <input id="field_segmentOther" aria-invalid={!!errors.segmentOther} aria-describedby={errors.segmentOther?'err_segmentOther':undefined}
                          value={state.data.segmentOther||''} onChange={e=> setState(s=>({...s, data:{...s.data, segmentOther: e.target.value}}))}
                          onBlur={async()=>{ if (state.current_step==='segment') { try { await save('segment', { segment: state.data.segment||'', segmentOther: state.data.segment==='Outro' ? (state.data.segmentOther||'') : '' }); setSavedAt(Date.now()) } catch{} } }}
                          maxLength={40} placeholder="Ex.: Energia renovável"
                          className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-brand-400" />
                        {errors.segmentOther && <p id="err_segmentOther" role="alert" className="mt-1 text-sm text-red-600">{errors.segmentOther}</p>}
                      </div>
                    )}
                    {errors.segment && <p role="alert" className="mt-1 text-sm text-red-600">{errors.segment}</p>}
                  </div>
                )}
                {stepKey === 'size' && (
                  <fieldset>
                    <legend className="block text-sm font-medium text-slate-800">Porte da empresa</legend>
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {COMPANY_SIZES.map(sz => (
                        <label key={sz} className={`rounded-2xl border px-3 py-3 cursor-pointer ${state.data.companySize===sz? 'border-brand-600 ring-2 ring-brand-400':'border-slate-300 hover:bg-slate-50'}`} title={tooltipForSize(sz)}>
                          <input type="radio" name="companySize" className="sr-only" checked={state.data.companySize===sz} onChange={()=> setState(s=>({...s, data:{...s.data, companySize: sz}}))} />
                          <div className="text-sm font-medium text-slate-800">{sz}</div>
                          <div className="text-xs text-slate-500">{hintForSize(sz)}</div>
                        </label>
                      ))}
                    </div>
                    {errors.companySize && <p role="alert" className="mt-2 text-sm text-red-600">{errors.companySize}</p>}
                  </fieldset>
                )}
                {stepKey === 'mission' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-800">Missão</label>
                    <textarea id="field_mission" aria-invalid={!!errors.mission} aria-describedby={errors.mission?'err_mission':undefined}
                      value={state.data.mission||''} onChange={e=> setState(s=>({...s, data:{...s.data, mission: e.target.value}}))}
                      onBlur={async()=>{ if (state.current_step==='mission') { try { await save('mission', { mission: state.data.mission||'' }); setSavedAt(Date.now()) } catch{} } }}
                      maxLength={500} rows={5} placeholder="Por que a empresa existe? Qual impacto gera?"
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-brand-400" />
                    <div className="mt-1 text-xs text-slate-500">{(state.data.mission||'').length}/500</div>
                    {errors.mission && <p id="err_mission" role="alert" className="mt-1 text-sm text-red-600">{errors.mission}</p>}
                  </div>
                )}
                {stepKey === 'vision' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-800">Visão</label>
                    <textarea id="field_vision" aria-invalid={!!errors.vision} aria-describedby={errors.vision?'err_vision':undefined}
                      value={state.data.vision||''} onChange={e=> setState(s=>({...s, data:{...s.data, vision: e.target.value}}))}
                      onBlur={async()=>{ if (state.current_step==='vision') { try { await save('vision', { vision: state.data.vision||'' }); setSavedAt(Date.now()) } catch{} } }}
                      maxLength={500} rows={5} placeholder="Onde querem chegar nos próximos anos?"
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-brand-400" />
                    <div className="mt-1 text-xs text-slate-500">{(state.data.vision||'').length}/500</div>
                    {errors.vision && <p id="err_vision" role="alert" className="mt-1 text-sm text-red-600">{errors.vision}</p>}
                  </div>
                )}
                {stepKey === 'review' && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-slate-800">Revise suas informações</h3>
                    <div className="rounded-xl border border-slate-200 divide-y">
                      {[
                        ['Workspace', `${state.data.workspaceName} (${state.data.workspaceSlug})`, 'workspace'],
                        ['País', state.data.country, 'country'],
                        ['Empresa', state.data.companyName, 'companyName'],
                        ['Segmento', state.data.segment + (state.data.segment==='Outro' && state.data.segmentOther ? ` — ${state.data.segmentOther}`:''), 'segment'],
                        ['Porte', state.data.companySize, 'size'],
                        ['Missão', state.data.mission, 'mission'],
                        ['Visão', state.data.vision, 'vision'],
                      ].map(([label, val, step]) => (
                        <div key={String(label)} className="px-4 py-3 flex items-start justify-between gap-4">
                          <div>
                            <div className="text-xs text-slate-500">{String(label)}</div>
                            <div className="text-sm text-slate-800 whitespace-pre-wrap break-words">{String(val||'—')}</div>
                          </div>
                          <button onClick={()=> setState(s=>({...s, current_step: step as StepId}))} className="text-sm text-brand-600 hover:underline">Editar</button>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-slate-500">Se estiver tudo certo, confirme para criar seu workspace.</p>
                  </div>
                )}
                {errors._root && <div role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{errors._root}</div>}
              </div>

              <div className="mt-6 flex items-center justify-between">
                <div className="text-xs text-slate-500 inline-flex items-center gap-2" aria-live="polite">
                  {saving && <svg className="h-3.5 w-3.5 animate-spin text-slate-500" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" opacity=".25"/><path d="M22 12a10 10 0 00-10-10" stroke="currentColor" strokeWidth="3" fill="none"/></svg>}
                  {saving ? 'Salvando…' : (savedAt ? `Tudo salvo às ${new Date(savedAt).toLocaleTimeString()}` : ' ')}
                </div>
                <div className="flex gap-2">
                  <button onClick={onDismissForSession} disabled={saving || isCompleting} className="px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50">Salvar e sair</button>
                  <button onClick={handleBack} disabled={STEP_ORDER.indexOf(state.current_step)===0 || saving || isCompleting} className="px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50">Voltar</button>
                  {state.current_step !== 'review' ? (
                    <button onClick={handleNext} disabled={saving || isCompleting} className="px-4 py-2 text-sm rounded-lg bg-brand-600 text-white hover:bg-brand-700 active:scale-[.98] transition disabled:opacity-50">{labelForNextStep(state.current_step)}</button>
                  ) : (
                    <button onClick={handleComplete} disabled={saving || isCompleting} className="px-4 py-2 text-sm rounded-lg bg-brand-600 text-white hover:bg-brand-700 active:scale-[.98] transition disabled:opacity-50">Concluir</button>
                  )}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      {isCompleting && (
        <div className="absolute inset-0 z-20 bg-white/80 backdrop-blur-sm grid place-items-center p-6" role="alertdialog" aria-live="polite" aria-label="Configurando seu ambiente">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-lg ring-1 ring-black/5 p-5">
            <div className="flex items-center gap-3">
              <svg className="h-5 w-5 text-brand-600 animate-spin" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" opacity=".2"/><path d="M22 12a10 10 0 00-10-10" stroke="currentColor" strokeWidth="3" fill="none"/></svg>
              <h4 className="text-sm font-semibold text-slate-900">Configurando seu ambiente</h4>
            </div>
            <p className="mt-1 text-xs text-slate-600">Estamos criando o workspace e aplicando permissões.</p>
            <div className="mt-4 h-2 w-full bg-slate-200 rounded-full overflow-hidden">
              <div className="h-full bg-brand-600 transition-all" style={{ width: `${progressPct}%` }} />
            </div>
            <ul className="mt-3 space-y-1 text-xs text-slate-700">
              {['Criando workspace','Aplicando permissões','Salvando perfil da empresa','Finalizando'].map((lbl, i) => {
                const idx = Math.min(3, Math.floor(progressPct / 25))
                const done = i < idx
                const current = i === idx
                return (
                  <li key={i} className="flex items-center gap-2">
                    <span className={`h-4 w-4 grid place-items-center rounded-full ${done? 'bg-emerald-500 text-white' : current? 'bg-brand-600 text-white' : 'bg-slate-300 text-slate-600'}`}>{done? '✓' : current? '•' : ''}</span>
                    <span className={`${done? 'text-slate-500 line-through' : current? 'text-slate-900' : 'text-slate-500'}`}>{lbl}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
    {toast && (
      <div className="fixed bottom-4 right-4 bg-slate-900 text-white rounded-lg shadow-lg p-3 flex items-center gap-3">
        <span className="text-sm">{toast.msg}</span>
        <button onClick={() => { setToast(null); toast.retry==='next' ? handleNext() : handleComplete() }} className="text-sm px-2 py-1 rounded bg-white/10 hover:bg-white/20">Tentar novamente</button>
        <button onClick={() => setToast(null)} className="text-sm px-2 py-1 rounded bg-white/10 hover:bg-white/20">Fechar</button>
      </div>
    )}
    </>
  )
}

function hintForSize(sz: string){
  switch (sz) {
    case 'Microempresa': return 'Até ~9 pessoas'
    case 'Pequena empresa': return '10–49 pessoas'
    case 'Média empresa': return '50–249 pessoas'
    case 'Grande porte': return '250+ pessoas'
    case 'Multinacional': return 'Operação em vários países'
    default: return ''
  }
}
function tooltipForSize(sz: string){
  switch (sz) {
    case 'Microempresa': return 'Ex.: escritório enxuto, startup em início'
    case 'Pequena empresa': return 'Ex.: equipe pequena, estrutura em crescimento'
    case 'Média empresa': return 'Ex.: várias áreas, times dedicados'
    case 'Grande porte': return 'Ex.: corporação com múltiplas unidades'
    case 'Multinacional': return 'Ex.: presença global/multirregional'
    default: return ''
  }
}
