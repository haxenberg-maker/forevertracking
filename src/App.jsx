import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { supabase } from './lib/supabase'
import Footer from './components/Footer'
import Auth from './pages/Auth'
import Dashboard from './pages/Dashboard'
import Nutritie from './pages/Nutritie'
import Sport from './pages/Sport'
import Profil from './pages/Profil'

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

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

  if (!session) return <Auth />

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-dark-900">
        <Routes>
          <Route path="/" element={<Dashboard session={session} />} />
          <Route path="/nutritie" element={<Nutritie session={session} />} />
          <Route path="/sport" element={<Sport session={session} />} />
          <Route path="/profil" element={<Profil session={session} />} />
        </Routes>
        <Footer />
      </div>
    </BrowserRouter>
  )
}
