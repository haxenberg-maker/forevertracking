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
import Camara from './pages/Camara'

export default function App() {
  const [session, setSession] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [onboardingDone, setOnboardingDone] = useState(true)
  const [loading, setLoading] = useState(true)

  // Apply saved theme on startup
  useEffect(() => {
    const saved = localStorage.getItem('app_theme') || 'dark'
    const vars = {
      dark:  { '--bg-900':'#0f0f13','--bg-800':'#1a1a24','--bg-700':'#242433','--bg-600':'#2e2e42','--bg-500':'#383850','--accent':'#4ade80','--accent-fg':'#052e16','--t1':'#f8fafc','--t2':'#e2e8f0','--t3':'#cbd5e1','--t4':'#94a3b8','--t5':'#64748b','--t6':'#475569','--border':'#2e2e42' },
      ocean: { '--bg-900':'#040d18','--bg-800':'#071525','--bg-700':'#0c1f38','--bg-600':'#132b4f','--bg-500':'#1a3a6e','--accent':'#38bdf8','--accent-fg':'#082f49','--t1':'#f0f9ff','--t2':'#e0f2fe','--t3':'#bae6fd','--t4':'#7dd3fc','--t5':'#38bdf8','--t6':'#0ea5e9','--border':'#1e3a6e' },
      vibe:  { '--bg-900':'#120700','--bg-800':'#1e0e00','--bg-700':'#2c1500','--bg-600':'#3d1d00','--bg-500':'#522600','--accent':'#fb923c','--accent-fg':'#431407','--t1':'#fff7ed','--t2':'#ffedd5','--t3':'#fed7aa','--t4':'#fdba74','--t5':'#fb923c','--t6':'#f97316','--border':'#7c2d12' },
      light: { '--bg-900':'#f1f5f9','--bg-800':'#ffffff','--bg-700':'#f8fafc','--bg-600':'#e2e8f0','--bg-500':'#cbd5e1','--accent':'#16a34a','--accent-fg':'#ffffff','--t1':'#0f172a','--t2':'#1e293b','--t3':'#334155','--t4':'#475569','--t5':'#64748b','--t6':'#94a3b8','--border':'#cbd5e1' },
    }
    const t = vars[saved] || vars.dark
    const root = document.documentElement
    Object.entries(t).forEach(([k, v]) => root.style.setProperty(k, v))
    root.setAttribute('data-theme', saved)
  }, [])

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
          <Route path="/camara" element={<><Camara session={session} /><Footer /></>} />
          <Route path="/profil" element={<><Profil session={session} isAdmin={isAdmin} /><Footer /></>} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}