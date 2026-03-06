import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Modal from '../components/Modal'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid } from 'recharts'

function getToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

// ─── Strava Sync Hook ──────────────────────────────────

function useStravaSync(session, onSuccess) {
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState(null)
  const [stravaConnected, setStravaConnected] = useState(false)

  useEffect(() => { checkStrava() }, [])

  async function checkStrava() {
    const { data } = await supabase.from('strava_tokens').select('athlete_id').eq('user_id', session.user.id).single()
    setStravaConnected(!!data)
  }

  async function syncStrava(type) {
    setSyncing(true); setSyncMsg('Se sincronizează cu Strava...')
    try {
      const { data: tokenData } = await supabase.from('strava_tokens').select('*').eq('user_id', session.user.id).single()
      if (!tokenData) { setSyncMsg('❌ Strava nu e conectat. Conectează din Profil.'); setSyncing(false); return }

      const res = await fetch('/.netlify/functions/strava-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: tokenData.access_token, refresh_token: tokenData.refresh_token, expires_at: tokenData.expires_at }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      // Save new tokens if refreshed
      if (data.newTokenData) {
        await supabase.from('strava_tokens').update(data.newTokenData).eq('user_id', session.user.id)
      }

      let imported = 0
      if (type === 'running' && data.running?.length) {
        for (const run of data.running) {
          // Check if already exists by notes containing strava_id
          const { data: existing } = await supabase.from('running_logs')
            .select('id').eq('user_id', session.user.id).like('notes', `%${run.strava_id}%`).single()
          if (existing) continue
          await supabase.from('running_logs').insert({
            user_id: session.user.id, date: run.date,
            distance_km: run.distance_km, duration_min: run.duration_min,
            notes: `${run.notes} [strava:${run.strava_id}]`,
          })
          imported++
        }
        setSyncMsg(`✅ ${imported} alergări noi importate din Strava!`)
      } else if (type === 'strength' && data.workouts?.length) {
        for (const wo of data.workouts) {
          const { data: existing } = await supabase.from('workout_logs')
            .select('id').eq('user_id', session.user.id).like('notes', `%${wo.strava_id}%`).single()
          if (existing) continue
          await supabase.from('workout_logs').insert({
            user_id: session.user.id, date: wo.date, name: wo.name, type: 'strength',
            notes: `${wo.notes} [strava:${wo.strava_id}]`,
          })
          imported++
        }
        setSyncMsg(`✅ ${imported} antrenamente noi importate din Strava!`)
      } else {
        setSyncMsg('✅ Nicio activitate nouă de importat.')
      }
      onSuccess()
    } catch (err) {
      setSyncMsg(`❌ ${err.message}`)
    }
    setSyncing(false)
    setTimeout(() => setSyncMsg(null), 4000)
  }

  return { syncing, syncMsg, stravaConnected, syncStrava }
}

// ─── Alergare ─────────────────────────────────────────

function AlergareTab({ session }) {
  const today = getToday()
  const [runs, setRuns] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ date: today, distance_km: '', duration_min: '', notes: '', start_time: '' })
  const [loading, setLoading] = useState(true)
  const { syncing, syncMsg, stravaConnected, syncStrava } = useStravaSync(session, loadRuns)

  useEffect(() => { loadRuns() }, [])

  async function loadRuns() {
    setLoading(true)
    const { data } = await supabase.from('running_logs').select('*')
      .eq('user_id', session.user.id).order('date', { ascending: false }).limit(30)
    setRuns(data || [])
    setLoading(false)
  }

  async function saveRun() {
    if (!form.distance_km || !form.duration_min) return
    await supabase.from('running_logs').insert({
      user_id: session.user.id,
      date: form.date,
      distance_km: parseFloat(form.distance_km),
      duration_min: parseFloat(form.duration_min),
      notes: form.notes,
      start_time: form.start_time || null,
    })
    setShowModal(false)
    setForm({ date: today, distance_km: '', duration_min: '', notes: '', start_time: '' })
    loadRuns()
  }

  async function deleteRun(id) {
    if (confirm('Ștergi alergarea?')) {
      await supabase.from('running_logs').delete().eq('id', id)
      loadRuns()
    }
  }

  function formatPace(km, min) {
    if (!km || !min) return '—'
    const pace = min / km
    const m = Math.floor(pace)
    const s = Math.round((pace - m) * 60)
    return `${m}:${s.toString().padStart(2, '0')} min/km`
  }

  function formatDuration(min) {
    const h = Math.floor(min / 60)
    const m = min % 60
    return h > 0 ? `${h}h ${m}min` : `${m}min`
  }

  const totalKm = runs.reduce((s, r) => s + r.distance_km, 0)
  const avgDist = runs.length ? totalKm / runs.length : 0

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button onClick={() => setShowModal(true)} className="btn-primary flex-1 py-3">🏃 Adaugă alergare</button>
        {stravaConnected && (
          <button onClick={() => syncStrava('running')} disabled={syncing}
            className="flex items-center gap-1.5 bg-orange-500/20 text-orange-400 border border-orange-500/30 px-3 py-3 rounded-xl hover:bg-orange-500/30 transition-all text-sm font-medium disabled:opacity-50">
            {syncing ? <span className="w-4 h-4 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" /> : '🟠'}
            Strava
          </button>
        )}
      </div>
      {syncMsg && (
        <div className={`rounded-xl px-3 py-2.5 text-sm ${syncMsg.startsWith('✅') ? 'bg-brand-green/20 text-brand-green' : 'bg-red-500/20 text-red-400'}`}>
          {syncMsg}
        </div>
      )}

      {runs.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Total km', value: totalKm.toFixed(1), unit: 'km', color: 'text-brand-blue' },
            { label: 'Alergări', value: runs.length, unit: 'total', color: 'text-brand-green' },
            { label: 'Medie', value: avgDist.toFixed(1), unit: 'km/alerg.', color: 'text-brand-orange' },
          ].map(s => (
            <div key={s.label} className="card text-center">
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-slate-500">{s.unit}</p>
            </div>
          ))}
        </div>
      )}

      {loading ? <p className="text-center text-slate-500 text-sm py-4">Se încarcă...</p> :
        runs.length === 0 ? (
          <div className="card text-center py-8">
            <p className="text-4xl mb-2">🏃</p>
            <p className="text-slate-400 text-sm">Nicio alergare înregistrată încă.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {runs.map(r => (
              <div key={r.id} className="card">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-brand-blue font-bold text-lg">{r.distance_km} km</span>
                      <span className="text-xs text-slate-400 bg-dark-700 px-2 py-0.5 rounded-full">{formatPace(r.distance_km, r.duration_min)}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                      <span>⏱ {formatDuration(r.duration_min)}</span>
                      <span>📅 {new Date(r.date).toLocaleDateString('ro-RO')}</span>
                    </div>
                    {r.notes && <p className="text-xs text-slate-500 mt-1 italic">"{r.notes}"</p>}
                  </div>
                  <button onClick={() => deleteRun(r.id)} className="text-slate-600 hover:text-red-400 transition-colors text-lg">×</button>
                </div>
              </div>
            ))}
          </div>
        )
      }

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Adaugă alergare">
        <div className="space-y-3">
          {[
            { key: 'date', label: 'Data', type: 'date' },
            { key: 'start_time', label: 'Ora start (opțional)', type: 'time' },
            { key: 'distance_km', label: 'Distanță (km)', type: 'number', placeholder: '5.0' },
            { key: 'duration_min', label: 'Durată (minute)', type: 'number', placeholder: '30' },
            { key: 'notes', label: 'Notițe (opțional)', type: 'text', placeholder: 'ex: Interval training' },
          ].map(f => (
            <div key={f.key}>
              <label className="text-xs text-slate-400 block mb-1">{f.label}</label>
              <input className="input" type={f.type} placeholder={f.placeholder}
                value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} />
            </div>
          ))}
          <button onClick={saveRun} className="btn-primary w-full py-3">Salvează alergarea</button>
        </div>
      </Modal>
    </div>
  )
}

// ─── Forță ─────────────────────────────────────────

function FortaTab({ session, isAdmin }) {
  const today = getToday()
  const [workouts, setWorkouts] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ date: today, name: '', notes: '', start_time: '' })
  const [exercises, setExercises] = useState([{ exercise_name: '', sets: '3', reps: '10', weight_kg: '0' }])
  const [loading, setLoading] = useState(true)
  const [students, setStudents] = useState([])
  const { syncing, syncMsg, stravaConnected, syncStrava } = useStravaSync(session, loadWorkouts)

  useEffect(() => { loadWorkouts() }, [])

  async function loadWorkouts() {
    setLoading(true)
    const { data } = await supabase.from('workout_logs').select(`
      id, date, name, notes, type, user_id,
      workout_exercises(id, exercise_name, sets, reps, weight_kg)
    `).eq('user_id', session.user.id).eq('type', 'strength')
      .order('date', { ascending: false }).limit(20)

    let all = data || []

    if (isAdmin) {
      const { data: studentWo } = await supabase.from('workout_logs').select(`
        id, date, name, notes, type, user_id,
        workout_exercises(id, exercise_name, sets, reps, weight_kg)
      `).neq('user_id', session.user.id).eq('type', 'strength')
        .like('notes', `%[admin:${session.user.id}]%`)
        .order('date', { ascending: false }).limit(30)
      if (studentWo?.length) {
        const ids = [...new Set(studentWo.map(w => w.user_id))]
        const { data: profiles } = await supabase.from('user_profiles').select('user_id, full_name, email').in('user_id', ids)
        setStudents(profiles || [])
        all = [...all, ...studentWo].sort((a, b) => b.date.localeCompare(a.date))
      }
    }

    setWorkouts(all)
    setLoading(false)
  }

  function addExercise() {
    setExercises(prev => [...prev, { exercise_name: '', sets: '3', reps: '10', weight_kg: '0' }])
  }

  function removeExercise(i) {
    setExercises(prev => prev.filter((_, idx) => idx !== i))
  }

  function updateExercise(i, key, val) {
    setExercises(prev => prev.map((e, idx) => idx === i ? { ...e, [key]: val } : e))
  }

  async function saveWorkout() {
    if (!form.name) return
    const { data: wl } = await supabase.from('workout_logs').insert({
      user_id: session.user.id, date: form.date, name: form.name, type: 'strength', notes: form.notes, start_time: form.start_time || null
    }).select().single()

    const validExercises = exercises.filter(e => e.exercise_name.trim())
    if (validExercises.length > 0) {
      await supabase.from('workout_exercises').insert(
        validExercises.map(e => ({
          workout_log_id: wl.id,
          exercise_name: e.exercise_name,
          sets: parseInt(e.sets),
          reps: parseInt(e.reps),
          weight_kg: parseFloat(e.weight_kg) || 0,
        }))
      )
    }

    setShowModal(false)
    setForm({ date: today, name: '', notes: '' })
    setExercises([{ exercise_name: '', sets: '3', reps: '10', weight_kg: '0' }])
    loadWorkouts()
  }

  async function deleteWorkout(id) {
    const wo = workouts.find(w => w.id === id)
    // Elevul nu poate sterge antrenamentele create de admin
    if (wo?.user_id === session.user.id && wo?.notes?.includes('[admin:')) {
      alert('Acest antrenament a fost creat de antrenor și nu poate fi șters.'); return
    }
    if (confirm('Ștergi antrenamentul?')) {
      await supabase.from('workout_logs').delete().eq('id', id)
      loadWorkouts()
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button onClick={() => setShowModal(true)} className="btn-primary flex-1 py-3">🏋️ Adaugă antrenament</button>
        {stravaConnected && (
          <button onClick={() => syncStrava('strength')} disabled={syncing}
            className="flex items-center gap-1.5 bg-orange-500/20 text-orange-400 border border-orange-500/30 px-3 py-3 rounded-xl hover:bg-orange-500/30 transition-all text-sm font-medium disabled:opacity-50">
            {syncing ? <span className="w-4 h-4 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" /> : '🟠'}
            Strava
          </button>
        )}
      </div>
      {syncMsg && (
        <div className={`rounded-xl px-3 py-2.5 text-sm ${syncMsg.startsWith('✅') ? 'bg-brand-green/20 text-brand-green' : 'bg-red-500/20 text-red-400'}`}>
          {syncMsg}
        </div>
      )}

      {loading ? <p className="text-center text-slate-500 text-sm py-4">Se încarcă...</p> :
        workouts.length === 0 ? (
          <div className="card text-center py-8">
            <p className="text-4xl mb-2">🏋️</p>
            <p className="text-slate-400 text-sm">Niciun antrenament de forță înregistrat.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {workouts.map(w => {
              const studentProfile = students.find(s => s.user_id === w.user_id)
              const isAdminAssigned = w.notes?.includes('[admin:')
              const canDelete = !isAdminAssigned || isAdmin
              const cleanName = w.name?.replace(/\s*\[admin:[^\]]+\]/g, '')
              return (
              <div key={w.id} className="card">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-white">{cleanName}</p>
                      {isAdminAssigned && <span className="text-xs bg-brand-blue/20 text-brand-blue px-1.5 py-0.5 rounded-md">👤 Admin</span>}
                    </div>
                    <p className="text-xs text-slate-400">📅 {new Date(w.date).toLocaleDateString('ro-RO')} · {w.workout_exercises?.length || 0} exerciții</p>
                    {studentProfile && <p className="text-xs text-brand-blue mt-0.5">🎓 {studentProfile.full_name || studentProfile.email}</p>}
                  </div>
                  {canDelete
                    ? <button onClick={() => deleteWorkout(w.id)} className="text-slate-600 hover:text-red-400 transition-colors text-lg">×</button>
                    : <span className="text-xs text-slate-600">🔒</span>
                  }
                </div>
                {w.workout_exercises?.length > 0 && (
                  <div className="space-y-1">
                    {w.workout_exercises.map(e => (
                      <div key={e.id} className="flex items-center justify-between bg-dark-700 rounded-xl px-3 py-2 text-sm">
                        <span className="text-slate-200">{e.exercise_name}</span>
                        <span className="text-xs text-slate-400">{e.sets}×{e.reps} {e.weight_kg > 0 ? `· ${e.weight_kg}kg` : ''}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              )
            })}
          </div>
        )
      }

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Antrenament de forță">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Nume antrenament</label>
              <input className="input" placeholder="ex: Push Day A" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Data</label>
              <input className="input" type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-400 block mb-1">Ora start (opțional)</label>
            <input className="input" type="time" value={form.start_time} onChange={e => setForm(p => ({ ...p, start_time: e.target.value }))} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-white">Exerciții</p>
              <button onClick={addExercise} className="text-xs bg-brand-orange/20 text-brand-orange px-2.5 py-1 rounded-lg hover:bg-brand-orange/30 transition-colors">+ Adaugă</button>
            </div>
            <div className="space-y-2">
              {exercises.map((ex, i) => (
                <div key={i} className="bg-dark-700 rounded-xl p-3 space-y-2">
                  <div className="flex gap-2 items-center">
                    <input className="input flex-1" placeholder="Exercițiu (ex: Bench Press)"
                      value={ex.exercise_name} onChange={e => updateExercise(i, 'exercise_name', e.target.value)} />
                    {exercises.length > 1 && (
                      <button onClick={() => removeExercise(i)} className="text-slate-600 hover:text-red-400 transition-colors text-lg shrink-0">×</button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { key: 'sets', label: 'Seturi' },
                      { key: 'reps', label: 'Repetări' },
                      { key: 'weight_kg', label: 'Greutate (kg)' },
                    ].map(f => (
                      <div key={f.key}>
                        <label className="text-xs text-slate-500 block mb-0.5">{f.label}</label>
                        <input className="input" type="number"
                          value={ex[f.key]} onChange={e => updateExercise(i, f.key, e.target.value)} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-400 block mb-1">Notițe</label>
            <input className="input" placeholder="Opțional..." value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
          </div>

          <button onClick={saveWorkout} className="btn-primary w-full py-3">Salvează antrenamentul</button>
        </div>
      </Modal>
    </div>
  )
}

// ─── Calendar ────────────────────────────────────────

function CalendarTab({ session, isAdmin }) {
  const today = getToday()
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [monthData, setMonthData] = useState({})
  const [scheduledByDate, setScheduledByDate] = useState({})
  const [selectedDate, setSelectedDate] = useState(null)
  const [selectedIsFuture, setSelectedIsFuture] = useState(false)
  const [dayDetail, setDayDetail] = useState(null)
  const [futurePlan, setFuturePlan] = useState([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [addDate, setAddDate] = useState(today)
  const [addForm, setAddForm] = useState({ name: '', type: 'strength', distance_km: '', student_id: '' })
  const [students, setStudents] = useState([]) // elevi list for admin

  useEffect(() => { loadMonthData() }, [currentMonth])
  useEffect(() => { if (isAdmin) loadStudents() }, [isAdmin])

  async function loadStudents() {
    const { data } = await supabase.from('user_profiles').select('user_id, full_name, email').eq('account_type', 'elev')
    setStudents(data || [])
  }

  async function loadMonthData() {
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    const start = `${year}-${String(month+1).padStart(2,'0')}-01`
    const end = new Date(year, month+1, 0).toISOString().split('T')[0]
    const uid = session.user.id

    const [
      { data: workouts }, { data: runs }, { data: mealLogs },
      { data: supLogs }, { data: targets }, { data: allSups },
      { data: allSchedules }, { data: exceptions },
    ] = await Promise.all([
      supabase.from('workout_logs').select('date, name, type').eq('user_id', uid).gte('date', start).lte('date', end),
      supabase.from('running_logs').select('date, distance_km').eq('user_id', uid).gte('date', start).lte('date', end),
      supabase.from('meal_logs').select('date, meal_items(quantity_g, foods(calories))').eq('user_id', uid).gte('date', start).lte('date', end),
      supabase.from('supplement_logs').select('date, taken').eq('user_id', uid).gte('date', start).lte('date', end),
      supabase.from('user_targets').select('calories').eq('user_id', uid).single(),
      supabase.from('daily_supplements').select('id').eq('user_id', uid),
      supabase.from('workout_schedules').select('*').eq('user_id', uid),
      supabase.from('workout_schedule_exceptions').select('schedule_id, exception_date').eq('user_id', uid),
    ])

    const calTarget = targets?.calories || 2000
    const supTotal = (allSups || []).length
    const data = {}
    const ensure = d => { if (!data[d]) data[d] = { runs: [], workouts: [], calories: 0, supTaken: 0, supTotal, calTarget } }

    ;(runs || []).forEach(r => { ensure(r.date); data[r.date].runs.push(r) })
    ;(workouts || []).forEach(w => { ensure(w.date); data[w.date].workouts.push(w) })
    ;(mealLogs || []).forEach(ml => {
      ensure(ml.date)
      ;(ml.meal_items || []).forEach(item => {
        data[ml.date].calories += ((item.foods?.calories || 0) * (item.quantity_g || 0)) / 100
      })
    })
    const supByDate = {}
    ;(supLogs || []).forEach(sl => { if (!supByDate[sl.date]) supByDate[sl.date] = 0; if (sl.taken) supByDate[sl.date]++ })
    Object.entries(supByDate).forEach(([date, count]) => { ensure(date); data[date].supTaken = count })

    // Build scheduled map for future days in this month
    const exSet = new Set((exceptions || []).map(e => `${e.schedule_id}_${e.exception_date}`))
    const schedMap = {}
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
      if (dateStr <= today) continue
      const d = new Date(dateStr + 'T12:00:00')
      const wd = d.getDay() === 0 ? 6 : d.getDay() - 1
      const planned = (allSchedules || []).filter(s => {
        if (exSet.has(`${s.id}_${dateStr}`)) return false
        if (s.recurrence === 'once') return s.scheduled_date === dateStr
        if (s.recurrence === 'weekly') return (s.weekdays || []).includes(wd)
        return false
      })
      if (planned.length) schedMap[dateStr] = planned
    }
    setScheduledByDate(schedMap)
    setMonthData(data)
  }

  async function loadDayDetail(dateStr) {
    setDetailLoading(true)
    const uid = session.user.id
    const [
      { data: mealLogs }, { data: runs }, { data: workouts },
      { data: supLogs }, { data: allSups }, { data: waterLogs },
      { data: targets },
    ] = await Promise.all([
      supabase.from('meal_logs').select('meal_type, meal_items(quantity_g, foods(name, calories, protein, carbs, fat))').eq('user_id', uid).eq('date', dateStr),
      supabase.from('running_logs').select('*').eq('user_id', uid).eq('date', dateStr),
      supabase.from('workout_logs').select('*, workout_exercises(*)').eq('user_id', uid).eq('date', dateStr),
      supabase.from('supplement_logs').select('taken, supplement_id').eq('user_id', uid).eq('date', dateStr),
      supabase.from('daily_supplements').select('*').eq('user_id', uid),
      supabase.from('water_logs').select('amount_ml').eq('user_id', uid).eq('date', dateStr),
      supabase.from('user_targets').select('*').eq('user_id', uid).single(),
    ])
    const supMap = {}
    ;(supLogs || []).forEach(sl => { supMap[sl.supplement_id] = sl.taken })
    const allItems = (mealLogs || []).flatMap(ml => ml.meal_items || [])
    const totalCals = allItems.reduce((a, i) => a + ((i.foods?.calories || 0) * (i.quantity_g || 0) / 100), 0)
    const totalProt = allItems.reduce((a, i) => a + ((i.foods?.protein || 0) * (i.quantity_g || 0) / 100), 0)
    const totalCarbs = allItems.reduce((a, i) => a + ((i.foods?.carbs || 0) * (i.quantity_g || 0) / 100), 0)
    const totalFat = allItems.reduce((a, i) => a + ((i.foods?.fat || 0) * (i.quantity_g || 0) / 100), 0)
    const totalWater = (waterLogs || []).reduce((s, w) => s + w.amount_ml, 0)
    setDayDetail({
      mealLogs: mealLogs || [], runs: runs || [], workouts: workouts || [],
      supplements: (allSups || []).map(s => ({ ...s, taken: supMap[s.id] === true })),
      totalCals: Math.round(totalCals), totalProt: Math.round(totalProt),
      totalCarbs: Math.round(totalCarbs), totalFat: Math.round(totalFat),
      totalWater, targets,
    })
    setDetailLoading(false)
  }

  async function loadFuturePlan(dateStr) {
    setDetailLoading(true)
    const uid = session.user.id
    const d = new Date(dateStr + 'T12:00:00')
    const wd = d.getDay() === 0 ? 6 : d.getDay() - 1
    const { data: allSchedules } = await supabase.from('workout_schedules').select('*').eq('user_id', uid)
    const { data: exceptions } = await supabase.from('workout_schedule_exceptions').select('schedule_id, exception_date').eq('user_id', uid)
    const exSet = new Set((exceptions || []).map(e => `${e.schedule_id}_${e.exception_date}`))
    const planned = (allSchedules || []).filter(s => {
      if (exSet.has(`${s.id}_${dateStr}`)) return false
      if (s.recurrence === 'once') return s.scheduled_date === dateStr
      if (s.recurrence === 'weekly') return (s.weekdays || []).includes(wd)
      return false
    })
    setFuturePlan(planned)
    setDetailLoading(false)
  }

  function openDay(dateStr, isFuture) {
    setSelectedDate(dateStr)
    setSelectedIsFuture(isFuture)
    setDayDetail(null)
    setFuturePlan([])
    if (isFuture) loadFuturePlan(dateStr)
    else loadDayDetail(dateStr)
  }

  async function saveAdd() {
    if (!addForm.name) return
    const targetUser = (isAdmin && addForm.student_id) ? addForm.student_id : session.user.id
    const insertData = {
      user_id: targetUser,
      date: addDate,
      name: addForm.name,
      type: addForm.type,
      notes: isAdmin && addForm.student_id ? `[admin:${session.user.id}]` : null,
    }
    if (addForm.type === 'running' && addForm.distance_km) {
      // For running with km, use running_logs
      await supabase.from('running_logs').insert({
        user_id: targetUser,
        date: addDate,
        distance_km: parseFloat(addForm.distance_km),
        duration_min: 0,
        notes: addForm.name + (isAdmin && addForm.student_id ? ` [admin:${session.user.id}]` : ''),
      })
    } else {
      await supabase.from('workout_logs').insert(insertData)
    }
    setShowAddModal(false)
    setAddForm({ name: '', type: 'strength', distance_km: '', student_id: '' })
    loadMonthData()
    if (selectedDate === addDate && selectedIsFuture) loadFuturePlan(addDate)
  }

  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth()
  const firstDay = (new Date(year, month, 1).getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const MONTHS = ['Ian','Feb','Mar','Apr','Mai','Iun','Iul','Aug','Sep','Oct','Nov','Dec']
  const DAYS = ['Lu','Ma','Mi','Jo','Vi','Sâ','Du']
  const MEAL_LABELS = { breakfast: '🌅 Mic dejun', lunch: '☀️ Prânz', dinner: '🌙 Cină', snack: '🍎 Gustare' }
  const TYPE_ICON_CAL = { running: '🏃', strength: '🏋️', cycling: '🚴', other: '⚡' }

  function fmtPace(km, min) {
    if (!km || !min) return '—'
    const p = min / km; const m = Math.floor(p); const s = Math.round((p - m) * 60)
    return `${m}:${s.toString().padStart(2,'0')} /km`
  }
  function fmtDur(min) {
    const h = Math.floor(min / 60); const m = Math.round(min % 60)
    return h > 0 ? `${h}h ${m}min` : `${m}min`
  }

  const dayTitle = selectedDate ? new Date(selectedDate + 'T12:00:00').toLocaleDateString('ro-RO', { weekday: 'long', day: 'numeric', month: 'long' }) : ''

  return (
    <div className="space-y-3">
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => setCurrentMonth(new Date(year, month-1, 1))} className="text-slate-400 hover:text-white w-8 h-8 rounded-lg hover:bg-dark-700 text-xl">‹</button>
          <h2 className="text-base font-semibold text-white">{MONTHS[month]} {year}</h2>
          <button onClick={() => setCurrentMonth(new Date(year, month+1, 1))} className="text-slate-400 hover:text-white w-8 h-8 rounded-lg hover:bg-dark-700 text-xl">›</button>
        </div>

        <div className="grid grid-cols-7 mb-1">
          {DAYS.map(d => <div key={d} className="text-center text-xs text-slate-500 py-1">{d}</div>)}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1
            const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
            const d = monthData[dateStr]
            const isToday = dateStr === today
            const isFuture = dateStr > today
            const hasRun = d?.runs.length > 0
            const hasWorkout = d?.workouts.length > 0
            const calOk = d && d.calories >= d.calTarget * 0.9
            const supOk = d && d.supTotal > 0 && d.supTaken >= d.supTotal
            const hasFood = d && d.calories > 0
            const hasPlanned = !!scheduledByDate[dateStr]

            return (
              <button key={day}
                onClick={() => openDay(dateStr, isFuture)}
                className={`aspect-square flex flex-col items-center justify-between py-1 px-0.5 rounded-xl text-xs transition-all
                  ${isToday ? 'bg-brand-green/20 border border-brand-green/40 text-brand-green font-bold' : isFuture ? 'text-slate-500 hover:bg-dark-700 hover:text-slate-300' : 'text-slate-300 hover:bg-dark-600'}
                  ${selectedDate === dateStr ? 'ring-2 ring-white/40' : ''}`}>
                <span>{day}</span>
                <div className="flex gap-0.5 flex-wrap justify-center pb-0.5">
                  {hasRun     && <div className="w-1.5 h-1.5 rounded-full bg-brand-blue" />}
                  {hasWorkout && <div className="w-1.5 h-1.5 rounded-full bg-brand-orange" />}
                  {hasFood    && <div className={`w-1.5 h-1.5 rounded-full ${calOk ? 'bg-brand-green' : 'bg-red-400'}`} />}
                  {d?.supTotal > 0 && <div className={`w-1.5 h-1.5 rounded-full ${supOk ? 'bg-brand-purple' : 'bg-slate-600'}`} />}
                  {hasPlanned && <div className="w-1.5 h-1.5 rounded-full bg-brand-blue/60 border border-brand-blue" />}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="card py-2.5">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {[
            { color: 'bg-brand-blue',   label: '🏃 Alergare' },
            { color: 'bg-brand-orange', label: '🏋️ Forță' },
            { color: 'bg-brand-green',  label: '✅ Calorii atinse' },
            { color: 'bg-red-400',      label: '❌ Calorii neatinse' },
            { color: 'bg-brand-purple', label: '💊 Supli. luate' },
            { color: 'border border-brand-blue bg-brand-blue/30', label: '📋 Planificat' },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full shrink-0 ${l.color}`} />
              <span className="text-xs text-slate-400">{l.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Day detail modal — PAST/TODAY */}
      <Modal open={!!selectedDate && !selectedIsFuture} onClose={() => { setSelectedDate(null); setDayDetail(null) }}
        title={`📅 ${dayTitle}`}>
        {detailLoading ? (
          <div className="flex items-center justify-center py-8 gap-2">
            <div className="w-5 h-5 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
            <span className="text-slate-400 text-sm">Se încarcă...</span>
          </div>
        ) : dayDetail ? (
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            {/* Nutrition */}
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">🥗 Nutriție</p>
              <div className="grid grid-cols-4 gap-1.5 mb-2">
                {[
                  { label: 'kcal', value: dayDetail.totalCals, target: dayDetail.targets?.calories, color: 'text-brand-green' },
                  { label: 'prot.', value: dayDetail.totalProt, target: dayDetail.targets?.protein_g, color: 'text-brand-blue' },
                  { label: 'carb.', value: dayDetail.totalCarbs, target: dayDetail.targets?.carbs_g, color: 'text-brand-orange' },
                  { label: 'grăs.', value: dayDetail.totalFat, target: dayDetail.targets?.fat_g, color: 'text-brand-purple' },
                ].map(item => (
                  <div key={item.label} className="bg-dark-700 rounded-xl p-2 text-center">
                    <p className={`text-sm font-bold ${item.color}`}>{item.value}</p>
                    {item.target && <p className="text-xs text-slate-600">/ {item.target}</p>}
                    <p className="text-xs text-slate-500">{item.label}</p>
                  </div>
                ))}
              </div>
              {dayDetail.totalWater > 0 && (
                <div className="bg-dark-700 rounded-xl px-3 py-2 flex justify-between text-xs">
                  <span className="text-slate-400">💧 Apă</span>
                  <span className="text-brand-blue font-medium">{dayDetail.totalWater} ml</span>
                </div>
              )}
              {dayDetail.mealLogs.length > 0 && (
                <div className="space-y-1.5 mt-2">
                  {dayDetail.mealLogs.map((ml, i) => {
                    const mCals = (ml.meal_items || []).reduce((a, it) => a + ((it.foods?.calories || 0) * (it.quantity_g || 0) / 100), 0)
                    return (
                      <div key={i} className="bg-dark-700 rounded-xl overflow-hidden">
                        <div className="flex justify-between items-center px-3 py-2 bg-dark-600">
                          <span className="text-xs font-medium text-slate-300">{MEAL_LABELS[ml.meal_type] || ml.meal_type}</span>
                          <span className="text-xs text-slate-400">{Math.round(mCals)} kcal</span>
                        </div>
                        {(ml.meal_items || []).map((item, j) => (
                          <div key={j} className="flex justify-between px-3 py-1.5 text-xs border-t border-dark-700">
                            <span className="text-slate-300">{item.foods?.name}</span>
                            <span className="text-slate-500">{item.quantity_g}g</span>
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            {/* Sport */}
            {(dayDetail.runs.length > 0 || dayDetail.workouts.length > 0) && (
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">💪 Activitate</p>
                <div className="space-y-2">
                  {dayDetail.runs.map((r, i) => (
                    <div key={i} className="bg-dark-700 rounded-xl px-3 py-2.5">
                      <div className="flex items-center gap-2"><span>🏃</span><span className="text-sm font-medium text-white">{r.distance_km} km</span><span className="text-xs text-slate-400 bg-dark-600 px-2 py-0.5 rounded-full">{fmtPace(r.distance_km, r.duration_min)}</span></div>
                      <p className="text-xs text-slate-500 ml-7">⏱ {fmtDur(r.duration_min)}</p>
                    </div>
                  ))}
                  {dayDetail.workouts.map((w, i) => (
                    <div key={i} className="bg-dark-700 rounded-xl px-3 py-2.5">
                      <div className="flex items-center gap-2"><span>{TYPE_ICON_CAL[w.type] || '⚡'}</span><span className="text-sm font-medium text-white">{w.name}</span></div>
                      {w.workout_exercises?.length > 0 && (
                        <div className="ml-7 mt-1 space-y-0.5">
                          {w.workout_exercises.map((ex, j) => (
                            <p key={j} className="text-xs text-slate-400">{ex.exercise_name} — {ex.sets}×{ex.reps}{ex.weight_kg > 0 ? ` @ ${ex.weight_kg}kg` : ''}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Supplements */}
            {dayDetail.supplements.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">💊 Suplimente</p>
                <div className="space-y-1.5">
                  {dayDetail.supplements.map((s, i) => (
                    <div key={i} className={`flex items-center gap-3 px-3 py-2 rounded-xl ${s.taken ? 'bg-brand-green/10 border border-brand-green/20' : 'bg-dark-700'}`}>
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${s.taken ? 'bg-brand-green border-brand-green' : 'border-slate-600'}`}>
                        {s.taken && <span className="text-dark-900 text-xs font-bold">✓</span>}
                      </div>
                      <span className={`text-sm ${s.taken ? 'text-brand-green' : 'text-slate-400 line-through'}`}>{s.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <button onClick={() => { setSelectedDate(null); setDayDetail(null); setAddDate(selectedDate); setAddForm({ name: '', type: 'strength' }); setShowAddModal(true) }}
              className="btn-ghost w-full py-2.5 text-sm">+ Adaugă antrenament în această zi</button>
          </div>
        ) : null}
      </Modal>

      {/* Day detail modal — FUTURE */}
      <Modal open={!!selectedDate && selectedIsFuture} onClose={() => { setSelectedDate(null); setFuturePlan([]) }}
        title={`📅 ${dayTitle}`}>
        {detailLoading ? (
          <div className="flex items-center justify-center py-8 gap-2">
            <div className="w-5 h-5 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
            <span className="text-slate-400 text-sm">Se încarcă...</span>
          </div>
        ) : (
          <div className="space-y-3">
            {futurePlan.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide">📋 Planificat</p>
                {futurePlan.map(s => (
                  <div key={s.id} className="flex items-center gap-3 bg-dark-700 rounded-xl px-3 py-2.5">
                    <span className="text-lg">{TYPE_ICON_CAL[s.type] || '⚡'}</span>
                    <div>
                      <p className="text-sm font-medium text-white">{s.name}</p>
                      <p className="text-xs text-slate-500">{s.recurrence === 'weekly' ? 'Săptămânal' : 'Programat'}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-500 text-sm text-center py-2">Niciun antrenament planificat în această zi.</p>
            )}
            <button onClick={() => { setSelectedDate(null); setFuturePlan([]); setAddDate(selectedDate); setAddForm({ name: '', type: 'strength' }); setShowAddModal(true) }}
              className="btn-primary w-full py-3">+ Adaugă antrenament pentru această zi</button>
          </div>
        )}
      </Modal>

      {/* Add workout modal */}
      <Modal open={showAddModal} onClose={() => setShowAddModal(false)} title={`+ Antrenament — ${addDate ? new Date(addDate + 'T12:00:00').toLocaleDateString('ro-RO') : ''}`}>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-400 block mb-1">Data</label>
            <input className="input" type="date" value={addDate} onChange={e => setAddDate(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-2">Tip</label>
            <div className="grid grid-cols-2 gap-2">
              {[{ k: 'strength', l: '🏋️ Forță' }, { k: 'running', l: '🏃 Alergare' }, { k: 'cycling', l: '🚴 Bicicletă' }, { k: 'other', l: '⚡ Altul' }].map(t => (
                <button key={t.k} onClick={() => setAddForm(p => ({ ...p, type: t.k }))}
                  className={`py-2.5 rounded-xl text-sm font-medium transition-all ${addForm.type === t.k ? 'bg-brand-orange/20 text-brand-orange border border-brand-orange/40' : 'bg-dark-700 text-slate-400'}`}>
                  {t.l}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Nume</label>
            <input className="input" placeholder="ex: Leg Day / 5km ușor" value={addForm.name}
              onChange={e => setAddForm(p => ({ ...p, name: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && saveAdd()} autoFocus />
          </div>
          {(addForm.type === 'running' || addForm.type === 'cycling') && (
            <div>
              <label className="text-xs text-slate-400 block mb-1">Distanță (km) — opțional</label>
              <input className="input" type="number" placeholder="ex: 5.0" value={addForm.distance_km}
                onChange={e => setAddForm(p => ({ ...p, distance_km: e.target.value }))} />
            </div>
          )}
          {isAdmin && students.length > 0 && (
            <div>
              <label className="text-xs text-slate-400 block mb-1">Alocă la elev (opțional)</label>
              <select className="input" value={addForm.student_id}
                onChange={e => setAddForm(p => ({ ...p, student_id: e.target.value }))}>
                <option value="">— Antrenament propriu —</option>
                {students.map(s => (
                  <option key={s.user_id} value={s.user_id}>{s.full_name || s.email}</option>
                ))}
              </select>
              {addForm.student_id && <p className="text-xs text-brand-blue mt-1">✓ Se va adăuga la elevul selectat</p>}
            </div>
          )}
          <button onClick={saveAdd} disabled={!addForm.name} className="btn-primary w-full py-3">Salvează</button>
        </div>
      </Modal>
    </div>
  )
}


// ─── Statistici ──────────────────────────────────────

function StatisticiTab({ session }) {
  const [runData, setRunData] = useState([])
  const [workoutData, setWorkoutData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadStats() }, [])

  async function loadStats() {
    setLoading(true)
    const { data: runs } = await supabase.from('running_logs').select('date, distance_km, duration_min')
      .eq('user_id', session.user.id).order('date').limit(20)
    const { data: workouts } = await supabase.from('workout_logs').select('date, type')
      .eq('user_id', session.user.id).order('date').limit(60)

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

// ─── Main Page ────────────────────────────────────────

// ─── Bicicletă ─────────────────────────────────────────

function BicicletaTab({ session }) {
  const today = getToday()
  const [rides, setRides] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ date: today, distance_km: '', duration_min: '', type: 'road', notes: '' })
  const [loading, setLoading] = useState(false)

  const BIKE_TYPES = [
    { key: 'road', label: '🚴 Șosea' },
    { key: 'mtb', label: '🏔 MTB' },
    { key: 'indoor', label: '🏠 Indoor / Spinning' },
    { key: 'gravel', label: '🪨 Gravel' },
  ]

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('workout_logs').select('*')
      .eq('user_id', session.user.id).eq('type', 'cycling').order('date', { ascending: false }).limit(30)
    setRides(data || [])
    setLoading(false)
  }

  async function save() {
    if (!form.distance_km) return
    await supabase.from('workout_logs').insert({
      user_id: session.user.id, date: form.date, type: 'cycling',
      name: `${BIKE_TYPES.find(t => t.key === form.type)?.label || '🚴'} ${form.distance_km} km`,
      notes: JSON.stringify({ distance_km: parseFloat(form.distance_km), duration_min: parseFloat(form.duration_min) || 0, bike_type: form.type, notes: form.notes }),
    })
    setShowModal(false)
    setForm({ date: today, distance_km: '', duration_min: '', type: 'road', notes: '' })
    load()
  }

  async function deleteRide(id) {
    if (confirm('Ștergi ieșirea?')) { await supabase.from('workout_logs').delete().eq('id', id); load() }
  }

  function parseMeta(r) {
    try { return JSON.parse(r.notes || '{}') } catch { return {} }
  }

  const totalKm = rides.reduce((s, r) => s + (parseMeta(r).distance_km || 0), 0)

  return (
    <div className="space-y-3">
      <button onClick={() => setShowModal(true)} className="btn-primary w-full py-3">🚴 Adaugă ieșire</button>

      {rides.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          <div className="card text-center"><p className="text-xl font-bold text-brand-green">{totalKm.toFixed(0)} km</p><p className="text-xs text-slate-500">Total km</p></div>
          <div className="card text-center"><p className="text-xl font-bold text-brand-blue">{rides.length}</p><p className="text-xs text-slate-500">Ieșiri</p></div>
        </div>
      )}

      {loading ? <p className="text-center text-slate-500 text-sm py-4">Se încarcă...</p>
        : rides.length === 0 ? (
          <div className="card text-center py-8"><p className="text-4xl mb-2">🚴</p><p className="text-slate-400 text-sm">Nicio ieșire înregistrată.</p></div>
        ) : rides.map(r => {
          const meta = parseMeta(r)
          return (
            <div key={r.id} className="card">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-lg text-brand-green">{meta.distance_km || '?'} km</span>
                    <span className="text-xs bg-dark-700 text-slate-400 px-2 py-0.5 rounded-full">{BIKE_TYPES.find(t => t.key === meta.bike_type)?.label || '🚴'}</span>
                  </div>
                  <div className="flex gap-3 mt-1 text-xs text-slate-400">
                    {meta.duration_min > 0 && <span>⏱ {meta.duration_min} min</span>}
                    <span>📅 {new Date(r.date + 'T12:00:00').toLocaleDateString('ro-RO')}</span>
                  </div>
                  {meta.notes && <p className="text-xs text-slate-500 mt-1 italic">"{meta.notes}"</p>}
                </div>
                <button onClick={() => deleteRide(r.id)} className="text-slate-600 hover:text-red-400 text-lg">×</button>
              </div>
            </div>
          )
        })}

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Adaugă ieșire bicicletă">
        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-400 block mb-1">Data</label>
            <input className="input" type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-2">Tip</label>
            <div className="grid grid-cols-2 gap-2">
              {BIKE_TYPES.map(t => (
                <button key={t.key} onClick={() => setForm(p => ({ ...p, type: t.key }))}
                  className={`py-2.5 rounded-xl text-sm font-medium transition-all ${form.type === t.key ? 'bg-brand-green/20 text-brand-green border border-brand-green/40' : 'bg-dark-700 text-slate-400'}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Distanță (km)</label>
              <input className="input" type="number" step="0.1" placeholder="30" value={form.distance_km} onChange={e => setForm(p => ({ ...p, distance_km: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Durată (min)</label>
              <input className="input" type="number" placeholder="60" value={form.duration_min} onChange={e => setForm(p => ({ ...p, duration_min: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Notițe</label>
            <input className="input" placeholder="ex: Munte, vânt puternic..." value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
          </div>
          <button onClick={save} disabled={!form.distance_km} className="btn-primary w-full py-3">Salvează</button>
        </div>
      </Modal>
    </div>
  )
}

// ─── Plan antrenamente ──────────────────────────────────

const WEEKDAY_LABELS = ['Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ', 'Du']
const SPORT_TYPES = [
  { key: 'strength', label: '🏋️ Forță',    color: 'brand-orange' },
  { key: 'running',  label: '🏃 Alergare',  color: 'brand-blue' },
  { key: 'cycling',  label: '🚴 Bicicletă', color: 'brand-green' },
  { key: 'other',    label: '⚡ Altul',     color: 'brand-purple' },
  { key: 'task',     label: '✅ Task',      color: 'brand-blue' },
  { key: 'medical',  label: '🏥 Medical',   color: 'brand-pink' },
  { key: 'wellness', label: '🧘 Wellness',  color: 'brand-green' },
  { key: 'nutrition',label: '🥗 Nutriție',  color: 'brand-green' },
]
const IMPORTANCE = [
  { key: 'important', label: '🔥 Important!', cls: 'border-red-500/60 bg-red-500/10 text-red-400' },
  { key: 'routine',   label: '✅ Rutină',     cls: 'border-brand-green/60 bg-brand-green/10 text-brand-green' },
]
const DIFFICULTY = [
  { key: 'easy',    label: '🟢 Ușor',  cls: 'border-green-500/60 bg-green-500/10 text-green-400' },
  { key: 'medium',  label: '🟡 Mediu', cls: 'border-yellow-500/60 bg-yellow-500/10 text-yellow-400' },
  { key: 'hard',    label: '🟠 Greu',  cls: 'border-orange-500/60 bg-orange-500/10 text-orange-400' },
  { key: 'extreme', label: '🔴 Extrem',cls: 'border-red-600/60 bg-red-600/10 text-red-500' },
]
const RUN_TYPES = ['Ușor', 'Interval', 'Tempo', 'Fartlek', 'Cursă', 'Recuperare']
const BIKE_TYPES_PLAN = ['Șosea', 'MTB', 'Indoor', 'Viteză', 'Anduranță']

const EMPTY_FORM = {
  name: '', type: 'strength',
  recurrence: 'weekly', weekdays: [], scheduled_date: '',
  importance: 'routine', difficulty: 'medium',
  time: '',
  // running / cycling
  distance_km: '', pace: '', activity_subtype: '',
  // strength exercises
  exercises: [{ name: '', sets: '3', reps: '10' }],
  // admin
  student_id: '',
}

function PlanTab({ session, isAdmin }) {
  const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })()
  const [adminProfiles, setAdminProfiles] = useState({})
  const [mySchedules, setMySchedules] = useState([])
  const [studentSchedules, setStudentSchedules] = useState([]) // admin view: elev plans
  const [studentProfiles, setStudentProfiles] = useState({}) // uid -> {full_name, email}
  const [exceptions, setExceptions] = useState({})
  const [showModal, setShowModal] = useState(false)
  const [showExceptModal, setShowExceptModal] = useState(false)
  const [exceptSchedule, setExceptSchedule] = useState(null)
  const [newExceptDate, setNewExceptDate] = useState(today)
  const [newExceptReason, setNewExceptReason] = useState('')
  const [editItem, setEditItem] = useState(null)
  const [form, setForm] = useState({ ...EMPTY_FORM, scheduled_date: today })
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState('mine') // 'mine' | 'students'
  const [studentFeedback, setStudentFeedback] = useState({})
  const [pastDoneLogs, setPastDoneLogs] = useState({}) // scheduleId -> Set of dates done

  useEffect(() => { load() }, [isAdmin])

  async function load() {
    setLoading(true)
    const uid = session.user.id

    // 1. Load own schedules
    const { data: sched } = await supabase.from('workout_schedules')
      .select('*').eq('user_id', uid).order('created_at')

    // 2. Load exceptions for own schedules
    const { data: excepts } = await supabase.from('workout_schedule_exceptions')
      .select('*').eq('user_id', uid)

    // 3. If admin, load ALL student schedules
    let studentSched = []
    if (isAdmin) {
      await loadStudents()
      const { data: all, error: schedErr } = await supabase.from('workout_schedules')
        .select('*')
        .neq('user_id', uid)
        .order('created_at')
      if (schedErr) console.error('studentSched error:', schedErr)
      // Filter client-side to those assigned by this admin
      studentSched = (all || []).filter(s => {
        try { return JSON.parse(s.notes || '{}').assigned_by === uid } catch { return false }
      })
      console.log('all other schedules:', all?.length, 'filtered for admin:', studentSched.length)
    }

    // 4. Load student profiles for names
    if (studentSched.length) {
      const ids = [...new Set(studentSched.map(s => s.user_id))]
      const { data: profiles } = await supabase.from('user_profiles')
        .select('user_id, full_name, email').in('user_id', ids)
      const pmap = {}
      ;(profiles || []).forEach(p => { pmap[p.user_id] = p })
      setStudentProfiles(pmap)
    }

    // 5. Load admin profiles for "assigned by" display (for elev view)
    const adminIds = [...new Set((sched || []).map(s => {
      try { return JSON.parse(s.notes || '{}').assigned_by } catch { return null }
    }).filter(Boolean))]
    if (adminIds.length) {
      const { data: aprof } = await supabase.from('user_profiles')
        .select('user_id, full_name, email').in('user_id', adminIds)
      console.log('adminIds:', adminIds, 'aprof:', aprof)
      const amap = {}
      ;(aprof || []).forEach(p => { amap[p.user_id] = p })
      setAdminProfiles(amap)
    } else {
      console.log('no adminIds found in sched:', (sched||[]).map(s => s.notes))
      setAdminProfiles({})
    }

    const excMap = {}
    ;(excepts || []).forEach(e => {
      if (!excMap[e.schedule_id]) excMap[e.schedule_id] = []
      excMap[e.schedule_id].push(e)
    })

    setMySchedules(sched || [])
    setStudentSchedules(studentSched)
    setExceptions(excMap)

    // Load last 30 days of done logs for own schedules
    if (sched?.length) {
      const past30 = new Date(); past30.setDate(past30.getDate() - 30)
      const d30 = `${past30.getFullYear()}-${String(past30.getMonth()+1).padStart(2,'0')}-${String(past30.getDate()).padStart(2,'0')}`
      const schedIds = sched.map(s => s.id)
      const { data: doneLogs } = await supabase.from('workout_schedule_logs')
        .select('schedule_id, date, done').in('schedule_id', schedIds).eq('done', true).gte('date', d30)
      const doneMap = {}
      ;(doneLogs || []).forEach(l => {
        if (!doneMap[l.schedule_id]) doneMap[l.schedule_id] = new Set()
        doneMap[l.schedule_id].add(l.date)
      })
      setPastDoneLogs(doneMap)
    }

    // Load feedback for student schedules (admin view)
    if (studentSched.length) {
      const ids = studentSched.map(s => s.id)
      const { data: fbLogs } = await supabase.from('workout_schedule_logs')
        .select('*').in('schedule_id', ids).eq('done', true).not('feedback', 'is', null)
      if (fbLogs?.length) {
        const fbMap = {}
        fbLogs.forEach(l => {
          if (!fbMap[l.schedule_id]) fbMap[l.schedule_id] = []
          let fb = null
          try { fb = JSON.parse(l.feedback) } catch {}
          if (fb) {
            const sp = studentProfiles[l.user_id]
            fbMap[l.schedule_id].push({
              date: l.date, feeling: fb.feeling, notes: fb.notes,
              studentName: sp?.full_name || sp?.email || 'Elev'
            })
          }
        })
        setStudentFeedback(fbMap)
      }
    }

    setLoading(false)
  }

  // Keep old `schedules` as alias for non-admin render
  const schedules = mySchedules

  function parseMeta(s) {
    try { return JSON.parse(s.notes || '{}') } catch { return {} }
  }

  async function loadStudents() {
    const { data } = await supabase.from('user_profiles').select('user_id, full_name, email').eq('account_type', 'elev')
    setStudents(data || [])
  }

  function openAdd() {
    setForm({ ...EMPTY_FORM, scheduled_date: today })
    setEditItem(null); setShowModal(true)
  }

  function openEdit(s) {
    const meta = parseMeta(s)
    // When editing a student's schedule, keep track of who it belongs to
    const isStudentSchedule = s.user_id !== session.user.id
    setForm({
      name: s.name, type: s.type,
      recurrence: s.recurrence, weekdays: s.weekdays || [], scheduled_date: s.scheduled_date || today,
      importance: meta.importance || 'routine',
      difficulty: meta.difficulty || 'medium',
      time: meta.time || '',
      distance_km: meta.distance_km || '',
      pace: meta.pace || '',
      activity_subtype: meta.activity_subtype || '',
      exercises: meta.exercises?.length ? meta.exercises : [{ name: '', sets: '3', reps: '10' }],
      student_id: isStudentSchedule ? s.user_id : '',
      _existing_user_id: s.user_id, // preserve target user on edit
    })
    setEditItem(s); setShowModal(true)
  }

  function toggleWeekday(d) {
    setForm(p => ({ ...p, weekdays: p.weekdays.includes(d) ? p.weekdays.filter(x => x !== d) : [...p.weekdays, d] }))
  }

  function setEx(idx, key, val) {
    setForm(p => {
      const ex = [...p.exercises]
      ex[idx] = { ...ex[idx], [key]: val }
      return { ...p, exercises: ex }
    })
  }
  function addExercise() { setForm(p => ({ ...p, exercises: [...p.exercises, { name: '', sets: '3', reps: '10' }] })) }
  function removeExercise(idx) { setForm(p => ({ ...p, exercises: p.exercises.filter((_, i) => i !== idx) })) }

  async function save() {
    if (!form.name) return
    // On edit: use existing user_id. On create: use selected student or self
    const targetUserId = editItem
      ? (form._existing_user_id || session.user.id)
      : (isAdmin && form.student_id ? form.student_id : session.user.id)

    const meta = {
      importance: form.importance,
      difficulty: form.difficulty,
      time: form.time,
      ...(form.type === 'running' || form.type === 'cycling' ? {
        distance_km: form.distance_km,
        pace: form.pace,
        activity_subtype: form.activity_subtype,
      } : {}),
      ...(form.type === 'strength' ? {
        exercises: form.exercises.filter(e => e.name),
      } : {}),
      ...(isAdmin && (form.student_id || form._existing_user_id !== session.user.id)
        ? { assigned_by: session.user.id } : {}),
    }

    const data = {
      user_id: targetUserId,
      name: form.name,
      type: form.type,
      recurrence: form.recurrence,
      weekdays: form.weekdays,
      scheduled_date: form.recurrence === 'once' ? form.scheduled_date : null,
      notes: JSON.stringify(meta),
    }

    if (editItem) {
      const { error } = await supabase.from('workout_schedules').update(data).eq('id', editItem.id)
      if (error) { alert('Update error: ' + error.message); return }
    } else {
      // Support assigning to multiple students at once
      const targets = (isAdmin && form.student_ids?.length)
        ? form.student_ids
        : [targetUserId]

      for (const uid of targets) {
        const { error } = await supabase.from('workout_schedules').insert({
          ...data, user_id: uid,
          notes: JSON.stringify({ ...meta, assigned_by: isAdmin && uid !== session.user.id ? session.user.id : undefined })
        })
        if (error) { alert('Insert error: ' + error.message + '\n' + JSON.stringify(data)); return }
      }
    }
    setShowModal(false)
    await load()
  }

  async function del(id) {
    const s = [...mySchedules, ...studentSchedules].find(x => x.id === id)
    const meta = parseMeta(s)
    if (!isAdmin && meta.assigned_by) {
      alert('Acest antrenament a fost creat de antrenorul tău și nu poate fi șters.'); return
    }
    if (confirm('Ștergi antrenamentul planificat?')) {
      await supabase.from('workout_schedules').delete().eq('id', id)
      load()
    }
  }

  function openExceptions(s) { setExceptSchedule(s); setNewExceptDate(today); setNewExceptReason(''); setShowExceptModal(true) }

  async function addException() {
    if (!newExceptDate) return
    await supabase.from('workout_schedule_exceptions').upsert({
      user_id: session.user.id, schedule_id: exceptSchedule.id,
      exception_date: newExceptDate, reason: newExceptReason || null,
    }, { onConflict: 'schedule_id,exception_date' })
    setNewExceptDate(today); setNewExceptReason(''); load()
  }

  async function removeException(id) {
    await supabase.from('workout_schedule_exceptions').delete().eq('id', id); load()
  }

  const recurrenceLabel = (s) => {
    if (s.recurrence === 'once') return `📅 ${new Date(s.scheduled_date + 'T12:00:00').toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' })}`
    if (!s.weekdays?.length) return '🔁 Săptămânal'
    return `🔁 ${s.weekdays.sort().map(d => WEEKDAY_LABELS[d]).join(', ')}`
  }

  const diffInfo = (key) => DIFFICULTY.find(d => d.key === key)
  const impInfo  = (key) => IMPORTANCE.find(i => i.key === key)

  function renderScheduleCard(s, isStudentCard) {
    const meta = parseMeta(s)
    const diff = diffInfo(meta.difficulty)
    const imp  = impInfo(meta.importance)
    const assignedByProfile = meta.assigned_by ? adminProfiles[meta.assigned_by] : null
    const assignedByName = assignedByProfile?.full_name || assignedByProfile?.email
    const exceptCount = (exceptions[s.id] || []).length

    // Check if this schedule was completed in the past
    const doneDates = pastDoneLogs[s.id]
    const isPastSingleDone = s.recurrence === 'once' && s.scheduled_date && s.scheduled_date < today && doneDates?.has(s.scheduled_date)
    // For weekly: check if done today
    const isDoneToday = doneDates?.has(today)

    return (
      <div key={s.id} className={`card space-y-2 ${isPastSingleDone ? 'opacity-75 border border-brand-green/30 bg-brand-green/5' : ''}`}>
        <div className="flex items-start gap-3">
          <span className="text-2xl mt-0.5">{SPORT_TYPES.find(t => t.key === s.type)?.label.split(' ')[0] || '⚡'}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-semibold text-white truncate">{s.name}</p>
              {isPastSingleDone && <span className="text-xs bg-brand-green/20 text-brand-green border border-brand-green/30 px-1.5 py-0.5 rounded-full shrink-0">✓ Îndeplinit</span>}
              {isDoneToday && !isPastSingleDone && <span className="text-xs bg-brand-green/20 text-brand-green border border-brand-green/30 px-1.5 py-0.5 rounded-full shrink-0">✓ Azi</span>}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">{recurrenceLabel(s)}{meta.time ? ` · ⏰ ${meta.time}` : ''}</p>
          </div>
          <div className="flex gap-1.5 shrink-0">
            {s.recurrence === 'weekly' && !isStudentCard && (
              <button onClick={() => openExceptions(s)} className="text-xs bg-brand-orange/10 text-brand-orange px-2 py-1.5 rounded-lg hover:bg-brand-orange/20">🚫</button>
            )}
            {(isAdmin || !meta.assigned_by) && (
              <button onClick={() => openEdit(s)} className="text-xs bg-dark-700 text-slate-300 px-2 py-1.5 rounded-lg hover:bg-dark-600">✏️</button>
            )}
            {(isAdmin || !meta.assigned_by) && (
              <button onClick={() => del(s.id)} className="text-xs bg-red-500/10 text-red-400 px-2 py-1.5 rounded-lg hover:bg-red-500/20">🗑</button>
            )}
            {!isAdmin && meta.assigned_by && (
              <span className="text-xs text-slate-600 px-2 py-1.5">🔒</span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {imp  && <span className={`text-xs px-2 py-0.5 rounded-full border ${imp.cls}`}>{imp.label}</span>}
          {diff && <span className={`text-xs px-2 py-0.5 rounded-full border ${diff.cls}`}>{diff.label}</span>}
          {(meta.distance_km || meta.pace) && (
            <span className="text-xs bg-brand-blue/10 text-brand-blue border border-brand-blue/30 px-2 py-0.5 rounded-full">
              {meta.distance_km && `${meta.distance_km} km`}{meta.pace && ` · ${meta.pace} min/km`}
            </span>
          )}
          {meta.activity_subtype && <span className="text-xs bg-dark-600 text-slate-400 px-2 py-0.5 rounded-full">{meta.activity_subtype}</span>}
          {exceptCount > 0 && <span className="text-xs text-brand-orange">⚠️ {exceptCount} excepție</span>}
        </div>

        {s.type === 'strength' && meta.exercises?.length > 0 && (
          <div className="space-y-1 pt-1 border-t border-dark-600">
            {meta.exercises.map((e, i) => (
              <div key={i} className="flex items-center justify-between bg-dark-700 rounded-lg px-2.5 py-1.5 text-xs">
                <span className="text-slate-200">{e.name}</span>
                <span className="text-slate-400">{e.sets} × {e.reps} rep</span>
              </div>
            ))}
          </div>
        )}

        {assignedByName && (
          <p className="text-xs text-brand-blue pt-1 border-t border-dark-600">👤 Alocat de: <span className="font-medium">{assignedByName}</span></p>
        )}
        {isAdmin && isStudentCard && studentFeedback[s.id]?.length > 0 && (
          <div className="pt-1 border-t border-dark-600 space-y-1">
            <p className="text-xs font-semibold text-brand-orange">💬 Feedback elev</p>
            {studentFeedback[s.id].map((fb, i) => (
              <div key={i} className="bg-dark-700 rounded-lg px-2.5 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-white">{
                    { great:'🔥 Excelent', good:'💪 Bine', ok:'😐 Ok', hard:'😰 Greu', bad:'😞 Rău' }[fb.feeling] || fb.feeling
                  }</span>
                  <span className="text-xs text-slate-500">{new Date(fb.date + 'T12:00:00').toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' })}</span>
                </div>
                {fb.notes && <p className="text-xs text-slate-400 mt-0.5 italic">"{fb.notes}"</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Header + tabs for admin */}
      <div className="flex items-center justify-between">
        {isAdmin ? (
          <div className="flex gap-1 bg-dark-700 rounded-xl p-1">
            <button onClick={() => setActiveSection('mine')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${activeSection === 'mine' ? 'bg-dark-500 text-white' : 'text-slate-500'}`}>
              📋 Planul meu ({mySchedules.length})
            </button>
            <button onClick={() => setActiveSection('students')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${activeSection === 'students' ? 'bg-dark-500 text-white' : 'text-slate-500'}`}>
              🎓 Elevi ({studentSchedules.length})
            </button>
          </div>
        ) : (
          <p className="text-xs text-slate-500">Planul apare în Dashboard în ziua potrivită.</p>
        )}
        <button onClick={openAdd} className="btn-primary px-4 py-2 text-sm">+ Adaugă</button>
      </div>

      {loading ? <p className="text-center text-slate-500 text-sm py-4">Se încarcă...</p> : (

        /* ── SECTION: MY PLANS ── */
        activeSection === 'mine' || !isAdmin ? (
          <div>
            {schedules.length === 0 ? (
              <div className="card text-center py-8">
                <p className="text-4xl mb-2">📋</p>
                <p className="text-slate-400 text-sm mb-3">Niciun antrenament planificat.</p>
                <button onClick={openAdd} className="btn-primary px-6 py-2">+ Plan nou</button>
              </div>
            ) : (
              <div className="space-y-2">
                {schedules.map(s => renderScheduleCard(s, false))}
              </div>
            )}
          </div>
        ) : (

          /* ── SECTION: STUDENTS ── */
          <div>
            {studentSchedules.length === 0 ? (
              <div className="card text-center py-8">
                <p className="text-4xl mb-2">🎓</p>
                <p className="text-slate-400 text-sm mb-3">Nu ai alocat antrenamente elevilor încă.</p>
                <button onClick={openAdd} className="btn-primary px-6 py-2">+ Adaugă pentru elev</button>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Group by student */}
                {Object.entries(
                  studentSchedules.reduce((acc, s) => {
                    const uid = s.user_id
                    if (!acc[uid]) acc[uid] = []
                    acc[uid].push(s)
                    return acc
                  }, {})
                ).map(([uid, plans]) => {
                  const profile = studentProfiles[uid]
                  const name = profile?.full_name || profile?.email || uid.slice(0, 8)
                  return (
                    <div key={uid}>
                      <div className="flex items-center gap-2 px-1 mb-2 mt-3 first:mt-0">
                        <div className="w-6 h-6 rounded-full bg-brand-blue/20 flex items-center justify-center text-xs">🎓</div>
                        <p className="text-sm font-semibold text-white">{name}</p>
                        <span className="text-xs text-slate-500">{plans.length} antrenament{plans.length !== 1 ? 'e' : ''}</span>
                      </div>
                      <div className="space-y-2">
                        {plans.map(s => renderScheduleCard(s, true))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      )}

      {/* ── ADD / EDIT MODAL ── */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editItem ? 'Editează plan' : '+ Antrenament nou'}>
        <div className="space-y-4">

          {/* 1. Recurență + Data — PRIMA */}
          <div>
            <label className="text-xs text-slate-400 block mb-2">Când?</label>
            <div className="flex gap-2 mb-2">
              {[{ k: 'once', l: '📅 O singură dată' }, { k: 'weekly', l: '🔁 Săptămânal' }].map(r => (
                <button key={r.k} onClick={() => setForm(p => ({ ...p, recurrence: r.k }))}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${form.recurrence === r.k ? 'bg-brand-blue/20 text-brand-blue border border-brand-blue/40' : 'bg-dark-700 text-slate-400 border border-transparent'}`}>
                  {r.l}
                </button>
              ))}
            </div>
            {form.recurrence === 'weekly' ? (
              <div className="flex gap-1.5">
                {WEEKDAY_LABELS.map((d, i) => (
                  <button key={i} onClick={() => toggleWeekday(i)}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${form.weekdays.includes(i) ? 'bg-brand-green text-dark-900' : 'bg-dark-700 text-slate-400'}`}>
                    {d}
                  </button>
                ))}
              </div>
            ) : (
              <input className="input" type="date" value={form.scheduled_date}
                onChange={e => setForm(p => ({ ...p, scheduled_date: e.target.value }))} />
            )}
          </div>

          {/* 2. Oră */}
          <div>
            <label className="text-xs text-slate-400 block mb-1">Oră (opțional)</label>
            <input className="input" type="time" step="60" value={form.time}
              onChange={e => setForm(p => ({ ...p, time: e.target.value }))} />
          </div>

          {/* 3. Tip */}
          <div>
            <label className="text-xs text-slate-400 block mb-2">Tip</label>
            <div className="grid grid-cols-4 gap-1.5">
              {SPORT_TYPES.map(t => (
                <button key={t.key} onClick={() => setForm(p => ({ ...p, type: t.key }))}
                  className={`py-2 rounded-xl text-xs font-medium transition-all text-center leading-tight ${form.type === t.key ? 'bg-brand-orange/20 text-brand-orange border border-brand-orange/40' : 'bg-dark-700 text-slate-400 border border-transparent'}`}>
                  {t.label.split(' ')[0]}<br/><span className="text-[10px]">{t.label.split(' ').slice(1).join(' ')}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 4. Importanță + Dificultate */}
          <div className={['task','nutrition','wellness','medical'].includes(form.type) ? '' : 'grid grid-cols-2 gap-3'}>
            <div>
              <label className="text-xs text-slate-400 block mb-1.5">Importanță</label>
              <div className="space-y-1.5">
                {IMPORTANCE.map(i => (
                  <button key={i.key} onClick={() => setForm(p => ({ ...p, importance: i.key }))}
                    className={`w-full py-2 rounded-xl text-xs font-medium border transition-all ${form.importance === i.key ? i.cls : 'bg-dark-700 text-slate-400 border-transparent'}`}>
                    {i.label}
                  </button>
                ))}
              </div>
            </div>
            {!['task','nutrition','wellness','medical'].includes(form.type) && (
              <div>
                <label className="text-xs text-slate-400 block mb-1.5">Dificultate</label>
                <div className="space-y-1.5">
                  {DIFFICULTY.map(d => (
                    <button key={d.key} onClick={() => setForm(p => ({ ...p, difficulty: d.key }))}
                      className={`w-full py-2 rounded-xl text-xs font-medium border transition-all ${form.difficulty === d.key ? d.cls : 'bg-dark-700 text-slate-400 border-transparent'}`}>
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 5. Nume */}
          <div>
            <label className="text-xs text-slate-400 block mb-1">Nume antrenament</label>
            <input className="input" autoFocus placeholder="ex: Piept + Triceps, Run 10km..." value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          </div>

          {/* 6. Running / Cycling specific */}
          {(form.type === 'running' || form.type === 'cycling') && (
            <div className="space-y-3 bg-dark-700 rounded-xl p-3">
              <p className="text-xs font-semibold text-slate-300">{form.type === 'running' ? '🏃 Detalii alergare' : '🚴 Detalii bicicletă'}</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Distanță (km)</label>
                  <input className="input" type="number" step="0.1" placeholder="10.0" value={form.distance_km}
                    onChange={e => setForm(p => ({ ...p, distance_km: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Pace (min/km)</label>
                  <input className="input" placeholder="5:30" value={form.pace}
                    onChange={e => setForm(p => ({ ...p, pace: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1.5">Tip {form.type === 'running' ? 'alergare' : 'ieșire'}</label>
                <div className="flex flex-wrap gap-1.5">
                  {(form.type === 'running' ? RUN_TYPES : BIKE_TYPES_PLAN).map(t => (
                    <button key={t} onClick={() => setForm(p => ({ ...p, activity_subtype: t }))}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${form.activity_subtype === t ? 'bg-brand-blue/20 text-brand-blue border border-brand-blue/40' : 'bg-dark-600 text-slate-400'}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 7. Strength exercises */}
          {form.type === 'strength' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs text-slate-400">Exerciții</label>
                <button onClick={addExercise} className="text-xs bg-brand-green/10 text-brand-green border border-brand-green/30 px-2.5 py-1 rounded-lg hover:bg-brand-green/20">+ Adaugă</button>
              </div>
              {form.exercises.map((ex, i) => (
                <div key={i} className="flex gap-2 items-center bg-dark-700 rounded-xl p-2">
                  <span className="text-xs text-slate-500 w-4 shrink-0">{i + 1}.</span>
                  <input className="input flex-1 py-1.5 text-xs" placeholder="ex: Leg Raises" value={ex.name}
                    onChange={e => setEx(i, 'name', e.target.value)} />
                  <input className="input w-14 py-1.5 text-xs text-center" type="number" placeholder="Serii" value={ex.sets}
                    onChange={e => setEx(i, 'sets', e.target.value)} />
                  <span className="text-slate-600 text-xs">×</span>
                  <input className="input w-14 py-1.5 text-xs text-center" type="number" placeholder="Rep" value={ex.reps}
                    onChange={e => setEx(i, 'reps', e.target.value)} />
                  {form.exercises.length > 1 && (
                    <button onClick={() => removeExercise(i)} className="text-slate-600 hover:text-red-400 text-base px-1">×</button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 8. Admin: alocare elevi — ascuns la edit dacă e deja alocat */}
          {isAdmin && students.length > 0 && (
            <div className="border-t border-dark-600 pt-3">
              {editItem && form._existing_user_id && form._existing_user_id !== session.user.id ? (
                // Edit pe antrenament deja alocat — arată doar cui aparține
                <div className="flex items-center gap-2 bg-brand-blue/10 border border-brand-blue/20 rounded-xl px-3 py-2.5">
                  <span className="text-brand-blue">🎓</span>
                  <div>
                    <p className="text-xs text-brand-blue font-medium">Antrenament alocat</p>
                    <p className="text-xs text-slate-400">
                      {students.find(s => s.user_id === form._existing_user_id)?.full_name ||
                       students.find(s => s.user_id === form._existing_user_id)?.email ||
                       'Elev'}
                    </p>
                  </div>
                </div>
              ) : !editItem ? (
                // Adăugare nouă — selector multi-elev
                <div>
                  <label className="text-xs text-slate-400 block mb-2">Alocă la (opțional)</label>
                  <div className="space-y-1.5">
                    <button onClick={() => setForm(p => ({ ...p, student_id: '', student_ids: [] }))}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all border ${!form.student_id && !form.student_ids?.length ? 'border-brand-green/50 bg-brand-green/10 text-brand-green' : 'border-dark-600 bg-dark-700 text-slate-400'}`}>
                      <span>👤</span> Plan propriu
                    </button>
                    {students.map(s => {
                      const ids = form.student_ids || []
                      const selected = ids.includes(s.user_id)
                      return (
                        <button key={s.user_id}
                          onClick={() => setForm(p => {
                            const cur = p.student_ids || []
                            const next = cur.includes(s.user_id) ? cur.filter(id => id !== s.user_id) : [...cur, s.user_id]
                            return { ...p, student_ids: next, student_id: next[0] || '' }
                          })}
                          className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all border ${selected ? 'border-brand-blue/50 bg-brand-blue/10 text-brand-blue' : 'border-dark-600 bg-dark-700 text-slate-400'}`}>
                          <span>{selected ? '✓' : '🎓'}</span>
                          <span className="flex-1 text-left truncate">{s.full_name || s.email}</span>
                        </button>
                      )
                    })}
                  </div>
                  {(form.student_ids?.length > 0) && (
                    <p className="text-xs text-brand-blue mt-2">✓ {form.student_ids.length} elev{form.student_ids.length > 1 ? 'i selectați' : ' selectat'}</p>
                  )}
                </div>
              ) : null}
            </div>
          )}

          <button onClick={save}
            disabled={!form.name || (form.recurrence === 'weekly' && !form.weekdays.length)}
            className="btn-primary w-full py-3 disabled:opacity-50">
            {editItem ? 'Salvează modificările' : (form.student_ids?.length > 1 ? `Creează pentru ${form.student_ids.length} elevi` : 'Creează antrenament')}
          </button>
        </div>
      </Modal>

      {/* Exceptions modal */}
      <Modal open={showExceptModal} onClose={() => setShowExceptModal(false)} title={`🚫 Excepții — ${exceptSchedule?.name || ''}`}>
        <div className="space-y-4">
          <p className="text-xs text-slate-400">Adaugă zilele în care nu poți face acest antrenament.</p>
          {(exceptions[exceptSchedule?.id] || []).length > 0 && (
            <div className="space-y-2">
              {(exceptions[exceptSchedule?.id] || []).map(e => (
                <div key={e.id} className="flex items-center justify-between bg-dark-700 rounded-xl px-3 py-2.5">
                  <div>
                    <p className="text-sm text-white">{new Date(e.exception_date + 'T12:00:00').toLocaleDateString('ro-RO', { weekday: 'short', day: 'numeric', month: 'long' })}</p>
                    {e.reason && <p className="text-xs text-slate-400 mt-0.5">"{e.reason}"</p>}
                  </div>
                  <button onClick={() => removeException(e.id)} className="text-xs bg-red-500/10 text-red-400 px-2 py-1 rounded-lg hover:bg-red-500/20">Șterge</button>
                </div>
              ))}
            </div>
          )}
          <div className="border-t border-dark-600 pt-3 space-y-3">
            <p className="text-xs font-semibold text-slate-300">+ Excepție nouă</p>
            <input className="input" type="date" value={newExceptDate} onChange={e => setNewExceptDate(e.target.value)} />
            <input className="input" placeholder="Motiv (opțional)" value={newExceptReason} onChange={e => setNewExceptReason(e.target.value)} />
            <button onClick={addException} className="btn-primary w-full py-3">Adaugă excepție</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}


export default function Sport({ session, isAdmin }) {
  const location = useLocation ? useLocation() : { search: '' }
  const initialTab = new URLSearchParams(location?.search || '').get('tab') || 'plan'
  const [tab, setTab] = useState(initialTab)
  const tabs = [
    { key: 'plan',       label: '📋 Plan' },
    { key: 'calendar',   label: '📅 Calendar' },
    { key: 'alergare',   label: '🏃 Alergare' },
    { key: 'forta',      label: '🏋️ Forță' },
    { key: 'bicicleta',  label: '🚴 Bicicletă' },
    { key: 'statistici', label: '📊 Statistici' },
  ]

  return (
    <div className="page fade-in">
      <h1 className="text-2xl font-bold text-white mb-4">📋 Plan</h1>
      <div className="flex gap-1 bg-dark-800 border border-dark-600 rounded-xl p-1 mb-4 overflow-x-auto">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`tab-btn whitespace-nowrap px-2 ${tab === t.key ? 'tab-active' : 'tab-inactive'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'calendar' && <CalendarTab session={session} isAdmin={isAdmin} />}
      {tab === 'plan' && <PlanTab session={session} isAdmin={isAdmin} />}
      {tab === 'alergare' && <AlergareTab session={session} />}
      {tab === 'forta' && <FortaTab session={session} isAdmin={isAdmin} />}
      {tab === 'bicicleta' && <BicicletaTab session={session} />}
      {tab === 'statistici' && <StatisticiTab session={session} />}
    </div>
  )
}
