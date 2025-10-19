import React, { useEffect, useMemo, useState } from 'react'
import Logo from './assets/logo.svg'

function ThemeToggle(){
  const [theme, setTheme] = useState<string>(() => {
    try {
      const t = localStorage.getItem('theme')
      if (t) return t
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    } catch { return 'light' }
  })
  useEffect(() => {
    try {
      if (theme === 'dark') document.documentElement.classList.add('dark')
      else document.documentElement.classList.remove('dark')
      localStorage.setItem('theme', theme)
    } catch {}
  }, [theme])
  return (
    <button
      aria-label={theme==='dark' ? 'Alternar para tema claro' : 'Alternar para tema escuro'}
      className="h-8 w-8 grid place-items-center rounded-md border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
    >
      {theme === 'dark' ? (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 18a6 6 0 100-12 6 6 0 000 12z"/><path fillRule="evenodd" d="M12 2.25a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0V3A.75.75 0 0112 2.25zm0 15.75a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0V18.75a.75.75 0 01.75-.75zm9-6a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5H20.25a.75.75 0 01.75.75zM6 12a.75.75 0 01-.75.75H3.75a.75.75 0 010-1.5H5.25A.75.75 0 016 12zm12.728 6.728a.75.75 0 01-1.06 0l-1.06-1.06a.75.75 0 011.06-1.06l1.06 1.06a.75.75 0 010 1.06zM7.392 7.392a.75.75 0 01-1.06 0l-1.06-1.06a.75.75 0 011.06-1.06l1.06 1.06a.75.75 0 010 1.06zm0 9.216a.75.75 0 010 1.06l-1.06 1.06a.75.75 0 11-1.06-1.06l1.06-1.06a.75.75 0 011.06 0zM18.728 5.272a.75.75 0 010 1.06l-1.06 1.06a.75.75 0 11-1.06-1.06l1.06-1.06a.75.75 0 011.06 0z" clipRule="evenodd"/></svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M21.752 15.002A9.718 9.718 0 0112.002 22C6.201 22 1.5 17.299 1.5 11.498 1.5 6.78 4.66 2.85 8.85 1.65a.75.75 0 01.89 1.03A8.25 8.25 0 0018.32 17.26a.75.75 0 011.03.89 9.59 9.59 0 01.401-3.148z"/></svg>
      )}
    </button>
  )
}

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
    <header className="w-full border-b border-slate-200 bg-white/70 dark:bg-slate-900/70 backdrop-blur supports-[backdrop-filter]:bg-white/50 dark:supports-[backdrop-filter]:bg-slate-900/50">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 bg-slate-900 text-white px-3 py-1 rounded">Pular para conteúdo</a>
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src={Logo} alt="DataInova" className="h-7 w-7" />
          <span className="font-semibold tracking-tight text-slate-900 dark:text-slate-100">DataInova Connect</span>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <button onClick={onSignOut} className="text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white">Sair</button>
        </div>
      </div>
    </header>
  )
}

function Card({ children, title, subtitle }: { children: React.ReactNode; title: string; subtitle?: string }){
  return (
    <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-xl ring-1 ring-black/5 dark:ring-white/10 p-6 md:p-7">
      <div className="mb-5">
        <h2 className="text-[20px] md:text-[22px] font-semibold text-slate-900 dark:text-slate-100 tracking-tight">{title}</h2>
        {subtitle && <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 leading-relaxed">{subtitle}</p>}
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
  const [mode, setMode] = useState<'login'|'register'>('register')
  const [message, setMessage] = useState('')
  const [profile, setProfile] = useState<any>(null)
  const [tenants, setTenants] = useState<any[]>([])
  const [showSwitch, setShowSwitch] = useState(false)
  const [loading, setLoading] = useState(false)
  const [devLink, setDevLink] = useState<string | null>(null)
  const [loginMode, setLoginMode] = useState<'link'|'password'>('link')
  const [password, setPassword] = useState('')
  const [pwdNew, setPwdNew] = useState('')
  const [pwdCurrent, setPwdCurrent] = useState('')

  useEffect(() => {
    // clear any previous state when switching mode
    setMessage('')
    setDevLink(null)
  }, [mode])

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault()
    setMessage('')
    setLoading(true)
    try {
      const endpoint = mode === 'register' ? '/auth/register' : '/auth/login-email'
      const res = await fetch(`${apiBase}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })
      const data = await res.json()
      if (res.ok) {
        setMessage('Enviamos um link para seu e-mail. Você pode fechar esta janela e acessar pelo link enviado.')
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900 relative overflow-hidden">
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
                title={mode==='register' ? 'Criar sua conta' : 'Entrar'}
                subtitle={mode==='register' ? 'Informe seu e‑mail para receber um link de confirmação' : (loginMode==='password' ? 'Entre com seu e‑mail e senha' : 'Entre com um link enviado para o seu e‑mail')}
              >
                <div className="inline-flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1 mb-5">
                  <button onClick={() => setMode('register')} className={`text-sm px-3 py-1 rounded-md transition ${mode==='register' ? 'bg-white dark:bg-slate-700 shadow text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'}`}>Registrar</button>
                  <button onClick={() => setMode('login')} className={`text-sm px-3 py-1 rounded-md transition ${mode==='login' ? 'bg-white dark:bg-slate-700 shadow text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'}`}>Entrar</button>
                </div>
                {mode==='login' && (
                  <div className="flex gap-2 -mt-2 mb-4">
                    <button onClick={()=>setLoginMode('link')} className={`text-xs px-2 py-1 rounded ${loginMode==='link'?'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100':'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'}`}>Por link</button>
                    <button onClick={()=>setLoginMode('password')} className={`text-xs px-2 py-1 rounded ${loginMode==='password'?'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100':'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'}`}>Com senha</button>
                  </div>
                )}
                {loginMode === 'password' && mode==='login' ? (
                  <form onSubmit={submitLoginPassword} className="space-y-4">
                    <label className="block text-sm">
                      <span className="text-slate-700 dark:text-slate-200">E‑mail</span>
                      <input value={email} onChange={e=>setEmail(e.target.value)} type="email" required placeholder="voce@empresa.com"
                        className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 outline-none focus:ring-2 focus:ring-brand-400"/>
                    </label>
                    <label className="block text-sm">
                      <span className="text-slate-700 dark:text-slate-200">Senha</span>
                      <input value={password} onChange={e=>setPassword(e.target.value)} type="password" required placeholder="Sua senha"
                        className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 outline-none focus:ring-2 focus:ring-brand-400"/>
                    </label>
                    <button disabled={loading} type="submit" className="w-full rounded-lg bg-brand-600 text-white py-2.5 hover:bg-brand-700 disabled:opacity-60">
                      {loading ? 'Entrando…' : 'Entrar'}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={submitEmail} className="space-y-4">
                    <label className="block text-sm">
                      <span className="text-slate-700 dark:text-slate-200">E‑mail</span>
                      <input value={email} onChange={e=>setEmail(e.target.value)} type="email" required placeholder="voce@empresa.com"
                        className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2 outline-none focus:ring-2 focus:ring-brand-400"/>
                    </label>
                    <button disabled={loading} type="submit" className="w-full rounded-lg bg-brand-600 text-white py-2.5 hover:bg-brand-700 disabled:opacity-60">
                      {loading ? 'Enviando…' : (mode==='register' ? 'Enviar link de cadastro' : 'Enviar link de acesso')}
                    </button>
                  </form>
                )}
                {message && <p className="text-sm text-slate-600 mt-4" aria-live="polite">{message}</p>}
                {devLink && (
                  <a className="mt-3 inline-flex items-center text-sm text-brand-700 hover:underline" href={devLink}>
                    Abrir link de desenvolvimento
                  </a>
                )}
                <p className="mt-6 text-[12px] text-slate-500">Ao continuar você concorda com nossos Termos e Política de Privacidade.</p>
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
            <div className="mt-6 bg-white rounded-xl shadow ring-1 ring-black/5 p-4 max-w-md">
              <h3 className="font-medium mb-2">Definir/alterar senha</h3>
              <form onSubmit={submitSetPassword} className="space-y-3">
                <label className="block text-sm">
                  <span className="text-slate-700">Senha atual (opcional)</span>
                  <input value={pwdCurrent} onChange={e=>setPwdCurrent(e.target.value)} type="password" placeholder="••••••••"
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-brand-400"/>
                </label>
                <label className="block text-sm">
                  <span className="text-slate-700">Nova senha</span>
                  <input value={pwdNew} onChange={e=>setPwdNew(e.target.value)} type="password" required placeholder="mínimo 8 caracteres"
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-brand-400"/>
                </label>
                <button disabled={loading} className="rounded-md bg-brand-600 text-white px-4 py-2 hover:bg-brand-700 disabled:opacity-60">Salvar senha</button>
              </form>
            </div>
            {profile && (
              <div className="mt-6 grid md:grid-cols-2 gap-4">
                <div className="bg-white rounded-xl shadow ring-1 ring-black/5 p-4">
                  <h3 className="font-medium mb-2">Usuário</h3>
                  <pre className="text-xs bg-slate-50 p-2 rounded overflow-auto">{JSON.stringify(profile.user, null, 2)}</pre>
                </div>
                <div className="bg-white rounded-xl shadow ring-1 ring-black/5 p-4">
                  <h3 className="font-medium mb-2">Tenant</h3>
                  <pre className="text-xs bg-slate-50 p-2 rounded overflow-auto">{JSON.stringify(profile.tenant, null, 2)}</pre>
                </div>
                <div className="bg-white rounded-xl shadow ring-1 ring-black/5 p-4 md:col-span-2">
                  <h3 className="font-medium mb-2">Roles</h3>
                  <pre className="text-xs bg-slate-50 p-2 rounded overflow-auto">{JSON.stringify(profile.roles, null, 2)}</pre>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
      <footer className="py-8 text-center text-xs text-slate-500">© {new Date().getFullYear()} DataInova</footer>
    </div>
  )
}
