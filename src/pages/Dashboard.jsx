import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import ProgressRing from '../components/ProgressRing'
import Modal from '../components/Modal'

function getToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

// ─── SHOPPING LIST CARD ───────────────────────────────

function ShoppingListCard({ session }) {
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [showAddFood, setShowAddFood] = useState(false)
  const [selectedItem, setSelectedItem] = useState(null)
  const [foodForm, setFoodForm] = useState({ quantity: '', unit: 'g', calories: '', protein: '', carbs: '', fat: '' })
  const [saving, setSaving] = useState(false)

  const [allFoods, setAllFoods] = useState([])

  useEffect(() => {
    load()
    supabase.from('foods').select('id,name,calories,protein,carbs,fat').order('name')
      .then(({ data }) => setAllFoods(data || []))
  }, [])

  async function load() {
    const { data } = await supabase.from('pantry_items')
      .select('*').eq('user_id', session.user.id).eq('list_type', 'shopping')
      .order('created_at', { ascending: false })
    setItems(data || [])
  }

  async function check(item) {
    // Look up nutrition from foods DB if item doesn't have it
    const linked = allFoods.find(f =>
      f.id === item.food_id || f.name.toLowerCase() === item.name.toLowerCase()
    )
    const cal = item.calories || linked?.calories || null
    if (!cal) {
      // No nutrition anywhere — open modal to add
      setSelectedItem(item)
      setFoodForm({ calories: '', protein: '', carbs: '', fat: '' })
      setShowAddFood(true)
    } else {
      // Has nutrition (or found in DB) — open modal pre-filled
      setSelectedItem(item)
      setFoodForm({
        quantity: String(item.quantity || ''),
        unit: item.unit || 'g',
        calories: String(cal || ''),
        protein: String(item.protein || linked?.protein || ''),
        carbs: String(item.carbs || linked?.carbs || ''),
        fat: String(item.fat || linked?.fat || ''),
      })
      setShowAddFood(true)
    }
  }

  async function moveToStock(item) {
    console.log('Dashboard moveToStock:', item.id, item.name)
    const { data, error } = await supabase.from('pantry_items')
      .update({ list_type: 'stock', checked: false })
      .eq('id', item.id).eq('user_id', session.user.id).select()
    console.log('Dashboard moveToStock result:', { data, error })
    if (error) { alert('Eroare: ' + error.message); return }
    if (!data || data.length === 0) { alert('Update fără efect — verifică SQL:\nALTER TABLE pantry_items ENABLE ROW LEVEL SECURITY;\nDROP POLICY IF EXISTS "own pantry" ON pantry_items;\nCREATE POLICY "own pantry" ON pantry_items FOR ALL USING (auth.uid() = user_id);'); return }
    if (item.calories) {
      await supabase.from('foods').upsert({
        user_id: session.user.id, user_email: session.user.email,
        name: item.name, calories: item.calories || 0,
        protein: item.protein || 0, carbs: item.carbs || 0, fat: item.fat || 0,
      }, { onConflict: 'name', ignoreDuplicates: true })
    }
    load()
  }

  async function saveAndMove() {
    if (!selectedItem) return
    setSaving(true)
    const cal = parseFloat(foodForm.calories) || 0
    const { data, error } = await supabase.from('pantry_items').update({
      quantity: parseFloat(foodForm.quantity) || 0,
      unit: foodForm.unit,
      calories: cal, protein: parseFloat(foodForm.protein) || 0,
      carbs: parseFloat(foodForm.carbs) || 0, fat: parseFloat(foodForm.fat) || 0,
      list_type: 'stock',
    }).eq('id', selectedItem.id).eq('user_id', session.user.id).select()
    console.log('Dashboard saveAndMove result:', { data, error })
    if (error) { alert('Eroare: ' + error.message); setSaving(false); return }
    if (cal > 0) {
      await supabase.from('foods').insert({
        user_id: session.user.id, user_email: session.user.email,
        name: selectedItem.name, calories: cal,
        protein: parseFloat(foodForm.protein) || 0,
        carbs: parseFloat(foodForm.carbs) || 0,
        fat: parseFloat(foodForm.fat) || 0,
      })
    }
    setSaving(false); setShowAddFood(false); setSelectedItem(null); load()
  }

  if (items.length === 0) return null

  return (
    <div className="card mt-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">🛒</span>
          <div>
            <p className="text-sm font-semibold text-white">Lista de cumpărături</p>
            <p className="text-xs text-slate-400">{items.length} produse</p>
          </div>
        </div>
        <button onClick={() => navigate('/camara')} className="text-xs text-brand-green">→ Cămară</button>
      </div>

      <div className="space-y-2">
        {items.slice(0, 5).map(item => (
          <button key={item.id} onClick={() => check(item)}
            className="w-full flex items-center gap-3 bg-dark-700 hover:bg-dark-600 rounded-xl px-3 py-2.5 transition-all text-left">
            <div className="w-5 h-5 rounded-full border-2 border-slate-600 hover:border-brand-green shrink-0" />
            <div className="flex-1">
              <p className="text-sm text-white">{item.name}</p>
              {item.quantity > 0 && <p className="text-xs text-slate-500">{item.quantity} {item.unit}</p>}
            </div>
            {!item.calories && <span className="text-xs text-slate-600">+ info</span>}
          </button>
        ))}
        {items.length > 5 && (
          <button onClick={() => navigate('/camara')} className="w-full text-xs text-slate-500 hover:text-slate-300 py-1.5 text-center">
            + {items.length - 5} produse → Cămară
          </button>
        )}
      </div>

      <Modal open={showAddFood} onClose={() => setShowAddFood(false)} title={`🛒 ${selectedItem?.name || ''} → Stoc`}>
        <div className="space-y-3">
          {foodForm.calories
            ? <p className="text-xs text-brand-green">✓ Valori nutriționale găsite — verifică și confirmă</p>
            : <p className="text-xs text-slate-400">Completează detalii și mută în stoc:</p>
          }
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Cantitate cumpărată</label>
              <input className="input" type="number" placeholder="ex: 500" value={foodForm.quantity}
                onChange={e => setFoodForm(p => ({ ...p, quantity: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Unitate</label>
              <select className="input" value={foodForm.unit} onChange={e => setFoodForm(p => ({ ...p, unit: e.target.value }))}>
                {['g','kg','ml','l','bucăți','linguriță','lingură','cutie','pachet'].map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { k: 'calories', l: 'Calorii (kcal/100g)' },
              { k: 'protein', l: 'Proteine (g/100g)' },
              { k: 'carbs', l: 'Carbohidrați (g/100g)' },
              { k: 'fat', l: 'Grăsimi (g/100g)' },
            ].map(f => (
              <div key={f.k}>
                <label className="text-xs text-slate-500 block mb-1">{f.l}</label>
                <input className="input" type="number" placeholder="0" value={foodForm[f.k]}
                  onChange={e => setFoodForm(p => ({ ...p, [f.k]: e.target.value }))} />
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={() => moveToStock(selectedItem).then(() => setShowAddFood(false))}
              className="btn-ghost flex-1 py-3 text-sm">Sări peste</button>
            <button onClick={saveAndMove} disabled={saving || !foodForm.calories}
              className="btn-primary flex-1 py-3 disabled:opacity-50">
              {saving ? 'Se salvează...' : '📦 Mută în stoc'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}


const dayNames = ['Duminică','Luni','Marți','Miercuri','Joi','Vineri','Sâmbătă']
const monthNames = ['ian','feb','mar','apr','mai','iun','iul','aug','sep','oct','nov','dec']
const TYPE_ICON = { running: '🏃', strength: '🏋️', cycling: '🚴', other: '⚡', task: '✅', medical: '🏥', wellness: '🧘', nutrition: '🥗' }
const WEEKDAY_LABELS = ['Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ', 'Du']

function getTodayWeekday() {
  const d = new Date().getDay()
  return d === 0 ? 6 : d - 1
}

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
  const [logs, setLogs] = useState([])
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
            <button onClick={() => setShowLog(true)} className="text-xs text-slate-500 hover:text-slate-300">{logs.length} ✕</button>
          )}
        </div>
      </div>
      <div className="flex gap-2">
        {[150, 250, 350, 500].map(ml => (
          <button key={ml} onClick={() => addWater(ml)}
            className="flex-1 py-2 bg-dark-700 hover:bg-brand-blue/20 text-slate-300 hover:text-brand-blue rounded-xl text-xs font-medium transition-all">
            +{ml}
          </button>
        ))}
      </div>
      <Modal open={showLog} onClose={() => setShowLog(false)} title="Istoric apă azi">
        <div className="space-y-2">
          {logs.map(log => (
            <div key={log.id} className="flex items-center justify-between bg-dark-700 rounded-xl px-3 py-2.5">
              <div>
                <span className="text-sm font-medium text-white">{log.amount_ml} ml</span>
                <span className="text-xs text-slate-500 ml-2">
                  {new Date(log.created_at).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <button onClick={() => removeWaterLog(log.id, log.amount_ml)}
                className="text-xs bg-red-500/20 text-red-400 px-2.5 py-1 rounded-lg hover:bg-red-500/30">Șterge</button>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  )
}

// ─── SUPPLEMENTS ─────────────────────────────────────

function SupplementsCard({ session }) {
  const today = getToday()
  const [supplements, setSupplements] = useState([])
  const [logs, setLogs] = useState({})
  const [showManage, setShowManage] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [form, setForm] = useState({ name: '', amount_g: '', unit: 'g', calories: '', protein_g: '', carbs_g: '', fat_g: '' })
  const [editItem, setEditItem] = useState(null)
  const [showMacros, setShowMacros] = useState(false)
  const UNITS = ['g', 'mg', 'ml', 'capsule', 'tabletă', 'linguriță']

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    const { data: sups } = await supabase.from('daily_supplements').select('*').eq('user_id', session.user.id).order('created_at')
    setSupplements(sups || [])
    if (sups?.length) {
      const { data: logData } = await supabase.from('supplement_logs').select('*').eq('user_id', session.user.id).eq('date', today)
      const logMap = {}
      ;(logData || []).forEach(l => { logMap[l.supplement_id] = l })
      setLogs(logMap)
    }
  }

  async function toggleTaken(sup) {
    const existing = logs[sup.id]
    if (existing) {
      const newDone = !existing.taken
      await supabase.from('supplement_logs').update({ taken: newDone }).eq('id', existing.id)
      setLogs(prev => ({ ...prev, [sup.id]: { ...existing, taken: newDone } }))
    } else {
      const { data } = await supabase.from('supplement_logs').insert({ user_id: session.user.id, supplement_id: sup.id, date: today, taken: true }).select().single()
      setLogs(prev => ({ ...prev, [sup.id]: data }))
    }
  }

  async function saveSupplement() {
    if (!form.name) return
    const data = {
      user_id: session.user.id,
      name: form.name,
      amount_g: parseFloat(form.amount_g) || 0,
      unit: form.unit,
      calories:  parseFloat(form.calories)  || 0,
      protein_g: parseFloat(form.protein_g) || 0,
      carbs_g:   parseFloat(form.carbs_g)   || 0,
      fat_g:     parseFloat(form.fat_g)     || 0,
    }
    if (editItem) await supabase.from('daily_supplements').update(data).eq('id', editItem.id)
    else await supabase.from('daily_supplements').insert(data)
    setForm({ name: '', amount_g: '', unit: 'g', calories: '', protein_g: '', carbs_g: '', fat_g: '' })
    setShowAddForm(false); setEditItem(null); setShowMacros(false); loadAll()
  }

  async function deleteSupplement(id) {
    if (confirm('Ștergi suplimentul?')) { await supabase.from('daily_supplements').delete().eq('id', id); loadAll() }
  }

  function openEdit(s) {
    setForm({ name: s.name, amount_g: String(s.amount_g), unit: s.unit, calories: String(s.calories || ''), protein_g: String(s.protein_g || ''), carbs_g: String(s.carbs_g || ''), fat_g: String(s.fat_g || '') })
    setEditItem(s); setShowAddForm(true)
    setShowMacros(!!(s.calories || s.protein_g || s.carbs_g || s.fat_g))
  }
  function closeManage() { setShowManage(false); setShowAddForm(false); setEditItem(null); setForm({ name: '', amount_g: '', unit: 'g', calories: '', protein_g: '', carbs_g: '', fat_g: '' }); setShowMacros(false) }
  const takenCount = supplements.filter(s => logs[s.id]?.taken).length

  const modal = (
    <Modal open={showManage} onClose={closeManage} title="Suplimente">
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
                  <button onClick={() => openEdit(s)} className="text-xs bg-dark-600 text-slate-300 px-2 py-1.5 rounded-lg">✏️</button>
                  <button onClick={() => deleteSupplement(s.id)} className="text-xs bg-red-500/10 text-red-400 px-2 py-1.5 rounded-lg">🗑</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-400 block mb-1">Nume</label>
            <input className="input" placeholder="ex: Creatină, Colagen..." value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Cantitate</label>
              <input className="input" type="number" step="0.1" value={form.amount_g} onChange={e => setForm(p => ({ ...p, amount_g: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Unitate</label>
              <select className="input" value={form.unit} onChange={e => setForm(p => ({ ...p, unit: e.target.value }))}>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          {/* Optional macros */}
          <button onClick={() => setShowMacros(p => !p)}
            className="w-full text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1.5 py-1 transition-colors">
            <span>{showMacros ? '▾' : '▸'}</span>
            <span>Macronutrienți opționali (calorii, proteine etc.)</span>
          </button>
          {showMacros && (
            <div className="bg-dark-700 rounded-xl p-3 space-y-2">
              <p className="text-xs text-slate-500">Valorile per doză (per cantitate de mai sus)</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { k: 'calories',  l: '🔥 Calorii (kcal)' },
                  { k: 'protein_g', l: '💪 Proteine (g)' },
                  { k: 'carbs_g',   l: '🌾 Carbohidrați (g)' },
                  { k: 'fat_g',     l: '🥑 Grăsimi (g)' },
                ].map(f => (
                  <div key={f.k}>
                    <label className="text-xs text-slate-400 block mb-1">{f.l}</label>
                    <input className="input" type="number" step="0.1" placeholder="0"
                      value={form[f.k]} onChange={e => setForm(p => ({ ...p, [f.k]: e.target.value }))} />
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={() => { setShowAddForm(false); setEditItem(null); setShowMacros(false) }} className="btn-ghost flex-1 py-3">← Înapoi</button>
            <button onClick={saveSupplement} className="btn-primary flex-1 py-3">{editItem ? 'Salvează' : 'Adaugă'}</button>
          </div>
        </div>
      )}
    </Modal>
  )

  if (supplements.length === 0) return (
    <div className="card">
      <div className="flex items-center gap-2 mb-2"><span className="text-xl">💊</span><p className="text-sm font-semibold text-white">Suplimente zilnice</p></div>
      <p className="text-xs text-slate-500 mb-3">Adaugă suplimentele pe care le iei zilnic.</p>
      <button onClick={() => { setShowManage(true); setShowAddForm(true) }} className="btn-ghost w-full py-2.5 text-sm">+ Adaugă primul supliment</button>
      {modal}
    </div>
  )

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">💊</span>
          <div><p className="text-sm font-semibold text-white">Suplimente</p><p className="text-xs text-slate-400">{takenCount} / {supplements.length} luate azi</p></div>
        </div>
        <button onClick={() => setShowManage(true)} className="text-xs bg-dark-700 text-slate-400 hover:text-white px-2.5 py-1 rounded-lg">⚙️ Gestionează</button>
      </div>
      <div className="h-1.5 bg-dark-700 rounded-full overflow-hidden mb-3">
        <div className="h-full bg-brand-pink rounded-full transition-all duration-500" style={{ width: `${(takenCount / supplements.length) * 100}%` }} />
      </div>
      <div className="space-y-2">
        {supplements.map(s => {
          const taken = logs[s.id]?.taken === true
          return (
            <button key={s.id} onClick={() => toggleTaken(s)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left ${taken ? 'bg-brand-green/10 border border-brand-green/30' : 'bg-dark-700 hover:bg-dark-600'}`}>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${taken ? 'bg-brand-green border-brand-green' : 'border-slate-600'}`}>
                {taken && <span className="text-dark-900 text-xs font-bold">✓</span>}
              </div>
              <div className="flex-1">
                <p className={`text-sm font-medium ${taken ? 'text-brand-green' : 'text-slate-200'}`}>{s.name}</p>
                <p className="text-xs text-slate-500">{s.amount_g} {s.unit}{s.calories > 0 ? ` · ${s.calories} kcal` : ''}</p>
              </div>
            </button>
          )
        })}
      </div>
      {modal}
    </div>
  )
}

// ─── UPCOMING WORKOUTS ────────────────────────────────

function UpcomingWorkoutsCard({ session }) {
  const today = getToday()
  const todayWeekday = getTodayWeekday()
  const navigate = useNavigate()
  const [todaySchedules, setTodaySchedules] = useState([])
  const [futureSchedules, setFutureSchedules] = useState([])
  const [logs, setLogs] = useState({})
  const [showAll, setShowAll] = useState(false)
  const [loading, setLoading] = useState(true)
  // Feedback modal
  const [feedbackItem, setFeedbackItem] = useState(null) // schedule entry
  const [feedbackForm, setFeedbackForm] = useState({ feeling: '', notes: '' })
  const [savingFb, setSavingFb] = useState(false)

  const FEELINGS = [
    { key: 'great',  label: '🔥 Excelent' },
    { key: 'good',   label: '💪 Bine' },
    { key: 'ok',     label: '😐 Ok' },
    { key: 'hard',   label: '😰 Greu' },
    { key: 'bad',    label: '😞 Rău' },
  ]

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const uid = session.user.id
    const [{ data: all }, { data: excepts }] = await Promise.all([
      supabase.from('workout_schedules').select('*').eq('user_id', uid),
      supabase.from('workout_schedule_exceptions').select('schedule_id, exception_date').eq('user_id', uid),
    ])

    const exSet = new Set((excepts || []).map(e => `${e.schedule_id}_${e.exception_date}`))

    const todayList = []
    const futureList = []

    for (let i = 0; i < 7; i++) {
      const d = new Date()
      d.setDate(d.getDate() + i)
      const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
      const wd = d.getDay() === 0 ? 6 : d.getDay() - 1

      for (const s of (all || [])) {
        // Skip if exception exists for this schedule+date
        if (exSet.has(`${s.id}_${dateStr}`)) continue

        const matches = (s.recurrence === 'once' && s.scheduled_date === dateStr) ||
                        (s.recurrence === 'weekly' && (s.weekdays || []).includes(wd))
        if (!matches) continue
        const entry = { ...s, _date: dateStr, _dayLabel: i === 0 ? 'Azi' : d.toLocaleDateString('ro-RO', { weekday: 'short', day: 'numeric', month: 'short' }) }
        if (i === 0) todayList.push(entry)
        else futureList.push(entry)
      }
    }

    setTodaySchedules(todayList)
    setFutureSchedules(futureList)

    const allEntries = [...todayList, ...futureList]
    if (allEntries.length) {
      const { data: logData } = await supabase.from('workout_schedule_logs')
        .select('*').eq('user_id', uid).in('date', [...new Set(allEntries.map(u => u._date))])
      const logMap = {}
      ;(logData || []).forEach(l => { logMap[`${l.schedule_id}_${l.date}`] = l })
      setLogs(logMap)
    }
    setLoading(false)
  }

  async function toggle(s) {
    // Block future workouts from being checked
    if (s._date !== today) return

    const uid = session.user.id
    const key = `${s.id}_${s._date}`
    const existing = logs[key]

    // If already done — just untoggle (no feedback needed)
    if (existing?.done) {
      await supabase.from('workout_schedule_logs').update({ done: false }).eq('id', existing.id)
      setLogs(prev => ({ ...prev, [key]: { ...existing, done: false } }))
      return
    }

    // Check if assigned by admin — open feedback modal
    try {
      const meta = JSON.parse(s.notes || '{}')
      if (meta.assigned_by) {
        setFeedbackItem(s)
        setFeedbackForm({ feeling: '', notes: '' })
        return
      }
    } catch {}

    // Normal toggle
    if (existing) {
      await supabase.from('workout_schedule_logs').update({ done: true }).eq('id', existing.id)
      setLogs(prev => ({ ...prev, [key]: { ...existing, done: true } }))
    } else {
      const { data } = await supabase.from('workout_schedule_logs')
        .insert({ user_id: uid, schedule_id: s.id, date: s._date, done: true }).select().single()
      setLogs(prev => ({ ...prev, [key]: data }))
    }
  }

  async function saveFeedback() {
    if (!feedbackItem || !feedbackForm.feeling) return
    setSavingFb(true)
    const uid = session.user.id
    const key = `${feedbackItem.id}_${feedbackItem._date}`
    const existing = logs[key]
    const feedbackData = { feeling: feedbackForm.feeling, notes: feedbackForm.notes }

    if (existing) {
      await supabase.from('workout_schedule_logs').update({
        done: true, feedback: JSON.stringify(feedbackData)
      }).eq('id', existing.id)
      setLogs(prev => ({ ...prev, [key]: { ...existing, done: true, feedback: JSON.stringify(feedbackData) } }))
    } else {
      const { data } = await supabase.from('workout_schedule_logs')
        .insert({ user_id: uid, schedule_id: feedbackItem.id, date: feedbackItem._date, done: true, feedback: JSON.stringify(feedbackData) })
        .select().single()
      setLogs(prev => ({ ...prev, [key]: data }))
    }
    setSavingFb(false)
    setFeedbackItem(null)
  }

  if (loading) return null

  const doneToday = todaySchedules.filter(s => logs[`${s.id}_${s._date}`]?.done).length

  const WorkoutRow = ({ s }) => {
    const done = logs[`${s.id}_${s._date}`]?.done === true
    const isFuture = s._date !== today
    const logEntry = logs[`${s.id}_${s._date}`]
    const feedback = logEntry?.feedback ? (() => { try { return JSON.parse(logEntry.feedback) } catch { return null } })() : null
    const meta = (() => { try { return JSON.parse(s.notes || '{}') } catch { return {} } })()
    const isAdminAssigned = !!meta.assigned_by

    const DIFF_COLORS = { easy: 'text-green-400', medium: 'text-yellow-400', hard: 'text-orange-400', extreme: 'text-red-400' }
    const DIFF_LABELS = { easy: '🟢', medium: '🟡', hard: '🟠', extreme: '🔴' }
    const IMP_LABEL   = meta.importance === 'important' ? '🔥' : null

    return (
      <button onClick={() => !isFuture && toggle(s)}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left
          ${isFuture ? 'opacity-50 cursor-default bg-dark-700' :
            done ? 'bg-brand-green/10 border border-brand-green/30' : 'bg-dark-700 hover:bg-dark-600'}`}>
        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0
          ${isFuture ? 'border-slate-700' : done ? 'bg-brand-green border-brand-green' : 'border-slate-600'}`}>
          {done && <span className="text-dark-900 text-xs font-bold">✓</span>}
        </div>
        <span className="text-base">{TYPE_ICON[s.type] || '⚡'}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className={`text-sm font-medium truncate ${done ? 'text-brand-green line-through' : isFuture ? 'text-slate-500' : 'text-white'}`}>{s.name}</p>
            {IMP_LABEL && <span className="text-xs shrink-0">{IMP_LABEL}</span>}
            {meta.difficulty && <span className={`text-xs shrink-0 ${DIFF_COLORS[meta.difficulty] || ''}`}>{DIFF_LABELS[meta.difficulty] || ''}</span>}
          </div>
          <div className="flex items-center gap-2 flex-wrap mt-0.5">
            {s._dayLabel !== 'Azi' && <span className="text-xs text-slate-500">{s._dayLabel}</span>}
            {meta.time && <span className="text-xs text-slate-500">⏰ {meta.time}</span>}
            {meta.distance_km && <span className="text-xs text-slate-500">📍 {meta.distance_km}km</span>}
          </div>
          {feedback && (
            <p className="text-xs text-brand-blue mt-0.5">
              {FEELINGS.find(f => f.key === feedback.feeling)?.label || feedback.feeling}
              {feedback.notes && ` · "${feedback.notes}"`}
            </p>
          )}
        </div>
        {isAdminAssigned && !done && !isFuture && (
          <span className="text-xs text-slate-500 shrink-0">💬</span>
        )}
      </button>
    )
  }


  return (
    <div className="card mb-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">📋</span>
          <div>
            <p className="text-sm font-semibold text-white">Plan azi</p>
            {todaySchedules.length > 0
              ? <p className="text-xs text-slate-400">{doneToday}/{todaySchedules.length} bifate</p>
              : <p className="text-xs text-slate-400">Niciun antrenament planificat</p>}
          </div>
        </div>
        <button onClick={() => navigate('/sport?tab=plan')} className="text-xs text-brand-green">→ Plan</button>
      </div>

      {todaySchedules.length === 0 && futureSchedules.length === 0 ? (
        <button onClick={() => navigate('/sport?tab=plan')} className="text-xs text-slate-500 hover:text-slate-300 w-full text-center py-1">
          + Adaugă antrenamente în Plan →
        </button>
      ) : (
        <div className="space-y-2">
          {todaySchedules.length > 0 ? (
            todaySchedules.map((s, i) => <WorkoutRow key={`${s.id}_${i}`} s={s} />)
          ) : (
            <p className="text-xs text-slate-500 text-center py-1">Niciun antrenament planificat azi</p>
          )}

          {futureSchedules.length > 0 && (
            <>
              <button onClick={() => setShowAll(p => !p)}
                className="w-full text-xs text-slate-500 hover:text-slate-300 py-1.5 transition-colors text-center">
                {showAll ? '▲ Ascunde zilele viitoare' : `▼ Urmează ${futureSchedules.length} antrenament${futureSchedules.length !== 1 ? 'e' : ''}`}
              </button>
              {showAll && futureSchedules.map((s, i) => <WorkoutRow key={`${s.id}_future_${i}`} s={s} />)}
            </>
          )}
        </div>
      )}

      {/* Feedback Modal */}
      {feedbackItem && (
        <div className="modal-overlay" onClick={() => setFeedbackItem(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-white mb-1">💬 Cum a fost?</h2>
            <p className="text-sm text-slate-400 mb-4">{feedbackItem.name}</p>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 block mb-2">Cum m-am simțit</label>
                <div className="grid grid-cols-5 gap-1.5">
                  {FEELINGS.map(f => (
                    <button key={f.key} onClick={() => setFeedbackForm(p => ({ ...p, feeling: f.key }))}
                      className={`py-2 rounded-xl text-xs font-medium transition-all border text-center ${feedbackForm.feeling === f.key
                        ? 'border-brand-green bg-brand-green/15 text-brand-green'
                        : 'border-dark-600 bg-dark-700 text-slate-400'}`}>
                      {f.label.split(' ')[0]}<br/>
                      <span className="text-[10px]">{f.label.split(' ')[1]}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Notițe (opțional)</label>
                <textarea className="input resize-none" rows={3}
                  placeholder="ex: Am simțit oboseală la seturi 3+, tempo bun..."
                  value={feedbackForm.notes}
                  onChange={e => setFeedbackForm(p => ({ ...p, notes: e.target.value }))} />
              </div>

              <div className="flex gap-2">
                <button onClick={() => setFeedbackItem(null)} className="btn-ghost flex-1 py-3">Anulează</button>
                <button onClick={saveFeedback} disabled={!feedbackForm.feeling || savingFb}
                  className="btn-primary flex-1 py-3 disabled:opacity-50">
                  {savingFb ? 'Se salvează...' : '✓ Gata, bifează!'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── QUOTE CARD ───────────────────────────────────────

function QuoteCard({ isAdmin }) {
  const [quote, setQuote] = useState('')
  const [editing, setEditing] = useState(false)
  const [input, setInput] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('app_settings').select('value').eq('key', 'daily_quote').single()
    if (data?.value) setQuote(data.value)
  }

  async function save() {
    await supabase.from('app_settings').upsert({ key: 'daily_quote', value: input }, { onConflict: 'key' })
    setQuote(input); setEditing(false)
  }

  if (!quote && !isAdmin) return null

  return (
    <div className="mb-5">
      {editing ? (
        <div className="bg-dark-800 border border-dark-600 rounded-xl p-3 space-y-2">
          <textarea className="input w-full text-sm resize-none" rows={2} placeholder="Scrie un citat motivațional..."
            value={input} onChange={e => setInput(e.target.value)} autoFocus />
          <div className="flex gap-2">
            <button onClick={() => setEditing(false)} className="btn-ghost flex-1 py-2 text-xs">Anulează</button>
            <button onClick={save} className="btn-primary flex-1 py-2 text-xs">Salvează</button>
          </div>
        </div>
      ) : quote ? (
        <div className="flex items-start gap-2 group">
          <p className="text-sm text-slate-400 italic flex-1">"{quote}"</p>
          {isAdmin && (
            <button onClick={() => { setInput(quote); setEditing(true) }}
              className="text-slate-600 hover:text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity text-xs shrink-0 mt-0.5">✏️</button>
          )}
        </div>
      ) : isAdmin ? (
        <button onClick={() => { setInput(''); setEditing(true) }}
          className="text-xs text-slate-600 hover:text-slate-400 transition-colors">
          + Adaugă citat zilnic
        </button>
      ) : null}
    </div>
  )
}

// ─── MAIN DASHBOARD ───────────────────────────────────

export default function Dashboard({ session, isAdmin }) {
  const navigate = useNavigate()
  const today = getToday()
  const [targets, setTargets] = useState({ calories: 2000, protein_g: 150, carbs_g: 250, fat_g: 65, water_ml: 2000 })
  const [todayNutrition, setTodayNutrition] = useState({ calories: 0, protein: 0, carbs: 0, fat: 0 })
  const [caloriesBurned, setCaloriesBurned] = useState(0)
  const [userName, setUserName] = useState('')

  const now = new Date()
  const dateStr = `${dayNames[now.getDay()]}, ${now.getDate()} ${monthNames[now.getMonth()]}`
  const greet = () => { const h = now.getHours(); if (h < 12) return 'Bună dimineața'; if (h < 18) return 'Bună ziua'; return 'Bună seara' }

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const uid = session.user.id
    const [{ data: t }, { data: pr }] = await Promise.all([
      supabase.from('user_targets').select('*').eq('user_id', uid).single(),
      supabase.from('user_profiles').select('full_name').eq('user_id', uid).single(),
    ])
    if (t) setTargets(t)
    if (pr?.full_name) setUserName(pr.full_name)

    const { data: meals } = await supabase.from('meal_logs').select('id, meal_items(quantity_g, foods(calories, protein, carbs, fat))').eq('user_id', uid).eq('date', today)
    if (meals) {
      let cal = 0, prot = 0, carb = 0, fat = 0
      meals.forEach(m => m.meal_items?.forEach(item => {
        const f = item.foods; const r = item.quantity_g / 100
        cal += (f?.calories || 0) * r; prot += (f?.protein || 0) * r
        carb += (f?.carbs || 0) * r; fat += (f?.fat || 0) * r
      }))
      setTodayNutrition({ calories: cal, protein: prot, carbs: carb, fat })
    }

    const { data: wo } = await supabase.from('workout_logs').select('id, type').eq('user_id', uid).eq('date', today)
    const { data: runs } = await supabase.from('running_logs').select('distance_km').eq('user_id', uid).eq('date', today)

    let burned = 0
    ;(runs || []).forEach(r => { burned += (r.distance_km || 0) * 60 })
    ;(wo || []).forEach(w => { if (w.type === 'strength') burned += 300; if (w.type === 'cycling') burned += 400 })
    setCaloriesBurned(Math.round(burned))
  }

  const consumed = Math.round(todayNutrition.calories)
  const netCalories = consumed - caloriesBurned
  const ringValue = Math.max(0, netCalories)

  return (
    <div className="page fade-in">
      {/* Header */}
      <div className="mb-5">
        <p className="text-slate-400 text-sm">{dateStr}</p>
        <h1 className="text-2xl font-bold text-white">
          {greet()}{userName ? `, ${userName}` : ''} 👋
        </h1>
      </div>

      {/* Citat */}
      <QuoteCard isAdmin={isAdmin} />

      {/* Calorie ring */}
      <div className="card mb-3 cursor-pointer" onClick={() => navigate('/nutritie')}>
        <div className="flex items-center gap-4">
          <ProgressRing value={ringValue} max={targets.calories} size={100} strokeWidth={9} color="#4ade80" showTarget={true} />
          <div className="flex-1 space-y-2.5">
            <MacroBar label="Proteine" value={todayNutrition.protein} max={targets.protein_g} color="#60a5fa" />
            <MacroBar label="Carbohidrați" value={todayNutrition.carbs} max={targets.carbs_g} color="#fb923c" />
            <MacroBar label="Grăsimi" value={todayNutrition.fat} max={targets.fat_g} color="#a78bfa" />
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-dark-600 space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">🍽️ Consumate</span>
            <span className="text-brand-green font-semibold">{consumed} / {targets.calories} kcal</span>
          </div>
          {caloriesBurned > 0 && (<>
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">🔥 Arse</span>
              <span className="text-brand-orange font-semibold">−{caloriesBurned} kcal</span>
            </div>
            <div className="flex justify-between text-xs pt-1 border-t border-dark-700">
              <span className="text-slate-300 font-medium">⚖️ Net</span>
              <span className={`font-bold ${netCalories < 0 ? 'text-brand-blue' : 'text-white'}`}>
                {netCalories > 0 ? '+' : ''}{netCalories} kcal
              </span>
            </div>
          </>)}
        </div>
      </div>

      {/* Antrenamente viitoare */}
      <UpcomingWorkoutsCard session={session} />

      {/* Water */}
      <div className="mb-3"><WaterCard session={session} targets={targets} /></div>

      {/* Supplements */}
      <div className="mb-3"><SupplementsCard session={session} /></div>

      {/* Shopping List */}
      <ShoppingListCard session={session} />
    </div>
  )
}
