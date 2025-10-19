import React, { useMemo, useState } from 'react'

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

export default function App(){
  // consume tokens from backend redirect if present
  useMemo(() => { storeTokensFromHash() }, [])
  const { isAuthed, me, apiBase } = useAuth()
  const [email, setEmail] = useState('')
  const [mode, setMode] = useState<'login'|'register'>('register')
  const [message, setMessage] = useState('')
  const [profile, setProfile] = useState<any>(null)

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault()
    setMessage('')
    const endpoint = mode === 'register' ? '/auth/register' : '/auth/login-email'
    const res = await fetch(`${apiBase}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    })
    const data = await res.json()
    if (res.ok) {
      setMessage('Enviamos um link para seu e-mail. Verifique sua caixa de entrada.')
      if (data.dev_link) setMessage(m => m + ` (Dev link: ${data.dev_link})`)
    } else {
      setMessage(`Erro: ${data.error || 'Falha ao enviar link'}`)
    }
  }

  async function loadProfile() {
    const p = await me()
    setProfile(p)
  }

  return (
    <div className="p-8 space-y-6 max-w-xl">
      <h1 className="text-2xl font-bold">DataInova Connect — Login</h1>
      {!isAuthed && (
        <div className="space-y-2">
          <div className="flex gap-4">
            <button onClick={() => setMode('register')} className={mode==='register'?'font-semibold underline':''}>Registrar</button>
            <button onClick={() => setMode('login')} className={mode==='login'?'font-semibold underline':''}>Entrar</button>
          </div>
          <form onSubmit={submitEmail} className="space-y-2">
            <label className="block">
              <span>E-mail</span>
              <input value={email} onChange={e=>setEmail(e.target.value)} type="email" required className="border p-2 w-full" placeholder="voce@empresa.com" />
            </label>
            <button type="submit" className="bg-black text-white px-4 py-2 rounded">
              {mode==='register' ? 'Enviar link de cadastro' : 'Enviar link de acesso'}
            </button>
          </form>
          {message && <p className="text-sm text-gray-600">{message}</p>}
        </div>
      )}
      {isAuthed && (
        <div className="space-y-2">
          <p>Você está autenticado. Carregue seu perfil:</p>
          <button onClick={loadProfile} className="bg-black text-white px-4 py-2 rounded">Carregar perfil</button>
          {profile && (
            <pre className="bg-gray-100 p-2 text-sm overflow-auto">{JSON.stringify(profile,null,2)}</pre>
          )}
        </div>
      )}
    </div>
  )
}
