import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Modal from '../components/Modal'

const today = new Date().toISOString().split('T')[0]
const MEAL_TYPES = [
  { key: 'breakfast', label: 'Mic dejun', emoji: '🌅' },
  { key: 'lunch', label: 'Prânz', emoji: '☀️' },
  { key: 'dinner', label: 'Cină', emoji: '🌙' },
  { key: 'snack', label: 'Gustare', emoji: '🍎' },
]

// ─── Sub-pages ───────────────────────────────────────

function AziTab({ session }) {
  const [meals, setMeals] = useState([])
  const [foods, setFoods] = useState([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [activeMealType, setActiveMealType] = useState(null)
  const [selectedFood, setSelectedFood] = useState(null)
  const [quantity, setQuantity] = useState('100')
  const [showFoodSearch, setShowFoodSearch] = useState(false)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadMeals(); loadFoods() }, [])

  async function loadMeals() {
    setLoading(true)
    const { data } = await supabase.from('meal_logs').select(`
      id, meal_type, date,
      meal_items(id, quantity_g, foods(id, name, calories, protein, carbs, fat))
    `).eq('user_id', session.user.id).eq('date', today).order('created_at')
    setMeals(data || [])
    setLoading(false)
  }

  async function loadFoods() {
    const { data } = await supabase.from('foods').select('*').eq('user_id', session.user.id).order('name')
    setFoods(data || [])
  }

  async function addMealItem() {
    if (!selectedFood || !quantity) return
    // find or create meal log for this meal type today
    let mealLog = meals.find(m => m.meal_type === activeMealType)
    if (!mealLog) {
      const { data } = await supabase.from('meal_logs').insert({
        user_id: session.user.id, date: today, meal_type: activeMealType
      }).select().single()
      mealLog = data
    }
    await supabase.from('meal_items').insert({
      meal_log_id: mealLog.id, food_id: selectedFood.id, quantity_g: parseFloat(quantity)
    })
    setShowAddModal(false)
    setSelectedFood(null)
    setQuantity('100')
    loadMeals()
  }

  async function removeItem(itemId) {
    await supabase.from('meal_items').delete().eq('id', itemId)
    loadMeals()
  }

  function calcNutrition(items) {
    return items.reduce((acc, item) => {
      const r = item.quantity_g / 100
      return {
        calories: acc.calories + (item.foods?.calories || 0) * r,
        protein: acc.protein + (item.foods?.protein || 0) * r,
        carbs: acc.carbs + (item.foods?.carbs || 0) * r,
        fat: acc.fat + (item.foods?.fat || 0) * r,
      }
    }, { calories: 0, protein: 0, carbs: 0, fat: 0 })
  }

  const totalNutrition = meals.reduce((acc, m) => {
    const n = calcNutrition(m.meal_items || [])
    return { calories: acc.calories + n.calories, protein: acc.protein + n.protein, carbs: acc.carbs + n.carbs, fat: acc.fat + n.fat }
  }, { calories: 0, protein: 0, carbs: 0, fat: 0 })

  const filteredFoods = foods.filter(f => f.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="space-y-3">
      {/* Total zi */}
      <div className="card bg-gradient-to-br from-brand-green/10 to-transparent border-brand-green/20">
        <p className="text-xs text-slate-400 mb-2">Total azi</p>
        <div className="grid grid-cols-4 gap-2 text-center">
          {[
            { label: 'kcal', value: totalNutrition.calories, color: 'text-brand-green' },
            { label: 'prot.', value: totalNutrition.protein, color: 'text-brand-blue' },
            { label: 'carb.', value: totalNutrition.carbs, color: 'text-brand-orange' },
            { label: 'grăs.', value: totalNutrition.fat, color: 'text-brand-purple' },
          ].map(item => (
            <div key={item.label}>
              <p className={`text-lg font-bold ${item.color}`}>{Math.round(item.value)}</p>
              <p className="text-xs text-slate-500">{item.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Meal sections */}
      {MEAL_TYPES.map(mt => {
        const mealLog = meals.find(m => m.meal_type === mt.key)
        const items = mealLog?.meal_items || []
        const nutr = calcNutrition(items)
        return (
          <div key={mt.key} className="card">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span>{mt.emoji}</span>
                <span className="font-semibold text-sm text-white">{mt.label}</span>
                {items.length > 0 && <span className="text-xs text-slate-400">{Math.round(nutr.calories)} kcal</span>}
              </div>
              <button onClick={() => { setActiveMealType(mt.key); setShowAddModal(true) }}
                className="w-7 h-7 rounded-lg bg-brand-green/20 text-brand-green text-lg flex items-center justify-center hover:bg-brand-green/30 transition-colors">
                +
              </button>
            </div>
            {items.length === 0 ? (
              <p className="text-slate-600 text-xs">Niciun aliment adăugat</p>
            ) : (
              <div className="space-y-1.5">
                {items.map(item => (
                  <div key={item.id} className="flex items-center justify-between bg-dark-700 rounded-xl px-3 py-2">
                    <div>
                      <p className="text-sm text-white">{item.foods?.name}</p>
                      <p className="text-xs text-slate-400">{item.quantity_g}g · {Math.round((item.foods?.calories || 0) * item.quantity_g / 100)} kcal</p>
                    </div>
                    <button onClick={() => removeItem(item.id)} className="text-slate-600 hover:text-red-400 transition-colors text-lg">×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}

      {/* Add food modal */}
      <Modal open={showAddModal} onClose={() => { setShowAddModal(false); setSelectedFood(null); setSearch('') }}
        title={`Adaugă la ${MEAL_TYPES.find(m => m.key === activeMealType)?.label || ''}`}>
        {!showFoodSearch ? (
          <div className="space-y-3">
            <button onClick={() => setShowFoodSearch(true)}
              className="w-full bg-dark-700 border border-dark-600 rounded-xl px-3 py-3 text-left text-slate-400 hover:border-brand-green/50 transition-all text-sm">
              🔍 Caută aliment...
            </button>
            {selectedFood && (
              <div className="bg-brand-green/10 border border-brand-green/20 rounded-xl p-3">
                <p className="font-semibold text-white text-sm">{selectedFood.name}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {selectedFood.calories} kcal · P:{selectedFood.protein}g · C:{selectedFood.carbs}g · G:{selectedFood.fat}g (per 100g)
                </p>
                <div className="mt-2">
                  <label className="text-xs text-slate-400 block mb-1">Cantitate (grame)</label>
                  <input className="input" type="number" value={quantity}
                    onChange={e => setQuantity(e.target.value)} placeholder="100" />
                </div>
              </div>
            )}
            <button onClick={addMealItem} disabled={!selectedFood} className="btn-primary w-full py-3">
              Adaugă aliment
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <input className="input" autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Caută aliment..." />
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {filteredFoods.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-4">Niciun aliment găsit. Adaugă din secțiunea Alimente.</p>
              ) : (
                filteredFoods.map(f => (
                  <button key={f.id} onClick={() => { setSelectedFood(f); setShowFoodSearch(false); setSearch('') }}
                    className="w-full flex justify-between items-center bg-dark-700 rounded-xl px-3 py-2.5 hover:bg-dark-600 transition-colors text-left">
                    <span className="text-sm text-white">{f.name}</span>
                    <span className="text-xs text-slate-400">{f.calories} kcal/100g</span>
                  </button>
                ))
              )}
            </div>
            <button onClick={() => { setShowFoodSearch(false); setSearch('') }} className="btn-ghost w-full">← Înapoi</button>
          </div>
        )}
      </Modal>
    </div>
  )
}

function AlimenteTab({ session }) {
  const [foods, setFoods] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editFood, setEditFood] = useState(null)
  const [form, setForm] = useState({ name: '', calories: '', protein: '', carbs: '', fat: '' })
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadFoods() }, [])

  async function loadFoods() {
    setLoading(true)
    const { data } = await supabase.from('foods').select('*').eq('user_id', session.user.id).order('name')
    setFoods(data || [])
    setLoading(false)
  }

  function openAdd() {
    setForm({ name: '', calories: '', protein: '', carbs: '', fat: '' })
    setEditFood(null)
    setShowModal(true)
  }

  function openEdit(f) {
    setForm({ name: f.name, calories: String(f.calories), protein: String(f.protein), carbs: String(f.carbs), fat: String(f.fat) })
    setEditFood(f)
    setShowModal(true)
  }

  async function saveFood() {
    if (!form.name || !form.calories) return
    const data = {
      user_id: session.user.id,
      name: form.name,
      calories: parseFloat(form.calories),
      protein: parseFloat(form.protein) || 0,
      carbs: parseFloat(form.carbs) || 0,
      fat: parseFloat(form.fat) || 0,
    }
    if (editFood) {
      await supabase.from('foods').update(data).eq('id', editFood.id)
    } else {
      await supabase.from('foods').insert(data)
    }
    setShowModal(false)
    loadFoods()
  }

  async function deleteFood(id) {
    if (confirm('Ștergi alimentul?')) {
      await supabase.from('foods').delete().eq('id', id)
      loadFoods()
    }
  }

  return (
    <div className="space-y-3">
      <button onClick={openAdd} className="btn-primary w-full py-3">+ Adaugă aliment nou</button>

      {loading ? <p className="text-slate-500 text-center text-sm py-4">Se încarcă...</p> :
        foods.length === 0 ? (
          <div className="card text-center py-8">
            <p className="text-4xl mb-2">🥦</p>
            <p className="text-slate-400 text-sm">Niciun aliment adăugat încă.</p>
            <p className="text-slate-500 text-xs mt-1">Adaugă alimente cu valorile lor nutriționale.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {foods.map(f => (
              <div key={f.id} className="card flex items-center justify-between">
                <div className="flex-1">
                  <p className="font-semibold text-sm text-white">{f.name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {f.calories} kcal · P:{f.protein}g · C:{f.carbs}g · G:{f.fat}g
                    <span className="text-slate-600"> /100g</span>
                  </p>
                </div>
                <div className="flex gap-2 ml-3">
                  <button onClick={() => openEdit(f)} className="text-xs bg-dark-700 text-slate-300 px-2.5 py-1.5 rounded-lg hover:bg-dark-600 transition-colors">✏️</button>
                  <button onClick={() => deleteFood(f.id)} className="text-xs bg-red-500/10 text-red-400 px-2.5 py-1.5 rounded-lg hover:bg-red-500/20 transition-colors">🗑</button>
                </div>
              </div>
            ))}
          </div>
        )
      }

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editFood ? 'Editează aliment' : 'Aliment nou'}>
        <div className="space-y-3">
          {[
            { key: 'name', label: 'Nume aliment', placeholder: 'ex: Piept de pui', type: 'text' },
            { key: 'calories', label: 'Calorii (kcal / 100g)', placeholder: '0', type: 'number' },
            { key: 'protein', label: 'Proteine (g / 100g)', placeholder: '0', type: 'number' },
            { key: 'carbs', label: 'Carbohidrați (g / 100g)', placeholder: '0', type: 'number' },
            { key: 'fat', label: 'Grăsimi (g / 100g)', placeholder: '0', type: 'number' },
          ].map(field => (
            <div key={field.key}>
              <label className="text-xs text-slate-400 block mb-1">{field.label}</label>
              <input className="input" type={field.type} placeholder={field.placeholder}
                value={form[field.key]} onChange={e => setForm(p => ({ ...p, [field.key]: e.target.value }))} />
            </div>
          ))}
          <button onClick={saveFood} className="btn-primary w-full py-3">{editFood ? 'Salvează' : 'Adaugă'}</button>
        </div>
      </Modal>
    </div>
  )
}

function TargeturiTab({ session }) {
  const [targets, setTargets] = useState({ calories: 2000, protein_g: 150, carbs_g: 250, fat_g: 65, water_ml: 2000 })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => { loadTargets() }, [])

  async function loadTargets() {
    const { data } = await supabase.from('user_targets').select('*').eq('user_id', session.user.id).single()
    if (data) setTargets(data)
  }

  async function saveTargets() {
    setSaving(true)
    const { data: existing } = await supabase.from('user_targets').select('id').eq('user_id', session.user.id).single()
    if (existing) {
      await supabase.from('user_targets').update(targets).eq('user_id', session.user.id)
    } else {
      await supabase.from('user_targets').insert({ ...targets, user_id: session.user.id })
    }
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const fields = [
    { key: 'calories', label: 'Calorii', unit: 'kcal', emoji: '🔥', color: 'text-brand-green' },
    { key: 'protein_g', label: 'Proteine', unit: 'g', emoji: '💪', color: 'text-brand-blue' },
    { key: 'carbs_g', label: 'Carbohidrați', unit: 'g', emoji: '🌾', color: 'text-brand-orange' },
    { key: 'fat_g', label: 'Grăsimi', unit: 'g', emoji: '🥑', color: 'text-brand-purple' },
    { key: 'water_ml', label: 'Apă', unit: 'ml', emoji: '💧', color: 'text-brand-blue' },
  ]

  return (
    <div className="space-y-3">
      <div className="card">
        <p className="text-xs text-slate-400 mb-4">Setează obiectivele tale zilnice</p>
        <div className="space-y-4">
          {fields.map(f => (
            <div key={f.key} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 w-32">
                <span>{f.emoji}</span>
                <span className="text-sm text-slate-300">{f.label}</span>
              </div>
              <div className="flex items-center gap-2 flex-1">
                <input className="input" type="number"
                  value={targets[f.key]}
                  onChange={e => setTargets(p => ({ ...p, [f.key]: parseFloat(e.target.value) || 0 }))} />
                <span className={`text-xs ${f.color} w-8 shrink-0`}>{f.unit}</span>
              </div>
            </div>
          ))}
        </div>
        <button onClick={saveTargets} disabled={saving} className="btn-primary w-full py-3 mt-4">
          {saved ? '✅ Salvat!' : saving ? 'Se salvează...' : 'Salvează target-urile'}
        </button>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────

export default function Nutritie({ session }) {
  const [tab, setTab] = useState('azi')
  const tabs = [
    { key: 'azi', label: '📅 Azi' },
    { key: 'alimente', label: '🥦 Alimente' },
    { key: 'targete', label: '🎯 Target-uri' },
  ]

  return (
    <div className="page fade-in">
      <h1 className="text-2xl font-bold text-white mb-4">🥗 Nutriție</h1>

      {/* Tabs */}
      <div className="flex gap-1 bg-dark-800 border border-dark-600 rounded-xl p-1 mb-4">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`tab-btn ${tab === t.key ? 'tab-active' : 'tab-inactive'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'azi' && <AziTab session={session} />}
      {tab === 'alimente' && <AlimenteTab session={session} />}
      {tab === 'targete' && <TargeturiTab session={session} />}
    </div>
  )
}
