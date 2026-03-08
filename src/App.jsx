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
import Utilizatori from './pages/Utilizatori'

export default function App() {
  const [session, setSession] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [accountType, setAccountType] = useState('user')
  const [onboardingDone, setOnboardingDone] = useState(true)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const saved = localStorage.getItem('app_theme') || 'dark'
    const vars = {
      dark:     { '--bg-900':'#0f0f13','--bg-800':'#1a1a24','--bg-700':'#242433','--bg-600':'#2e2e42','--bg-500':'#383850','--accent':'#4ade80','--accent-fg':'#052e16','--t1':'#f8fafc','--t2':'#e2e8f0','--t3':'#cbd5e1','--t4':'#94a3b8','--t5':'#64748b','--t6':'#475569','--border':'#2e2e42' },
      ocean:    { '--bg-900':'#040d18','--bg-800':'#071525','--bg-700':'#0c1f38','--bg-600':'#132b4f','--bg-500':'#1a3a6e','--accent':'#38bdf8','--accent-fg':'#082f49','--t1':'#f0f9ff','--t2':'#e0f2fe','--t3':'#bae6fd','--t4':'#7dd3fc','--t5':'#38bdf8','--t6':'#0ea5e9','--border':'#1e3a6e' },
      vibe:     { '--bg-900':'#120700','--bg-800':'#1e0e00','--bg-700':'#2c1500','--bg-600':'#3d1d00','--bg-500':'#522600','--accent':'#fb923c','--accent-fg':'#431407','--t1':'#fff7ed','--t2':'#ffedd5','--t3':'#fed7aa','--t4':'#fdba74','--t5':'#fb923c','--t6':'#f97316','--border':'#7c2d12' },
      midnight: { '--bg-900':'#070714','--bg-800':'#0e0e28','--bg-700':'#15153d','--bg-600':'#1e1e52','--bg-500':'#272768','--accent':'#818cf8','--accent-fg':'#1e1b4b','--t1':'#eef2ff','--t2':'#e0e7ff','--t3':'#c7d2fe','--t4':'#a5b4fc','--t5':'#818cf8','--t6':'#6366f1','--border':'#1e1e52' },
      forest:   { '--bg-900':'#030d06','--bg-800':'#071a0d','--bg-700':'#0c2714','--bg-600':'#12361c','--bg-500':'#184626','--accent':'#34d399','--accent-fg':'#022c22','--t1':'#ecfdf5','--t2':'#d1fae5','--t3':'#a7f3d0','--t4':'#6ee7b7','--t5':'#34d399','--t6':'#10b981','--border':'#12361c' },
      rose:     { '--bg-900':'#140508','--bg-800':'#200810','--bg-700':'#30101a','--bg-600':'#421526','--bg-500':'#581b32','--accent':'#fb7185','--accent-fg':'#4c0519','--t1':'#fff1f2','--t2':'#ffe4e6','--t3':'#fecdd3','--t4':'#fda4af','--t5':'#fb7185','--t6':'#f43f5e','--border':'#42152a' },
      barbie:   { '--bg-900':'#1a0016','--bg-800':'#2d0028','--bg-700':'#3f003a','--bg-600':'#5c005a','--bg-500':'#7a0075','--accent':'#ff2d9b','--accent-fg':'#1a0016','--t1':'#fff0f9','--t2':'#ffd6f0','--t3':'#ffb3e6','--t4':'#ff80d3','--t5':'#ff2d9b','--t6':'#e0008c','--border':'#5c005a' },
      gothic:   { '--bg-900':'#080508','--bg-800':'#100d10','--bg-700':'#1a141a','--bg-600':'#251a25','--bg-500':'#30223a','--accent':'#9b30ff','--accent-fg':'#1a0040','--t1':'#f0e6ff','--t2':'#dcc8ff','--t3':'#c4a0ff','--t4':'#a870ff','--t5':'#9b30ff','--t6':'#7a00ff','--border':'#2d1a3d' },
      slate:    { '--bg-900':'#0c1320','--bg-800':'#131e2e','--bg-700':'#1a293d','--bg-600':'#22364f','--bg-500':'#2b4464','--accent':'#38bdf8','--accent-fg':'#0c4a6e','--t1':'#f0f9ff','--t2':'#e0f2fe','--t3':'#bae6fd','--t4':'#93c5fd','--t5':'#60a5fa','--t6':'#3b82f6','--border':'#1e3352' },
      light:    { '--bg-900':'#f1f5f9','--bg-800':'#ffffff','--bg-700':'#f8fafc','--bg-600':'#e2e8f0','--bg-500':'#cbd5e1','--accent':'#16a34a','--accent-fg':'#ffffff','--t1':'#0f172a','--t2':'#1e293b','--t3':'#334155','--t4':'#475569','--t5':'#64748b','--t6':'#94a3b8','--border':'#cbd5e1' },
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
      else { setIsAdmin(false); setAccountType('user'); setOnboardingDone(true); setLoading(false) }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(uid) {
    const { data } = await supabase.from('user_profiles').select('is_admin, onboarding_done, account_type').eq('user_id', uid).single()
    setIsAdmin(data?.is_admin === true || data?.account_type === 'admin')
    setAccountType(data?.account_type || 'user')
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
          <Route path="/" element={<><Dashboard session={session} isAdmin={isAdmin} /><Footer isAdmin={isAdmin} /></>} />
          <Route path="/nutritie" element={<><Nutritie session={session} isAdmin={isAdmin} /><Footer isAdmin={isAdmin} /></>} />
          <Route path="/sport" element={<><Sport session={session} isAdmin={isAdmin} accountType={accountType} /><Footer isAdmin={isAdmin} /></>} />
          <Route path="/camara" element={<><Camara session={session} /><Footer isAdmin={isAdmin} /></>} />
          <Route path="/profil" element={<><Profil session={session} isAdmin={isAdmin} /><Footer isAdmin={isAdmin} /></>} />
          {isAdmin && <Route path="/utilizatori" element={<><Utilizatori session={session} /><Footer isAdmin={isAdmin} /></>} />}
        </Routes>
      </div>
    </BrowserRouter>
  )
}
