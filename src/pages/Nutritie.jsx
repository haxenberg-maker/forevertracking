import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import Modal from '../components/Modal'
import { getCached, setCached, invalidateCache } from '../lib/cache'
import BarcodeScanner from '../components/BarcodeScanner'

function getToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

const MEAL_TYPES = [
  { key: 'breakfast', label: 'Mic dejun', emoji: '🌅' },
  { key: 'lunch',     label: 'Prânz',     emoji: '☀️' },
  { key: 'dinner',    label: 'Cină',      emoji: '🌙' },
  { key: 'snack',     label: 'Gustare',   emoji: '🍎' },
]

function calcNutr(items) {
  return items.reduce((acc, item) => {
    const r = (item.quantity_g || 0) / 100
    const f = item.foods || {}
    return {
      calories: acc.calories + (f.calories || 0) * r,
      protein:  acc.protein  + (f.protein  || 0) * r,
      carbs:    acc.carbs    + (f.carbs    || 0) * r,
      fat:      acc.fat      + (f.fat      || 0) * r,
    }
  }, { calories: 0, protein: 0, carbs: 0, fat: 0 })
}

function genUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

// ─── AZI ─────────────────────────────────────────────

function AziTab({ session }) {
  const today = getToday()
  const [meals, setMeals] = useState([])
  const [allFoods, setAllFoods] = useState([])
  const [pantryItems, setPantryItems] = useState([])
  const [mealTemplates, setMealTemplates] = useState([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [activeMealType, setActiveMealType] = useState(null)
  const [addMode, setAddMode] = useState('food')
  const [selectedFood, setSelectedFood] = useState(null)
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [quantity, setQuantity] = useState('100')
  const [unit, setUnit] = useState('g')
  const [mealPct, setMealPct] = useState(100)  // % din masă mâncată
  const [search, setSearch] = useState('')
  const [pickingFood, setPickingFood] = useState(false)
  const [pickingTemplate, setPickingTemplate] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [editQty, setEditQty] = useState('')
  const [collapsed, setCollapsed] = useState({})
  const [takenSupplements, setTakenSupplements] = useState([])
  const [showNewFoodForm, setShowNewFoodForm] = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  const [newFoodForm, setNewFoodForm] = useState({ name: '', calories: '', protein: '', carbs: '', fat: '' })

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    // Use cached foods if available (saves ~200ms on revisit)
    const cachedFoods = getCached('foods')
    const [
      foodsRes,
      { data: pantry },
      { data: templates },
      { data: sups },
    ] = await Promise.all([
      cachedFoods ? Promise.resolve({ data: cachedFoods }) : supabase.from('foods').select('*').order('name'),
      supabase.from('pantry_items').select('*').eq('user_id', session.user.id).eq('list_type', 'stock'),
      supabase.from('meal_templates')
        .select(`id, name, user_id, is_public, meal_template_items(quantity_g, foods(id, name, calories, protein, carbs, fat))`)
        .order('name'),
      supabase.from('daily_supplements').select('*').eq('user_id', session.user.id),
    ])
    const foods = foodsRes.data || []
    if (!cachedFoods) setCached('foods', foods)
    setAllFoods(foods)
    setPantryItems(pantry || [])
    setMealTemplates((templates || []).filter(t => t.user_id === session.user.id || t.is_public === true))
    if (sups?.length) {
      const { data: logs } = await supabase.from('supplement_logs').select('*').eq('user_id', session.user.id).eq('date', today).eq('taken', true)
      const takenIds = new Set((logs || []).map(l => l.supplement_id))
      setTakenSupplements((sups || []).filter(s => takenIds.has(s.id) && (s.calories > 0 || s.protein_g > 0 || s.carbs_g > 0 || s.fat_g > 0)))
    } else {
      setTakenSupplements([])
    }
    loadMeals()
  }

  async function loadMeals() {
    const { data } = await supabase.from('meal_logs').select(`
      id, meal_type,
      meal_items(id, quantity_g, group_id, group_name, foods(id, name, calories, protein, carbs, fat))
    `).eq('user_id', session.user.id).eq('date', today)
    setMeals(data || [])
  }

  // Convert any unit to grams equivalent for storage
  function toGrams(qty, u, food) {
    const q = parseFloat(qty) || 0
    switch(u) {
      case 'kg': return q * 1000
      case 'ml': return q       // treat ml as g for liquids
      case 'l':  return q * 1000
      case 'linguriță': return q * 5
      case 'lingură': return q * 15
      case 'bucăți':
      case 'porție': return food?.serving_size ? q * food.serving_size : q * 100
      default: return q
    }
  }

  async function addFood() {
    if (!selectedFood || !quantity) return
    let mealLog = meals.find(m => m.meal_type === activeMealType)
    if (!mealLog) {
      const { data } = await supabase.from('meal_logs').insert({ user_id: session.user.id, date: today, meal_type: activeMealType }).select().single()
      mealLog = data
    }
    const qg = toGrams(quantity, unit, selectedFood) * (mealPct / 100)
    await supabase.from('meal_items').insert({ meal_log_id: mealLog.id, food_id: selectedFood.id, quantity_g: Math.round(qg * 10) / 10, group_id: null, group_name: null })
    closeAddModal(); loadMeals()
  }

  async function addTemplate() {
    if (!selectedTemplate) return
    let mealLog = meals.find(m => m.meal_type === activeMealType)
    if (!mealLog) {
      const { data } = await supabase.from('meal_logs').insert({ user_id: session.user.id, date: today, meal_type: activeMealType }).select().single()
      mealLog = data
    }
    const gid = genUUID()
    const pct = mealPct / 100
    await supabase.from('meal_items').insert(
      selectedTemplate.meal_template_items.map(i => ({
        meal_log_id: mealLog.id,
        food_id: i.foods.id,
        quantity_g: Math.round(i.quantity_g * pct * 10) / 10,
        group_id: gid,
        group_name: mealPct < 100 ? `${selectedTemplate.name} (${mealPct}%)` : selectedTemplate.name
      }))
    )
    closeAddModal(); loadMeals()
  }

  async function removeItem(itemId) { await supabase.from('meal_items').delete().eq('id', itemId); loadMeals() }
  async function removeGroup(groupId) { await supabase.from('meal_items').delete().eq('group_id', groupId); loadMeals() }
  async function saveEditItem() {
    if (!editingItem || !editQty) return
    await supabase.from('meal_items').update({ quantity_g: parseFloat(editQty) }).eq('id', editingItem.id)
    setEditingItem(null); loadMeals()
  }

  function closeAddModal() {
    setShowAddModal(false); setSelectedFood(null); setSelectedTemplate(null)
    setQuantity('100'); setUnit('g'); setMealPct(100); setSearch(''); setPickingFood(false); setPickingTemplate(false); setAddMode('food')
    setShowNewFoodForm(false); setNewFoodForm({ name: '', calories: '', protein: '', carbs: '', fat: '' })
  }

  async function saveNewFoodInline() {
    if (!newFoodForm.name || !newFoodForm.calories) return
    // Check if food with same name already exists
    const existing = allFoods.find(f => f.name.toLowerCase() === newFoodForm.name.toLowerCase())
    if (existing) {
      // Offer to use existing food instead
      if (confirm(`"${existing.name}" există deja (${existing.calories} kcal/100g). Folosești alimentul existent?`)) {
        setSelectedFood(existing)
        setShowNewFoodForm(false)
        setPickingFood(false)
        setSearch('')
        return
      }
      // User chose to add anyway (different values)
    }
    const { data: food } = await supabase.from('foods').insert({
      user_id: session.user.id,
      user_email: session.user.email,
      name: newFoodForm.name,
      calories: parseFloat(newFoodForm.calories) || 0,
      protein: parseFloat(newFoodForm.protein) || 0,
      carbs: parseFloat(newFoodForm.carbs) || 0,
      fat: parseFloat(newFoodForm.fat) || 0,
    }).select().single()
    if (food) {
      const newFoods = [...allFoods, food].sort((a,b) => a.name.localeCompare(b.name))
      setAllFoods(newFoods)
      setSelectedFood(food)
      setShowNewFoodForm(false)
      setPickingFood(false)
      setSearch('')
    }
  }

  function groupItems(items) {
    const ungrouped = [], groups = {}
    for (const item of items) {
      if (!item.group_id) { ungrouped.push(item); continue }
      if (!groups[item.group_id]) groups[item.group_id] = { name: item.group_name, items: [] }
      groups[item.group_id].items.push(item)
    }
    return { ungrouped, groups }
  }

  const mealNutrition = meals.reduce((acc, m) => {
    const n = calcNutr(m.meal_items || [])
    return { calories: acc.calories + n.calories, protein: acc.protein + n.protein, carbs: acc.carbs + n.carbs, fat: acc.fat + n.fat }
  }, { calories: 0, protein: 0, carbs: 0, fat: 0 })

  const supNutrition = takenSupplements.reduce((acc, s) => ({
    calories: acc.calories + (s.calories || 0),
    protein:  acc.protein  + (s.protein_g || 0),
    carbs:    acc.carbs    + (s.carbs_g || 0),
    fat:      acc.fat      + (s.fat_g || 0),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 })

  const totalNutrition = {
    calories: mealNutrition.calories + supNutrition.calories,
    protein:  mealNutrition.protein  + supNutrition.protein,
    carbs:    mealNutrition.carbs    + supNutrition.carbs,
    fat:      mealNutrition.fat      + supNutrition.fat,
  }

  const pantrySuggestions = search.length > 1
    ? pantryItems.filter(p => p.name.toLowerCase().includes(search.toLowerCase())).slice(0, 5)
    : pantryItems.slice(0, 5)
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
        const nutr = calcNutr(items)
        const { ungrouped, groups } = groupItems(items)
        const isCollapsed = false // always expanded in Azi tab
        return (
          <div key={mt.key} className="card">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-1 text-left min-w-0">
                <span className="shrink-0">{mt.emoji}</span>
                <span className="font-semibold text-sm text-white">{mt.label}</span>
                {items.length > 0 && (
                  <span className="text-xs text-slate-400 ml-1">{Math.round(nutr.calories)} kcal</span>
                )}
              </div>
              <button onClick={() => { setActiveMealType(mt.key); setShowAddModal(true) }}
                className="w-7 h-7 rounded-lg bg-brand-green/20 text-brand-green text-lg flex items-center justify-center hover:bg-brand-green/30 shrink-0">+</button>
            </div>

            <div className="mt-2 space-y-2">
                {items.length === 0 ? (
                  <p className="text-slate-600 text-xs">Niciun aliment adăugat</p>
                ) : (
                  <>
                    {Object.entries(groups).map(([gid, group]) => {
                      const gNutr = calcNutr(group.items)
                      return (
                        <div key={gid} className="bg-dark-700 rounded-xl overflow-hidden">
                          <div className="flex items-center justify-between px-3 py-2 bg-brand-blue/10 border-b border-dark-600">
                            <div className="flex items-center gap-2">
                              <span className="text-sm">🍽️</span>
                              <span className="text-sm font-semibold text-brand-blue">{group.name}</span>
                              <span className="text-xs text-slate-400">{Math.round(gNutr.calories)} kcal</span>
                            </div>
                            <button onClick={() => removeGroup(gid)} className="text-xs bg-red-500/20 text-red-400 px-2 py-1 rounded-lg">Șterge</button>
                          </div>
                          <div className="divide-y divide-dark-600">
                            {group.items.map(item => (
                              <div key={item.id} className="flex items-center justify-between px-3 py-2">
                                <div>
                                  <p className="text-sm text-slate-200">{item.foods?.name}</p>
                                  <p className="text-xs text-slate-500">{item.quantity_g}g · {Math.round((item.foods?.calories || 0) * item.quantity_g / 100)} kcal</p>
                                </div>
                                <div className="flex gap-2">
                                  <button onClick={() => { setEditingItem(item); setEditQty(String(item.quantity_g)) }} className="text-xs bg-dark-600 text-slate-300 px-2 py-1 rounded-lg">✏️</button>
                                  <button onClick={() => removeItem(item.id)} className="text-slate-600 hover:text-red-400 text-lg">×</button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                    {ungrouped.map(item => (
                      <div key={item.id} className="flex items-center justify-between bg-dark-700 rounded-xl px-3 py-2">
                        <div>
                          <p className="text-sm text-white">{item.foods?.name}</p>
                          <p className="text-xs text-slate-400">{item.quantity_g}g · {Math.round((item.foods?.calories || 0) * item.quantity_g / 100)} kcal</p>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => { setEditingItem(item); setEditQty(String(item.quantity_g)) }} className="text-xs bg-dark-600 text-slate-300 px-2 py-1 rounded-lg">✏️</button>
                          <button onClick={() => removeItem(item.id)} className="text-slate-600 hover:text-red-400 text-lg">×</button>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
          </div>
        )
      })}

      {/* Suplimente luate azi cu macronutrienți */}
      {takenSupplements.length > 0 && (
        <div className="card">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">💊</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-white">Suplimente</p>
              <p className="text-xs text-slate-500">Luate azi · contribuie la total</p>
            </div>
            <span className="text-xs text-slate-500">
              {Math.round(supNutrition.calories)} kcal
            </span>
          </div>
          <div className="space-y-1.5">
            {takenSupplements.map(s => (
              <div key={s.id} className="flex items-center justify-between bg-dark-700 rounded-xl px-3 py-2">
                <div>
                  <p className="text-xs font-medium text-brand-green">✓ {s.name}</p>
                  <p className="text-xs text-slate-500">{s.amount_g} {s.unit}</p>
                </div>
                <div className="text-right text-xs space-y-0.5">
                  {s.calories > 0 && <p className="text-slate-300">{s.calories} kcal</p>}
                  <p className="text-slate-500">
                    {s.protein_g > 0 && <span className="text-brand-blue mr-1.5">P:{s.protein_g}g</span>}
                    {s.carbs_g > 0 && <span className="text-brand-orange mr-1.5">C:{s.carbs_g}g</span>}
                    {s.fat_g > 0 && <span className="text-brand-purple">G:{s.fat_g}g</span>}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Modal open={showAddModal} onClose={closeAddModal} title={`Adaugă la ${MEAL_TYPES.find(m => m.key === activeMealType)?.label || ''}`}>
        {!pickingFood && !pickingTemplate && (
          <div className="space-y-3">
            <div className="flex gap-1 bg-dark-700 rounded-xl p-1">
              <button onClick={() => setAddMode('food')} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${addMode === 'food' ? 'bg-dark-600 text-white' : 'text-slate-400'}`}>🥦 Aliment</button>
              <button onClick={() => setAddMode('template')} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${addMode === 'template' ? 'bg-dark-600 text-white' : 'text-slate-400'}`}>🍽️ Masă</button>
            </div>
            {addMode === 'food' ? (
              <>
                <button onClick={() => setPickingFood(true)} className="w-full bg-dark-700 border border-dark-600 rounded-xl px-3 py-3 text-left text-slate-400 hover:border-brand-green/50 text-sm">
                  🔍 {selectedFood ? selectedFood.name : 'Caută aliment...'}
                </button>
                {selectedFood && (
                  <div className="bg-brand-green/10 border border-brand-green/20 rounded-xl p-3 space-y-2">
                    <p className="text-xs text-slate-400">{selectedFood.calories} kcal · P:{selectedFood.protein}g · C:{selectedFood.carbs}g · G:{selectedFood.fat}g (per 100g)</p>
                    {selectedFood.serving_size && (
                      <button onClick={() => { setQuantity('1'); setUnit(selectedFood.serving_unit || 'bucăți') }}
                        className="text-xs bg-brand-blue/20 text-brand-blue px-2.5 py-1 rounded-lg">
                        1 porție = {selectedFood.serving_size}{selectedFood.serving_unit || 'g'}
                      </button>
                    )}
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Cantitate</label>
                      <div className="flex gap-2">
                        <input className="input flex-1" type="number" value={quantity} onChange={e => setQuantity(e.target.value)} />
                        <select className="input w-28" value={unit} onChange={e => setUnit(e.target.value)}>
                          {['g','kg','ml','l','bucăți','porție','linguriță','lingură'].map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </div>
                      {unit !== 'g' && unit !== 'ml' && (
                        <p className="text-xs text-slate-500 mt-1">≈ {Math.round(toGrams(quantity, unit, selectedFood))}g</p>
                      )}
                    </div>
                    {/* % din masă */}
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-xs text-slate-400">Cât ai mâncat din porție?</label>
                        <span className="text-sm font-bold text-brand-green">{mealPct}%</span>
                      </div>
                      <input type="range" min={10} max={100} step={5} value={mealPct}
                        onChange={e => setMealPct(parseInt(e.target.value))}
                        className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                        style={{ accentColor: '#4ade80' }} />
                      <div className="flex justify-between text-[10px] text-slate-600 mt-0.5">
                        <span>10%</span><span>50%</span><span>100%</span>
                      </div>
                      {mealPct < 100 && (
                        <p className="text-xs text-brand-orange mt-1">
                          ≈ {Math.round(toGrams(quantity, unit, selectedFood) * mealPct / 100)}g · {Math.round((selectedFood.calories || 0) * toGrams(quantity, unit, selectedFood) * mealPct / 10000)} kcal
                        </p>
                      )}
                    </div>
                  </div>
                )}
                <button onClick={addFood} disabled={!selectedFood} className="btn-primary w-full py-3">Adaugă aliment</button>
              </>
            ) : (
              <>
                <button onClick={() => setPickingTemplate(true)} className="w-full bg-dark-700 border border-dark-600 rounded-xl px-3 py-3 text-left text-slate-400 hover:border-brand-blue/50 text-sm">
                  🔍 {selectedTemplate ? selectedTemplate.name : 'Caută masă...'}
                </button>

                {/* Slider % — mereu vizibil în modul masă */}
                <div className="bg-dark-700 rounded-xl p-3 space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-xs text-slate-400">Cât ai mâncat din masă?</label>
                    <span className="text-sm font-bold text-brand-green">{mealPct}%</span>
                  </div>
                  <input type="range" min={10} max={100} step={5} value={mealPct}
                    onChange={e => setMealPct(parseInt(e.target.value))}
                    className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                    style={{ accentColor: '#4ade80' }} />
                  <div className="flex justify-between text-[10px] text-slate-600">
                    <span>10%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
                  </div>
                </div>

                {selectedTemplate && (
                  <div className="bg-brand-blue/10 border border-brand-blue/20 rounded-xl p-3 space-y-1.5">
                    <p className="text-xs font-medium text-slate-300 mb-1">{selectedTemplate.name}</p>
                    {selectedTemplate.meal_template_items.map((i, idx) => (
                      <div key={idx} className="flex justify-between text-xs">
                        <span className="text-slate-300">{i.foods?.name}</span>
                        <span className="text-slate-400">
                          {mealPct < 100
                            ? <><span className="line-through opacity-40 mr-1">{i.quantity_g}g</span><span className="text-brand-orange">{Math.round(i.quantity_g * mealPct / 10) / 10}g</span></>
                            : `${i.quantity_g}g`}
                        </span>
                      </div>
                    ))}
                    <p className={`text-xs pt-1.5 border-t border-dark-600 font-medium ${mealPct < 100 ? 'text-brand-orange' : 'text-brand-blue'}`}>
                      {Math.round(calcNutr(selectedTemplate.meal_template_items).calories * mealPct / 100)} kcal
                      {mealPct < 100 && <span className="text-slate-500 font-normal"> din {Math.round(calcNutr(selectedTemplate.meal_template_items).calories)} total</span>}
                    </p>
                  </div>
                )}

                <button onClick={addTemplate} disabled={!selectedTemplate} className="btn-primary w-full py-3 disabled:opacity-40">
                  {mealPct < 100 ? `Adaugă ${mealPct}% din masă` : 'Adaugă masa întreagă'}
                </button>
              </>
            )}
          </div>
        )}
        {pickingFood && (
          <div className="space-y-3">

            {/* Scanner activ */}
            {showScanner && (
              <div className="bg-dark-800 border border-dark-600 rounded-xl p-3">
                <BarcodeScanner
                  onFound={async (foodData) => {
                    const existing = allFoods.find(f =>
                      f.name.toLowerCase() === foodData.name.toLowerCase() ||
                      f.barcode === foodData.barcode
                    )
                    if (existing) {
                      setSelectedFood(existing); setPickingFood(false)
                      setShowScanner(false); setSearch('')
                      return
                    }
                    const { data: saved } = await supabase.from('foods').insert({
                      user_id: session.user.id, user_email: session.user.email,
                      name: foodData.name, calories: foodData.calories,
                      protein: foodData.protein, carbs: foodData.carbs,
                      fat: foodData.fat, barcode: foodData.barcode,
                    }).select().single()
                    if (saved) {
                      invalidateCache('foods')
                      setAllFoods(prev => [...prev, saved])
                      setSelectedFood(saved)
                      setPickingFood(false); setShowScanner(false); setSearch('')
                    }
                  }}
                  onClose={() => setShowScanner(false)}
                />
              </div>
            )}

            {!showScanner && (
            <div className="flex gap-2">
              <input className="input flex-1" autoFocus value={search}
                onChange={e => setSearch(e.target.value)} placeholder="Caută aliment..." />
              <button onClick={() => setShowScanner(true)}
                className="w-11 h-11 flex items-center justify-center rounded-xl bg-dark-700 border border-dark-600 hover:border-brand-green/50 text-xl shrink-0"
                title="Scanează cod de bare">
                📷
              </button>
            </div>
            )}
            {!showScanner && pantrySuggestions.length > 0 && (
              <div>
                <p className="text-xs text-brand-orange font-medium mb-1.5">🧺 Din cămară</p>
                <div className="space-y-1">
                  {pantrySuggestions.map(p => {
                    const food = allFoods.find(f => f.name.toLowerCase() === p.name.toLowerCase()) || { id: null, name: p.name, calories: p.calories || 0, protein: p.protein || 0, carbs: p.carbs || 0, fat: p.fat || 0 }
                    return (
                      <button key={p.id} onClick={() => {
                        setSelectedFood(food)
                        setUnit(p.unit || 'g')
                        setQuantity(p.quantity > 0 ? String(p.quantity) : '100')
                        setPickingFood(false); setSearch('')
                      }}
                        className="w-full flex justify-between items-center bg-brand-orange/10 border border-brand-orange/20 rounded-xl px-3 py-2.5 hover:bg-brand-orange/20 text-left">
                        <span className="text-sm text-white">{p.name}</span>
                        <span className="text-xs text-brand-orange">{p.quantity > 0 ? `${p.quantity} ${p.unit}` : 'în stoc'}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            <div className="space-y-1.5 max-h-52 overflow-y-auto">
              {filteredFoods.length === 0
                ? (
                  <div className="text-center py-3 space-y-2">
                    <p className="text-slate-500 text-sm">Niciun aliment găsit.</p>
                    {!showNewFoodForm && (
                      <button onClick={() => { setShowNewFoodForm(true); setNewFoodForm(p => ({ ...p, name: search })) }}
                        className="btn-primary w-full py-2.5 text-sm">
                        + Adaugă „{search}" ca aliment nou
                      </button>
                    )}
                  </div>
                )
                : filteredFoods.map(f => (
                  <button key={f.id} onClick={() => { setSelectedFood(f); setPickingFood(false); setSearch('') }}
                    className="w-full flex justify-between items-center bg-dark-700 rounded-xl px-3 py-2.5 hover:bg-dark-600 text-left">
                    <span className="text-sm text-white">{f.name}</span>
                    <span className="text-xs text-slate-400">{f.calories} kcal{f.serving_size ? ` · ${f.serving_size}${f.serving_unit || 'g'}/porție` : '/100g'}</span>
                  </button>
                ))}
            </div>

            {/* Always show option to add new food, even when results exist */}
            {!showNewFoodForm && search.length > 1 && filteredFoods.length > 0 && (
              <button onClick={() => { setShowNewFoodForm(true); setNewFoodForm(p => ({ ...p, name: search })) }}
                className="w-full py-2 rounded-xl border border-dashed border-dark-500 text-slate-500 text-xs hover:border-brand-green/40 hover:text-brand-green transition-all">
                + Adaugă „{search}" ca aliment nou
              </button>
            )}

            {showNewFoodForm && (
              <div className="bg-dark-700 border border-brand-green/30 rounded-xl p-3 space-y-2">
                <p className="text-xs font-semibold text-brand-green">✏️ Aliment nou</p>
                <input className="input" placeholder="Nume *" value={newFoodForm.name}
                  onChange={e => setNewFoodForm(p => ({ ...p, name: e.target.value }))} />
                <div className="grid grid-cols-2 gap-2">
                  {[['calories','kcal /100g *'],['protein','Proteine g'],['carbs','Carbohidrați g'],['fat','Grăsimi g']].map(([k,lbl]) => (
                    <div key={k}>
                      <label className="text-[10px] text-slate-500 block mb-0.5">{lbl}</label>
                      <input className="input" type="number" placeholder="0" value={newFoodForm[k]}
                        onChange={e => setNewFoodForm(p => ({ ...p, [k]: e.target.value }))} />
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowNewFoodForm(false)} className="btn-ghost flex-1 py-2 text-sm">✕</button>
                  <button onClick={saveNewFoodInline} disabled={!newFoodForm.name || !newFoodForm.calories}
                    className="btn-primary flex-1 py-2 text-sm disabled:opacity-40">Salvează & selectează</button>
                </div>
              </div>
            )}

            <button onClick={() => { setPickingFood(false); setSearch(''); setShowNewFoodForm(false); setShowScanner(false) }} className="btn-ghost w-full">← Înapoi</button>
          </div>
        )}
        {pickingTemplate && (
          <div className="space-y-3">
            <input className="input" autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Caută masă..." />
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {filteredTemplates.length === 0 ? <p className="text-slate-500 text-sm text-center py-4">Nicio masă găsită.</p>
                : filteredTemplates.map(t => {
                  const n = calcNutr(t.meal_template_items)
                  const isOwn = t.user_id === session.user.id
                  return (
                    <button key={t.id} onClick={() => { setSelectedTemplate(t); setPickingTemplate(false); setSearch('') }}
                      className="w-full flex justify-between items-center bg-dark-700 rounded-xl px-3 py-2.5 hover:bg-dark-600 text-left">
                      <div>
                        <p className="text-sm text-white">{t.name}</p>
                        {!isOwn && <p className="text-xs text-brand-blue">🌍 Publică</p>}
                      </div>
                      <span className="text-xs text-slate-400">{Math.round(n.calories)} kcal</span>
                    </button>
                  )
                })}
            </div>
            <button onClick={() => { setPickingTemplate(false); setSearch('') }} className="btn-ghost w-full">← Înapoi</button>
          </div>
        )}
      </Modal>

      <Modal open={!!editingItem} onClose={() => setEditingItem(null)} title="Editează cantitate">
        {editingItem && (
          <div className="space-y-3">
            <p className="text-sm text-white font-medium">{editingItem.foods?.name}</p>
            <input className="input" type="number" autoFocus value={editQty} onChange={e => setEditQty(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveEditItem()} />
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setEditingItem(null)} className="btn-ghost py-3">Anulează</button>
              <button onClick={saveEditItem} className="btn-primary py-3">Salvează</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
// ─── MESE ─────────────────────────────────────────────

function MeseTab({ session, isAdmin }) {
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
  const [collapsed, setCollapsed] = useState({})
  const csvRef = useRef()

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const { data: t } = await supabase.from('meal_templates').select(`
      id, name, user_id, is_public,
      meal_template_items(id, quantity_g, foods(id, name, calories, protein, carbs, fat))
    `).order('name')
    // Show only own templates + public ones (hide other users' private templates)
    setTemplates((t || []).filter(r => r.user_id === session.user.id || r.is_public === true))
    const { data: f } = await supabase.from('foods').select('*').order('name')
    setAllFoods(f || [])
    setLoading(false)
  }

  function openAdd() { setForm({ name: '', is_public: false }); setItems([{ food_id: '', food: null, quantity_g: '100' }]); setEditTemplate(null); setShowModal(true) }
  function openEdit(t) {
    setForm({ name: t.name, is_public: t.is_public || false })
    setItems(t.meal_template_items.map(i => ({ food_id: i.foods.id, food: i.foods, quantity_g: String(i.quantity_g) })))
    setEditTemplate(t); setShowModal(true)
  }
  function addItem() { setItems(prev => [...prev, { food_id: '', food: null, quantity_g: '100' }]) }
  function removeItem(i) { setItems(prev => prev.filter((_, idx) => idx !== i)) }
  function updateItem(i, key, val) { setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [key]: val } : it)) }
  function pickFood(food, idx) {
    updateItem(idx, 'food', food)
    updateItem(idx, 'food_id', food.id)
    // Auto-set quantity to serving_size if available
    if (food.serving_size) updateItem(idx, 'quantity_g', String(food.serving_size))
    setPickingIdx(null); setFoodSearch('')
  }

  async function saveTemplate() {
    if (!form.name) return
    const validItems = items.filter(i => i.food_id)
    if (!validItems.length) return
    if (editTemplate) {
      await supabase.from('meal_template_items').delete().eq('meal_template_id', editTemplate.id)
      await supabase.from('meal_templates').update({ name: form.name, is_public: form.is_public }).eq('id', editTemplate.id)
      await supabase.from('meal_template_items').insert(validItems.map(i => ({ meal_template_id: editTemplate.id, food_id: i.food_id, quantity_g: parseFloat(i.quantity_g) })))
    } else {
      const { data: tmpl } = await supabase.from('meal_templates').insert({ user_id: session.user.id, name: form.name, is_public: form.is_public }).select().single()
      await supabase.from('meal_template_items').insert(validItems.map(i => ({ meal_template_id: tmpl.id, food_id: i.food_id, quantity_g: parseFloat(i.quantity_g) })))
    }
    setShowModal(false); loadAll()
  }

  async function deleteTemplate(id) {
    if (confirm('Ștergi masa?')) { await supabase.from('meal_templates').delete().eq('id', id); loadAll() }
  }

  async function handleCSV(e) {
    const file = e.target.files[0]; if (!file) return
    const text = await file.text()
    const grouped = {}
    for (const line of text.trim().split('\n').slice(1)) {
      const [meal_name, food_name, quantity_g] = line.split(',').map(s => s.trim())
      if (!meal_name || !food_name) continue
      if (!grouped[meal_name]) grouped[meal_name] = []
      grouped[meal_name].push({ food_name, quantity_g: parseFloat(quantity_g) || 100 })
    }
    for (const [mealName, foodRows] of Object.entries(grouped)) {
      const { data: tmpl } = await supabase.from('meal_templates').insert({ user_id: session.user.id, name: mealName }).select().single()
      for (const row of foodRows) {
        const food = allFoods.find(f => f.name.toLowerCase() === row.food_name.toLowerCase())
        if (!food) continue
        await supabase.from('meal_template_items').insert({ meal_template_id: tmpl.id, food_id: food.id, quantity_g: row.quantity_g })
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
        {isAdmin && (
          <>
            <button onClick={() => csvRef.current.click()} className="btn-ghost px-4 py-3">📥 CSV</button>
            <input ref={csvRef} type="file" accept=".csv" className="hidden" onChange={handleCSV} />
          </>
        )}
      </div>

      {isAdmin && (
        <div className="bg-dark-700 border border-dark-600 rounded-xl px-3 py-2.5">
          <p className="text-xs text-slate-400 font-medium mb-0.5">Format CSV mese:</p>
          <code className="text-xs text-brand-green">meal_name,food_name,quantity_g</code>
          <p className="text-xs text-slate-600 mt-0.5">⚠️ Alimentele trebuie să existe deja în bază</p>
        </div>
      )}

      {templates.length > 0 && <input className="input" value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Caută masă..." />}

      {loading ? <p className="text-center text-slate-500 text-sm py-4">Se încarcă...</p>
        : filteredTemplates.length === 0 ? (
          <div className="card text-center py-8"><p className="text-4xl mb-2">🍽️</p><p className="text-slate-400 text-sm">Nicio masă creată încă.</p></div>
        ) : (
          <div className="space-y-3">
            {filteredTemplates.map(t => {
              const n = calcNutr(t.meal_template_items)
              const isOwn = t.user_id === session.user.id
              const isOpen = collapsed[t.id] === true
              return (
                <div key={t.id} className="card">
                  <div className="flex items-center justify-between">
                    <button onClick={() => setCollapsed(p => ({ ...p, [t.id]: !isOpen }))}
                      className="flex items-center gap-2 flex-1 text-left min-w-0">
                      <span className="text-lg">🍽️</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="font-semibold text-white text-sm">{t.name}</p>
                          {isOwn && (
                            <span className={`text-xs px-1.5 py-0.5 rounded-full shrink-0 ${t.is_public ? 'bg-brand-blue/20 text-brand-blue' : 'bg-dark-600 text-slate-500'}`}>
                              {t.is_public ? '🌍' : '🔒'}
                            </span>
                          )}
                          {!isOwn && t.is_public && <span className="text-xs text-brand-blue shrink-0">🌍</span>}
                        </div>
                        <p className="text-xs text-slate-400">{Math.round(n.calories)} kcal · {t.meal_template_items.length} alim.</p>
                      </div>
                      <span className="text-xs text-slate-600 ml-2 shrink-0">{isOpen ? '▲' : '▼'}</span>
                    </button>
                    {isOwn && (
                      <div className="flex gap-1.5 ml-2 shrink-0">
                        <button onClick={() => openEdit(t)} className="text-xs bg-dark-700 text-slate-300 px-2 py-1.5 rounded-lg hover:bg-dark-600">✏️</button>
                        <button onClick={() => deleteTemplate(t.id)} className="text-xs bg-red-500/10 text-red-400 px-2 py-1.5 rounded-lg hover:bg-red-500/20">🗑</button>
                      </div>
                    )}
                  </div>
                  {isOpen && (
                    <div className="mt-2 space-y-1">
                      <div className="grid grid-cols-4 gap-1 text-center text-xs text-slate-500 mb-1">
                        {[
                          { l: 'prot.', v: Math.round(n.protein), c: 'text-brand-blue' },
                          { l: 'carb.', v: Math.round(n.carbs), c: 'text-brand-orange' },
                          { l: 'grăs.', v: Math.round(n.fat), c: 'text-brand-purple' },
                        ].map(x => (
                          <div key={x.l} className="bg-dark-700 rounded-lg py-1">
                            <p className={`text-xs font-bold ${x.c}`}>{x.v}g</p>
                            <p className="text-xs text-slate-600">{x.l}</p>
                          </div>
                        ))}
                      </div>
                      {t.meal_template_items.map((item, i) => (
                        <div key={i} className="flex justify-between items-center bg-dark-700 rounded-lg px-3 py-1.5 text-xs">
                          <span className="text-slate-300">{item.foods?.name}</span>
                          <span className="text-slate-500">{item.quantity_g}g · {Math.round((item.foods?.calories || 0) * item.quantity_g / 100)} kcal</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

      <Modal open={showModal} onClose={() => { setShowModal(false); setPickingIdx(null) }} title={editTemplate ? 'Editează masa' : 'Masă nouă'}>
        {pickingIdx === null ? (
          <div className="space-y-4">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Nume masă</label>
              <input className="input" placeholder="ex: Omletă cu legume" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-white">Ingrediente</p>
                <button onClick={addItem} className="text-xs bg-brand-blue/20 text-brand-blue px-2.5 py-1 rounded-lg">+ Adaugă</button>
              </div>
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {items.map((item, i) => (
                  <div key={i} className="bg-dark-700 rounded-xl p-3 flex gap-2 items-center">
                    <button onClick={() => setPickingIdx(i)} className="flex-1 text-left text-sm bg-dark-600 rounded-lg px-3 py-2 text-slate-300 hover:bg-dark-500 truncate">
                      {item.food ? item.food.name : '🔍 Alege aliment...'}
                    </button>
                    <input className="input w-20 text-center" type="number" placeholder="g" value={item.quantity_g} onChange={e => updateItem(i, 'quantity_g', e.target.value)} />
                    {items.length > 1 && <button onClick={() => removeItem(i)} className="text-slate-600 hover:text-red-400">×</button>}
                  </div>
                ))}
              </div>
            </div>
            {items.filter(i => i.food).length > 0 && (
              <div className="bg-dark-700 rounded-xl px-3 py-2 text-xs text-slate-400">
                Total: {Math.round(calcNutr(items.filter(i => i.food).map(i => ({ quantity_g: parseFloat(i.quantity_g) || 0, foods: i.food }))).calories)} kcal
              </div>
            )}
            {/* Public / Privat toggle */}
            <button onClick={() => setForm(p => ({ ...p, is_public: !p.is_public }))}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${form.is_public ? 'bg-brand-blue/10 border-brand-blue/40' : 'bg-dark-700 border-dark-600'}`}>
              <div className="flex items-center gap-2">
                <span>{form.is_public ? '🌍' : '🔒'}</span>
                <div className="text-left">
                  <p className={`text-sm font-medium ${form.is_public ? 'text-brand-blue' : 'text-slate-300'}`}>
                    {form.is_public ? 'Publică' : 'Privată'}
                  </p>
                  <p className="text-xs text-slate-500">{form.is_public ? 'Vizibilă tuturor utilizatorilor' : 'Vizibilă doar ție'}</p>
                </div>
              </div>
              <div className={`w-10 h-5 rounded-full transition-all ${form.is_public ? 'bg-brand-blue' : 'bg-dark-600'}`}>
                <div className={`w-4 h-4 bg-white rounded-full mt-0.5 transition-all ${form.is_public ? 'ml-5.5' : 'ml-0.5'}`} style={{ marginLeft: form.is_public ? '22px' : '2px' }} />
              </div>
            </button>
            <button onClick={saveTemplate} disabled={!form.name || !items.filter(i => i.food_id).length} className="btn-primary w-full py-3">
              {editTemplate ? 'Salvează' : 'Creează masa'}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <input className="input" autoFocus value={foodSearch} onChange={e => setFoodSearch(e.target.value)} placeholder="Caută aliment..." />
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {filteredFoods.length === 0 ? <p className="text-slate-500 text-sm text-center py-4">Niciun aliment găsit.</p>
                : filteredFoods.map(f => (
                  <button key={f.id} onClick={() => pickFood(f, pickingIdx)}
                    className="w-full flex justify-between items-center bg-dark-700 rounded-xl px-3 py-2.5 hover:bg-dark-600 text-left">
                    <span className="text-sm text-white">{f.name}</span>
                    <span className="text-xs text-slate-400">
                      {f.calories} kcal{f.serving_size ? ` · ${f.serving_size}${f.serving_unit||'g'}` : '/100g'}
                    </span>
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

function AlimenteTab({ session, isAdmin }) {
  const [foods, setFoods] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editFood, setEditFood] = useState(null)
  const [form, setForm] = useState({ name: '', calories: '', protein: '', carbs: '', fat: '', serving_size: '', serving_unit: 'g' })
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showAlimScanner, setShowAlimScanner] = useState(false)
  const csvRef = useRef()

  const SERVING_UNITS = ['g', 'ml', 'bucată', 'lingură', 'linguriță', 'felie', 'porție']

  useEffect(() => { loadFoods() }, [])

  async function loadFoods(bust = false) {
    setLoading(true)
    if (bust) invalidateCache('foods')
    const cached = getCached('foods')
    if (cached) { setFoods(cached); setLoading(false); return }
    const { data } = await supabase.from('foods').select('*').order('name')
    const foods = data || []
    setCached('foods', foods)
    setFoods(foods)
    setLoading(false)
  }

  function openAdd() { setForm({ name: '', calories: '', protein: '', carbs: '', fat: '', serving_size: '', serving_unit: 'g', barcode: '' }); setEditFood(null); setShowModal(true) }
  function openEdit(f) {
    setForm({ name: f.name, calories: String(f.calories), protein: String(f.protein), carbs: String(f.carbs), fat: String(f.fat), serving_size: String(f.serving_size || ''), serving_unit: f.serving_unit || 'g' })
    setEditFood(f); setShowModal(true)
  }

  async function saveFood() {
    if (!form.name || !form.calories) return
    // Check duplicate by name (case-insensitive), skip own record when editing
    const duplicate = foods.find(f =>
      f.name.toLowerCase() === form.name.toLowerCase() &&
      (!editFood || f.id !== editFood.id)
    )
    if (duplicate) {
      if (!confirm(`Există deja un aliment numit "${duplicate.name}". Adaugi oricum?`)) return
    }
    const data = {
      user_id: session.user.id,
      user_email: session.user.email,
      name: form.name,
      calories: parseFloat(form.calories),
      protein: parseFloat(form.protein) || 0,
      carbs: parseFloat(form.carbs) || 0,
      fat: parseFloat(form.fat) || 0,
      serving_size: parseFloat(form.serving_size) || null,
      serving_unit: form.serving_unit || 'g',
      barcode: form.barcode || null,
    }
    if (editFood) await supabase.from('foods').update(data).eq('id', editFood.id)
    else await supabase.from('foods').insert(data)
    setShowModal(false); loadFoods(true)
  }

  async function deleteFood(id) {
    if (confirm('Ștergi alimentul?')) { await supabase.from('foods').delete().eq('id', id); loadFoods(true) }
  }

  async function handleCSV(e) {
    const file = e.target.files[0]; if (!file) return
    const rows = await file.text().then(text =>
      text.trim().split('\n').slice(1).map(line => {
        const [name, calories, protein, carbs, fat] = line.split(',').map(s => s.trim())
        if (!name || !calories) return null
        return { user_id: session.user.id, user_email: session.user.email, name, calories: parseFloat(calories) || 0, protein: parseFloat(protein) || 0, carbs: parseFloat(carbs) || 0, fat: parseFloat(fat) || 0 }
      }).filter(Boolean)
    )
    if (rows?.length) await supabase.from('foods').insert(rows)
    e.target.value = ''; loadFoods(true)
    alert(`✅ ${rows?.length || 0} alimente importate!`)
  }

  const filteredFoods = foods.filter(f => f.name.toLowerCase().includes(search.toLowerCase()))
  const canDelete = (f) => isAdmin || f.user_id === session.user.id
  const canEdit = (f) => isAdmin || f.user_id === session.user.id

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button onClick={openAdd} className="btn-primary flex-1 py-3">+ Aliment nou</button>
        {isAdmin && (
          <>
            <button onClick={() => csvRef.current.click()} className="btn-ghost px-4 py-3">📥 CSV</button>
            <input ref={csvRef} type="file" accept=".csv" className="hidden" onChange={handleCSV} />
          </>
        )}
      </div>

      {isAdmin && (
        <div className="bg-dark-700 border border-dark-600 rounded-xl px-3 py-2.5">
          <p className="text-xs text-slate-400 font-medium mb-0.5">Format CSV:</p>
          <code className="text-xs text-brand-green">name,calories,protein,carbs,fat</code>
        </div>
      )}

      {foods.length > 0 && <input className="input" value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Caută aliment..." />}

      {loading ? <p className="text-slate-500 text-center text-sm py-4">Se încarcă...</p>
        : filteredFoods.length === 0 ? (
          <div className="card text-center py-8"><p className="text-4xl mb-2">🥦</p><p className="text-slate-400 text-sm">{search ? 'Niciun rezultat.' : 'Niciun aliment adăugat.'}</p></div>
        ) : (
          <div className="space-y-2">
            {filteredFoods.map(f => (
              <div key={f.id} className="card flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-white">{f.name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{f.calories} kcal · P:{f.protein}g · C:{f.carbs}g · G:{f.fat}g<span className="text-slate-600"> /100g</span></p>
                  {f.serving_size && <p className="text-xs text-brand-blue mt-0.5">📏 1 porție = {f.serving_size} {f.serving_unit || 'g'} ({Math.round(f.calories * f.serving_size / 100)} kcal)</p>}
                </div>
                <div className="flex gap-2 ml-3 shrink-0">
                  {canEdit(f) && <button onClick={() => openEdit(f)} className="text-xs bg-dark-700 text-slate-300 px-2.5 py-1.5 rounded-lg hover:bg-dark-600">✏️</button>}
                  {canDelete(f) && <button onClick={() => deleteFood(f.id)} className="text-xs bg-red-500/10 text-red-400 px-2.5 py-1.5 rounded-lg hover:bg-red-500/20">🗑</button>}
                </div>
              </div>
            ))}
          </div>
        )}

      <Modal open={showModal} onClose={() => { setShowModal(false); setShowAlimScanner(false) }} title={editFood ? 'Editează aliment' : 'Aliment nou'}>
        <div className="space-y-3">
          {isAdmin && editFood?.user_email && (
            <div className="bg-dark-700 rounded-xl px-3 py-2 flex items-center gap-2">
              <span className="text-xs text-slate-500">👤</span>
              <span className="text-xs text-slate-300">{editFood.user_email}</span>
            </div>
          )}

          {/* Scanner cod de bare — doar la adăugare, nu la editare */}
          {!editFood && (
            <div>
              {!showAlimScanner ? (
                <button onClick={() => setShowAlimScanner(true)}
                  className="w-full flex items-center justify-center gap-2 bg-dark-700 border border-dark-600 hover:border-brand-green/50 rounded-xl py-3 text-sm text-slate-300 transition-all">
                  📷 <span>Completează automat din cod de bare</span>
                </button>
              ) : (
                <div className="bg-dark-800 border border-dark-600 rounded-xl p-3">
                  <BarcodeScanner
                    onFound={(foodData) => {
                      setForm(p => ({
                        ...p,
                        name:     foodData.name,
                        calories: String(foodData.calories),
                        protein:  String(foodData.protein),
                        carbs:    String(foodData.carbs),
                        fat:      String(foodData.fat),
                        barcode:  foodData.barcode,
                      }))
                      setShowAlimScanner(false)
                    }}
                    onClose={() => setShowAlimScanner(false)}
                  />
                </div>
              )}
            </div>
          )}

          {!showAlimScanner && (<>
          {[
            { key: 'name', label: 'Nume aliment', placeholder: 'ex: Piept de pui', type: 'text' },
            { key: 'calories', label: 'Calorii (kcal / 100g)', placeholder: '0', type: 'number' },
            { key: 'protein', label: 'Proteine (g / 100g)', placeholder: '0', type: 'number' },
            { key: 'carbs', label: 'Carbohidrați (g / 100g)', placeholder: '0', type: 'number' },
            { key: 'fat', label: 'Grăsimi (g / 100g)', placeholder: '0', type: 'number' },
          ].map(field => (
            <div key={field.key}>
              <label className="text-xs text-slate-400 block mb-1">{field.label}</label>
              <input className="input" type={field.type} placeholder={field.placeholder} value={form[field.key]} onChange={e => setForm(p => ({ ...p, [field.key]: e.target.value }))} />
            </div>
          ))}

          {/* Serving size */}
          <div className="border-t border-dark-600 pt-3">
            <p className="text-xs text-slate-400 mb-2">📏 Mărime porție (opțional)</p>
            <p className="text-xs text-slate-500 mb-2">ex: Baton Kinder = 15g/bucată — apasă butonul de porție la adăugare</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-slate-500 block mb-1">Cantitate porție</label>
                <input className="input" type="number" placeholder="ex: 15" value={form.serving_size} onChange={e => setForm(p => ({ ...p, serving_size: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Unitate</label>
                <select className="input" value={form.serving_unit} onChange={e => setForm(p => ({ ...p, serving_unit: e.target.value }))}>
                  {SERVING_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>
            {form.serving_size && form.calories && (
              <p className="text-xs text-brand-green mt-2">≈ {Math.round(parseFloat(form.calories) * parseFloat(form.serving_size) / 100)} kcal / {form.serving_unit || 'porție'}</p>
            )}
          </div>

          <button onClick={saveFood} className="btn-primary w-full py-3">{editFood ? 'Salvează' : 'Adaugă'}</button>
          </>)}
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
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="card space-y-4">
      <p className="text-xs text-slate-400">Setează obiectivele tale zilnice</p>
      {[
        { key: 'calories', label: 'Calorii', unit: 'kcal', emoji: '🔥' },
        { key: 'protein_g', label: 'Proteine', unit: 'g', emoji: '💪' },
        { key: 'carbs_g', label: 'Carbohidrați', unit: 'g', emoji: '🌾' },
        { key: 'fat_g', label: 'Grăsimi', unit: 'g', emoji: '🥑' },
        { key: 'water_ml', label: 'Apă', unit: 'ml', emoji: '💧' },
      ].map(f => (
        <div key={f.key} className="flex items-center gap-3">
          <div className="flex items-center gap-2 w-32"><span>{f.emoji}</span><span className="text-sm text-slate-300">{f.label}</span></div>
          <div className="flex items-center gap-2 flex-1">
            <input className="input" type="number" value={targets[f.key]} onChange={e => setTargets(p => ({ ...p, [f.key]: parseFloat(e.target.value) || 0 }))} />
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

export default function Nutritie({ session, isAdmin }) {
  const [tab, setTab] = useState('azi')
  const tabs = [
    { key: 'azi',      label: '📅 Azi' },
    { key: 'alimente', label: '🥦 Alimente' },
    { key: 'mese',     label: '🍽️ Mese' },
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
      {tab === 'azi'      && <AziTab session={session} />}
      {tab === 'mese'     && <MeseTab session={session} isAdmin={isAdmin} />}
      {tab === 'alimente' && <AlimenteTab session={session} isAdmin={isAdmin} />}
    </div>
  )
}