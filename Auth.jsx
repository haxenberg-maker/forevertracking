import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Auth() {
  const [mode, setMode] = useState('login') // login | signup
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)

  const handleSubmit = async () => {
    if (!email || !password) return
    setLoading(true)
    setMessage(null)

    let error
    if (mode === 'login') {
      ({ error } = await supabase.auth.signInWithPassword({ email, password }))
    } else {
      const { error: signUpError } = await supabase.auth.signUp({ email, password })
      error = signUpError
      if (!signUpError) setMessage({ type: 'success', text: 'Cont creat! Verifică emailul pentru confirmare.' })
    }

    if (error) setMessage({ type: 'error', text: error.message })
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-green/30 to-brand-blue/30 flex items-center justify-center mx-auto mb-3 border border-brand-green/20">
            <span className="text-3xl">🏋️</span>
          </div>
          <h1 className="text-2xl font-bold text-white">FitTracker</h1>
          <p className="text-slate-400 text-sm mt-1">Nutriție & Sport — tot într-un loc</p>
        </div>

        {/* Card */}
        <div className="card space-y-4">
          {/* Toggle */}
          <div className="flex bg-dark-700 rounded-xl p-1">
            <button onClick={() => setMode('login')} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${mode === 'login' ? 'bg-dark-600 text-white' : 'text-slate-400'}`}>
              Autentificare
            </button>
            <button onClick={() => setMode('signup')} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${mode === 'signup' ? 'bg-dark-600 text-white' : 'text-slate-400'}`}>
              Cont nou
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Email</label>
              <input className="input" type="email" placeholder="email@exemplu.com"
                value={email} onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Parolă</label>
              <input className="input" type="password" placeholder="••••••••"
                value={password} onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
            </div>
          </div>

          {message && (
            <div className={`rounded-xl px-3 py-2.5 text-sm ${message.type === 'error' ? 'bg-red-500/20 text-red-400' : 'bg-brand-green/20 text-brand-green'}`}>
              {message.text}
            </div>
          )}

          <button onClick={handleSubmit} disabled={loading} className="btn-primary w-full py-3 text-base">
            {loading ? 'Se procesează...' : mode === 'login' ? '→ Intră în cont' : '→ Creează cont'}
          </button>
        </div>
      </div>
    </div>
  )
}
