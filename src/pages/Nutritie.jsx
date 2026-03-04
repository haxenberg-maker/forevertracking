import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import Modal from '../components/Modal'

const today = new Date().toISOString().split('T')[0]
const MEAL_TYPES = [
  { key: 'breakfast', label: 'Mic dejun', emoji: '🌅' },
  { key: 'lunch', label: 'Prânz', emoji: '☀️' },
  { key: 'dinner', label: 'Cină', emoji: '🌙' },
  { key: 'snack', label: 'Gustare', emoji: '🍎' },
]

function calcNutritionFromItems(items) {
  return items.reduce((acc, item) => {
    const r = (item.quantity_g || 0) / 100
    const f = item.foods || {}
    return {
      calories: acc.calories + (f.calories || 0) * r,
      protein: acc.protein + (f.protein || 0) * r,
      carbs: acc.carbs + (f.carbs || 0) * r,
      fat: acc.fat + (f.fat || 0) * r,
    }
  }, { calories: 0, protein: 0, carbs: 0, fat: 0 })
}

// ─── AZI ─────────────────────────────────────────────

function AziTab({ session }) {
  const [meals, setMeals] = useState([])
  const [allFoods, setAllFoods] = useState([])
  const [mealTemplates, setMealTemplates] = useState([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [activeMealType, setActiveMealType] = useState(null)
  const [addMode, setAddMode] = useState('food')
  const [selectedFood, setSelectedFood] = useState(null)
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [quantity, setQuantity] = useState('100')
  const [search, setSearch] = useState('')
  const [pickingFood, setPickingFood] = useState(false)
  const [pickingTemplate, setPickingTemplate] = useState(false)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    loadMeals()
    const { data: foods } = await supabase.from('foods').select('*').order('name')
    setAllFoods(foods || [])
    const { data: templates } = await supabase.from('meal_templates').select(`
      id, name,
      meal_template_items(quantity_g, foods(id, name, calories, protein, carbs, fat))
    `).order('name')
    setMealTemplates(templates || [])
  }

  async function loadMeals() {
    const { data } = await supabase.from('meal_logs').select(`
      id, meal_type,
      meal_items(id, quantity_g, foods(id, name, calories, protein, carbs, fat))
    `).eq('user_id', session.user.id).eq('date', today)
    setMeals(data || [])
  }

  async function addFood() {
    if (!selectedFood || !quantity) return
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
    closeAddModal(); loadMeals()
  }

  async function addTemplate() {
    if (!selectedTemplate) return
    let mealLog = meals.find(m => m.meal_type === activeMealType)
    if (!mealLog) {
      const { data } = await supabase.from('meal_logs').insert({
        user_id: session.user.id, date: today, meal_type: activeMealType
      }).select().single()
      mealLog = data
    }
    const items = selectedTemplate.meal_template_items.map(i => ({
      meal_log_id: mealLog.id, food_id: i.foods.id, quantity_g: i.quantity_g
    }))
    await supabase.from('meal_items').insert(items)
    closeAddModal(); loadMeals()
  }

  async function removeItem(itemId) {
    await supabase.from('meal_items').delete().eq('id', itemId)
    loadMeals()
  }

  function closeAddModal() {
    setShowAddModal(false); setSelectedFood(null); setSelectedTemplate(null)
    setQuantity('100'); setSearch(''); setPickingFood(false); setPickingTemplate(false)
    setAddMode('food')
  }

  const totalNutrition = meals.reduce((acc, m) => {
    const n = calcNutritionFromItems(m.meal_items || [])
    return { calories: acc.calories + n.calories, protein: acc.protein + n.protein, carbs: acc.carbs + n.carbs, fat: acc.fat + n.fat }
  }, { calories: 0, protein: 0, carbs: 0, fat: 0 })

  const filteredFoods = allFoods.filter(f => f.name.toLowerCase().includes(search.toLowerCase()))
  const filteredTemplates = mealTemplates.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="space-y-3">
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

      {MEAL_TYPES.map(mt => {
        const mealLog = meals.find(m => m.meal_type === mt.key)
        const items = mealLog?.meal_items || []
        const nutr = calcNutritionFromItems(items)
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

      <Modal open={showAddModal} onClose={closeAddModal}
        title={`Adaugă la ${MEAL_TYPES.find(m => m.key === activeMealType)?.label || ''}`}>

        {!pickingFood && !pickingTemplate && (
          <div className="space-y-3">
            <div className="flex gap-1 bg-dark-700 rounded-xl p-1">
              <button onClick={() => setAddMode('food')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${addMode === 'food' ? 'bg-dark-600 text-white' : 'text-slate-400'}`}>
                🥦 Aliment
              </button>
              <button onClick={() => setAddMode('template')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${addMode === 'template' ? 'bg-dark-600 text-white' : 'text-slate-400'}`}>
                🍽️ Masă
              </button>
            </div>

            {addMode === 'food' ? (
              <>
                <button onClick={() => setPickingFood(true)}
                  className="w-full bg-dark-700 border border-dark-600 rounded-xl px-3 py-3 text-left text-slate-400 hover:border-brand-green/50 transition-all text-sm">
                  🔍 {selectedFood ? selectedFood.name : 'Caută aliment...'}
                </button>
                {selectedFood && (
                  <div className="bg-brand-green/10 border border-brand-green/20 rounded-xl p-3">
                    <p className="text-xs text-slate-400">{selectedFood.calories} kcal · P:{selectedFood.protein}g · C:{selectedFood.carbs}g · G:{selectedFood.fat}g (per 100g)</p>
                    <div className="mt-2">
                      <label className="text-xs text-slate-400 block mb-1">Cantitate (grame)</label>
                      <input className="input" type="number" value={quantity} onChange={e => setQuantity(e.target.value)} />
                    </div>
                  </div>
                )}
                <button onClick={addFood} disabled={!selectedFood} className="btn-primary w-full py-3">Adaugă aliment</button>
              </>
            ) : (
              <>
                <button onClick={() => setPickingTemplate(true)}
                  className="w-full bg-dark-700 border border-dark-600 rounded-xl px-3 py-3 text-left text-slate-400 hover:border-brand-blue/50 transition-all text-sm">
                  🔍 {selectedTemplate ? selectedTemplate.name : 'Caută masă...'}
                </button>
                {selectedTemplate && (
                  <div className="bg-brand-blue/10 border border-brand-blue/20 rounded-xl p-3 space-y-1">
                    {selectedTemplate.meal_template_items.map((i, idx) => (
                      <div key={idx} className="flex justify-between text-xs">
                        <span className="text-slate-300">{i.foods?.name}</span>
                        <span className="text-slate-400">{i.quantity_g}g</span>
                      </div>
                    ))}
                    <p className="text-xs text-brand-blue mt-1 pt-1 border-t border-dark-600">
                      {Math.round(calcNutritionFromItems(selectedTemplate.meal_template_items).calories)} kcal total
                    </p>
                  </div>
                )}
                <button onClick={addTemplate} disabled={!selectedTemplate} className="btn-primary w-full py-3">Adaugă masa întreagă</button>
              </>
            )}
          </div>
        )}

        {pickingFood && (
          <div className="space-y-3">
            <input className="input" autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Caută aliment..." />
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {filteredFoods.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-4">Niciun aliment găsit.</p>
              ) : filteredFoods.map(f => (
                <button key={f.id} onClick={() => { setSelectedFood(f); setPickingFood(false); setSearch('') }}
                  className="w-full flex justify-between items-center bg-dark-700 rounded-xl px-3 py-2.5 hover:bg-dark-600 transition-colors text-left">
                  <span className="text-sm text-white">{f.name}</span>
                  <span className="text-xs text-slate-400">{f.calories} kcal/100g</span>
                </button>
              ))}
            </div>
            <button onClick={() => { setPickingFood(false); setSearch('') }} className="btn-ghost w-full">← Înapoi</button>
          </div>
        )}

        {pickingTemplate && (
          <div className="space-y-3">
            <input className="input" autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Caută masă..." />
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {filteredTemplates.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-4">Nicio masă găsită. Creează din tab-ul Mese.</p>
              ) : filteredTemplates.map(t => {
                const n = calcNutritionFromItems(t.meal_template_items)
                return (
                  <button key={t.id} onClick={() => { setSelectedTemplate(t); setPickingTemplate(false); setSearch('') }}
                    className="w-full flex justify-between items-center bg-dark-700 rounded-xl px-3 py-2.5 hover:bg-dark-600 transition-colors text-left">
                    <span className="text-sm text-white">{t.name}</span>
                    <span className="text-xs text-slate-400">{Math.round(n.calories)} kcal · {t.meal_template_items.length} alim.</span>
                  </button>
                )
              })}
            </div>
            <button onClick={() => { setPickingTemplate(false); setSearch('') }} className="btn-ghost w-full">← Înapoi</button>
          </div>
        )}
      </Modal>
    </div>
  )
}

// ─── MESE ────────────────────────────────────────────

function MeseTab({ session }) {
  const [templates, setTemplates] = useState([])
  const [allFoods, setAllFoods] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editTemplate, setEditTemplate] = useState(null)
  const [form, setForm] = useState({ name: '' })
  const [items, setItems] = useState([{ food_id: '', food: null, quantity_g: '100' }])
  const [search, setSearch] = useState('')
  const [pickingIdx, setPickingIdx] = useState(null)
  const [foodSearch, setFoodSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const csvRef = useRef()

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const { data: t } = await supabase.from('meal_templates').select(`
      id, name, user_id,
      meal_template_items(id, quantity_g, foods(id, name, calories, protein, carbs, fat))
    `).order('name')
    setTemplates(t || [])
    const { data: f } = await supabase.from('foods').select('*').order('name')
    setAllFoods(f || [])
    setLoading(false)
  }

  function openAdd() {
    setForm({ name: '' }); setItems([{ food_id: '', food: null, quantity_g: '100' }])
    setEditTemplate(null); setShowModal(true)
  }

  function openEdit(t) {
    setForm({ name: t.name })
    setItems(t.meal_template_items.map(i => ({ food_id: i.foods.id, food: i.foods, quantity_g: String(i.quantity_g) })))
    setEditTemplate(t); setShowModal(true)
  }

  function addItem() { setItems(prev => [...prev, { food_id: '', food: null, quantity_g: '100' }]) }
  function removeItem(i) { setItems(prev => prev.filter((_, idx) => idx !== i)) }
  function updateItem(i, key, val) { setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [key]: val } : it)) }
  function pickFood(food, idx) { updateItem(idx, 'food', food); updateItem(idx, 'food_id', food.id); setPickingIdx(null); setFoodSearch('') }

  async function saveTemplate() {
    if (!form.name) return
    const validItems = items.filter(i => i.food_id)
    if (validItems.length === 0) return
    if (editTemplate) {
      await supabase.from('meal_template_items').delete().eq('meal_template_id', editTemplate.id)
      await supabase.from('meal_templates').update({ name: form.name }).eq('id', editTemplate.id)
      await supabase.from('meal_template_items').insert(validItems.map(i => ({
        meal_template_id: editTemplate.id, food_id: i.food_id, quantity_g: parseFloat(i.quantity_g)
      })))
    } else {
      const { data: tmpl } = await supabase.from('meal_templates').insert({
        user_id: session.user.id, name: form.name
      }).select().single()
      await supabase.from('meal_template_items').insert(validItems.map(i => ({
        meal_template_id: tmpl.id, food_id: i.food_id, quantity_g: parseFloat(i.quantity_g)
      })))
    }
    setShowModal(false); loadAll()
  }

  async function deleteTemplate(id) {
    if (confirm('Ștergi masa?')) { await supabase.from('meal_templates').delete().eq('id', id); loadAll() }
  }

  async function handleCSV(e) {
    const file = e.target.files[0]
    if (!file) return
    const text = await file.text()
    const lines = text.trim().split('\n').slice(1)
    // Format: meal_name,food_name,quantity_g
    const grouped = {}
    for (const line of lines) {
      const [meal_name, food_name, quantity_g] = line.split(',').map(s => s.trim())
      if (!meal_name || !food_name) continue
      if (!grouped[meal_name]) grouped[meal_name] = []
      grouped[meal_name].push({ food_name, quantity_g: parseFloat(quantity_g) || 100 })
    }
    for (const [mealName, foodRows] of Object.entries(grouped)) {
      const { data: tmpl } = await supabase.from('meal_templates').insert({
        user_id: session.user.id, name: mealName
      }).select().single()
      for (const row of foodRows) {
        const food = allFoods.find(f => f.name.toLowerCase() === row.food_name.toLowerCase())
        if (!food) continue
        await supabase.from('meal_template_items').insert({
          meal_template_id: tmpl.id, food_id: food.id, quantity_g: row.quantity_g
        })
      }
    }
    e.target.value = ''; loadAll()
    alert(`✅ ${Object.keys(grouped).length} mese importate!`)
  }

  const filteredTemplates = templates.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))
  const filteredFoods = allFoods.filter(f => f.name.toLowerCase().includes(foodSearch.toLowerCase()))

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button onClick={openAdd} className="btn-primary flex-1 py-3">+ Masă nouă</button>
        <button onClick={() => csvRef.current.click()} className="btn-ghost px-4 py-3">📥 CSV</button>
        <input ref={csvRef} type="file" accept=".csv" className="hidden" onChange={handleCSV} />
      </div>

      <div className="bg-dark-700 border border-dark-600 rounded-xl px-3 py-2.5">
        <p className="text-xs text-slate-400 font-medium mb-0.5">Format CSV mese:</p>
        <code className="text-xs text-brand-green">meal_name,food_name,quantity_g</code>
        <p className="text-xs text-slate-500 mt-0.5">ex: Omletă,Ouă,150</p>
        <p className="text-xs text-slate-600 mt-0.5">⚠️ Alimentele trebuie să existe deja în bază</p>
      </div>

      {templates.length > 0 && (
        <input className="input" value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Caută masă..." />
      )}

      {loading ? <p className="text-center text-slate-500 text-sm py-4">Se încarcă...</p> :
        filteredTemplates.length === 0 ? (
          <div className="card text-center py-8">
            <p className="text-4xl mb-2">🍽️</p>
            <p className="text-slate-400 text-sm">{search ? 'Niciun rezultat.' : 'Nicio masă creată încă.'}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTemplates.map(t => {
              const n = calcNutritionFromItems(t.meal_template_items)
              const isOwn = t.user_id === session.user.id
              return (
                <div key={t.id} className="card">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-semibold text-white">{t.name}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {Math.round(n.calories)} kcal · P:{Math.round(n.protein)}g · C:{Math.round(n.carbs)}g · G:{Math.round(n.fat)}g
                      </p>
                    </div>
                    {isOwn && (
                      <div className="flex gap-1.5 ml-2">
                        <button onClick={() => openEdit(t)} className="text-xs bg-dark-700 text-slate-300 px-2 py-1.5 rounded-lg hover:bg-dark-600">✏️</button>
                        <button onClick={() => deleteTemplate(t.id)} className="text-xs bg-red-500/10 text-red-400 px-2 py-1.5 rounded-lg hover:bg-red-500/20">🗑</button>
                      </div>
                    )}
                  </div>
                  <div className="space-y-1">
                    {t.meal_template_items.map((item, i) => (
                      <div key={i} className="flex justify-between items-center bg-dark-700 rounded-lg px-3 py-1.5 text-xs">
                        <span className="text-slate-300">{item.foods?.name}</span>
                        <span className="text-slate-500">{item.quantity_g}g · {Math.round((item.foods?.calories || 0) * item.quantity_g / 100)} kcal</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )
      }

      <Modal open={showModal} onClose={() => { setShowModal(false); setPickingIdx(null) }}
        title={editTemplate ? 'Editează masa' : 'Masă nouă'}>

        {pickingIdx === null ? (
          <div className="space-y-4">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Nume masă</label>
              <input className="input" placeholder="ex: Omletă cu legume" value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-white">Ingrediente</p>
                <button onClick={addItem} className="text-xs bg-brand-blue/20 text-brand-blue px-2.5 py-1 rounded-lg hover:bg-brand-blue/30">+ Adaugă</button>
              </div>
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {items.map((item, i) => (
                  <div key={i} className="bg-dark-700 rounded-xl p-3 flex gap-2 items-center">
                    <button onClick={() => setPickingIdx(i)}
                      className="flex-1 text-left text-sm bg-dark-600 rounded-lg px-3 py-2 text-slate-300 hover:bg-dark-500 transition-colors truncate">
                      {item.food ? item.food.name : '🔍 Alege aliment...'}
                    </button>
                    <input className="input w-20 text-center" type="number" placeholder="g"
                      value={item.quantity_g} onChange={e => updateItem(i, 'quantity_g', e.target.value)} />
                    {items.length > 1 && (
                      <button onClick={() => removeItem(i)} className="text-slate-600 hover:text-red-400 transition-colors">×</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
            {items.filter(i => i.food).length > 0 && (
              <div className="bg-dark-700 rounded-xl px-3 py-2 text-xs text-slate-400">
                Total: {Math.round(calcNutritionFromItems(
                  items.filter(i => i.food).map(i => ({ quantity_g: parseFloat(i.quantity_g) || 0, foods: i.food }))
                ).calories)} kcal
              </div>
            )}
            <button onClick={saveTemplate} disabled={!form.name || items.filter(i => i.food_id).length === 0}
              className="btn-primary w-full py-3">
              {editTemplate ? 'Salvează' : 'Creează masa'}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <input className="input" autoFocus value={foodSearch} onChange={e => setFoodSearch(e.target.value)} placeholder="Caută aliment..." />
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {filteredFoods.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-4">Niciun aliment găsit.</p>
              ) : filteredFoods.map(f => (
                <button key={f.id} onClick={() => pickFood(f, pickingIdx)}
                  className="w-full flex justify-between items-center bg-dark-700 rounded-xl px-3 py-2.5 hover:bg-dark-600 transition-colors text-left">
                  <span className="text-sm text-white">{f.name}</span>
                  <span className="text-xs text-slate-400">{f.calories} kcal/100g</span>
                </button>
              ))}
            </div>
            <button onClick={() => { setPickingIdx(null); setFoodSearch('') }} className="btn-ghost w-full">← Înapoi</button>
          </div>
        )}
      </Modal>
    </div>
  )
}

// ─── ALIMENTE ─────────────────────────────────────────

function AlimenteTab({ session }) {
  const [foods, setFoods] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editFood, setEditFood] = useState(null)
  const [form, setForm] = useState({ name: '', calories: '', protein: '', carbs: '', fat: '' })
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const csvRef = useRef()

  useEffect(() => { loadFoods() }, [])

  async function loadFoods() {
    setLoading(true)
    const { data } = await supabase.from('foods').select('*').order('name')
    setFoods(data || [])
    setLoading(false)
  }

  function openAdd() {
    setForm({ name: '', calories: '', protein: '', carbs: '', fat: '' })
    setEditFood(null); setShowModal(true)
  }

  function openEdit(f) {
    setForm({ name: f.name, calories: String(f.calories), protein: String(f.protein), carbs: String(f.carbs), fat: String(f.fat) })
    setEditFood(f); setShowModal(true)
  }

  async function saveFood() {
    if (!form.name || !form.calories) return
    const data = { user_id: session.user.id, name: form.name, calories: parseFloat(form.calories), protein: parseFloat(form.protein) || 0, carbs: parseFloat(form.carbs) || 0, fat: parseFloat(form.fat) || 0 }
    if (editFood) await supabase.from('foods').update(data).eq('id', editFood.id)
    else await supabase.from('foods').insert(data)
    setShowModal(false); loadFoods()
  }

  async function deleteFood(id) {
    if (confirm('Ștergi alimentul?')) { await supabase.from('foods').delete().eq('id', id); loadFoods() }
  }

  async function handleCSV(e) {
    const file = e.target.files[0]
    if (!file) return
    const text = await file.text()
    const lines = text.trim().split('\n').slice(1)
    // Format: name,calories,protein,carbs,fat
    const rows = []
    for (const line of lines) {
      const [name, calories, protein, carbs, fat] = line.split(',').map(s => s.trim())
      if (!name || !calories) continue
      rows.push({ user_id: session.user.id, name, calories: parseFloat(calories) || 0, protein: parseFloat(protein) || 0, carbs: parseFloat(carbs) || 0, fat: parseFloat(fat) || 0 })
    }
    if (rows.length > 0) await supabase.from('foods').insert(rows)
    e.target.value = ''; loadFoods()
    alert(`✅ ${rows.length} alimente importate!`)
  }

  const filteredFoods = foods.filter(f => f.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button onClick={openAdd} className="btn-primary flex-1 py-3">+ Aliment nou</button>
        <button onClick={() => csvRef.current.click()} className="btn-ghost px-4 py-3">📥 CSV</button>
        <input ref={csvRef} type="file" accept=".csv" className="hidden" onChange={handleCSV} />
      </div>

      <div className="bg-dark-700 border border-dark-600 rounded-xl px-3 py-2.5">
        <p className="text-xs text-slate-400 font-medium mb-0.5">Format CSV alimente:</p>
        <code className="text-xs text-brand-green">name,calories,protein,carbs,fat</code>
        <p className="text-xs text-slate-500 mt-0.5">ex: Piept de pui,165,31,0,3.6</p>
      </div>

      {foods.length > 0 && (
        <input className="input" value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Caută aliment..." />
      )}

      {loading ? <p className="text-slate-500 text-center text-sm py-4">Se încarcă...</p> :
        filteredFoods.length === 0 ? (
          <div className="card text-center py-8">
            <p className="text-4xl mb-2">🥦</p>
            <p className="text-slate-400 text-sm">{search ? 'Niciun rezultat.' : 'Niciun aliment adăugat încă.'}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredFoods.map(f => (
              <div key={f.id} className="card flex items-center justify-between">
                <div className="flex-1">
                  <p className="font-semibold text-sm text-white">{f.name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {f.calories} kcal · P:{f.protein}g · C:{f.carbs}g · G:{f.fat}g<span className="text-slate-600"> /100g</span>
                  </p>
                </div>
                {f.user_id === session.user.id && (
                  <div className="flex gap-2 ml-3">
                    <button onClick={() => openEdit(f)} className="text-xs bg-dark-700 text-slate-300 px-2.5 py-1.5 rounded-lg hover:bg-dark-600">✏️</button>
                    <button onClick={() => deleteFood(f.id)} className="text-xs bg-red-500/10 text-red-400 px-2.5 py-1.5 rounded-lg hover:bg-red-500/20">🗑</button>
                  </div>
                )}
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

// ─── TARGET-URI ───────────────────────────────────────

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
    if (existing) await supabase.from('user_targets').update(targets).eq('user_id', session.user.id)
    else await supabase.from('user_targets').insert({ ...targets, user_id: session.user.id })
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const fields = [
    { key: 'calories', label: 'Calorii', unit: 'kcal', emoji: '🔥' },
    { key: 'protein_g', label: 'Proteine', unit: 'g', emoji: '💪' },
    { key: 'carbs_g', label: 'Carbohidrați', unit: 'g', emoji: '🌾' },
    { key: 'fat_g', label: 'Grăsimi', unit: 'g', emoji: '🥑' },
    { key: 'water_ml', label: 'Apă', unit: 'ml', emoji: '💧' },
  ]

  return (
    <div className="card space-y-4">
      <p className="text-xs text-slate-400">Setează obiectivele tale zilnice</p>
      {fields.map(f => (
        <div key={f.key} className="flex items-center gap-3">
          <div className="flex items-center gap-2 w-32">
            <span>{f.emoji}</span>
            <span className="text-sm text-slate-300">{f.label}</span>
          </div>
          <div className="flex items-center gap-2 flex-1">
            <input className="input" type="number" value={targets[f.key]}
              onChange={e => setTargets(p => ({ ...p, [f.key]: parseFloat(e.target.value) || 0 }))} />
            <span className="text-xs text-slate-400 w-8 shrink-0">{f.unit}</span>
          </div>
        </div>
      ))}
      <button onClick={saveTargets} disabled={saving} className="btn-primary w-full py-3">
        {saved ? '✅ Salvat!' : saving ? 'Se salvează...' : 'Salvează target-urile'}
      </button>
    </div>
  )
}

// ─── MAIN ─────────────────────────────────────────────

export default function Nutritie({ session }) {
  const [tab, setTab] = useState('azi')
  const tabs = [
    { key: 'azi', label: '📅 Azi' },
    { key: 'mese', label: '🍽️ Mese' },
    { key: 'alimente', label: '🥦 Alimente' },
    { key: 'targete', label: '🎯 Target-uri' },
  ]

  return (
    <div className="page fade-in">
      <h1 className="text-2xl font-bold text-white mb-4">🥗 Nutriție</h1>
      <div className="flex gap-1 bg-dark-800 border border-dark-600 rounded-xl p-1 mb-4">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`tab-btn text-xs ${tab === t.key ? 'tab-active' : 'tab-inactive'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'azi' && <AziTab session={session} />}
      {tab === 'mese' && <MeseTab session={session} />}
      {tab === 'alimente' && <AlimenteTab session={session} />}
      {tab === 'targete' && <TargeturiTab session={session} />}
    </div>
  )
}
