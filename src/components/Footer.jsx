import { useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'

const allTabs = [
  { path: '/',         label: 'Acasă',   icon: '🏠',  pref: null },
  { path: '/nutritie', label: 'Nutriție', icon: '🥗',  pref: null },
  { path: '/sport',    label: 'Plan',     icon: '📋',  pref: null },
  { path: '/camara',   label: 'Cămară',  icon: '🧺',  pref: 'showCamara' },
  { path: '/buget',    label: 'Buget',   icon: '💰',  pref: 'showBuget' },
  { path: '/profil',   label: 'Profil',  icon: '👤',  pref: null },
]

const adminTab = { path: '/utilizatori', label: 'Elevi', icon: '👥', pref: null }

function getNavPrefs() {
  try { return JSON.parse(localStorage.getItem('nav_prefs') || '{}') } catch { return {} }
}

export default function Footer({ isAdmin }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [prefs, setPrefs] = useState(getNavPrefs)

  useEffect(() => {
    const handler = () => setPrefs(getNavPrefs())
    window.addEventListener('nav-prefs-changed', handler)
    return () => window.removeEventListener('nav-prefs-changed', handler)
  }, [])

  const visibleTabs = allTabs.filter(t => t.pref === null || prefs[t.pref] !== false)
  const tabs = isAdmin ? [...visibleTabs, adminTab] : visibleTabs
  const many = tabs.length >= 6

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 footer-safe">
      <div className="border-t border-dark-600 px-1 pt-1.5 pb-3" style={{ backgroundColor: 'var(--bg-800)' }}>
        <div className="flex items-center justify-around max-w-lg mx-auto">
          {tabs.map(tab => {
            const active = location.pathname === tab.path
            return (
              <button
                key={tab.path}
                onClick={() => navigate(tab.path)}
                className={`flex flex-col items-center gap-0.5 rounded-xl transition-all duration-200 px-1.5 py-1.5 min-w-0 flex-1 ${active ? 'bg-dark-600' : 'hover:bg-dark-700'}`}
              >
                <span className={`transition-transform leading-none ${active ? 'scale-110' : 'scale-100'} ${many ? 'text-base' : 'text-xl'}`}>
                  {tab.icon}
                </span>
                <span className={`font-medium transition-colors truncate w-full text-center ${many ? 'text-[9px]' : 'text-xs'} ${active ? 'text-brand-green' : 'text-slate-500'}`}>
                  {tab.label}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </nav>
  )
}