import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { swr } from '../../lib/cache'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid } from 'recharts'

// ─── Statistici ──────────────────────────────────────

export default function StatisticiTab({ session }) {
  const [runData, setRunData] = useState([])
  const [workoutData, setWorkoutData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadStats() }, [])

  async function loadStats() {
    const uid = session.user.id
    await swr(`${uid}:stats`, async () => {
      const [r, w] = await Promise.all([
        supabase.from('running_logs').select('date, distance_km, duration_min')
          .eq('user_id', uid).order('date', { ascending: false }).limit(20),
        supabase.from('workout_logs').select('date, type')
          .eq('user_id', uid).order('date', { ascending: false }).limit(150),
      ])
      // aduse descrescător (cele mai noi), puse înapoi în ordine cronologică pentru grafic
      return { runs: (r.data || []).reverse(), workouts: (w.data || []).reverse(), error: r.error || w.error || undefined }
    }, ({ runs, workouts }) => {
    if (runs) {
      setRunData(runs.map(r => ({
        date: new Date(r.date).toLocaleDateString('ro-RO', { day: '2-digit', month: 'short' }),
        km: r.distance_km,
        pace: r.duration_min && r.distance_km ? +(r.duration_min / r.distance_km).toFixed(2) : 0
      })))
    }

    if (workouts) {
      const byMonth = {}
      workouts.forEach(w => {
        const m = new Date(w.date + 'T12:00:00').toLocaleDateString('ro-RO', { month: 'short', year: '2-digit' })
        if (!byMonth[m]) byMonth[m] = { month: m, forta: 0, alergare: 0 }
        if (w.type === 'strength') byMonth[m].forta++
        else byMonth[m].alergare++
      })
      setWorkoutData(Object.values(byMonth).slice(-6))
    }

    setLoading(false)
    })
  }

  if (loading) return <p className="text-center text-slate-500 text-sm py-8">Se încarcă statisticile...</p>

  const tooltipStyle = { backgroundColor: '#1a1a24', border: '1px solid #2e2e42', borderRadius: 12, color: '#f1f5f9', fontSize: 12 }

  return (
    <div className="space-y-4">
      {/* Running distance chart */}
      {runData.length > 0 && (
        <div className="card">
          <p className="text-sm font-semibold text-white mb-3">🏃 Distanță alergare (km)</p>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={runData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2e2e42" />
              <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 10 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="km" stroke="#60a5fa" strokeWidth={2} dot={{ fill: '#60a5fa', r: 3 }} name="km" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Pace chart */}
      {runData.length > 0 && (
        <div className="card">
          <p className="text-sm font-semibold text-white mb-3">⏱ Ritm (min/km)</p>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={runData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2e2e42" />
              <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 10 }} reversed />
              <Tooltip contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="pace" stroke="#4ade80" strokeWidth={2} dot={{ fill: '#4ade80', r: 3 }} name="min/km" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Workout frequency */}
      {workoutData.length > 0 && (
        <div className="card">
          <p className="text-sm font-semibold text-white mb-3">📊 Antrenamente pe lună</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={workoutData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2e2e42" />
              <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 10 }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 10 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="forta" fill="#fb923c" radius={[4, 4, 0, 0]} name="Forță" />
              <Bar dataKey="alergare" fill="#60a5fa" radius={[4, 4, 0, 0]} name="Alergare" />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-2 justify-center">
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-brand-orange" /><span className="text-xs text-slate-400">Forță</span></div>
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-brand-blue" /><span className="text-xs text-slate-400">Alergare</span></div>
          </div>
        </div>
      )}

      {runData.length === 0 && workoutData.length === 0 && (
        <div className="card text-center py-8">
          <p className="text-4xl mb-2">📊</p>
          <p className="text-slate-400 text-sm">Nu există date pentru statistici încă.</p>
          <p className="text-slate-500 text-xs mt-1">Adaugă antrenamente pentru a vedea grafice.</p>
        </div>
      )}
    </div>
  )
}
