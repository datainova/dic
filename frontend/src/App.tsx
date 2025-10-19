import React, { useEffect, useMemo, useState } from 'react'

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
    <header className="w-full border-b border-slate-200 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60">
      <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-md bg-brand-600 text-white grid place-items-center font-bold">D</div>
          <span className="font-semibold">DataInova Connect</span>
        </div>
        <button onClick={onSignOut} className="text-sm text-slate-600 hover:text-slate-900">Sair</button>
      </div>
    </header>
  )
}

function Card({ children, title, subtitle }: { children: React.ReactNode; title: string; subtitle?: string }){
  return (
    <div className="w-full max-w-md bg-white rounded-xl shadow-lg ring-1 ring-black/5 p-6">
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
        {subtitle && <p className="text-slate-500 text-sm mt-1">{subtitle}</p>}
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      {isAuthed ? (
        <Header onSignOut={() => { localStorage.clear(); location.href = '/' }} />
      ) : (
        <div className="h-14" />
      )}
      <main className="max-w-4xl mx-auto px-6 py-10 grid place-items-center">
        {!isAuthed ? (
          <Card
            title={mode==='register' ? 'Criar sua conta' : 'Entrar'}
            subtitle={mode==='register' ? 'Informe seu e-mail para receber o link de confirmação' : 'Informe seu e-mail para receber o link de acesso'}
          >
            <div className="flex gap-2 mb-4">
              <button onClick={() => setMode('register')} className={`text-sm px-3 py-1 rounded ${mode==='register' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`}>Registrar</button>
              <button onClick={() => setMode('login')} className={`text-sm px-3 py-1 rounded ${mode==='login' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`}>Entrar</button>
            </div>
            <div className="space-y-1 mb-2" hidden={mode!=='login'}>
              <div className="flex gap-2">
                <button onClick={()=>setLoginMode('link')} className={`text-xs px-2 py-1 rounded ${loginMode==='link'?'bg-slate-200':'hover:bg-slate-100'}`}>Por link</button>
                <button onClick={()=>setLoginMode('password')} className={`text-xs px-2 py-1 rounded ${loginMode==='password'?'bg-slate-200':'hover:bg-slate-100'}`}>Com senha</button>
              </div>
            </div>
            {loginMode === 'password' && mode==='login' ? (
              <form onSubmit={submitLoginPassword} className="space-y-4">
                <label className="block text-sm">
                  <span className="text-slate-700">E-mail</span>
                  <input value={email} onChange={e=>setEmail(e.target.value)} type="email" required placeholder="voce@empresa.com"
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-brand-400"/>
                </label>
                <label className="block text-sm">
                  <span className="text-slate-700">Senha</span>
                  <input value={password} onChange={e=>setPassword(e.target.value)} type="password" required placeholder="Sua senha"
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-brand-400"/>
                </label>
                <button disabled={loading} type="submit" className="w-full rounded-md bg-brand-600 text-white py-2 hover:bg-brand-700 disabled:opacity-60">
                  {loading ? 'Entrando...' : 'Entrar'}
                </button>
              </form>
            ) : (
              <form onSubmit={submitEmail} className="space-y-4">
                <label className="block text-sm">
                  <span className="text-slate-700">E-mail</span>
                  <input value={email} onChange={e=>setEmail(e.target.value)} type="email" required placeholder="voce@empresa.com"
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-brand-400"/>
                </label>
                <button disabled={loading} type="submit" className="w-full rounded-md bg-brand-600 text-white py-2 hover:bg-brand-700 disabled:opacity-60">
                  {loading ? 'Enviando...' : (mode==='register' ? 'Enviar link de cadastro' : 'Enviar link de acesso')}
                </button>
              </form>
            )}
            {message && <p className="text-sm text-slate-600 mt-4">{message}</p>}
            {devLink && (
              <a className="mt-3 inline-flex items-center text-sm text-brand-700 hover:underline" href={devLink}>
                Abrir link de desenvolvimento
              </a>
            )}
          </Card>
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
