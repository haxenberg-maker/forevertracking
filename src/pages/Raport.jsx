import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const MONTHS_FULL = ['Ianuarie','Februarie','Martie','Aprilie','Mai','Iunie','Iulie','August','Septembrie','Octombrie','Noiembrie','Decembrie']
const MONTHS_RO   = ['Ian','Feb','Mar','Apr','Mai','Iun','Iul','Aug','Sep','Oct','Nov','Dec']

function fmtN(n, dec = 0) {
  return (n || 0).toFixed(dec)
}

function getWeekRange(offset = 0) {
  const now = new Date()
  const day = now.getDay() === 0 ? 7 : now.getDay()
  const mon = new Date(now)
  mon.setDate(now.getDate() - day + 1 + offset * 7)
  const sun = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  return {
    start: mon.toISOString().split('T')[0],
    end:   sun.toISOString().split('T')[0],
    label: `${mon.getDate()} ${MONTHS_RO[mon.getMonth()]} – ${sun.getDate()} ${MONTHS_RO[sun.getMonth()]}`,
  }
}

function getMonthRange(offset = 0) {
  const now = new Date()
  const y = now.getFullYear()
  let m = now.getMonth() + offset
  let year = y + Math.floor(m / 12)
  m = ((m % 12) + 12) % 12
  const start = `${year}-${String(m + 1).padStart(2,'0')}-01`
  const lastDay = new Date(year, m + 1, 0).getDate()
  const end   = `${year}-${String(m + 1).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`
  return { start, end, label: `${MONTHS_FULL[m]} ${year}`, month: m, year }
}

export default function Raport({ session }) {
  const [mode,    setMode]    = useState('saptamana') // saptamana | luna
  const [offset,  setOffset]  = useState(0)
  const [data,    setData]    = useState(null)
  const [targets, setTargets] = useState({ calories: 2000, protein_g: 150, water_ml: 2000 })
  const [loading, setLoading] = useState(true)

  const range = mode === 'saptamana' ? getWeekRange(offset) : getMonthRange(offset)
  const isToday = offset === 0

  useEffect(() => { load() }, [mode, offset])

  useEffect(() => {
    supabase.from('user_targets').select('*').eq('user_id', session.user.id).single()
      .then(({ data: t }) => { if (t) setTargets(t) })
  }, [])

  async function load() {
    setLoading(true)
    const uid = session.user.id
    const { start, end } = range

    const [
      { data: meals },
      { data: waterLogs },
      { data: workouts },
      { data: runs },
      { data: scheduleDone },
    ] = await Promise.all([
      supabase.from('meal_logs')
        .select('date, meal_items(quantity_g, foods(calories, protein, carbs, fat))')
        .eq('user_id', uid).gte('date', start).lte('date', end),
      supabase.from('water_logs')
        .select('date, amount_ml')
        .eq('user_id', uid).gte('date', start).lte('date', end),
      supabase.from('workout_logs')
        .select('date, type, duration_min')
        .eq('user_id', uid).gte('date', start).lte('date', end),
      supabase.from('running_logs')
        .select('date, distance_km, duration_min')
        .eq('user_id', uid).gte('date', start).lte('date', end),
      // Antrenamentele zilnice/săptămânale bifate
      supabase.from('workout_schedule_logs')
        .select('date, schedule_id')
        .eq('user_id', uid).eq('done', true)
        .gte('date', start).lte('date', end),
    ])

    // Group by date
    const byDate = {}
    const addDate = d => { if (!byDate[d]) byDate[d] = { cal: 0, protein: 0, carbs: 0, fat: 0, water: 0, workouts: 0, km: 0 } }

    ;(meals || []).forEach(m => {
      addDate(m.date)
      m.meal_items?.forEach(item => {
        const f = item.foods; const r = (item.quantity_g || 0) / 100
        byDate[m.date].cal     += (f?.calories || 0) * r
        byDate[m.date].protein += (f?.protein  || 0) * r
        byDate[m.date].carbs   += (f?.carbs    || 0) * r
        byDate[m.date].fat     += (f?.fat      || 0) * r
      })
    })

    ;(waterLogs || []).forEach(w => {
      addDate(w.date); byDate[w.date].water += w.amount_ml || 0
    })

    ;(workouts || []).forEach(w => {
      addDate(w.date); byDate[w.date].workouts += 1
    })

    // Adaugă și antrenamentele bifate din program (zilnic/săptămânal)
    // Evităm dubluri: dacă aceeași zi are și workout_log și schedule_log, numărăm separat
    ;(scheduleDone || []).forEach(w => {
      addDate(w.date); byDate[w.date].workouts += 1
    })

    ;(runs || []).forEach(r => {
      addDate(r.date); byDate[r.date].km += r.distance_km || 0
    })

    const days = Object.values(byDate)
    const nDays = days.length || 1

    const totalCal      = days.reduce((s, d) => s + d.cal, 0)
    const totalProtein  = days.reduce((s, d) => s + d.protein, 0)
    const totalCarbs    = days.reduce((s, d) => s + d.carbs, 0)
    const totalFat      = days.reduce((s, d) => s + d.fat, 0)
    const totalWater    = days.reduce((s, d) => s + d.water, 0)
    const totalWorkouts = days.reduce((s, d) => s + d.workouts, 0)
    const totalKm       = days.reduce((s, d) => s + d.km, 0)
    const loggedDays    = (meals || []).map(m => m.date).filter((d, i, a) => a.indexOf(d) === i).length

    // Best / worst day
    const daysArr = Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b))
    const bestDay  = daysArr.reduce((b, d) => d[1].cal > (b?.[1]?.cal || 0) ? d : b, null)
    const bestWater = daysArr.reduce((b, d) => d[1].water > (b?.[1]?.water || 0) ? d : b, null)

    const totalDays = mode === 'saptamana' ? 7 : new Date(range.end).getDate()

    setData({
      totalCal, totalProtein, totalCarbs, totalFat,
      totalWater, totalWorkouts, totalKm, loggedDays, totalDays,
      avgCal: totalCal / Math.max(loggedDays, 1),
      avgWater: totalWater / Math.max(loggedDays, 1),
      bestDay, bestWater, byDate, daysArr,
    })
    setLoading(false)
  }

  function fmtDate(d) {
    if (!d) return ''
    const dt = new Date(d + 'T12:00:00')
    return dt.toLocaleDateString('ro-RO', { weekday: 'short', day: 'numeric', month: 'short' })
  }

  const calTarget = (targets.calories || 2000) * (data?.loggedDays || 1)
  const waterTarget = (targets.water_ml || 2000) * (data?.loggedDays || 1)

  return (
    <div className="page fade-in">

      {/* Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-white">📊 Raport</h1>
        <p className="text-xs text-slate-500 mt-0.5">Rezumatul activității tale</p>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-1 bg-dark-700 rounded-xl p-1 mb-4">
        {[['saptamana','📅 Săptămână'],['luna','🗓️ Lună']].map(([k,l]) => (
          <button key={k} onClick={() => { setMode(k); setOffset(0) }}
            className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${mode === k ? 'bg-dark-600 text-white' : 'text-slate-400'}`}>
            {l}
          </button>
        ))}
      </div>

      {/* Period nav */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setOffset(o => o - 1)}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-dark-700 text-slate-300 hover:bg-dark-600 text-lg">‹</button>
        <div className="text-center">
          <p className="text-sm font-semibold text-white">{range.label}</p>
          {isToday && <p className="text-[10px] text-brand-green mt-0.5">Perioada curentă</p>}
        </div>
        <button onClick={() => setOffset(o => o + 1)} disabled={isToday}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-dark-700 text-slate-300 hover:bg-dark-600 disabled:opacity-30 text-lg">›</button>
      </div>

      {loading && (
        <div className="card text-center py-12">
          <p className="text-slate-400 text-sm animate-pulse">Se calculează...</p>
        </div>
      )}

      {!loading && data && (
        <div className="space-y-3">

          {/* Zile logate */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-white">📆 Zile înregistrate</p>
              <p className="text-xs text-slate-500">{data.loggedDays} din {data.totalDays}</p>
            </div>
            <div className="flex gap-1">
              {Array.from({ length: data.totalDays }, (_, i) => {
                const d = new Date(range.start + 'T12:00:00')
                d.setDate(d.getDate() + i)
                const key = d.toISOString().split('T')[0]
                const has = !!data.byDate[key]
                const isToday2 = key === new Date().toISOString().split('T')[0]
                return (
                  <div key={i} className={`flex-1 rounded-sm transition-all ${
                    has ? 'bg-brand-green' : 'bg-dark-700'
                  } ${isToday2 ? 'ring-1 ring-white/40' : ''}`}
                    style={{ height: '20px' }} title={key} />
                )
              })}
            </div>
            <div className="flex gap-3 mt-2">
              <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-brand-green"/><span className="text-[10px] text-slate-500">Logat</span></div>
              <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-dark-700 border border-dark-500"/><span className="text-[10px] text-slate-500">Nelogat</span></div>
            </div>
          </div>

          {/* Nutriție summary */}
          <div className="card">
            <p className="text-sm font-semibold text-white mb-3">🥗 Nutriție</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-dark-700 rounded-xl p-3">
                <p className="text-xs text-slate-500 mb-1">Total calorii</p>
                <p className="text-xl font-bold text-brand-green">{Math.round(data.totalCal).toLocaleString('ro-RO')}</p>
                <p className="text-[10px] text-slate-500">kcal înregistrate</p>
                {calTarget > 0 && (
                  <div className="mt-2 h-1 bg-dark-600 rounded-full overflow-hidden">
                    <div className="h-full bg-brand-green/60 rounded-full"
                      style={{ width: `${Math.min(100, data.totalCal / calTarget * 100)}%` }} />
                  </div>
                )}
              </div>
              <div className="bg-dark-700 rounded-xl p-3">
                <p className="text-xs text-slate-500 mb-1">Medie zilnică</p>
                <p className="text-xl font-bold text-white">{Math.round(data.avgCal)}</p>
                <p className="text-[10px] text-slate-500">kcal/zi logată</p>
                <p className={`text-[10px] mt-1 font-medium ${data.avgCal < targets.calories * 0.9 ? 'text-brand-blue' : data.avgCal > targets.calories * 1.1 ? 'text-red-400' : 'text-brand-green'}`}>
                  {data.avgCal < targets.calories * 0.9 ? '↓ Sub target' : data.avgCal > targets.calories * 1.1 ? '↑ Peste target' : '✓ În target'}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-3">
              {[
                { label: 'Proteine', value: Math.round(data.totalProtein), unit: 'g', color: 'text-brand-blue' },
                { label: 'Carbo',   value: Math.round(data.totalCarbs),   unit: 'g', color: 'text-brand-orange' },
                { label: 'Grăsimi',value: Math.round(data.totalFat),     unit: 'g', color: 'text-purple-400' },
              ].map(m => (
                <div key={m.label} className="bg-dark-700 rounded-xl p-2.5 text-center">
                  <p className={`text-sm font-bold ${m.color}`}>{m.value}<span className="text-xs font-normal">{m.unit}</span></p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{m.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Hidratare */}
          <div className="card">
            <p className="text-sm font-semibold text-white mb-3">💧 Hidratare</p>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-slate-400">Total</span>
                  <span className="text-white font-medium">{(data.totalWater / 1000).toFixed(1)} L</span>
                </div>
                <div className="h-2 bg-dark-600 rounded-full overflow-hidden">
                  <div className="h-full bg-brand-blue/70 rounded-full"
                    style={{ width: `${Math.min(100, data.totalWater / waterTarget * 100)}%` }} />
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  Medie: {(data.avgWater / 1000).toFixed(2)} L/zi · Target: {(targets.water_ml / 1000).toFixed(1)} L/zi
                </p>
              </div>
            </div>
            {data.bestWater && (
              <p className="text-[10px] text-slate-500 mt-2">
                🏆 Cea mai bine hidratată zi: <span className="text-white">{fmtDate(data.bestWater[0])}</span> — {((data.bestWater[1].water) / 1000).toFixed(1)} L
              </p>
            )}
          </div>

          {/* Sport */}
          <div className="card">
            <p className="text-sm font-semibold text-white mb-3">💪 Activitate fizică</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-dark-700 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-brand-green">{data.totalWorkouts}</p>
                <p className="text-xs text-slate-400">antrenamente</p>
              </div>
              <div className="bg-dark-700 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-brand-orange">{fmtN(data.totalKm, 1)}</p>
                <p className="text-xs text-slate-400">km alergați</p>
              </div>
            </div>
            {data.bestDay && data.bestDay[1].cal > 0 && (
              <p className="text-[10px] text-slate-500 mt-3">
                🔥 Ziua cu cele mai multe calorii: <span className="text-white">{fmtDate(data.bestDay[0])}</span> — {Math.round(data.bestDay[1].cal)} kcal
              </p>
            )}
          </div>

          {/* Daily chart */}
          {data.daysArr.length > 0 && (
            <div className="card">
              <p className="text-sm font-semibold text-white mb-3">📈 Calorii pe zi</p>
              <div className="flex items-end gap-1" style={{ height: '80px' }}>
                {Array.from({ length: data.totalDays }, (_, i) => {
                  const d = new Date(range.start + 'T12:00:00')
                  d.setDate(d.getDate() + i)
                  const key = d.toISOString().split('T')[0]
                  const cal = data.byDate[key]?.cal || 0
                  const maxCal = Math.max(...Object.values(data.byDate).map(d => d.cal), 1)
                  const pct = cal / maxCal * 100
                  const isToday2 = key === new Date().toISOString().split('T')[0]
                  return (
                    <div key={i} className="flex-1 flex items-end" style={{ height: '72px' }}>
                      <div className={`w-full rounded-t-sm transition-all ${isToday2 ? 'bg-brand-green' : 'bg-brand-green/40'}`}
                        style={{ height: `${pct}%`, minHeight: cal > 0 ? '4px' : '0' }}
                        title={`${key}: ${Math.round(cal)} kcal`} />
                    </div>
                  )
                })}
              </div>
              {mode === 'saptamana' && (
                <div className="flex gap-1 mt-1">
                  {['L','Ma','Mi','J','V','S','D'].map((z, i) => (
                    <div key={i} className="flex-1 text-center">
                      <p className="text-[9px] text-slate-600">{z}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Concluzie */}
          <div className="card bg-gradient-to-br from-dark-700 to-dark-800">
            <p className="text-sm font-semibold text-white mb-2">💡 Concluzie</p>
            <div className="space-y-1.5 text-xs text-slate-400">
              {data.loggedDays === 0 && <p>Nicio zi înregistrată în această perioadă.</p>}
              {data.loggedDays > 0 && data.avgCal >= targets.calories * 0.9 && data.avgCal <= targets.calories * 1.1 && (
                <p>✅ <span className="text-brand-green">Excelent!</span> Caloriile medii sunt în target ({targets.calories} kcal).</p>
              )}
              {data.avgCal < targets.calories * 0.9 && data.loggedDays > 0 && (
                <p>⚠️ Caloriile medii sunt sub target. Asigură-te că mănânci suficient.</p>
              )}
              {data.avgCal > targets.calories * 1.1 && data.loggedDays > 0 && (
                <p>⚠️ Caloriile medii depășesc target-ul zilnic.</p>
              )}
              {data.totalWorkouts >= 3 && (
                <p>💪 <span className="text-brand-orange">Super!</span> {data.totalWorkouts} antrenamente în această perioadă.</p>
              )}
              {data.totalWorkouts === 0 && (
                <p>🏋️ Niciun antrenament înregistrat. Hai la sport!</p>
              )}
              {data.avgWater >= targets.water_ml * 0.9 && data.loggedDays > 0 && (
                <p>💧 <span className="text-brand-blue">Hidratat</span> corespunzător.</p>
              )}
              {data.avgWater < targets.water_ml * 0.7 && data.loggedDays > 0 && (
                <p>💧 Hidratarea e sub target. Încearcă să bei mai multă apă.</p>
              )}
            </div>
          </div>

        </div>
      )}
    </div>
  )
}