import { useLocation, useNavigate } from 'react-router-dom'

const baseTabs = [
  { path: '/',         label: 'Acasă',   icon: '🏠' },
  { path: '/nutritie', label: 'Nutriție', icon: '🥗' },
  { path: '/camara',   label: 'Cămară',  icon: '🧺' },
  { path: '/sport',    label: 'Plan',     icon: '📋' },
  { path: '/profil',   label: 'Profil',  icon: '👤' },
]

const adminTab = { path: '/utilizatori', label: 'Elevi', icon: '👥' }

export default function Footer({ isAdmin }) {
  const location = useLocation()
  const navigate = useNavigate()

  const tabs = isAdmin ? [...baseTabs, adminTab] : baseTabs

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 footer-safe">
      <div className="border-t border-dark-600 px-1 pt-1.5 pb-3" style={{ backgroundColor: 'var(--bg-800)' }}>
        <div className={`flex items-center justify-around ${isAdmin ? 'max-w-lg' : 'max-w-md'} mx-auto`}>
          {tabs.map(tab => {
            const active = location.pathname === tab.path
            return (
              <button
                key={tab.path}
                onClick={() => navigate(tab.path)}
                className={`flex flex-col items-center gap-0.5 rounded-xl transition-all duration-200 ${
                  isAdmin ? 'px-2 py-1.5 min-w-0 flex-1' : 'px-3 py-1.5'
                } ${active ? 'bg-dark-600' : 'hover:bg-dark-700'}`}
              >
                <span className={`transition-transform leading-none ${active ? 'scale-110' : 'scale-100'} ${isAdmin ? 'text-lg' : 'text-xl'}`}>
                  {tab.icon}
                </span>
                <span className={`font-medium transition-colors truncate w-full text-center ${isAdmin ? 'text-[10px]' : 'text-xs'} ${
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