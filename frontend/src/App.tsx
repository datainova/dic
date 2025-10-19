import React, { useEffect, useMemo, useState } from 'react'
import LogoWhite from './image/white_icon_transparent_background.png'


function parseHash() {
  const h = (typeof window !== 'undefined' && window.location.hash) || ''
  const out: Record<string, string> = {}
  if (h.startsWith('#')) {
    for (const part of h.slice(1).split('&')) {
      const [k, v] = part.split('=')
      if (k) out[decodeURIComponent(k)] = decodeURIComponent(v || '')
    }
  }
  return out
}

function storeTokensFromHash() {
  const params = parseHash()
  if (params.access_token && params.refresh_token) {
    localStorage.setItem('access_token', params.access_token)
    localStorage.setItem('refresh_token', params.refresh_token)
    // clear hash for cleanliness
    history.replaceState(null, '', window.location.pathname)
  }
}

function useAuth() {
  const [access, setAccess] = useState<string | null>(() => localStorage.getItem('access_token'))
  const isAuthed = !!access
  const apiBase = import.meta.env.VITE_API_BASE || 'http://localhost:4000'
  async function me() {
    const token = localStorage.getItem('access_token')
    if (!token) return null
    const res = await fetch(`${apiBase}/me`, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return null
    return res.json()
  }
  return { isAuthed, access, setAccess, me, apiBase }
}

function Header({ onSignOut }: { onSignOut(): void }){
  return (
    <header className="w-full border-b border-white/10 bg-brand-600">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 bg-white text-brand-600 px-3 py-1 rounded">Pular para conteúdo</a>
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src={LogoWhite} alt="DataInova" className="h-7 w-7" />
          <span className="font-semibold tracking-tight text-white font-display">DataInova Connect</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={onSignOut} className="text-sm text-white/80 hover:text-white">Sair</button>
        </div>
      </div>
    </header>
  )
}

function Card({ children, title, subtitle }: { children: React.ReactNode; title: string; subtitle?: string }){
  return (
    <div className="w-full max-w-md bg-transparent rounded-2xl shadow-xl ring-1 ring-white/10 p-6 md:p-7">
      <div className="mb-5">
        <h2 className="text-[22px] font-semibold text-white tracking-tight font-display">{title}</h2>
        {subtitle && <p className="text-white/70 text-sm mt-1 leading-relaxed">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

export default function App(){
  // consume tokens from backend redirect if present
  useMemo(() => { storeTokensFromHash() }, [])
  const { isAuthed, me, apiBase } = useAuth()
  const [email, setEmail] = useState('')
  // Login-first experience (no self-registration in UI)
  const [mode] = useState<'login'|'register'>('login')
  const [message, setMessage] = useState('')
  const [profile, setProfile] = useState<any>(null)
  const [tenants, setTenants] = useState<any[]>([])
  const [showSwitch, setShowSwitch] = useState(false)
  const [loading, setLoading] = useState(false)
  const [devLink, setDevLink] = useState<string | null>(null)
  const [loginMode, setLoginMode] = useState<'link'|'password'>('link')
  const [showForgot, setShowForgot] = useState(false)
  const [resetToken, setResetToken] = useState<string | null>(null)
  const redirectUri = typeof window !== 'undefined' ? `${location.origin}/auth/callback` : ''

  function startGoogleSSO(){
    window.location.href = `${apiBase}/auth/oauth/google/start?redirect=${encodeURIComponent(redirectUri)}`
  }
  function startGenericSSO(){
    const emailParam = email ? `&email=${encodeURIComponent(email)}` : ''
    window.location.href = `${apiBase}/auth/sso/start?redirect=${encodeURIComponent(redirectUri)}${emailParam}`
  }
  const [password, setPassword] = useState('')
  const [pwdNew, setPwdNew] = useState('')
  const [pwdCurrent, setPwdCurrent] = useState('')

  // clear transient messages when type of auth changes
  useEffect(() => { setMessage(''); setDevLink(null) }, [loginMode])

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault()
    setMessage('')
    setLoading(true)
    try {
      const res = await fetch(`${apiBase}/auth/login-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })
      const data = await res.json()
      if (res.ok) {
        setMessage('Enviamos um link de acesso para seu e-mail.')
        if (data.dev_link) setDevLink(data.dev_link)
      } else {
        setMessage(`Erro: ${data.error || 'Falha ao enviar link'}`)
      }
    } finally {
      setLoading(false)
    }
  }

  async function submitLoginPassword(e: React.FormEvent) {
    e.preventDefault()
    setMessage('')
    setLoading(true)
    try {
      const res = await fetch(`${apiBase}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })
      const data = await res.json()
      if (res.ok) {
        localStorage.setItem('access_token', data.access_token)
        localStorage.setItem('refresh_token', data.refresh_token)
        setMessage('Login realizado com sucesso. Você já pode carregar o perfil.')
      } else {
        setMessage(`Erro: ${data.error || 'Falha no login'}`)
      }
    } finally { setLoading(false) }
  }

  async function submitSetPassword(e: React.FormEvent) {
    e.preventDefault()
    setMessage('')
    setLoading(true)
    try {
      const token = localStorage.getItem('access_token')
      if (!token) { setMessage('Você precisa estar autenticado.'); return }
      const body: any = { password: pwdNew }
      if (pwdCurrent) body.current_password = pwdCurrent
      const res = await fetch(`${apiBase}/auth/set-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body)
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) setMessage('Senha definida com sucesso. Você já pode entrar usando e-mail e senha.')
      else setMessage(`Erro: ${data.error || 'Falha ao definir senha'}`)
    } finally { setLoading(false) }
  }
  async function submitForgot(e: React.FormEvent) {
    e.preventDefault()
    setMessage('')
    setLoading(true)
    try {
      const res = await fetch(`${apiBase}/auth/forgot-password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email })
      })
      const data = await res.json().catch(()=>({}))
      if (res.ok) {
        setMessage('Enviamos um link de redefinição para o seu e‑mail.')
        if (data.dev_link) setDevLink(data.dev_link)
      } else setMessage(`Erro: ${data.error || 'Falha ao solicitar redefinição'}`)
    } finally { setLoading(false) }
  }
  async function submitDoReset(e: React.FormEvent) {
    e.preventDefault()
    setMessage('')
    setLoading(true)
    try {
      if (!resetToken) { setMessage('Token inválido.'); return }
      const res = await fetch(`${apiBase}/auth/reset-password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: resetToken, password: pwdNew })
      })
      const data = await res.json().catch(()=>({}))
      if (res.ok) {
        setMessage('Senha redefinida com sucesso. Faça login com sua nova senha.')
        setMode('login'); setLoginMode('password'); setResetToken(null); history.replaceState(null,'',location.pathname)
      } else setMessage(`Erro: ${data.error || 'Falha ao redefinir'}`)
    } finally { setLoading(false) }
  }

  async function loadProfile() {
    const p = await me()
    setProfile(p)
  }

  async function loadTenants() {
    const token = localStorage.getItem('access_token')
    if (!token) return
    const res = await fetch(`${apiBase}/my/tenants`, { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) {
      const data = await res.json()
      setTenants(data.tenants || [])
    }
  }

  async function switchTenant(id: string) {
    const token = localStorage.getItem('access_token')
    if (!token) return
    const res = await fetch(`${apiBase}/auth/switch-tenant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ tenant_id: id })
    })
    const data = await res.json().catch(()=>({}))
    if (res.ok) {
      localStorage.setItem('access_token', data.access_token)
      localStorage.setItem('refresh_token', data.refresh_token)
      setMessage('Espaço alternado com sucesso.')
      setShowSwitch(false)
      await loadProfile()
    } else {
      setMessage(`Erro: ${data.error || 'Falha ao alternar espaço'}`)
    }
  }

  async function createTenant(e: React.FormEvent) {
    e.preventDefault()
    const token = localStorage.getItem('access_token')
    if (!token) { setMessage('Você precisa estar autenticado.'); return }
    const name = (document.getElementById('tenant_name') as HTMLInputElement)?.value || ''
    const res = await fetch(`${apiBase}/tenants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name })
    })
    const data = await res.json().catch(()=>({}))
    if (res.ok) {
      localStorage.setItem('access_token', data.tokens.access_token)
      localStorage.setItem('refresh_token', data.tokens.refresh_token)
      setMessage('Espaço criado com sucesso.')
      await loadProfile()
    } else {
      setMessage(`Erro: ${data.error || 'Falha ao criar espaço'}`)
    }
  }

  // capture reset token from URL hash
  useEffect(() => {
    try {
      const h = parseHash()
      if (h.reset_token) setResetToken(h.reset_token)
    } catch {}
  }, [])

  return (
    <div className="min-h-screen bg-brand-600 relative overflow-hidden">
      <div className="bg-blob one top-20 -left-16" />
      <div className="bg-blob two bottom-10 -right-16" />
      {isAuthed ? (
        <Header onSignOut={() => { localStorage.clear(); location.href = '/' }} />
      ) : (
        <div className="h-14" />
      )}
      <main id="main" className="max-w-6xl mx-auto px-6 py-12 grid place-items-center">
        {!isAuthed ? (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-10 items-center w-full">
            <section className="hidden xl:block">
              <h1 className="text-4xl font-bold tracking-tight text-slate-900 dark:text-white">Acesse a plataforma DataInova</h1>
              <p className="mt-3 text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">Entre sem senha usando um link mágico ou autentique‑se por senha. Após verificar seu e‑mail, crie o seu espaço de trabalho (Free) e convide sua equipe.</p>
              <ul className="mt-6 space-y-2 text-slate-700 dark:text-slate-300">
                <li className="flex items-center gap-2"><span className="h-5 w-5 rounded-full bg-brand-100 text-brand-700 grid place-items-center text-xs">✓</span> Login seguro e prático</li>
                <li className="flex items-center gap-2"><span className="h-5 w-5 rounded-full bg-brand-100 text-brand-700 grid place-items-center text-xs">✓</span> Espaços multi‑tenant com RLS</li>
                <li className="flex items-center gap-2"><span className="h-5 w-5 rounded-full bg-brand-100 text-brand-700 grid place-items-center text-xs">✓</span> RBAC por roles e permissões</li>
              </ul>
            </section>
            <section className="relative flex justify-center">
              <Card
                title={'Entrar'}
                subtitle={loginMode==='password' ? 'Entre com seu e‑mail e senha' : 'Entre com um link enviado para o seu e‑mail'}
              >
                {!resetToken && (
                  <div className="flex gap-2 -mt-2 mb-4">
                    <button onClick={()=>setLoginMode('link')} className={`text-xs px-2 py-1 rounded ${loginMode==='link'?'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100':'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'}`}>Por link</button>
                    <button onClick={()=>setLoginMode('password')} className={`text-xs px-2 py-1 rounded ${loginMode==='password'?'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100':'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'}`}>Com senha</button>
                  </div>
                )}
                {/* SSO buttons */}
                {!resetToken && (
                  <div className="space-y-3 mb-4">
                    <button onClick={startGoogleSSO} className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-[#1a73e8] text-white py-2.5 hover:bg-[#1669c1]">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="h-5 w-5"><path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12 c0-6.627,5.373-12,12-12c3.059,0,5.842,1.153,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24 s8.955,20,20,20s20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"/><path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,16.108,18.961,14,24,14c3.059,0,5.842,1.153,7.961,3.039l5.657-5.657 C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"/><path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.197l-6.19-5.238C29.211,35.091,26.715,36,24,36 c-5.202,0-9.617-3.317-11.278-7.946l-6.523,5.025C9.577,39.556,16.227,44,24,44z"/><path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-3.987,5.565 c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.186,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"/></svg>
                      Continuar com Google
                    </button>
                    <div className="relative">
                      <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10"/></div>
                      <div className="relative flex justify-center"><span className="bg-brand-600 px-2 text-xs text-white/60">ou</span></div>
                    </div>
                    <button onClick={startGenericSSO} className="w-full text-white hover:underline text-sm">Continuar com Single Sign‑On (SSO)</button>
                  </div>
                )}
                {resetToken ? (
                  <form onSubmit={submitDoReset} className="space-y-4">
                    <p className="text-sm text-white/80">Defina sua nova senha.</p>
                    <label className="block text-sm">
                      <span className="text-white">Nova senha</span>
                      <input value={pwdNew} onChange={e=>setPwdNew(e.target.value)} type="password" required placeholder="mínimo 8 caracteres"
                        className="mt-1 w-full rounded-lg border border-white/0 bg-white text-brand-600 px-3 py-2 outline-none focus:ring-2 focus:ring-white"/>
                    </label>
                    <button disabled={loading} className="w-full rounded-lg bg-white text-brand-600 py-2.5 hover:bg-white/90 disabled:opacity-60">Salvar nova senha</button>
                    <button type="button" onClick={()=>{ setResetToken(null); history.replaceState(null,'',location.pathname) }} className="w-full text-sm text-white/80 mt-1 hover:underline">Cancelar</button>
                  </form>
                ) : loginMode === 'password' ? (
                  <form onSubmit={submitLoginPassword} className="space-y-4">
                    <label className="block text-sm">
                      <span className="text-white">E‑mail</span>
                      <input value={email} onChange={e=>setEmail(e.target.value)} type="email" required placeholder="voce@empresa.com"
                        className="mt-1 w-full rounded-lg border border-white/0 bg-white text-brand-600 px-3 py-2 outline-none focus:ring-2 focus:ring-white"/>
                    </label>
                    <label className="block text-sm">
                      <span className="text-white">Senha</span>
                      <input value={password} onChange={e=>setPassword(e.target.value)} type="password" required placeholder="Sua senha"
                        className="mt-1 w-full rounded-lg border border-white/0 bg-white text-brand-600 px-3 py-2 outline-none focus:ring-2 focus:ring-white"/>
                    </label>
                    <button disabled={loading} type="submit" className="w-full rounded-lg bg-white text-brand-600 py-2.5 hover:bg-white/90 disabled:opacity-60">
                      {loading ? 'Entrando…' : 'Entrar'}
                    </button>
                    <div className="flex items-center justify-end text-xs mt-1">
                      <button type="button" onClick={()=>setShowForgot(true)} className="text-white/80 hover:underline">Esqueci minha senha</button>
                    </div>
                  </form>
                ) : (
                  <form onSubmit={submitEmail} className="space-y-4">
                    <label className="block text-sm">
                      <span className="text-white">E‑mail</span>
                      <input value={email} onChange={e=>setEmail(e.target.value)} type="email" required placeholder="voce@empresa.com"
                        className="mt-1 w-full rounded-lg border border-white/0 bg-white text-brand-600 px-3 py-2 outline-none focus:ring-2 focus:ring-white"/>
                    </label>
                    <button disabled={loading} type="submit" className="w-full rounded-lg bg-white text-brand-600 py-2.5 hover:bg-white/90 disabled:opacity-60">
                      {loading ? 'Enviando…' : 'Enviar link de acesso'}
                    </button>
                    <div className="flex items-center justify-end text-xs mt-1">
                      <button type="button" onClick={()=>setShowForgot(true)} className="text-white/80 hover:underline">Esqueci minha senha</button>
                    </div>
                  </form>
                )}
                {showForgot && !resetToken && (
                  <div className="mt-4 border-t pt-4 border-white/10">
                    <h3 className="font-medium text-sm text-white mb-1">Recuperar senha</h3>
                    <form onSubmit={submitForgot} className="space-y-3">
                      <label className="block text-sm">
                        <span className="text-white">E‑mail</span>
                        <input value={email} onChange={e=>setEmail(e.target.value)} type="email" required placeholder="voce@empresa.com"
                          className="mt-1 w-full rounded-lg border border-white/0 bg-white text-brand-600 px-3 py-2 outline-none focus:ring-2 focus:ring-white"/>
                      </label>
                      <div className="flex items-center gap-2">
                        <button disabled={loading} className="rounded-md bg-white text-brand-600 px-4 py-2 hover:bg-white/90 disabled:opacity-60">Enviar link</button>
                        <button type="button" onClick={()=>setShowForgot(false)} className="text-sm text-white/80 hover:underline">Cancelar</button>
                      </div>
                    </form>
                  </div>
                )}
                {message && <p className="text-sm text-white/80 mt-4" aria-live="polite">{message}</p>}
                {devLink && (
                  <a className="mt-3 inline-flex items-center text-sm text-white hover:underline" href={devLink}>
                    Abrir link de desenvolvimento
                  </a>
                )}
                <p className="mt-6 text-[12px] text-white/60">Ao continuar você concorda com nossos Termos e Política de Privacidade.</p>
              </Card>
            </section>
          </div>
        ) : (
          <div className="w-full max-w-3xl">
            <div className="mb-6">
              <h2 className="text-2xl font-semibold">Bem-vindo!</h2>
              <p className="text-slate-600">Você está autenticado. Carregue seu perfil para ver detalhes de usuário e tenant.</p>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={loadProfile} className="rounded-md bg-slate-900 text-white px-4 py-2 hover:bg-slate-800">Carregar perfil</button>
              <button onClick={() => { setShowSwitch(v=>!v); loadTenants() }} className="rounded-md border border-slate-300 px-4 py-2 text-slate-700 hover:bg-slate-50">Meus espaços</button>
              <button onClick={() => { localStorage.clear(); location.href = '/' }} className="rounded-md border border-slate-300 px-4 py-2 text-slate-700 hover:bg-slate-50">Sair</button>
            </div>
            {showSwitch && (
              <div className="mt-4 bg-white rounded-xl shadow ring-1 ring-black/5 p-4 max-w-xl">
                <h3 className="font-medium mb-2">Meus espaços</h3>
                {tenants.length === 0 && <p className="text-sm text-slate-600">Você ainda não participa de nenhum espaço.</p>}
                <ul className="divide-y divide-slate-200">
                  {tenants.map(t => (
                    <li key={t.id} className="py-2 flex items-center justify-between">
                      <div>
                        <div className="font-medium">{t.name}</div>
                        <div className="text-xs text-slate-500">{t.slug} • {t.plan} • {t.status}{t.current ? ' • atual' : ''}</div>
                      </div>
                      {!t.current && (
                        <button onClick={()=>switchTenant(t.id)} className="text-sm rounded-md bg-brand-600 text-white px-3 py-1 hover:bg-brand-700">Alternar</button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!profile?.tenant && (
              <div className="mt-6 bg-white rounded-xl shadow ring-1 ring-black/5 p-4 max-w-md">
                <h3 className="font-medium mb-2">Criar seu espaço de trabalho</h3>
                <p className="text-sm text-slate-600 mb-3">Defina o nome do seu workspace. Você será o owner (plano Free).</p>
                <form onSubmit={createTenant} className="space-y-3">
                  <label className="block text-sm">
                    <span className="text-slate-700">Nome do espaço</span>
                    <input id="tenant_name" type="text" required placeholder="Ex.: DataInova"
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-brand-400"/>
                  </label>
                  <button className="rounded-md bg-brand-600 text-white px-4 py-2 hover:bg-brand-700">Criar espaço</button>
                </form>
              </div>
            )}
            <div className="mt-6 bg-transparent rounded-xl shadow ring-1 ring-white/10 p-4 max-w-md text-white">
              <h3 className="font-medium mb-2">Definir/alterar senha</h3>
              <form onSubmit={submitSetPassword} className="space-y-3">
                <label className="block text-sm">
                  <span className="text-white">Senha atual (opcional)</span>
                  <input value={pwdCurrent} onChange={e=>setPwdCurrent(e.target.value)} type="password" placeholder="••••••••"
                    className="mt-1 w-full rounded-md border border-white/0 bg-white text-brand-600 px-3 py-2 outline-none focus:ring-2 focus:ring-white"/>
                </label>
                <label className="block text-sm">
                  <span className="text-white">Nova senha</span>
                  <input value={pwdNew} onChange={e=>setPwdNew(e.target.value)} type="password" required placeholder="mínimo 8 caracteres"
                    className="mt-1 w-full rounded-md border border-white/0 bg-white text-brand-600 px-3 py-2 outline-none focus:ring-2 focus:ring-white"/>
                </label>
                <button disabled={loading} className="rounded-md bg-white text-brand-600 px-4 py-2 hover:bg-white/90 disabled:opacity-60">Salvar senha</button>
              </form>
            </div>
            {profile && (
              <div className="mt-6 grid md:grid-cols-2 gap-4 text-white">
                <div className="bg-transparent rounded-xl shadow ring-1 ring-white/10 p-4">
                  <h3 className="font-medium mb-2">Usuário</h3>
                  <pre className="text-xs bg-white/5 p-2 rounded overflow-auto">{JSON.stringify(profile.user, null, 2)}</pre>
                </div>
                <div className="bg-transparent rounded-xl shadow ring-1 ring-white/10 p-4">
                  <h3 className="font-medium mb-2">Tenant</h3>
                  <pre className="text-xs bg-white/5 p-2 rounded overflow-auto">{JSON.stringify(profile.tenant, null, 2)}</pre>
                </div>
                <div className="bg-transparent rounded-xl shadow ring-1 ring-white/10 p-4 md:col-span-2">
                  <h3 className="font-medium mb-2">Roles</h3>
                  <pre className="text-xs bg-white/5 p-2 rounded overflow-auto">{JSON.stringify(profile.roles, null, 2)}</pre>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
      <footer className="py-8 text-center text-xs text-white/50">© {new Date().getFullYear()} DataInova</footer>
    </div>
  )
}
