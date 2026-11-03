import { useEffect, useState } from 'react'
import { Zap, Trophy } from 'lucide-react'

// Mică notificare „+XP" care apare când sincronizarea acordă puncte (apă, mese, suplimente, antrenamente...).
export default function XpToast() {
  const [toast, setToast] = useState(null)

  useEffect(() => {
    let hideTimer
    const onAwarded = (e) => {
      setToast(e.detail)
      clearTimeout(hideTimer)
      hideTimer = setTimeout(() => setToast(null), 4500)
    }
    window.addEventListener('xp-awarded', onAwarded)
    return () => { window.removeEventListener('xp-awarded', onAwarded); clearTimeout(hideTimer) }
  }, [])

  if (!toast) return null
  const items = [...(toast.items || [])].sort((a, b) => b.xp - a.xp)
  const shown = items.slice(0, 3)
  const hidden = items.length - shown.length

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-1/2 -translate-x-1/2 z-[60] w-[min(92vw,22rem)] pointer-events-none"
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
    >
      <div className="rounded-2xl border border-brand-green/40 bg-dark-800/95 backdrop-blur px-4 py-3 shadow-lg shadow-black/40">
        <div className="flex items-center gap-2">
          {toast.levelUp ? <Trophy size={18} className="text-brand-green shrink-0" /> : <Zap size={18} className="text-brand-green shrink-0" />}
          <span className="font-black text-brand-green text-base">+{toast.awarded} XP</span>
          {toast.levelUp && <span className="text-sm font-bold text-white">Nivel {toast.levelUp}!</span>}
        </div>
        {shown.length > 0 && (
          <ul className="mt-1.5 space-y-0.5">
            {shown.map((it, i) => (
              <li key={i} className="flex justify-between gap-3 text-xs text-slate-300">
                <span className="truncate">{it.reason}</span>
                <span className="text-slate-400 shrink-0">+{it.xp}</span>
              </li>
            ))}
            {hidden > 0 && <li className="text-[11px] text-slate-500">și încă {hidden}</li>}
          </ul>
        )}
      </div>
    </div>
  )
}
