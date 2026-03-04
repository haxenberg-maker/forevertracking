import { useLocation, useNavigate } from 'react-router-dom'

const tabs = [
  { path: '/', label: 'Acasă', icon: '🏠' },
  { path: '/nutritie', label: 'Nutriție', icon: '🥗' },
  { path: '/sport', label: 'Sport', icon: '💪' },
  { path: '/profil', label: 'Profil', icon: '👤' },
]

export default function Footer() {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 footer-safe">
      <div className="bg-dark-800/95 backdrop-blur-xl border-t border-dark-600 px-2 pt-2 pb-4">
        <div className="flex items-center justify-around max-w-md mx-auto">
          {tabs.map(tab => {
            const active = location.pathname === tab.path
            return (
              <button
                key={tab.path}
                onClick={() => navigate(tab.path)}
                className={`flex flex-col items-center gap-1 px-4 py-1.5 rounded-xl transition-all duration-200 ${
                  active ? 'bg-dark-600' : 'hover:bg-dark-700'
                }`}
              >
                <span className={`text-xl transition-transform ${active ? 'scale-110' : 'scale-100'}`}>
                  {tab.icon}
                </span>
                <span className={`text-xs font-medium transition-colors ${
                  active ? 'text-brand-green' : 'text-slate-500'
                }`}>
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
