import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import ProgressRing from '../components/ProgressRing'
import Modal from '../components/Modal'

function getToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

const dayNames = ['Duminică','Luni','Marți','Miercuri','Joi','Vineri','Sâmbătă']
const monthNames = ['ian','feb','mar','apr','mai','iun','iul','aug','sep','oct','nov','dec']

function MacroBar({ label, value, max, color }) {
  const pct = Math.min((value / max) * 100, 100)
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-slate-400">{label}</span>
        <span className="text-slate-300 font-medium">{Math.round(value)}g / {max}g</span>
      </div>
      <div className="h-2 bg-dark-700 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

// ─── WATER ────────────────────────────────────────────

function WaterCard({ session, targets }) {
  const today = getToday()
  const [water, setWater] = useState(0)
  const [logs, setLogs] = useState([]) // individual log entries
  const [showLog, setShowLog] = useState(false)

  useEffect(() => { loadWater() }, [])

  async function loadWater() {
    const { data } = await supabase.from('water_logs').select('id, amount_ml, created_at')
      .eq('user_id', session.user.id).eq('date', today).order('created_at')
    setLogs(data || [])
    setWater((data || []).reduce((s, r) => s + r.amount_ml, 0))
  }

  async function addWater(amount) {
    await supabase.from('water_logs').insert({ user_id: session.user.id, date: today, amount_ml: amount })
    loadWater()
  }

  async function removeWaterLog(id, amount) {
    await supabase.from('water_logs').delete().eq('id', id)
    setWater(w => Math.max(0, w - amount))
    setLogs(prev => prev.filter(l => l.id !== id))
  }

  const pct = Math.min((water / (targets.water_ml || 2000)) * 100, 100)

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">💧</span>
          <div>
            <p className="text-sm font-semibold text-white">Apă</p>
            <p className="text-xs text-slate-400">{water}ml / {targets.water_ml || 2000}ml</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-20 h-2 bg-dark-700 rounded-full overflow-hidden">
            <div className="h-full bg-brand-blue rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
          {logs.length > 0 && (
            <button onClick={() => setShowLog(true)}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
              {logs.length} ✕
            </button>
          )}
        </div>
      </div>

      {/* Add buttons */}
      <div className="flex gap-2">
        {[150, 250, 350, 500].map(ml => (
          <button key={ml} onClick={() => addWater(ml)}
            className="flex-1 py-2 bg-dark-700 hover:bg-brand-blue/20 text-slate-300 hover:text-brand-blue rounded-xl text-xs font-medium transition-all">
            +{ml}
          </button>
        ))}
      </div>

      {/* Log modal — undo entries */}
      <Modal open={showLog} onClose={() => setShowLog(false)} title="Istoric apă azi">
        <div className="space-y-2">
          {logs.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-4">Nicio înregistrare.</p>
          ) : (
            logs.map(log => (
              <div key={log.id} className="flex items-center justify-between bg-dark-700 rounded-xl px-3 py-2.5">
                <div>
                  <span className="text-sm font-medium text-white">{log.amount_ml} ml</span>
                  <span className="text-xs text-slate-500 ml-2">
                    {new Date(log.created_at).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <button onClick={() => removeWaterLog(log.id, log.amount_ml)}
                  className="text-xs bg-red-500/20 text-red-400 px-2.5 py-1 rounded-lg hover:bg-red-500/30 transition-colors">
                  Șterge
                </button>
              </div>
            ))
          )}
        </div>
      </Modal>
    </div>
  )
}

// ─── SUPPLEMENTS ─────────────────────────────────────

function SupplementsCard({ session }) {
  const today = getToday()
  const [supplements, setSupplements] = useState([])
  const [logs, setLogs] = useState({}) // { supplement_id: {id, taken} }
  const [showManage, setShowManage] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [form, setForm] = useState({ name: '', amount_g: '', unit: 'g' })
  const [editItem, setEditItem] = useState(null)

  const UNITS = ['g', 'mg', 'ml', 'capsule', 'tabletă', 'linguriță']

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    const { data: sups } = await supabase.from('daily_supplements')
      .select('*').eq('user_id', session.user.id).order('created_at')
    setSupplements(sups || [])

    if (sups?.length) {
      const { data: logData } = await supabase.from('supplement_logs')
        .select('*').eq('user_id', session.user.id).eq('date', today)
      const logMap = {}
      ;(logData || []).forEach(l => { logMap[l.supplement_id] = l })
      setLogs(logMap)
    }
  }

  async function toggleTaken(sup) {
    const existing = logs[sup.id]
    if (existing) {
      // toggle taken
      await supabase.from('supplement_logs').update({ taken: !existing.taken }).eq('id', existing.id)
      setLogs(prev => ({ ...prev, [sup.id]: { ...existing, taken: !existing.taken } }))
    } else {
      // create log
      const { data } = await supabase.from('supplement_logs').insert({
        user_id: session.user.id, supplement_id: sup.id, date: today, taken: true
      }).select().single()
      setLogs(prev => ({ ...prev, [sup.id]: data }))
    }
  }

  async function saveSupplement() {
    if (!form.name) return
    const data = { user_id: session.user.id, name: form.name, amount_g: parseFloat(form.amount_g) || 0, unit: form.unit }
    if (editItem) await supabase.from('daily_supplements').update(data).eq('id', editItem.id)
    else await supabase.from('daily_supplements').insert(data)
    setForm({ name: '', amount_g: '', unit: 'g' }); setShowAddForm(false); setEditItem(null)
    loadAll()
  }

  async function deleteSupplement(id) {
    if (confirm('Ștergi suplimentul?')) {
      await supabase.from('daily_supplements').delete().eq('id', id)
      loadAll()
    }
  }

  function openEdit(s) {
    setForm({ name: s.name, amount_g: String(s.amount_g), unit: s.unit })
    setEditItem(s); setShowAddForm(true)
  }

  const takenCount = supplements.filter(s => logs[s.id]?.taken).length

  function closeManage() {
    setShowManage(false); setShowAddForm(false); setEditItem(null)
    setForm({ name: '', amount_g: '', unit: 'g' })
  }

  const modal = (
    <Modal open={showManage} onClose={closeManage} title="Gestionează suplimente">
      {!showAddForm ? (
        <div className="space-y-3">
          <button onClick={() => setShowAddForm(true)} className="btn-primary w-full py-3">+ Supliment nou</button>
          <div className="space-y-2">
            {supplements.map(s => (
              <div key={s.id} className="flex items-center justify-between bg-dark-700 rounded-xl px-3 py-2.5">
                <div>
                  <p className="text-sm text-white font-medium">{s.name}</p>
                  <p className="text-xs text-slate-400">{s.amount_g} {s.unit} / zi</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => openEdit(s)} className="text-xs bg-dark-600 text-slate-300 px-2 py-1.5 rounded-lg hover:bg-dark-500">✏️</button>
                  <button onClick={() => deleteSupplement(s.id)} className="text-xs bg-red-500/10 text-red-400 px-2 py-1.5 rounded-lg hover:bg-red-500/20">🗑</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-400 block mb-1">Nume supliment</label>
            <input className="input" placeholder="ex: Creatină, Colagen, Vitamina D..."
              value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Cantitate</label>
              <input className="input" type="number" step="0.1" placeholder="5"
                value={form.amount_g} onChange={e => setForm(p => ({ ...p, amount_g: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Unitate</label>
              <select className="input" value={form.unit} onChange={e => setForm(p => ({ ...p, unit: e.target.value }))}>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setShowAddForm(false); setEditItem(null); setForm({ name: '', amount_g: '', unit: 'g' }) }}
              className="btn-ghost flex-1 py-3">← Înapoi</button>
            <button onClick={saveSupplement} className="btn-primary flex-1 py-3">
              {editItem ? 'Salvează' : 'Adaugă'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )

  if (supplements.length === 0) {
    return (
      <div className="card">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl">💊</span>
          <p className="text-sm font-semibold text-white">Suplimente zilnice</p>
        </div>
        <p className="text-xs text-slate-500 mb-3">Adaugă suplimentele pe care le iei zilnic.</p>
        <button onClick={() => { setShowManage(true); setShowAddForm(true) }} className="btn-ghost w-full py-2.5 text-sm">
          + Adaugă primul supliment
        </button>
        {modal}
      </div>
    )
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">💊</span>
          <div>
            <p className="text-sm font-semibold text-white">Suplimente</p>
            <p className="text-xs text-slate-400">{takenCount} / {supplements.length} luate azi</p>
          </div>
        </div>
        <button onClick={() => setShowManage(true)}
          className="text-xs bg-dark-700 text-slate-400 hover:text-white px-2.5 py-1 rounded-lg hover:bg-dark-600 transition-colors">
          ⚙️ Gestionează
        </button>
      </div>

      <div className="h-1.5 bg-dark-700 rounded-full overflow-hidden mb-3">
        <div className="h-full bg-brand-pink rounded-full transition-all duration-500"
          style={{ width: `${(takenCount / supplements.length) * 100}%` }} />
      </div>

      <div className="space-y-2">
        {supplements.map(s => {
          const taken = logs[s.id]?.taken === true
          return (
            <button key={s.id} onClick={() => toggleTaken(s)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left ${
                taken ? 'bg-brand-green/10 border border-brand-green/30' : 'bg-dark-700 hover:bg-dark-600'
              }`}>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                taken ? 'bg-brand-green border-brand-green' : 'border-slate-600'
              }`}>
                {taken && <span className="text-dark-900 text-xs font-bold">✓</span>}
              </div>
              <div className="flex-1">
                <p className={`text-sm font-medium ${taken ? 'text-brand-green' : 'text-slate-200'}`}>{s.name}</p>
                <p className="text-xs text-slate-500">{s.amount_g} {s.unit}</p>
              </div>
              {taken && <span className="text-xs text-brand-green">✅ Luat</span>}
            </button>
          )
        })}
      </div>

      {modal}
    </div>
  )
}

// ─── MAIN DASHBOARD ───────────────────────────────────

export default function Dashboard({ session }) {
  const navigate = useNavigate()
  const today = getToday()
  const [targets, setTargets] = useState({ calories: 2000, protein_g: 150, carbs_g: 250, fat_g: 65, water_ml: 2000 })
  const [todayNutrition, setTodayNutrition] = useState({ calories: 0, protein: 0, carbs: 0, fat: 0 })
  const [weight, setWeight] = useState(null)
  const [todayWorkouts, setTodayWorkouts] = useState([])
  const [lastWorkouts, setLastWorkouts] = useState([])
  const [caloriesBurned, setCaloriesBurned] = useState(0)
  const [loading, setLoading] = useState(true)

  const now = new Date()
  const dateStr = `${dayNames[now.getDay()]}, ${now.getDate()} ${monthNames[now.getMonth()]}`
  const greet = () => {
    const h = now.getHours()
    if (h < 12) return 'Bună dimineața'
    if (h < 18) return 'Bună ziua'
    return 'Bună seara'
  }

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const uid = session.user.id

    const { data: t } = await supabase.from('user_targets').select('*').eq('user_id', uid).single()
    if (t) setTargets(t)

    const { data: meals } = await supabase.from('meal_logs').select(`
      id, meal_items(quantity_g, foods(calories, protein, carbs, fat))
    `).eq('user_id', uid).eq('date', today)
    if (meals) {
      let cal = 0, prot = 0, carb = 0, fat = 0
      meals.forEach(m => {
        m.meal_items?.forEach(item => {
          const f = item.foods; const ratio = item.quantity_g / 100
          cal += (f?.calories || 0) * ratio; prot += (f?.protein || 0) * ratio
          carb += (f?.carbs || 0) * ratio; fat += (f?.fat || 0) * ratio
        })
      })
      setTodayNutrition({ calories: cal, protein: prot, carbs: carb, fat })
    }

    const { data: wg } = await supabase.from('weight_logs').select('weight_kg').eq('user_id', uid).order('date', { ascending: false }).limit(1)
    if (wg?.[0]) setWeight(wg[0].weight_kg)

    const { data: wo } = await supabase.from('workout_logs').select('id, name, type, date').eq('user_id', uid).eq('date', today)
    if (wo) setTodayWorkouts(wo)

    // Dacă nu e niciun antrenament azi, ia ultimele (incluzând alergări)
    if (!wo || wo.length === 0) {
      const [{ data: lastWo }, { data: lastRuns }] = await Promise.all([
        supabase.from('workout_logs').select('id, name, type, date')
          .eq('user_id', uid).lt('date', today).order('date', { ascending: false }).limit(3),
        supabase.from('running_logs').select('id, distance_km, duration_min, date')
          .eq('user_id', uid).lt('date', today).order('date', { ascending: false }).limit(3),
      ])
      const combined = [
        ...(lastWo || []).map(w => ({ ...w, _kind: 'workout' })),
        ...(lastRuns || []).map(r => ({ ...r, name: `${r.distance_km} km alergare`, type: 'running', _kind: 'run' })),
      ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3)
      if (combined.length) setLastWorkouts(combined)
    }

    // ── Calorii arse ──────────────────────────────────
    // Alergări azi — 60 kcal/km estimare (MET 8 ~= 60 kcal/km indiferent de greutate ca aproximație)
    const { data: runs } = await supabase.from('running_logs').select('distance_km, duration_min').eq('user_id', uid).eq('date', today)
    let burned = 0
    ;(runs || []).forEach(r => { burned += (r.distance_km || 0) * 60 })

    // Antrenamente forță azi — 300 kcal/sesiune estimare
    const strengthCount = (wo || []).filter(w => w.type === 'strength').length
    burned += strengthCount * 300

    // Dacă are Strava conectat, încearcă să ia date mai precise
    // (strava_sync returnează activitățile dar nu stocăm calorii direct în DB)
    // Folosim estimările de mai sus care sunt deja acurate pentru alergare

    setCaloriesBurned(Math.round(burned))
    setLoading(false)
  }

  const netCalories = Math.round(todayNutrition.calories) - caloriesBurned

  return (
    <div className="page fade-in">
      {/* Header */}
      <div className="mb-6">
        <p className="text-slate-400 text-sm">{dateStr}</p>
        <h1 className="text-2xl font-bold text-white">{greet()} 👋</h1>
      </div>

      {/* Calorie ring + macros */}
      <div className="card mb-3 cursor-pointer" onClick={() => navigate('/nutritie')}>
        <div className="flex items-center gap-4">
          <ProgressRing value={todayNutrition.calories} max={targets.calories}
            size={100} strokeWidth={9} color="#4ade80" showTarget={true} />
          <div className="flex-1 space-y-2.5">
            <MacroBar label="Proteine" value={todayNutrition.protein} max={targets.protein_g} color="#60a5fa" />
            <MacroBar label="Carbohidrați" value={todayNutrition.carbs} max={targets.carbs_g} color="#fb923c" />
            <MacroBar label="Grăsimi" value={todayNutrition.fat} max={targets.fat_g} color="#a78bfa" />
          </div>
        </div>

        {/* Calorii consumate + arse + net */}
        <div className="mt-3 pt-3 border-t border-dark-600 space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">🍽️ Consumate</span>
            <span className="text-brand-green font-semibold">{Math.round(todayNutrition.calories)} / {targets.calories} kcal</span>
          </div>
          {caloriesBurned > 0 && (
            <>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">🔥 Arse (activitate)</span>
                <span className="text-brand-orange font-semibold">−{caloriesBurned} kcal</span>
              </div>
              <div className="flex justify-between text-xs pt-1 border-t border-dark-700">
                <span className="text-slate-300 font-medium">⚖️ Net</span>
                <span className={`font-bold ${netCalories < 0 ? 'text-brand-blue' : 'text-white'}`}>
                  {netCalories > 0 ? '+' : ''}{netCalories} kcal
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Water */}
      <div className="mb-3">
        <WaterCard session={session} targets={targets} />
      </div>

      {/* Supplements */}
      <div className="mb-3">
        <SupplementsCard session={session} />
      </div>

      {/* Weight */}
      <div className="card mb-3 flex items-center justify-between cursor-pointer" onClick={() => navigate('/profil')}>
        <div className="flex items-center gap-3">
          <span className="text-xl">⚖️</span>
          <div>
            <p className="text-sm font-semibold text-white">Greutate</p>
            <p className="text-xs text-slate-400">Ultima măsurătoare</p>
          </div>
        </div>
        <span className="text-2xl font-bold text-white">{weight ? `${weight} kg` : '—'}</span>
      </div>

      {/* Sport */}
      <div className="card cursor-pointer" onClick={() => navigate('/sport')}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-white">
            {todayWorkouts.length > 0 ? 'Antrenamente azi' : 'Ultimele antrenamente'}
          </h2>
          <span className="text-xs text-brand-green">→ Sport</span>
        </div>
        {todayWorkouts.length > 0 ? (
          <div className="space-y-2">
            {todayWorkouts.map(w => (
              <div key={w.id} className="flex items-center gap-2 bg-dark-700 rounded-xl px-3 py-2">
                <span>{w.type === 'running' ? '🏃' : '🏋️'}</span>
                <span className="text-sm text-slate-200">{w.name}</span>
              </div>
            ))}
          </div>
        ) : lastWorkouts.length > 0 ? (
          <div className="space-y-2">
            {lastWorkouts.map(w => (
              <div key={w.id} className="flex items-center gap-2 bg-dark-700 rounded-xl px-3 py-2">
                <span>{w.type === 'running' ? '🏃' : '🏋️'}</span>
                <div className="flex-1">
                  <span className="text-sm text-slate-200">{w.name}</span>
                  <span className="text-xs text-slate-500 ml-2">
                    {new Date(w.date + 'T12:00:00').toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-slate-500 text-sm text-center py-2">Niciun antrenament înregistrat încă</p>
        )}
      </div>
    </div>
  )
}