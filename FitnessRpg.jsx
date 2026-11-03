import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Activity, ArrowLeft, CalendarDays, Check, ChevronRight, HelpCircle,
  Dumbbell, Flame, Footprints, Gauge, HeartPulse, Plus, RefreshCw,
  Save, Shield, Sparkles, Target, Trophy, Waves, X, Zap,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { DEFAULT_EXERCISES, TRAINING_DAILY_CAP, XP_RULES, ensureDefaultExercises, ensureRpgProfile, getMetricFromActivity, levelFromXp } from '../../lib/fitness/rpg'
import { syncXp } from '../../lib/xp'

const todayISO = (d = new Date()) => {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const categoryLabels = { endurance: 'Anduranță', strength: 'Forță', mobility: 'Mobilitate', recovery: 'Recuperare', other: 'Altele' }
// Categoriile din istoricul XP (include cele acordate automat din apă, nutriție, suplimente și bonusuri)
const ledgerLabels = { ...categoryLabels, vitality: 'Vitalitate', consistency: 'Consecvență' }
const unitLabels = { reps: 'repetări', km: 'km', meters: 'm', minutes: 'minute', seconds: 'secunde', kg: 'kg', hours: 'ore', rounds: 'runde' }
const iconFor = (category) => category === 'endurance' ? Footprints : category === 'strength' ? Dumbbell : category === 'mobility' ? Waves : Activity
const fmt = (value, digits = 0) => Number(value || 0).toLocaleString('ro-RO', { maximumFractionDigits: digits })

function StatCard({ icon: Icon, label, value, detail }) {
  return <div className="card min-w-0">
    <div className="flex items-center justify-between gap-2 mb-3"><span className="text-xs text-slate-400">{label}</span><Icon size={17} className="text-brand-green" /></div>
    <div className="text-2xl font-bold text-white leading-tight">{value}</div>
    {detail && <div className="text-xs text-slate-500 mt-1">{detail}</div>}
  </div>
}

export default function FitnessRpg({ session }) {
  const navigate = useNavigate()
  const [tab, setTab] = useState('overview')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [exercises, setExercises] = useState([])
  const [activities, setActivities] = useState([])
  const [profile, setProfile] = useState(null)
  const [ledger, setLedger] = useState([])
  const [quests, setQuests] = useState([])
  const [showExerciseForm, setShowExerciseForm] = useState(false)
  const [editingExercise, setEditingExercise] = useState(null)
  const [showQuestForm, setShowQuestForm] = useState(false)
  const [exerciseForm, setExerciseForm] = useState({ name: '', category: 'strength', unit: 'reps' })
  const [questForm, setQuestForm] = useState({ name: '', description: '', metric_key: 'distance_km', target_value: '40', period: 'weekly', reward_xp: '20', starts_on: todayISO(), ends_on: '' })
  const [logForm, setLogForm] = useState({ exercise_id: '', activity_date: todayISO(), values: [''], duration_minutes: '', distance_km: '', elevation_gain_m: '', notes: '' })

  const [xpError, setXpError] = useState('')

  // silent = reîncărcare în fundal (fără spinner), folosită când XP-ul se actualizează singur
  const loadData = useCallback(async (opts) => {
    if (!session?.user?.id) return
    if (!opts?.silent) setLoading(true)
    setError('')
    try {
      await ensureRpgProfile()
      await ensureDefaultExercises(session.user.id)
      const [exRes, actRes, profileRes, ledgerRes, questRes] = await Promise.all([
        supabase.from('exercise_definitions').select('*').eq('user_id', session.user.id).is('archived_at', null).order('created_at', { ascending: true }),
        supabase.from('activity_logs').select('*, activity_sets(*)').eq('user_id', session.user.id).order('activity_date', { ascending: false }).order('created_at', { ascending: false }).limit(250),
        supabase.from('rpg_profiles').select('*').eq('user_id', session.user.id).maybeSingle(),
        supabase.from('xp_ledger').select('*').eq('user_id', session.user.id).order('awarded_at', { ascending: false }).limit(60),
        supabase.from('quest_definitions').select('*').eq('user_id', session.user.id).eq('is_active', true).order('created_at', { ascending: false }),
      ])
      const firstError = [exRes, actRes, profileRes, ledgerRes, questRes].find(r => r.error)?.error
      if (firstError) throw firstError
      // Read legacy running_logs for unified statistics without migrating or duplicating existing records.
      const { data: legacyRuns, error: legacyError } = await supabase.from('running_logs')
        .select('id,date,distance_km,duration_min,notes,created_at')
        .eq('user_id', session.user.id).order('date', { ascending: false }).limit(250)
      if (legacyError) throw legacyError
      const legacyActivities = (legacyRuns || []).map(run => ({
        id: `legacy-run-${run.id}`, legacy: true, title: 'Alergare (istoric)', category: 'endurance',
        activity_date: run.date, unit: 'km', metric_value: Number(run.distance_km || 0),
        distance_km: Number(run.distance_km || 0), duration_minutes: Number(run.duration_min || 0),
        elevation_gain_m: 0, notes: run.notes, created_at: run.created_at, activity_sets: [], source: 'legacy',
      }))
      setExercises(exRes.data || [])
      setActivities([...(actRes.data || []), ...legacyActivities].sort((a, b) => `${b.activity_date || ''}${b.created_at || ''}`.localeCompare(`${a.activity_date || ''}${a.created_at || ''}`)).slice(0, 400))
      setProfile(profileRes.data || { total_xp: 0, endurance_xp: 0, strength_xp: 0, consistency_xp: 0, mobility_xp: 0, vitality_xp: 0 })
      setLedger(ledgerRes.data || [])
      setQuests(questRes.data || [])
      setLogForm(prev => ({ ...prev, exercise_id: prev.exercise_id || exRes.data?.[0]?.id || '' }))
    } catch (e) {
      setError(e.message || 'Nu am putut încărca modulul RPG. Verifică dacă ai rulat migrarea SQL.')
    } finally { setLoading(false) }
  }, [session?.user?.id])

  useEffect(() => { loadData() }, [loadData])

  // XP automat: verifică ultimele zile la deschiderea paginii și reîncarcă în fundal când se acordă XP
  useEffect(() => {
    syncXp({ daysBack: 1 }).then(res => setXpError(res.ok ? '' : (res.error || '')))
    const refresh = () => loadData({ silent: true })
    window.addEventListener('xp-awarded', refresh)
    return () => window.removeEventListener('xp-awarded', refresh)
  }, [loadData])

  const selectedExercise = exercises.find(e => e.id === logForm.exercise_id)
  const today = todayISO()
  const todayActivities = activities.filter(a => a.activity_date === today)
  const weekStart = new Date(); weekStart.setHours(0, 0, 0, 0); weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7))
  const weekStartISO = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`
  const weekActivities = activities.filter(a => a.activity_date >= weekStartISO && a.activity_date <= today)
  const todayKm = todayActivities.reduce((sum, a) => sum + Number(a.distance_km || (a.unit === 'km' ? a.metric_value : 0) || 0), 0)
  const todayReps = todayActivities.reduce((sum, a) => sum + (a.unit === 'reps' ? Number(a.metric_value || 0) : 0), 0)
  const weekKm = weekActivities.reduce((sum, a) => sum + Number(a.distance_km || (a.unit === 'km' ? a.metric_value : 0) || 0), 0)
  const level = levelFromXp(profile?.total_xp || 0)
  const todayXp = ledger.filter(item => item.awarded_at && todayISO(new Date(item.awarded_at)) === today).reduce((sum, item) => sum + item.xp_amount, 0)

  const questProgress = useMemo(() => quests.map(quest => {
    const start = quest.period === 'daily' ? today : quest.period === 'weekly' ? weekStartISO : quest.period === 'monthly' ? `${today.slice(0, 7)}-01` : quest.starts_on
    const end = quest.ends_on || today
    const value = activities.filter(a => a.activity_date >= start && a.activity_date <= end && a.activity_date >= quest.starts_on)
      .reduce((sum, activity) => sum + getMetricFromActivity(activity, quest.metric_key), 0)
    return { ...quest, current: value, percent: Math.min(100, (value / Number(quest.target_value)) * 100), complete: value >= Number(quest.target_value) }
  }), [quests, activities, today, weekStartISO])

  // Acordă XP și pentru ce ai înregistrat înainte de actualizare (apă, mese, suplimente, antrenamente). Doar la cerere,
  // fiindcă poate urca nivelul dintr-o dată; premiile deja acordate nu se dublează.
  async function backfillXp() {
    setSaving(true); setError(''); setNotice('Se calculează XP-ul pentru ultimele 30 de zile...')
    const res = await syncXp({ daysBack: 30 })
    if (res.ok) {
      setNotice(res.data?.awarded > 0 ? `Am adăugat ${fmt(res.data.awarded)} XP din ultimele 30 de zile.` : 'Nimic de adăugat: tot ce ai înregistrat e deja contabilizat.')
      await loadData({ silent: true })
    } else { setNotice(''); setError(res.error || 'Nu am putut calcula XP-ul.') }
    setSaving(false)
  }

  async function saveExercise(e) {
    e.preventDefault(); setSaving(true); setError(''); setNotice('')
    try {
      const name = exerciseForm.name.trim()
      if (!name) throw new Error('Introdu un nume pentru exercițiu.')
      let data
      if (editingExercise) {
        const { data: updated, error: saveError } = await supabase.from('exercise_definitions').update({ name, category: exerciseForm.category, unit: exerciseForm.unit, updated_at: new Date().toISOString() }).eq('id', editingExercise.id).eq('user_id', session.user.id).select().single()
        if (saveError) throw saveError
        data = updated
        setExercises(prev => prev.map(item => item.id === data.id ? data : item))
        setNotice('Exercițiul a fost actualizat.')
      } else {
        const { data: inserted, error: saveError } = await supabase.from('exercise_definitions').insert({ user_id: session.user.id, name, category: exerciseForm.category, unit: exerciseForm.unit }).select().single()
        if (saveError) throw saveError
        data = inserted
        setExercises(prev => [...prev, data])
        setNotice('Exercițiul a fost creat.')
      }
      setLogForm(prev => ({ ...prev, exercise_id: data.id, values: [''] }))
      setExerciseForm({ name: '', category: 'strength', unit: 'reps' }); setEditingExercise(null); setShowExerciseForm(false)
    } catch (e2) { setError(e2.message || 'Nu am putut salva exercițiul.') }
    finally { setSaving(false) }
  }

  function openEditExercise(exercise) {
    setEditingExercise(exercise)
    setExerciseForm({ name: exercise.name, category: exercise.category, unit: exercise.unit })
    setShowExerciseForm(true)
  }

  async function deleteExercise(exercise) {
    if (DEFAULT_EXERCISES.some(d => d.name === exercise.name)) return
    if (!window.confirm(`Ștergi definitiv definiția „${exercise.name}”? Activitățile deja înregistrate își păstrează istoricul.`)) return
    const { error: deleteError } = await supabase.from('exercise_definitions').delete().eq('id', exercise.id).eq('user_id', session.user.id)
    if (deleteError) { setError(deleteError.message); return }
    setExercises(prev => prev.filter(item => item.id !== exercise.id))
    if (logForm.exercise_id === exercise.id) setLogForm(prev => ({ ...prev, exercise_id: '' }))
    setNotice('Definiția exercițiului a fost ștearsă; istoricul activităților a fost păstrat.')
  }

  async function archiveExercise(exercise) {
    if (DEFAULT_EXERCISES.some(d => d.name === exercise.name)) {
      setError('Exercițiile de bază nu se șterg. Le poți arhiva doar pe cele personalizate.'); return
    }
    if (!window.confirm(`Arhivezi exercițiul „${exercise.name}”? Istoricul va fi păstrat.`)) return
    const { error: updateError } = await supabase.from('exercise_definitions').update({ archived_at: new Date().toISOString() }).eq('id', exercise.id).eq('user_id', session.user.id)
    if (updateError) { setError(updateError.message); return }
    setExercises(prev => prev.filter(e => e.id !== exercise.id)); setNotice('Exercițiul a fost arhivat.')
  }

  async function saveActivity(e) {
    e.preventDefault(); setSaving(true); setError(''); setNotice('')
    try {
      if (!selectedExercise) throw new Error('Alege un exercițiu.')
      const quantities = logForm.values.map(v => Number(v)).filter(v => Number.isFinite(v) && v > 0)
      if (!quantities.length) throw new Error('Introdu cel puțin o valoare mai mare decât zero.')
      const total = quantities.reduce((sum, n) => sum + n, 0)
      const unit = selectedExercise.unit
      const distance = unit === 'km' ? total : (logForm.distance_km ? Number(logForm.distance_km) : null)
      const duration = logForm.duration_minutes !== '' ? Number(logForm.duration_minutes) : (unit === 'minutes' ? total : unit === 'seconds' ? total / 60 : null)
      const payload = {
        user_id: session.user.id, exercise_id: selectedExercise.id, title: selectedExercise.name,
        category: selectedExercise.category, activity_date: logForm.activity_date, unit,
        metric_value: total, duration_minutes: duration, distance_km: distance,
        elevation_gain_m: logForm.elevation_gain_m === '' ? null : Number(logForm.elevation_gain_m),
        notes: logForm.notes.trim() || null, source: 'manual',
      }
      const { data: activity, error: activityError } = await supabase.from('activity_logs').insert(payload).select().single()
      if (activityError) throw activityError
      const setsPayload = quantities.map((quantity, i) => ({ user_id: session.user.id, activity_id: activity.id, set_number: i + 1, quantity, unit }))
      const { error: setsError } = await supabase.from('activity_sets').insert(setsPayload)
      if (setsError) {
        await supabase.from('activity_logs').delete().eq('id', activity.id).eq('user_id', session.user.id)
        throw setsError
      }
      const { data: awardData, error: awardError } = await supabase.rpc('award_activity_xp', { p_activity_id: activity.id })
      if (awardError) throw new Error(`Activitatea a fost salvată, dar XP-ul nu a putut fi calculat: ${awardError.message}`)
      const award = Array.isArray(awardData) ? awardData[0] : awardData
      setNotice(`Activitate salvată · +${award?.awarded_xp || 0} XP`)
      setLogForm(prev => ({ ...prev, values: [''], duration_minutes: '', distance_km: '', elevation_gain_m: '', notes: '', activity_date: todayISO() }))
      await loadData()
    } catch (e2) { setError(e2.message || 'Nu am putut salva activitatea.') }
    finally { setSaving(false) }
  }

  async function deleteActivity(activity) {
    if (activity.legacy) { setError('Alergările istorice se gestionează în pagina Sport, pentru a păstra integrarea existentă.'); return }
    if (!window.confirm(`Ștergi activitatea „${activity.title}”? Statisticile se vor actualiza, însă XP-ul istoric deja acordat va rămâne în registru pentru trasabilitate.`)) return
    const { error: deleteError } = await supabase.from('activity_logs').delete().eq('id', activity.id).eq('user_id', session.user.id)
    if (deleteError) { setError(deleteError.message); return }
    setNotice('Activitatea a fost ștearsă. XP-ul istoric a fost păstrat.'); await loadData()
  }

  async function saveQuest(e) {
    e.preventDefault(); setSaving(true); setError(''); setNotice('')
    try {
      const { data, error: questError } = await supabase.from('quest_definitions').insert({
        user_id: session.user.id, name: questForm.name.trim(), description: questForm.description.trim() || null,
        metric_key: questForm.metric_key, target_value: Number(questForm.target_value), period: questForm.period,
        starts_on: questForm.starts_on, ends_on: questForm.ends_on || null, reward_xp: Number(questForm.reward_xp) || 0,
      }).select().single()
      if (questError) throw questError
      setQuests(prev => [data, ...prev]); setShowQuestForm(false); setQuestForm({ name: '', description: '', metric_key: 'distance_km', target_value: '40', period: 'weekly', reward_xp: '20', starts_on: todayISO(), ends_on: '' }); setNotice('Provocarea a fost creată.')
    } catch (e2) { setError(e2.message || 'Nu am putut salva provocarea.') }
    finally { setSaving(false) }
  }

  async function toggleQuest(quest) {
    const { error: updateError } = await supabase.from('quest_definitions').update({ is_active: false }).eq('id', quest.id).eq('user_id', session.user.id)
    if (updateError) { setError(updateError.message); return }
    setQuests(prev => prev.filter(q => q.id !== quest.id)); setNotice('Provocarea a fost arhivată.')
  }

  const tabs = [
    { id: 'overview', label: 'Prezentare', icon: Gauge },
    { id: 'log', label: 'Înregistrează', icon: Plus },
    { id: 'exercises', label: 'Exerciții', icon: Dumbbell },
    { id: 'quests', label: 'Quest-uri', icon: Target },
    { id: 'history', label: 'Istoric XP', icon: Zap },
  ]

  return <main className="page fade-in">
    <div className="max-w-5xl mx-auto space-y-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <button onClick={() => navigate('/sport')} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-brand-green mb-3"><ArrowLeft size={14}/> Înapoi la Sport</button>
          <div className="flex items-center gap-2"><div className="p-2 rounded-xl bg-brand-green/15 text-brand-green"><Shield size={22}/></div><div><p className="text-xs uppercase tracking-[.22em] text-brand-green font-semibold">PERSONAL FITNESS</p><h1 className="text-2xl font-black text-white">RPG TRACKER</h1></div></div>
          <p className="text-sm text-slate-400 mt-2">Progres real. Datele tale, regulile tale.</p>
        </div>
        <button onClick={loadData} className="btn-ghost !p-2.5" aria-label="Reîncarcă datele"><RefreshCw size={17}/></button>
      </header>

      {error && <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300 flex gap-2"><HelpCircle size={18} className="shrink-0"/><span>{error}</span><button className="ml-auto" onClick={() => setError('')}><X size={16}/></button></div>}
      {notice && <div className="rounded-xl border border-brand-green/30 bg-brand-green/10 p-3 text-sm text-brand-green flex items-center gap-2"><Check size={17}/>{notice}<button className="ml-auto" onClick={() => setNotice('')}><X size={16}/></button></div>}

      {xpError && <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">XP-ul automat (apă, nutriție, suplimente, antrenamente) nu este activ încă: {xpError}. Rulează migrarea <code>202611030001_xp_everything.sql</code> în Supabase → SQL Editor.</div>}

      <section className="card relative overflow-hidden !p-5">
        <div className="absolute -right-8 -top-12 w-40 h-40 rounded-full bg-brand-green/10 blur-3xl pointer-events-none"/>
        <div className="relative flex items-start justify-between gap-4">
          <div><div className="text-xs text-slate-400 uppercase tracking-widest">Nivel actual</div><div className="flex items-baseline gap-2 mt-1"><span className="text-5xl font-black text-white">{level.level}</span><span className="text-sm font-semibold text-brand-green">ATHLETE</span></div><div className="text-sm text-slate-400 mt-2">{fmt(profile?.total_xp)} XP total</div></div>
          <div className="w-16 h-16 rounded-2xl border border-brand-green/30 bg-brand-green/10 flex items-center justify-center"><Trophy size={30} className="text-brand-green"/></div>
        </div>
        <div className="mt-5"><div className="flex justify-between text-xs mb-2"><span className="text-slate-400">Progres către nivelul {level.level + 1}</span><span className="text-brand-green font-semibold">{fmt(level.progressXp)} / {fmt(level.nextLevelXp)} XP</span></div><div className="h-2.5 rounded-full bg-dark-600 overflow-hidden"><div className="h-full rounded-full bg-brand-green transition-all duration-700" style={{ width: `${level.progressPercent}%` }}/></div></div>
      </section>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Footprints} label="Alergare azi" value={`${fmt(todayKm, 2)} km`} detail={`${fmt(weekKm, 1)} km săptămâna aceasta`}/>
        <StatCard icon={Dumbbell} label="Repetări azi" value={fmt(todayReps)} detail={`${todayActivities.length} activități înregistrate`}/>
        <StatCard icon={Zap} label="XP câștigat azi" value={`+${fmt(todayXp)}`} detail={`Plafon antrenamente: ${TRAINING_DAILY_CAP} XP/zi`}/>
        <StatCard icon={CalendarDays} label="Săptămâna curentă" value={weekActivities.length} detail="activități înregistrate"/>
      </div>

      <div className="flex gap-1.5 overflow-x-auto bg-dark-800 border border-dark-600 rounded-xl p-1.5">
        {tabs.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setTab(id)} className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${tab === id ? 'bg-dark-600 text-brand-green' : 'text-slate-400 hover:text-white'}`}><Icon size={14}/>{label}</button>)}
      </div>

      {loading ? <div className="card py-12 text-center"><RefreshCw size={22} className="animate-spin mx-auto text-brand-green mb-3"/><p className="text-sm text-slate-400">Se încarcă datele tale...</p></div> : <>
        {tab === 'overview' && <div className="grid lg:grid-cols-[1.1fr_.9fr] gap-3">
          <section className="card"><div className="flex items-center justify-between mb-4"><div><h2 className="font-bold text-white">Atribute</h2><p className="text-xs text-slate-500 mt-1">XP acumulat pe categorie</p></div><Sparkles size={18} className="text-brand-green"/></div>
            {[['ENDURANCE', profile?.endurance_xp, Footprints], ['STRENGTH', profile?.strength_xp, Dumbbell], ['CONSISTENCY', profile?.consistency_xp, Flame], ['MOBILITY', profile?.mobility_xp, Waves], ['VITALITY', profile?.vitality_xp, HeartPulse]].map(([name, value, Icon]) => <div key={name} className="mb-4 last:mb-0"><div className="flex items-center justify-between mb-1.5"><span className="flex items-center gap-2 text-xs font-semibold text-slate-300"><Icon size={14} className="text-brand-green"/>{name}</span><span className="text-xs text-slate-400">{fmt(value)} XP</span></div><div className="h-1.5 rounded-full bg-dark-600 overflow-hidden"><div className="h-full bg-brand-green rounded-full" style={{ width: `${Math.min(100, Number(value || 0) / 5)}%` }}/></div></div>)}
          </section>
          <section className="card"><div className="flex items-center justify-between mb-4"><div><h2 className="font-bold text-white">Activitate recentă</h2><p className="text-xs text-slate-500 mt-1">Ultimele înregistrări</p></div><Activity size={18} className="text-brand-green"/></div>
            {activities.slice(0, 5).length ? <div className="space-y-3">{activities.slice(0, 5).map(a => { const Icon = iconFor(a.category); return <div key={a.id} className="flex items-center gap-3"><div className="p-2 rounded-lg bg-dark-700 text-brand-green"><Icon size={17}/></div><div className="min-w-0 flex-1"><div className="text-sm font-medium text-white truncate">{a.title}</div><div className="text-xs text-slate-500">{a.activity_date} · {categoryLabels[a.category] || a.category}</div></div><div className="text-sm font-semibold text-slate-200">{fmt(a.metric_value, 2)} <span className="text-xs text-slate-500">{unitLabels[a.unit] || a.unit}</span></div></div>})}</div> : <p className="text-sm text-slate-500 py-5 text-center">Nu ai activități înregistrate încă.</p>}
            <button onClick={() => setTab('log')} className="btn-primary w-full mt-4 flex items-center justify-center gap-2"><Plus size={16}/> Înregistrează activitate</button>
          </section>
          <section className="card lg:col-span-2"><div className="flex items-center justify-between mb-3"><div><h2 className="font-bold text-white">Quest-uri active</h2><p className="text-xs text-slate-500 mt-1">Progres calculat din activitățile înregistrate</p></div><button onClick={() => setTab('quests')} className="text-xs text-brand-green flex items-center gap-1">Vezi toate <ChevronRight size={14}/></button></div>
            {questProgress.length ? <div className="grid md:grid-cols-2 gap-3">{questProgress.slice(0, 4).map(q => <div key={q.id} className="rounded-xl border border-dark-600 bg-dark-700/50 p-3"><div className="flex items-start justify-between gap-2"><div className="font-semibold text-sm text-white">{q.name}</div><span className="text-xs text-brand-green">{q.reward_xp} XP</span></div><div className="text-xs text-slate-500 mt-1">{q.period === 'daily' ? 'Zilnic' : q.period === 'weekly' ? 'Săptămânal' : q.period === 'monthly' ? 'Lunar' : 'Personalizat'}</div><div className="h-1.5 bg-dark-600 rounded-full mt-3 overflow-hidden"><div className="h-full bg-brand-green rounded-full" style={{ width: `${q.percent}%` }}/></div><div className="flex justify-between text-xs text-slate-400 mt-2"><span>{fmt(q.current, 2)} / {fmt(q.target_value, 2)}</span><span>{Math.round(q.percent)}%</span></div></div>)}</div> : <div className="text-sm text-slate-500 py-4 text-center">Nu ai quest-uri. Creează o provocare personalizată.</div>}
          </section>
          <details className="card lg:col-span-2">
            <summary className="cursor-pointer flex items-center justify-between gap-2 font-bold text-white">
              <span className="flex items-center gap-2"><HelpCircle size={17} className="text-brand-green"/> Cum câștigi XP</span>
              <ChevronRight size={16} className="text-slate-500"/>
            </summary>
            <div className="grid sm:grid-cols-2 gap-x-8 gap-y-4 mt-4">
              {XP_RULES.map(group => <div key={group.group}>
                <div className="text-[11px] uppercase tracking-widest text-brand-green mb-1.5">{group.group}</div>
                <ul className="space-y-1">{group.rules.map(([what, xp]) => <li key={what} className="flex justify-between gap-3 text-xs text-slate-300"><span>{what}</span><span className="text-slate-400 shrink-0">{xp}</span></li>)}</ul>
              </div>)}
            </div>
            <p className="text-[11px] text-slate-500 mt-4">Fiecare premiu se acordă o singură dată. Antrenamentele (Sport, Strava și activitățile RPG) au un plafon comun de {TRAINING_DAILY_CAP} XP/zi; apa, nutriția și suplimentele nu au plafon.</p>
            <button onClick={backfillXp} disabled={saving} className="mt-3 text-xs font-semibold text-brand-green hover:text-white transition disabled:opacity-50">Adaugă XP și pentru ultimele 30 de zile →</button>
          </details>
        </div>}

        {tab === 'log' && <section className="card max-w-2xl mx-auto"><div className="flex items-center gap-2 mb-4"><div className="p-2 rounded-xl bg-brand-green/10 text-brand-green"><Plus size={19}/></div><div><h2 className="font-bold text-white">Înregistrează activitate</h2><p className="text-xs text-slate-500">Valorile multiple sunt salvate ca seturi separate.</p></div></div>
          <form onSubmit={saveActivity} className="space-y-4">
            <div><label className="label text-xs text-slate-400 block mb-1.5">Exercițiu</label><div className="flex gap-2"><select className="input flex-1" value={logForm.exercise_id} onChange={e => setLogForm(p => ({ ...p, exercise_id: e.target.value, values: [''] }))} required><option value="">Selectează exercițiul</option>{exercises.map(ex => <option key={ex.id} value={ex.id}>{ex.name} · {unitLabels[ex.unit] || ex.unit}</option>)}</select><button type="button" onClick={() => setShowExerciseForm(true)} className="btn-ghost !px-3" aria-label="Adaugă exercițiu"><Plus size={17}/></button></div></div>
            <div><label className="block text-xs text-slate-400 mb-1.5">Data activității</label><input className="input" type="date" value={logForm.activity_date} max={todayISO()} onChange={e => setLogForm(p => ({ ...p, activity_date: e.target.value }))} required/></div>
            <div><div className="flex items-center justify-between mb-1.5"><label className="block text-xs text-slate-400">Seturi · {unitLabels[selectedExercise?.unit] || 'valoare'}</label><button type="button" onClick={() => setLogForm(p => ({ ...p, values: [...p.values, ''] }))} className="text-xs text-brand-green inline-flex items-center gap-1"><Plus size={13}/> Adaugă set</button></div><div className="space-y-2">{logForm.values.map((value, index) => <div key={index} className="flex gap-2 items-center"><span className="text-xs text-slate-500 w-12">Set {index + 1}</span><input className="input" type="number" min="0" step="any" placeholder={selectedExercise?.unit === 'km' ? '5.0' : '20'} value={value} onChange={e => setLogForm(p => ({ ...p, values: p.values.map((v, i) => i === index ? e.target.value : v) }))} required/><button type="button" className="text-slate-500 hover:text-red-400 p-2 disabled:opacity-30" disabled={logForm.values.length === 1} onClick={() => setLogForm(p => ({ ...p, values: p.values.filter((_, i) => i !== index) }))}><X size={15}/></button></div>)}</div></div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3"><div><label className="block text-xs text-slate-400 mb-1.5">Durată (minute)</label><input className="input" type="number" min="0" step="any" placeholder="Opțional" value={logForm.duration_minutes} onChange={e => setLogForm(p => ({ ...p, duration_minutes: e.target.value }))}/></div><div><label className="block text-xs text-slate-400 mb-1.5">Distanță (km)</label><input className="input" type="number" min="0" step="any" placeholder="Opțional" value={logForm.distance_km} onChange={e => setLogForm(p => ({ ...p, distance_km: e.target.value }))}/></div><div><label className="block text-xs text-slate-400 mb-1.5">D+ (m)</label><input className="input" type="number" min="0" step="any" placeholder="Opțional" value={logForm.elevation_gain_m} onChange={e => setLogForm(p => ({ ...p, elevation_gain_m: e.target.value }))}/></div></div>
            <div><label className="block text-xs text-slate-400 mb-1.5">Notițe (opțional)</label><textarea className="input min-h-20 resize-y" value={logForm.notes} onChange={e => setLogForm(p => ({ ...p, notes: e.target.value }))} placeholder="Cum te-ai simțit, traseu, intensitate..."/></div>
            <button disabled={saving || !selectedExercise} className="btn-primary w-full py-3 inline-flex items-center justify-center gap-2 disabled:opacity-50"><Save size={17}/>{saving ? 'Se salvează...' : 'Salvează activitatea'}</button>
          </form>
        </section>}

        {tab === 'exercises' && <section className="card"><div className="flex items-center justify-between gap-3 mb-4"><div><h2 className="font-bold text-white">Catalog de exerciții</h2><p className="text-xs text-slate-500 mt-1">Poți crea exerciții cu unități personalizate.</p></div><button onClick={() => { setEditingExercise(null); setExerciseForm({ name: '', category: 'strength', unit: 'reps' }); setShowExerciseForm(true) }} className="btn-primary inline-flex items-center gap-1.5"><Plus size={15}/> Exercițiu nou</button></div><div className="grid md:grid-cols-2 gap-2">{exercises.map(ex => { const Icon = iconFor(ex.category); return <div key={ex.id} className="flex items-center gap-3 p-3 rounded-xl bg-dark-700/60 border border-dark-600"><div className="p-2 rounded-lg bg-brand-green/10 text-brand-green"><Icon size={18}/></div><div className="min-w-0 flex-1"><div className="text-sm font-semibold text-white">{ex.name}</div><div className="text-xs text-slate-500">{categoryLabels[ex.category]} · {unitLabels[ex.unit] || ex.unit}</div></div>{!DEFAULT_EXERCISES.some(d => d.name === ex.name) && <div className="flex items-center gap-2"><button onClick={() => openEditExercise(ex)} className="text-xs text-brand-green hover:underline px-1 py-1">Editează</button><button onClick={() => archiveExercise(ex)} className="text-xs text-slate-500 hover:text-amber-400 px-1 py-1">Arhivează</button><button onClick={() => deleteExercise(ex)} className="text-xs text-slate-500 hover:text-red-400 px-1 py-1">Șterge</button></div>}</div>})}</div>{!exercises.length && <p className="text-sm text-slate-500 text-center py-6">Nu există exerciții active.</p>}</section>}

        {tab === 'quests' && <section className="card"><div className="flex items-center justify-between gap-3 mb-4"><div><h2 className="font-bold text-white">Quest-uri și provocări</h2><p className="text-xs text-slate-500 mt-1">Progres automat pe baza activităților tale.</p></div><button onClick={() => setShowQuestForm(true)} className="btn-primary inline-flex items-center gap-1.5"><Plus size={15}/> Quest nou</button></div>{questProgress.length ? <div className="space-y-3">{questProgress.map(q => <div key={q.id} className="rounded-xl border border-dark-600 bg-dark-700/50 p-4"><div className="flex items-start gap-3"><div className="p-2 rounded-lg bg-brand-green/10 text-brand-green"><Target size={18}/></div><div className="flex-1 min-w-0"><div className="flex items-center justify-between gap-2"><h3 className="font-semibold text-white">{q.name}</h3><button onClick={() => toggleQuest(q)} className="text-xs text-slate-500 hover:text-red-400">Arhivează</button></div>{q.description && <p className="text-xs text-slate-400 mt-1">{q.description}</p>}<p className="text-xs text-slate-500 mt-1">{q.period === 'daily' ? 'Zilnic' : q.period === 'weekly' ? 'Săptămânal' : q.period === 'monthly' ? 'Lunar' : 'Personalizat'} · Recompensă informativă: {q.reward_xp} XP</p><div className="h-2 rounded-full bg-dark-600 mt-3 overflow-hidden"><div className="h-full bg-brand-green rounded-full transition-all" style={{ width: `${q.percent}%` }}/></div><div className="flex justify-between text-xs mt-2"><span className="text-slate-400">{fmt(q.current, 2)} / {fmt(q.target_value, 2)} {q.metric_key === 'distance_km' ? 'km' : q.metric_key === 'reps' ? 'repetări' : q.metric_key === 'duration_minutes' ? 'minute' : q.metric_key === 'elevation_gain_m' ? 'm D+' : 'activități'}</span><span className={q.complete ? 'text-brand-green font-semibold' : 'text-slate-400'}>{q.complete ? 'COMPLETAT' : `${Math.round(q.percent)}%`}</span></div></div></div></div>)}</div> : <div className="py-8 text-center text-sm text-slate-500">Nicio provocare activă. Creează primul quest.</div>}</section>}

        {tab === 'history' && <section className="card"><div className="flex items-center justify-between mb-4"><div><h2 className="font-bold text-white">Istoric XP</h2><p className="text-xs text-slate-500 mt-1">Apă, mese, suplimente și antrenamente se adaugă automat.</p></div><Zap size={18} className="text-brand-green"/></div>{ledger.length ? <div className="space-y-2">{ledger.map(item => <div key={item.id} className="flex items-center gap-3 p-3 rounded-xl bg-dark-700/60"><div className="p-2 rounded-lg bg-brand-green/10 text-brand-green"><Sparkles size={16}/></div><div className="flex-1 min-w-0"><div className="text-sm font-medium text-white truncate">{item.reason}</div><div className="text-xs text-slate-500">{new Date(item.awarded_at).toLocaleString('ro-RO')} · {ledgerLabels[item.category] || item.category}</div></div><div className="font-bold text-brand-green">+{item.xp_amount} XP</div></div>)}</div> : <div className="py-8 text-center text-sm text-slate-500">XP-ul va apărea aici după prima activitate.</div>}</section>}
      </>}

      {showExerciseForm && <div className="fixed inset-0 z-50 bg-black/70 p-4 flex items-center justify-center" onMouseDown={e => { if (e.target === e.currentTarget) { setShowExerciseForm(false); setEditingExercise(null) } }}><form onSubmit={saveExercise} className="card w-full max-w-md space-y-4"><div className="flex items-center justify-between"><h2 className="font-bold text-white">{editingExercise ? 'Editează exercițiul' : 'Exercițiu personalizat'}</h2><button type="button" onClick={() => { setShowExerciseForm(false); setEditingExercise(null) }} className="text-slate-400"><X size={18}/></button></div><div><label className="block text-xs text-slate-400 mb-1.5">Nume</label><input className="input" value={exerciseForm.name} onChange={e => setExerciseForm(p => ({ ...p, name: e.target.value }))} placeholder="Ex. Sărituri la cutie" maxLength={80} required/></div><div><label className="block text-xs text-slate-400 mb-1.5">Categorie</label><select className="input" value={exerciseForm.category} onChange={e => setExerciseForm(p => ({ ...p, category: e.target.value }))}>{Object.entries(categoryLabels).filter(([key]) => key !== 'recovery').map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div><div><label className="block text-xs text-slate-400 mb-1.5">Unitate de măsură</label><select className="input" value={exerciseForm.unit} onChange={e => setExerciseForm(p => ({ ...p, unit: e.target.value }))}>{Object.entries(unitLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div><button disabled={saving} className="btn-primary w-full py-3">{saving ? 'Se salvează...' : editingExercise ? 'Salvează modificările' : 'Creează exercițiul'}</button></form></div>}
      {showQuestForm && <div className="fixed inset-0 z-50 bg-black/70 p-4 flex items-center justify-center overflow-y-auto" onMouseDown={e => { if (e.target === e.currentTarget) setShowQuestForm(false) }}><form onSubmit={saveQuest} className="card w-full max-w-lg space-y-3 my-auto"><div className="flex items-center justify-between"><h2 className="font-bold text-white">Provocare personalizată</h2><button type="button" onClick={() => setShowQuestForm(false)} className="text-slate-400"><X size={18}/></button></div><div><label className="block text-xs text-slate-400 mb-1">Nume</label><input className="input" value={questForm.name} onChange={e => setQuestForm(p => ({ ...p, name: e.target.value }))} maxLength={100} placeholder="Ex. 40 km săptămâna aceasta" required/></div><div><label className="block text-xs text-slate-400 mb-1">Descriere (opțional)</label><input className="input" value={questForm.description} onChange={e => setQuestForm(p => ({ ...p, description: e.target.value }))} maxLength={240}/></div><div className="grid grid-cols-2 gap-3"><div><label className="block text-xs text-slate-400 mb-1">Metrică</label><select className="input" value={questForm.metric_key} onChange={e => setQuestForm(p => ({ ...p, metric_key: e.target.value }))}><option value="distance_km">Distanță (km)</option><option value="reps">Repetări</option><option value="duration_minutes">Durată (minute)</option><option value="elevation_gain_m">D+ (m)</option><option value="activity_count">Număr activități</option></select></div><div><label className="block text-xs text-slate-400 mb-1">Obiectiv</label><input className="input" type="number" min="0.1" step="any" value={questForm.target_value} onChange={e => setQuestForm(p => ({ ...p, target_value: e.target.value }))} required/></div><div><label className="block text-xs text-slate-400 mb-1">Perioadă</label><select className="input" value={questForm.period} onChange={e => setQuestForm(p => ({ ...p, period: e.target.value }))}><option value="daily">Zilnic</option><option value="weekly">Săptămânal</option><option value="monthly">Lunar</option><option value="custom">Personalizat</option></select></div><div><label className="block text-xs text-slate-400 mb-1">XP informativ</label><input className="input" type="number" min="0" max="100" value={questForm.reward_xp} onChange={e => setQuestForm(p => ({ ...p, reward_xp: e.target.value }))}/></div><div><label className="block text-xs text-slate-400 mb-1">Începe la</label><input className="input" type="date" value={questForm.starts_on} onChange={e => setQuestForm(p => ({ ...p, starts_on: e.target.value }))} required/></div><div><label className="block text-xs text-slate-400 mb-1">Se termină (opțional)</label><input className="input" type="date" min={questForm.starts_on} value={questForm.ends_on} onChange={e => setQuestForm(p => ({ ...p, ends_on: e.target.value }))}/></div></div><button disabled={saving} className="btn-primary w-full py-3">{saving ? 'Se salvează...' : 'Creează provocarea'}</button></form></div>}
      <p className="text-[11px] text-slate-600 text-center flex items-center justify-center gap-1"><HeartPulse size={12}/> XP-ul are limită zilnică și nu recompensează nelimitat repetarea aceleiași activități.</p>
    </div>
  </main>
}
