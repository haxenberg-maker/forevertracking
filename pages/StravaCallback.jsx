import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function StravaCallback({ session }) {
  const navigate = useNavigate()
  const [status, setStatus] = useState('Se conectează la Strava...')
  const [error, setError] = useState(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const errorParam = params.get('error')

    if (errorParam) {
      setError('Autorizarea Strava a fost anulată.')
      setTimeout(() => navigate('/profil'), 3000)
      return
    }
    if (!code) {
      setError('Cod lipsă de la Strava.')
      setTimeout(() => navigate('/profil'), 3000)
      return
    }

    handleExchange(code)
  }, [])

  async function handleExchange(code) {
    try {
      setStatus('Se schimbă codul de autorizare...')

      // Call Netlify function to exchange code (keeps client_secret hidden)
      const res = await fetch('/.netlify/functions/strava-exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Exchange failed')

      setStatus('Se salvează conexiunea...')

      // Save tokens to Supabase
      const { error: dbError } = await supabase.from('strava_tokens').upsert({
        user_id: session.user.id,
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: data.expires_at,
        athlete_id: data.athlete_id,
      }, { onConflict: 'user_id' })

      if (dbError) throw new Error(dbError.message)

      setStatus(`✅ Conectat cu succes${data.athlete_name ? ` ca ${data.athlete_name}` : ''}! Redirecționare...`)
      setTimeout(() => navigate('/sport'), 2000)
    } catch (err) {
      setError(err.message)
      setTimeout(() => navigate('/profil'), 4000)
    }
  }

  return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center px-4">
      <div className="card max-w-sm w-full text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-orange-500/20 flex items-center justify-center mx-auto">
          <span className="text-3xl">🟠</span>
        </div>
        <h1 className="text-lg font-bold text-white">Strava</h1>
        {error ? (
          <>
            <p className="text-red-400 text-sm">{error}</p>
            <p className="text-slate-500 text-xs">Redirecționare înapoi...</p>
          </>
        ) : (
          <>
            <div className="flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-slate-300 text-sm">{status}</p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
