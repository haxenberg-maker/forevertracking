import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { supabase } from './lib/supabase'
import Footer from './components/Footer'
import Auth from './pages/Auth'
import Dashboard from './pages/Dashboard'
import Nutritie from './pages/Nutritie'
import Sport from './pages/Sport'
import Profil from './pages/Profil'
import StravaCallback from './pages/StravaCallback'

export default function App() {
  const [session, setSession] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchAdmin(session.user.id)
      else setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) fetchAdmin(session.user.id)
      else { setIsAdmin(false); setLoading(false) }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function fetchAdmin(uid) {
    const { data } = await supabase.from('user_profiles').select('is_admin').eq('user_id', uid).single()
    setIsAdmin(data?.is_admin === true)
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-900 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-brand-green/20 flex items-center justify-center mx-auto animate-pulse">
            <span className="text-2xl">🏋️</span>
          </div>
          <p className="text-slate-400 text-sm">Se încarcă...</p>
        </div>
      </div>
    )
  }

  // Strava callback needs session — show auth if not logged in
  const isStravaCallback = window.location.pathname === '/strava-callback'
  if (!session && !isStravaCallback) return <Auth />
  if (!session && isStravaCallback) return <Auth />

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-dark-900">
        <Routes>
          <Route path="/strava-callback" element={<StravaCallback session={session} />} />
          <Route path="/" element={<><Dashboard session={session} /><Footer /></>} />
          <Route path="/nutritie" element={<><Nutritie session={session} isAdmin={isAdmin} /><Footer /></>} />
          <Route path="/sport" element={<><Sport session={session} /><Footer /></>} />
          <Route path="/profil" element={<><Profil session={session} /><Footer /></>} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}