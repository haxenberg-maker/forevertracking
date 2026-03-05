import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Modal from '../components/Modal'

const UNITS = ['g', 'kg', 'ml', 'l', 'bucăți', 'linguriță', 'lingură', 'cutie', 'pachet']

export default function Camara({ session }) {
  const [shopping, setShopping] = useState([])
  const [stock, setStock] = useState([])
  const [allFoods, setAllFoods] = useState([])
  const [loading, setLoading] = useState(true)

  // Add shopping item modal
  const [showAddShopping, setShowAddShopping] = useState(false)
  const [addSearch, setAddSearch] = useState('')
  const [selectedFood, setSelectedFood] = useState(null)
  const [addForm, setAddForm] = useState({ name: '', quantity: '', unit: 'g', notes: '' })

  // Add stock item modal
  const [showAddStock, setShowAddStock] = useState(false)
  const [stockSearch, setStockSearch] = useState('')
  const [selectedStockFood, setSelectedStockFood] = useState(null)
  const [stockForm, setStockForm] = useState({ name: '', quantity: '', unit: 'g', calories: '', protein: '', carbs: '', fat: '', notes: '' })

  // Move to stock modal (from shopping)
  const [moveItem, setMoveItem] = useState(null)
  const [moveForm, setMoveForm] = useState({ quantity: '', unit: 'g', calories: '', protein: '', carbs: '', fat: '' })

  // Edit modal
  const [editItem, setEditItem] = useState(null)
  const [editForm, setEditForm] = useState({ name: '', quantity: '', unit: 'g', calories: '', protein: '', carbs: '', fat: '', notes: '' })

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: sh }, { data: st }, { data: foods }] = await Promise.all([
      supabase.from('pantry_items').select('*').eq('user_id', session.user.id).eq('list_type', 'shopping').order('created_at', { ascending: false }),
      supabase.from('pantry_items').select('*').eq('user_id', session.user.id).eq('list_type', 'stock').order('name'),
      supabase.from('foods').select('id, name, calories, protein, carbs, fat').order('name'),
    ])
    setShopping(sh || [])
    setStock(st || [])
    setAllFoods(foods || [])
    setLoading(false)
  }

  // ── SHOPPING ADD ──
  const shoppingSuggestions = addSearch.length > 1
    ? allFoods.filter(f => f.name.toLowerCase().includes(addSearch.toLowerCase())).slice(0, 5)
    : []

  async function addShoppingItem() {
    if (!addForm.name) return
    await supabase.from('pantry_items').insert({
      user_id: session.user.id,
      list_type: 'shopping',
      name: addForm.name,
      quantity: parseFloat(addForm.quantity) || 0,
      unit: addForm.unit,
      notes: addForm.notes || null,
      food_id: selectedFood?.id || null,
      checked: false,
    })
    setShowAddShopping(false)
    setAddSearch(''); setSelectedFood(null)
    setAddForm({ name: '', quantity: '', unit: 'g', notes: '' })
    loadAll()
  }

  // ── MOVE TO STOCK ──
  function openMove(item) {
    setMoveItem(item)
    // Pre-fill with existing food data if linked
    const linked = allFoods.find(f => f.id === item.food_id || f.name.toLowerCase() === item.name.toLowerCase())
    setMoveForm({
      quantity: String(item.quantity || ''),
      unit: item.unit || 'g',
      calories: String(linked?.calories || item.calories || ''),
      protein: String(linked?.protein || item.protein || ''),
      carbs: String(linked?.carbs || item.carbs || ''),
      fat: String(linked?.fat || item.fat || ''),
    })
  }

  async function confirmMove() {
    if (!moveItem) return
    const cal = parseFloat(moveForm.calories) || null
    const qty = parseFloat(moveForm.quantity) || 0

    // Update the same row: change list_type to stock
    const { error } = await supabase.from('pantry_items')
      .update({
        list_type: 'stock',
        checked: false,
        quantity: qty,
        unit: moveForm.unit,
        calories: cal,
        protein: parseFloat(moveForm.protein) || null,
        carbs: parseFloat(moveForm.carbs) || null,
        fat: parseFloat(moveForm.fat) || null,
      })
      .eq('id', moveItem.id)

    if (error) { alert('Eroare: ' + error.message); return }

    // Also save to foods if has calories
    if (cal) {
      const exists = allFoods.find(f => f.name.toLowerCase() === moveItem.name.toLowerCase())
      if (!exists) {
        await supabase.from('foods').insert({
          user_id: session.user.id, user_email: session.user.email,
          name: moveItem.name, calories: cal,
          protein: parseFloat(moveForm.protein) || 0,
          carbs: parseFloat(moveForm.carbs) || 0,
          fat: parseFloat(moveForm.fat) || 0,
        })
      }
    }

    setMoveItem(null)
    loadAll()
  }

  // ── STOCK ADD ──
  const stockSuggestions = stockSearch.length > 1
    ? allFoods.filter(f => f.name.toLowerCase().includes(stockSearch.toLowerCase())).slice(0, 5)
    : []

  function selectStockFood(food) {
    setSelectedStockFood(food)
    setStockSearch(food.name)
    setStockForm(p => ({
      ...p, name: food.name,
      calories: String(food.calories || ''),
      protein: String(food.protein || ''),
      carbs: String(food.carbs || ''),
      fat: String(food.fat || ''),
    }))
  }

  async function addStockItem() {
    if (!stockForm.name) return
    const cal = parseFloat(stockForm.calories) || null
    await supabase.from('pantry_items').insert({
      user_id: session.user.id,
      list_type: 'stock',
      name: stockForm.name,
      quantity: parseFloat(stockForm.quantity) || 0,
      unit: stockForm.unit,
      calories: cal,
      protein: parseFloat(stockForm.protein) || null,
      carbs: parseFloat(stockForm.carbs) || null,
      fat: parseFloat(stockForm.fat) || null,
      notes: stockForm.notes || null,
      food_id: selectedStockFood?.id || null,
      checked: false,
    })
    if (cal && !selectedStockFood) {
      const exists = allFoods.find(f => f.name.toLowerCase() === stockForm.name.toLowerCase())
      if (!exists) await supabase.from('foods').insert({
        user_id: session.user.id, user_email: session.user.email,
        name: stockForm.name, calories: cal,
        protein: parseFloat(stockForm.protein) || 0,
        carbs: parseFloat(stockForm.carbs) || 0,
        fat: parseFloat(stockForm.fat) || 0,
      })
    }
    setShowAddStock(false)
    setStockSearch(''); setSelectedStockFood(null)
    setStockForm({ name: '', quantity: '', unit: 'g', calories: '', protein: '', carbs: '', fat: '', notes: '' })
    loadAll()
  }

  // ── DELETE ──
  async function deleteItem(id) {
    if (!confirm('Ștergi produsul?')) return
    await supabase.from('pantry_items').delete().eq('id', id)
    loadAll()
  }

  // ── EDIT ──
  function openEdit(item) {
    setEditItem(item)
    setEditForm({ name: item.name, quantity: String(item.quantity || ''), unit: item.unit || 'g', calories: String(item.calories || ''), protein: String(item.protein || ''), carbs: String(item.carbs || ''), fat: String(item.fat || ''), notes: item.notes || '' })
  }

  async function saveEdit() {
    if (!editItem) return
    await supabase.from('pantry_items').update({
      name: editForm.name,
      quantity: parseFloat(editForm.quantity) || 0,
      unit: editForm.unit,
      calories: parseFloat(editForm.calories) || null,
      protein: parseFloat(editForm.protein) || null,
      carbs: parseFloat(editForm.carbs) || null,
      fat: parseFloat(editForm.fat) || null,
      notes: editForm.notes || null,
    }).eq('id', editItem.id)
    setEditItem(null); loadAll()
  }

  if (loading) return <div className="page flex items-center justify-center"><div className="w-8 h-8 border-2 border-brand-green border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="page fade-in space-y-4">
      <h1 className="text-2xl font-bold text-white">🧺 Cămară</h1>

      {/* ── LISTA DE CUMPĂRĂTURI ── */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="font-semibold text-white">🛒 De cumpărat</p>
            <p className="text-xs text-slate-500">{shopping.length} produse</p>
          </div>
          <button onClick={() => { setAddSearch(''); setSelectedFood(null); setAddForm({ name: '', quantity: '', unit: 'g', notes: '' }); setShowAddShopping(true) }}
            className="btn-primary px-4 py-2 text-sm">+ Adaugă</button>
        </div>

        {shopping.length === 0 ? (
          <p className="text-slate-600 text-sm text-center py-4">Lista e goală 🎉</p>
        ) : (
          <div className="space-y-2">
            {shopping.map(item => (
              <div key={item.id} className="flex items-center gap-3 bg-dark-700 rounded-xl px-3 py-2.5">
                {/* Check button → opens move modal */}
                <button onClick={() => openMove(item)}
                  className="w-6 h-6 rounded-full border-2 border-slate-500 hover:border-brand-green hover:bg-brand-green/20 flex items-center justify-center shrink-0 transition-all">
                  <span className="text-slate-600 text-xs">✓</span>
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white">{item.name}</p>
                  {item.quantity > 0 && <p className="text-xs text-slate-500">{item.quantity} {item.unit}</p>}
                  {item.notes && <p className="text-xs text-slate-600 italic">{item.notes}</p>}
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button onClick={() => openEdit(item)} className="text-xs text-slate-500 hover:text-slate-300 px-1.5 py-1">✏️</button>
                  <button onClick={() => deleteItem(item.id)} className="text-xs text-slate-600 hover:text-red-400 px-1.5 py-1">🗑</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── STOC CASĂ ── */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="font-semibold text-white">📦 Stoc casă</p>
            <p className="text-xs text-slate-500">{stock.length} produse</p>
          </div>
          <button onClick={() => { setStockSearch(''); setSelectedStockFood(null); setStockForm({ name: '', quantity: '', unit: 'g', calories: '', protein: '', carbs: '', fat: '', notes: '' }); setShowAddStock(true) }}
            className="bg-dark-700 border border-dark-600 text-slate-300 px-4 py-2 text-sm rounded-xl hover:bg-dark-600">+ Adaugă</button>
        </div>

        {stock.length === 0 ? (
          <p className="text-slate-600 text-sm text-center py-4">Niciun produs în stoc.</p>
        ) : (
          <div className="space-y-2">
            {stock.map(item => (
              <div key={item.id} className="flex items-center gap-3 bg-dark-700 rounded-xl px-3 py-2.5">
                <span className="text-lg shrink-0">📦</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white">{item.name}</p>
                  <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
                    {item.quantity > 0 && <span className="text-xs text-slate-400">{item.quantity} {item.unit}</span>}
                    {item.calories && <span className="text-xs text-slate-600">{item.calories} kcal/100g</span>}
                  </div>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button onClick={() => openEdit(item)} className="text-xs text-slate-500 hover:text-slate-300 px-1.5 py-1">✏️</button>
                  <button onClick={() => deleteItem(item.id)} className="text-xs text-slate-600 hover:text-red-400 px-1.5 py-1">🗑</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── MODAL: Adaugă la cumpărături ── */}
      <Modal open={showAddShopping} onClose={() => setShowAddShopping(false)} title="🛒 Adaugă la cumpărături">
        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-400 block mb-1">Produs *</label>
            <input className="input" autoFocus placeholder="ex: Lapte, Ovăz..."
              value={addSearch}
              onChange={e => { setAddSearch(e.target.value); setAddForm(p => ({ ...p, name: e.target.value })); if (selectedFood) setSelectedFood(null) }} />
            {shoppingSuggestions.length > 0 && !selectedFood && (
              <div className="mt-1 space-y-1 max-h-36 overflow-y-auto">
                {shoppingSuggestions.map(f => (
                  <button key={f.id} onClick={() => { setSelectedFood(f); setAddSearch(f.name); setAddForm(p => ({ ...p, name: f.name })) }}
                    className="w-full flex justify-between bg-dark-700 hover:bg-dark-600 rounded-xl px-3 py-2 text-left">
                    <span className="text-sm text-white">{f.name}</span>
                    <span className="text-xs text-brand-green">{f.calories} kcal ✓</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Cantitate (opțional)</label>
              <input className="input" type="number" placeholder="ex: 1" value={addForm.quantity} onChange={e => setAddForm(p => ({ ...p, quantity: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Unitate</label>
              <select className="input" value={addForm.unit} onChange={e => setAddForm(p => ({ ...p, unit: e.target.value }))}>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <button onClick={addShoppingItem} disabled={!addForm.name} className="btn-primary w-full py-3 disabled:opacity-50">Adaugă</button>
        </div>
      </Modal>

      {/* ── MODAL: Mută în stoc ── */}
      <Modal open={!!moveItem} onClose={() => setMoveItem(null)} title={`📦 ${moveItem?.name || ''} → Stoc casă`}>
        <div className="space-y-4">
          <p className="text-xs text-slate-400">Ce ai cumpărat? Specifică cantitatea și mută în stoc:</p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Cantitate *</label>
              <input className="input text-lg font-bold" type="number" placeholder="ex: 500" autoFocus
                value={moveForm.quantity} onChange={e => setMoveForm(p => ({ ...p, quantity: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Unitate</label>
              <select className="input" value={moveForm.unit} onChange={e => setMoveForm(p => ({ ...p, unit: e.target.value }))}>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>

          {/* Nutrition only if not already set */}
          {!moveItem?.calories && (
            <div className="border-t border-dark-600 pt-3">
              <p className="text-xs text-slate-400 mb-2">Valori nutriționale per 100g <span className="text-slate-600">(opțional)</span></p>
              <div className="grid grid-cols-2 gap-2">
                {[{ k: 'calories', l: 'Calorii kcal' }, { k: 'protein', l: 'Proteine g' }, { k: 'carbs', l: 'Carbohidrați g' }, { k: 'fat', l: 'Grăsimi g' }].map(f => (
                  <div key={f.k}>
                    <label className="text-xs text-slate-500 block mb-1">{f.l}</label>
                    <input className="input" type="number" placeholder="0" value={moveForm[f.k]}
                      onChange={e => setMoveForm(p => ({ ...p, [f.k]: e.target.value }))} />
                  </div>
                ))}
              </div>
              {moveForm.calories && <p className="text-xs text-brand-green mt-1.5">✓ Se salvează și în Alimente</p>}
            </div>
          )}

          {moveItem?.calories && (
            <div className="bg-brand-green/10 border border-brand-green/20 rounded-xl px-3 py-2 text-xs text-slate-300">
              {moveItem.calories} kcal · P:{moveItem.protein || 0}g · C:{moveItem.carbs || 0}g · G:{moveItem.fat || 0}g <span className="text-slate-500">per 100g</span>
            </div>
          )}

          <button onClick={confirmMove} className="btn-primary w-full py-3 text-base font-semibold">
            📦 Mută în stoc casă
          </button>
        </div>
      </Modal>

      {/* ── MODAL: Adaugă direct în stoc ── */}
      <Modal open={showAddStock} onClose={() => setShowAddStock(false)} title="📦 Adaugă în stoc casă">
        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-400 block mb-1">Produs *</label>
            <input className="input" autoFocus placeholder="ex: Ouă, Brânză..."
              value={stockSearch}
              onChange={e => { setStockSearch(e.target.value); setStockForm(p => ({ ...p, name: e.target.value })); if (selectedStockFood) setSelectedStockFood(null) }} />
            {stockSuggestions.length > 0 && !selectedStockFood && (
              <div className="mt-1 space-y-1 max-h-36 overflow-y-auto">
                {stockSuggestions.map(f => (
                  <button key={f.id} onClick={() => selectStockFood(f)}
                    className="w-full flex justify-between bg-dark-700 hover:bg-dark-600 rounded-xl px-3 py-2 text-left">
                    <span className="text-sm text-white">{f.name}</span>
                    <span className="text-xs text-brand-green">{f.calories} kcal ✓</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Cantitate</label>
              <input className="input" type="number" placeholder="0" value={stockForm.quantity} onChange={e => setStockForm(p => ({ ...p, quantity: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Unitate</label>
              <select className="input" value={stockForm.unit} onChange={e => setStockForm(p => ({ ...p, unit: e.target.value }))}>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          {!selectedStockFood && (
            <div className="grid grid-cols-2 gap-2">
              {[{ k: 'calories', l: 'Calorii kcal/100g' }, { k: 'protein', l: 'Proteine g' }, { k: 'carbs', l: 'Carbohidrați g' }, { k: 'fat', l: 'Grăsimi g' }].map(f => (
                <div key={f.k}>
                  <label className="text-xs text-slate-500 block mb-1">{f.l}</label>
                  <input className="input" type="number" placeholder="0" value={stockForm[f.k]}
                    onChange={e => setStockForm(p => ({ ...p, [f.k]: e.target.value }))} />
                </div>
              ))}
            </div>
          )}
          <button onClick={addStockItem} disabled={!stockForm.name} className="btn-primary w-full py-3 disabled:opacity-50">Adaugă în stoc</button>
        </div>
      </Modal>

      {/* ── MODAL: Edit ── */}
      <Modal open={!!editItem} onClose={() => setEditItem(null)} title={`✏️ ${editItem?.name || ''}`}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Cantitate</label>
              <input className="input" type="number" value={editForm.quantity} onChange={e => setEditForm(p => ({ ...p, quantity: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Unitate</label>
              <select className="input" value={editForm.unit} onChange={e => setEditForm(p => ({ ...p, unit: e.target.value }))}>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[{ k: 'calories', l: 'Calorii kcal/100g' }, { k: 'protein', l: 'Proteine g' }, { k: 'carbs', l: 'Carbohidrați g' }, { k: 'fat', l: 'Grăsimi g' }].map(f => (
              <div key={f.k}>
                <label className="text-xs text-slate-500 block mb-1">{f.l}</label>
                <input className="input" type="number" placeholder="0" value={editForm[f.k]} onChange={e => setEditForm(p => ({ ...p, [f.k]: e.target.value }))} />
              </div>
            ))}
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Notițe</label>
            <input className="input" placeholder="opțional" value={editForm.notes} onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))} />
          </div>
          <button onClick={saveEdit} className="btn-primary w-full py-3">Salvează</button>
        </div>
      </Modal>
    </div>
  )
}