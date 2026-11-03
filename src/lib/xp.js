// Sincronizare XP automată.
//
// XP-ul vine din TOT ce înregistrezi (apă, mese, suplimente, antrenamente, Strava, plan bifat), dar nu e calculat
// aici: funcția SQL `sync_xp` citește datele reale din baza de date și acordă XP. Clientul doar o declanșează,
// deci nu poate trimite sume false, iar fiecare premiu se acordă o singură dată (vezi migrarea 202611030001).
//
// Când se declanșează:
//   - după orice salvare reușită într-unul din tabelele de mai jos (cu mică întârziere, ca salvările în rafală
//     — ex. antrenament + seturi — să fie o singură sincronizare);
//   - la deschiderea aplicației (ultimele 3 zile: așa se încheie ziua de ieri) și la revenirea în aplicație.
import { onWritten } from './cache'
import { supabase } from './supabase'
import { levelFromXp } from './fitness/rpg'

// Tabelele din care se calculează XP
const XP_TABLES = new Set([
  'water_logs', 'meal_logs', 'meal_items', 'supplement_logs', 'daily_supplements',
  'workout_logs', 'workout_exercises', 'running_logs', 'workout_schedule_logs', 'user_targets',
])
const DEBOUNCE_MS = 1200

export const xpStatus = { error: null, lastSync: 0 }

let unavailable = false   // funcția SQL nu există (migrarea nu a fost rulată): nu mai insistăm în această sesiune
let running = null
let queuedDaysBack = null
let timer = null

const pad = n => String(n).padStart(2, '0')
const localDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export function syncXp({ daysBack = 0 } = {}) {
  if (unavailable) return Promise.resolve({ ok: false, error: xpStatus.error })
  if (running) {
    queuedDaysBack = Math.max(queuedDaysBack ?? 0, daysBack)
    return running
  }
  running = doSync(daysBack).finally(() => {
    running = null
    if (queuedDaysBack !== null) {
      const next = queuedDaysBack
      queuedDaysBack = null
      syncXp({ daysBack: next })
    }
  })
  return running
}

async function doSync(daysBack) {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return { ok: false }

    const { data, error } = await supabase.rpc('sync_xp', { p_today: localDate(), p_days_back: daysBack })
    if (error) {
      // PGRST202 / 42883 = funcția nu există încă în baza de date
      if (error.code === 'PGRST202' || error.code === '42883') unavailable = true
      xpStatus.error = error.message
      console.warn('[xp] sync_xp a eșuat:', error.message)
      return { ok: false, error: error.message }
    }

    xpStatus.error = null
    xpStatus.lastSync = Date.now()
    if (data?.awarded > 0) {
      const before = levelFromXp((data.total_xp || 0) - data.awarded).level
      const detail = { ...data, levelUp: data.level > before ? data.level : null }
      window.dispatchEvent(new CustomEvent('xp-awarded', { detail }))
    }
    return { ok: true, data }
  } catch (e) {
    xpStatus.error = e.message
    console.warn('[xp] sync_xp a eșuat:', e)
    return { ok: false, error: e.message }
  }
}

let pendingDaysBack = 0
function scheduleSync(daysBack = 0) {
  pendingDaysBack = Math.max(pendingDaysBack, daysBack)
  clearTimeout(timer)
  timer = setTimeout(() => {
    const days = pendingDaysBack
    pendingDaysBack = 0
    syncXp({ daysBack: days })
  }, DEBOUNCE_MS)
}

// Când editezi o zi din TRECUT (ex. adaugi o masă uitată), sincronizarea trebuie să acopere și ziua aceea.
export function touchXpDay(dateISO) {
  const [y, m, d] = String(dateISO).split('-').map(Number)
  if (!y || !m || !d) return
  const now = new Date()
  const daysAgo = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(y, m - 1, d)) / 86400000)
  if (daysAgo > 0 && daysAgo <= 60) scheduleSync(daysAgo)   // sync_xp reevaluează maxim 60 de zile în urmă
}

onWritten(table => { if (XP_TABLES.has(table)) scheduleSync(0) })
