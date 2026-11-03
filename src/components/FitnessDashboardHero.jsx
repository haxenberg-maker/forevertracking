import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, ArrowUpRight, Dumbbell, Footprints, Flame, Shield, Target, Zap } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { levelFromXp } from '../lib/fitness/rpg'

const dateISO = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const fmt = (value, digits = 1) => Number(value || 0).toLocaleString('ro-RO', { maximumFractionDigits: digits })

export default function FitnessDashboardHero({ userId }) {
  const navigate = useNavigate()
  const [data, setData] = useState({ xp: 0, runKm: 0, workouts: 0, sessions: 0, quests: 0 })
  const [rpgReady, setRpgReady] = useState(false)

  useEffect(() => {
    let alive = true
    async function load() {
      const today = new Date()
      const weekStart = new Date(today)
      weekStart.setHours(0, 0, 0, 0)
      weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7))
      const from = dateISO(weekStart)
      const to = dateISO(today)
      const [profileRes, activityRes, runsRes, workoutsRes, questsRes] = await Promise.all([
        supabase.from('rpg_profiles').select('total_xp').eq('user_id', userId).maybeSingle(),
        supabase.from('activity_logs').select('id,category,activity_date,distance_km,unit,metric_value').eq('user_id', userId).gte('activity_date', from).lte('activity_date', to),
        supabase.from('running_logs').select('id,distance_km,date').eq('user_id', userId).gte('date', from).lte('date', to),
        supabase.from('workout_logs').select('id,type,date').eq('user_id', userId).gte('date', from).lte('date', to),
        supabase.from('quest_definitions').select('id').eq('user_id', userId).eq('is_active', true),
      ])
      if (!alive) return
      const activities = activityRes.data || []
      const runs = runsRes.data || []
      const workouts = workoutsRes.data || []
      const runKm = runs.reduce((sum, r) => sum + Number(r.distance_km || 0), 0) + activities.reduce((sum, a) => sum + Number(a.distance_km || (a.unit === 'km' ? a.metric_value : 0) || 0), 0)
      const sessions = runs.length + workouts.length + activities.length
      setData({ xp: Number(profileRes.data?.total_xp || 0), runKm, workouts: workouts.filter(w => w.type === 'strength').length + activities.filter(a => a.category === 'strength').length, sessions, quests: questsRes.data?.length || 0 })
      setRpgReady(!profileRes.error && !activityRes.error)
    }
    if (userId) load()
    return () => { alive = false }
  }, [userId])

  const level = levelFromXp(data.xp)
  return (
    <section className="relative overflow-hidden rounded-2xl border border-brand-green/25 bg-gradient-to-br from-brand-green/15 via-dark-800 to-dark-800 p-4 sm:p-5 mb-4">
      <div className="absolute -right-12 -top-16 h-48 w-48 rounded-full bg-brand-green/10 blur-3xl pointer-events-none" />
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-brand-green text-[11px] font-bold tracking-[.2em] uppercase"><Shield size={14}/> Fitness central</div>
            <h2 className="text-xl sm:text-2xl font-black text-white mt-1">Evoluția ta</h2>
            <p className="text-xs text-slate-400 mt-1">Săptămâna curentă · progres sportiv și nivel RPG</p>
          </div>
          <button onClick={() => navigate('/fitness-rpg')} className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-brand-green px-3 py-2 text-xs font-bold text-dark-900 hover:brightness-110 transition"><Zap size={14}/> Fitness RPG <ArrowUpRight size={14}/></button>
        </div>

        <div className="grid grid-cols-[auto_1fr] gap-4 items-center mt-5">
          <div className="w-[76px] h-[76px] rounded-2xl border border-brand-green/30 bg-dark-900/70 flex flex-col items-center justify-center">
            <span className="text-[10px] uppercase tracking-widest text-slate-500">Nivel</span>
            <span className="text-3xl font-black text-brand-green leading-none">{level.level}</span>
          </div>
          <div className="min-w-0">
            <div className="flex justify-between items-end gap-2 mb-2"><span className="text-sm font-bold text-white">{fmt(data.xp, 0)} XP total</span><span className="text-[11px] text-slate-400">{fmt(level.progressXp, 0)} / {fmt(level.nextLevelXp, 0)} XP</span></div>
            <div className="h-2.5 rounded-full bg-dark-600 overflow-hidden"><div className="h-full rounded-full bg-brand-green transition-all" style={{ width: `${level.progressPercent}%` }}/></div>
            <p className="text-[11px] text-slate-500 mt-2">{rpgReady ? 'Progres RPG sincronizat' : 'Date RPG disponibile după configurarea modulului'}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-5">
          <div className="rounded-xl bg-dark-900/55 border border-dark-600/70 p-3"><Footprints size={16} className="text-brand-green mb-2"/><div className="text-lg font-bold text-white">{fmt(data.runKm)} <span className="text-xs text-slate-400">km</span></div><div className="text-[10px] text-slate-500">Distanță săptămânală</div></div>
          <div className="rounded-xl bg-dark-900/55 border border-dark-600/70 p-3"><Dumbbell size={16} className="text-sky-400 mb-2"/><div className="text-lg font-bold text-white">{data.workouts}</div><div className="text-[10px] text-slate-500">Sesiuni de forță</div></div>
          <div className="rounded-xl bg-dark-900/55 border border-dark-600/70 p-3"><Activity size={16} className="text-orange-400 mb-2"/><div className="text-lg font-bold text-white">{data.sessions}</div><div className="text-[10px] text-slate-500">Activități totale</div></div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 mt-4 pt-3 border-t border-dark-600/70">
          <div className="flex items-center gap-2 text-xs text-slate-400"><Target size={14} className="text-brand-green"/>{data.quests} provocări active</div>
          <button onClick={() => navigate('/sport')} className="text-xs font-semibold text-brand-green hover:text-white transition">Vezi toate activitățile →</button>
        </div>
      </div>
    </section>
  )
}
