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
import Onboarding from './pages/Onboarding'

export default function App() {
  const [session, setSession] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [onboardingDone, setOnboardingDone] = useState(true)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else { setIsAdmin(false); setOnboardingDone(true); setLoading(false) }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(uid) {
    const { data } = await supabase.from('user_profiles').select('is_admin, onboarding_done').eq('user_id', uid).single()
    setIsAdmin(data?.is_admin === true)
    setOnboardingDone(data?.onboarding_done === true)
    setLoading(false)
  }

  if (loading) return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-brand-green/20 flex items-center justify-center mx-auto animate-pulse">
          <span className="text-2xl">🏋️</span>
        </div>
        <p className="text-slate-400 text-sm">Se încarcă...</p>
      </div>
    </div>
  )

  if (window.location.pathname === '/strava-callback') {
    if (!session) return <Auth />
    return <BrowserRouter><Routes><Route path="/strava-callback" element={<StravaCallback session={session} />} /></Routes></BrowserRouter>
  }

  if (!session) return <Auth />

  if (!onboardingDone) return <Onboarding session={session} onDone={() => setOnboardingDone(true)} />

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-dark-900">
        <Routes>
          <Route path="/strava-callback" element={<StravaCallback session={session} />} />
          <Route path="/" element={<><Dashboard session={session} isAdmin={isAdmin} /><Footer /></>} />
          <Route path="/nutritie" element={<><Nutritie session={session} isAdmin={isAdmin} /><Footer /></>} />
          <Route path="/sport" element={<><Sport session={session} /><Footer /></>} />
          <Route path="/profil" element={<><Profil session={session} isAdmin={isAdmin} /><Footer /></>} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}