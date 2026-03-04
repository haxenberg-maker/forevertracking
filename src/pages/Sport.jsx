import { useState, useEffect } from 'react'
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
  const [form, setForm] = useState({ date: today, distance_km: '', duration_min: '', notes: '' })
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
    })
    setShowModal(false)
    setForm({ date: today, distance_km: '', duration_min: '', notes: '' })
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

function FortaTab({ session }) {
  const today = getToday()
  const [workouts, setWorkouts] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ date: today, name: '', notes: '' })
  const [exercises, setExercises] = useState([{ exercise_name: '', sets: '3', reps: '10', weight_kg: '0' }])
  const [loading, setLoading] = useState(true)
  const { syncing, syncMsg, stravaConnected, syncStrava } = useStravaSync(session, loadWorkouts)

  useEffect(() => { loadWorkouts() }, [])

  async function loadWorkouts() {
    setLoading(true)
    const { data } = await supabase.from('workout_logs').select(`
      id, date, name, notes, type,
      workout_exercises(id, exercise_name, sets, reps, weight_kg)
    `).eq('user_id', session.user.id).eq('type', 'strength')
      .order('date', { ascending: false }).limit(20)
    setWorkouts(data || [])
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
      user_id: session.user.id, date: form.date, name: form.name, type: 'strength', notes: form.notes
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
            {workouts.map(w => (
              <div key={w.id} className="card">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-semibold text-white">{w.name}</p>
                    <p className="text-xs text-slate-400">📅 {new Date(w.date).toLocaleDateString('ro-RO')} · {w.workout_exercises?.length || 0} exerciții</p>
                  </div>
                  <button onClick={() => deleteWorkout(w.id)} className="text-slate-600 hover:text-red-400 transition-colors text-lg">×</button>
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
                {w.notes && <p className="text-xs text-slate-500 mt-2 italic">"{w.notes}"</p>}
              </div>
            ))}
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

function CalendarTab({ session }) {
  const today = getToday()
  const [events, setEvents] = useState([])
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [showModal, setShowModal] = useState(false)
  const [selectedDate, setSelectedDate] = useState(today)
  const [form, setForm] = useState({ name: '', type: 'strength' })

  useEffect(() => { loadEvents() }, [currentMonth])

  async function loadEvents() {
    const start = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).toISOString().split('T')[0]
    const end = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).toISOString().split('T')[0]
    const { data: workouts } = await supabase.from('workout_logs').select('date, name, type').eq('user_id', session.user.id).gte('date', start).lte('date', end)
    const { data: runs } = await supabase.from('running_logs').select('date, distance_km').eq('user_id', session.user.id).gte('date', start).lte('date', end)

    const allEvents = {}
    ;(workouts || []).forEach(w => {
      if (!allEvents[w.date]) allEvents[w.date] = []
      allEvents[w.date].push({ type: w.type, label: w.name })
    })
    ;(runs || []).forEach(r => {
      if (!allEvents[r.date]) allEvents[r.date] = []
      allEvents[r.date].push({ type: 'running', label: `${r.distance_km}km` })
    })
    setEvents(allEvents)
  }

  async function savePlan() {
    if (!form.name) return
    await supabase.from('workout_logs').insert({
      user_id: session.user.id, date: selectedDate, name: form.name, type: form.type
    })
    setShowModal(false)
    setForm({ name: '', type: 'strength' })
    loadEvents()
  }

  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth()
  const firstDay = (new Date(year, month, 1).getDay() + 6) % 7 // Mo=0
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const monthNames = ['Ian', 'Feb', 'Mar', 'Apr', 'Mai', 'Iun', 'Iul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const dayLabels = ['Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ', 'Du']

  function prevMonth() { setCurrentMonth(new Date(year, month - 1, 1)) }
  function nextMonth() { setCurrentMonth(new Date(year, month + 1, 1)) }

  return (
    <div className="space-y-3">
      <div className="card">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={prevMonth} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-dark-700">‹</button>
          <h2 className="text-base font-semibold text-white">{monthNames[month]} {year}</h2>
          <button onClick={nextMonth} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-dark-700">›</button>
        </div>

        {/* Day labels */}
        <div className="grid grid-cols-7 mb-1">
          {dayLabels.map(d => <div key={d} className="text-center text-xs text-slate-500 py-1">{d}</div>)}
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7 gap-0.5">
          {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            const hasEvents = events[dateStr]
            const isToday = dateStr === today
            return (
              <button key={day} onClick={() => { setSelectedDate(dateStr); setShowModal(true) }}
                className={`aspect-square flex flex-col items-center justify-center rounded-lg text-xs transition-all hover:bg-dark-600
                  ${isToday ? 'bg-brand-green/20 text-brand-green font-bold border border-brand-green/40' : 'text-slate-300'}
                  ${hasEvents ? 'ring-1 ring-brand-blue/50' : ''}`}>
                <span>{day}</span>
                {hasEvents && (
                  <div className="flex gap-0.5 mt-0.5">
                    {hasEvents.slice(0, 3).map((e, i) => (
                      <div key={i} className={`w-1 h-1 rounded-full ${e.type === 'running' ? 'bg-brand-blue' : 'bg-brand-orange'}`} />
                    ))}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-4 px-1">
        <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-brand-blue" /><span className="text-xs text-slate-400">Alergare</span></div>
        <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-brand-orange" /><span className="text-xs text-slate-400">Forță</span></div>
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title={`📅 ${new Date(selectedDate + 'T12:00:00').toLocaleDateString('ro-RO')}`}>
        <div className="space-y-3">
          {/* Existing events */}
          {events[selectedDate] && (
            <div className="space-y-1.5">
              {events[selectedDate].map((e, i) => (
                <div key={i} className="bg-dark-700 rounded-xl px-3 py-2 flex items-center gap-2">
                  <span>{e.type === 'running' ? '🏃' : '🏋️'}</span>
                  <span className="text-sm text-slate-200">{e.label}</span>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-slate-400">Planifică un antrenament:</p>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Tip</label>
            <div className="flex gap-2">
              <button onClick={() => setForm(p => ({ ...p, type: 'strength' }))}
                className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${form.type === 'strength' ? 'bg-brand-orange/20 text-brand-orange border border-brand-orange/40' : 'bg-dark-700 text-slate-400'}`}>
                🏋️ Forță
              </button>
              <button onClick={() => setForm(p => ({ ...p, type: 'running' }))}
                className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${form.type === 'running' ? 'bg-brand-blue/20 text-brand-blue border border-brand-blue/40' : 'bg-dark-700 text-slate-400'}`}>
                🏃 Alergare
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Nume</label>
            <input className="input" placeholder="ex: Leg Day / 5km ușor" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          </div>
          <button onClick={savePlan} className="btn-primary w-full py-3">Adaugă în calendar</button>
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

export default function Sport({ session }) {
  const [tab, setTab] = useState('alergare')
  const tabs = [
    { key: 'alergare', label: '🏃 Alergare' },
    { key: 'forta', label: '🏋️ Forță' },
    { key: 'calendar', label: '📅 Calendar' },
    { key: 'statistici', label: '📊 Statistici' },
  ]

  return (
    <div className="page fade-in">
      <h1 className="text-2xl font-bold text-white mb-4">💪 Sport</h1>
      <div className="flex gap-1 bg-dark-800 border border-dark-600 rounded-xl p-1 mb-4 overflow-x-auto">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`tab-btn whitespace-nowrap px-2 ${tab === t.key ? 'tab-active' : 'tab-inactive'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'alergare' && <AlergareTab session={session} />}
      {tab === 'forta' && <FortaTab session={session} />}
      {tab === 'calendar' && <CalendarTab session={session} />}
      {tab === 'statistici' && <StatisticiTab session={session} />}
    </div>
  )
}