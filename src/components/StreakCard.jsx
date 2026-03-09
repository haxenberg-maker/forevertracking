import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

/**
 * StreakCard — afișează streak-uri consecutive pentru:
 * - zile cu mese loggate (nutriție)
 * - zile cu apă logată
 * - zile cu antrenament
 */
export default function StreakCard({ session }) {
  const [streaks, setStreaks] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    const uid = session.user.id
    const today = new Date()
    // Luăm ultimele 60 de zile pentru calcul
    const since = new Date(today)
    since.setDate(since.getDate() - 60)
    const sinceStr = since.toISOString().split('T')[0]

    const [{ data: meals }, { data: water }, { data: workouts }] = await Promise.all([
      supabase.from('meal_logs').select('date').eq('user_id', uid).gte('date', sinceStr),
      supabase.from('water_logs').select('date').eq('user_id', uid).gte('date', sinceStr),
      supabase.from('workout_logs').select('date').eq('user_id', uid).gte('date', sinceStr),
    ])

    const mealDates    = new Set((meals    || []).map(r => r.date))
    const waterDates   = new Set((water    || []).map(r => r.date))
    const workoutDates = new Set((workouts || []).map(r => r.date))

    setStreaks({
      meals:    calcStreak(mealDates),
      water:    calcStreak(waterDates),
      workouts: calcStreak(workoutDates),
    })
    setLoading(false)
  }

  function calcStreak(datesSet) {
    let streak = 0
    const today = new Date()
    // Verificăm dacă azi e deja logat (dacă nu, startăm de ieri)
    const todayStr = today.toISOString().split('T')[0]
    let check = new Date(today)
    if (!datesSet.has(todayStr)) {
      check.setDate(check.getDate() - 1)
    }
    while (true) {
      const s = check.toISOString().split('T')[0]
      if (!datesSet.has(s)) break
      streak++
      check.setDate(check.getDate() - 1)
    }
    return streak
  }

  function flameColor(n) {
    if (n >= 30) return '#ff6b00'
    if (n >= 14) return '#fb923c'
    if (n >= 7)  return '#fbbf24'
    if (n >= 3)  return '#4ade80'
    return '#64748b'
  }

  function flameEmoji(n) {
    if (n >= 30) return '🔥'
    if (n >= 14) return '🔥'
    if (n >= 7)  return '⚡'
    if (n >= 3)  return '✨'
    return '💤'
  }

  function message(n) {
    if (n === 0) return 'Nicio zi consecutivă'
    if (n === 1) return '1 zi — bun început!'
    if (n < 7)  return `${n} zile — continuă!`
    if (n < 14) return `${n} zile — ești pe val!`
    if (n < 30) return `${n} zile — impresionant!`
    return `${n} zile — legendă 🏆`
  }

  if (loading) return null
  if (!streaks) return null
  // Nu afișa cardul dacă toate streak-urile sunt 0
  if (streaks.meals === 0 && streaks.water === 0 && streaks.workouts === 0) return null

  const items = [
    { label: 'Nutriție',      value: streaks.meals,    icon: '🥗' },
    { label: 'Hidratare',     value: streaks.water,    icon: '💧' },
    { label: 'Antrenamente',  value: streaks.workouts, icon: '💪' },
  ]

  const best = Math.max(streaks.meals, streaks.water, streaks.workouts)

  return (
    <div className="card mb-3">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">{flameEmoji(best)}</span>
        <p className="text-sm font-semibold text-white">Streak-uri</p>
        <span className="ml-auto text-xs text-slate-500">{message(best)}</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {items.map(item => (
          <div key={item.label}
            className="bg-dark-700 rounded-xl p-3 text-center"
            style={{ borderBottom: `2px solid ${item.value > 0 ? flameColor(item.value) : '#1e293b'}` }}>
            <p className="text-base mb-0.5">{item.icon}</p>
            <p className="text-xl font-bold text-white leading-none">{item.value}</p>
            <p className="text-[10px] text-slate-500 mt-1">
              {item.value === 1 ? '1 zi' : `${item.value} zile`}
            </p>
            <p className="text-[9px] text-slate-600 mt-0.5 truncate">{item.label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
