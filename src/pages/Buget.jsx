import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Modal from '../components/Modal'

function getToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

const EXPENSE_CATS = ['🍔 Mâncare','🏋️ Sport','📱 Abonamente','🚗 Transport','💊 Sănătate','🎬 Divertisment','🛍️ Cumpărături','🏠 Locuință','📚 Educație','💸 Altele']
const INCOME_CATS  = ['💼 Salariu','🧑‍💻 Freelance','🎁 Cadou','📈 Investiții','💰 Altele']

function fmt(n) {
  return new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)
}

export default function Buget({ session }) {
  const today = getToday()
  const now = new Date()

  const [entries, setEntries]         = useState([])
  const [loading, setLoading]         = useState(true)
  const [showModal, setShowModal]     = useState(false)
  const [editEntry, setEditEntry]     = useState(null)
  const [tab, setTab]                 = useState('luna')  // luna | toate | statistici
  const [viewMonth, setViewMonth]     = useState(now.getMonth())
  const [viewYear, setViewYear]       = useState(now.getFullYear())

  const emptyForm = { type: 'expense', amount: '', category: EXPENSE_CATS[0], note: '', date: today }
  const [form, setForm]               = useState(emptyForm)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('budget_entries')
      .select('*')
      .eq('user_id', session.user.id)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
    setEntries(data || [])
    setLoading(false)
  }

  function openAdd() {
    setForm(emptyForm)
    setEditEntry(null)
    setShowModal(true)
  }

  function openEdit(e) {
    setForm({ type: e.type, amount: String(e.amount), category: e.category, note: e.note || '', date: e.date })
    setEditEntry(e)
    setShowModal(true)
  }

  async function save() {
    if (!form.amount || isNaN(parseFloat(form.amount))) return
    const data = {
      user_id:  session.user.id,
      type:     form.type,
      amount:   parseFloat(form.amount),
      category: form.category,
      note:     form.note.trim() || null,
      date:     form.date,
    }
    if (editEntry) await supabase.from('budget_entries').update(data).eq('id', editEntry.id)
    else           await supabase.from('budget_entries').insert(data)
    setShowModal(false)
    load()
  }

  async function del(id) {
    if (!confirm('Ștergi această înregistrare?')) return
    await supabase.from('budget_entries').delete().eq('id', id)
    load()
  }

  // ── Derived data ────────────────────────────────────
  const monthEntries = entries.filter(e => {
    const d = new Date(e.date + 'T12:00:00')
    return d.getMonth() === viewMonth && d.getFullYear() === viewYear
  })

  const totalIncome  = monthEntries.filter(e => e.type === 'income') .reduce((s, e) => s + e.amount, 0)
  const totalExpense = monthEntries.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0)
  const balance      = totalIncome - totalExpense

  // Category breakdown for expenses this month
  const catMap = {}
  monthEntries.filter(e => e.type === 'expense').forEach(e => {
    catMap[e.category] = (catMap[e.category] || 0) + e.amount
  })
  const catBreakdown = Object.entries(catMap).sort((a,b) => b[1] - a[1])

  const MONTHS_RO = ['Ian','Feb','Mar','Apr','Mai','Iun','Iul','Aug','Sep','Oct','Nov','Dec']
  const MONTHS_FULL = ['Ianuarie','Februarie','Martie','Aprilie','Mai','Iunie','Iulie','August','Septembrie','Octombrie','Noiembrie','Decembrie']

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) }
    else setViewMonth(m => m + 1)
  }

  const displayList = tab === 'luna' ? monthEntries : entries

  // Last 6 months trend
  const trendMonths = Array.from({ length: 6 }, (_, i) => {
    let m = now.getMonth() - (5 - i)
    let y = now.getFullYear()
    if (m < 0) { m += 12; y -= 1 }
    const monthE = entries.filter(e => {
      const d = new Date(e.date + 'T12:00:00')
      return d.getMonth() === m && d.getFullYear() === y
    })
    return {
      label: MONTHS_RO[m],
      income:  monthE.filter(e => e.type === 'income') .reduce((s,e) => s + e.amount, 0),
      expense: monthE.filter(e => e.type === 'expense').reduce((s,e) => s + e.amount, 0),
    }
  })
  const maxTrend = Math.max(...trendMonths.map(t => Math.max(t.income, t.expense)), 1)

  return (
    <div className="page fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-white">💰 Buget</h1>
          <p className="text-xs text-slate-500 mt-0.5">Datele tale sunt private · doar tu le vezi</p>
        </div>
        <button onClick={openAdd} className="btn-primary px-4 py-2.5 text-sm">+ Adaugă</button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-dark-700 rounded-xl p-1 mb-4">
        {[['luna','📅 Luna'],['toate','📋 Toate'],['statistici','📊 Stats']].map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${tab === k ? 'bg-dark-600 text-white' : 'text-slate-400'}`}>
            {l}
          </button>
        ))}
      </div>

      {/* Month nav (luna + statistici tabs) */}
      {(tab === 'luna' || tab === 'statistici') && (
        <div className="flex items-center justify-between mb-3">
          <button onClick={prevMonth} className="w-9 h-9 flex items-center justify-center rounded-xl bg-dark-700 text-slate-300 hover:bg-dark-600">‹</button>
          <p className="text-sm font-semibold text-white">{MONTHS_FULL[viewMonth]} {viewYear}</p>
          <button onClick={nextMonth} disabled={viewMonth === now.getMonth() && viewYear === now.getFullYear()}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-dark-700 text-slate-300 hover:bg-dark-600 disabled:opacity-30">›</button>
        </div>
      )}

      {/* Summary card */}
      {tab !== 'statistici' && (
        <div className="card mb-4 bg-gradient-to-br from-dark-700 to-dark-800">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-lg font-bold text-brand-green">{fmt(totalIncome)}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">↑ Venituri</p>
            </div>
            <div>
              <p className={`text-lg font-bold ${balance >= 0 ? 'text-white' : 'text-red-400'}`}>{fmt(balance)}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">⚖️ Sold</p>
            </div>
            <div>
              <p className="text-lg font-bold text-red-400">{fmt(totalExpense)}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">↓ Cheltuieli</p>
            </div>
          </div>
          {totalIncome > 0 && (
            <div className="mt-3 pt-3 border-t border-dark-600">
              <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                <span>Cheltuieli din venituri</span>
                <span>{Math.round(totalExpense / totalIncome * 100)}%</span>
              </div>
              <div className="h-1.5 bg-dark-600 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, totalExpense / totalIncome * 100)}%`,
                    backgroundColor: totalExpense > totalIncome ? '#f87171' : totalExpense / totalIncome > 0.8 ? '#fb923c' : '#4ade80'
                  }} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Statistics tab */}
      {tab === 'statistici' && (
        <div className="space-y-4">
          {/* Category breakdown */}
          <div className="card">
            <p className="text-sm font-semibold text-white mb-3">Cheltuieli pe categorii</p>
            {catBreakdown.length === 0
              ? <p className="text-slate-500 text-sm text-center py-4">Nicio cheltuială luna asta.</p>
              : <div className="space-y-2.5">
                  {catBreakdown.map(([cat, amt]) => (
                    <div key={cat}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-300">{cat}</span>
                        <span className="text-white font-medium">{fmt(amt)} RON</span>
                      </div>
                      <div className="h-1.5 bg-dark-600 rounded-full overflow-hidden">
                        <div className="h-full bg-red-400/70 rounded-full"
                          style={{ width: `${amt / catBreakdown[0][1] * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
            }
          </div>

          {/* 6-month trend */}
          <div className="card">
            <p className="text-sm font-semibold text-white mb-3">Ultimele 6 luni</p>
            <div className="flex items-end justify-between gap-1.5 h-28">
              {trendMonths.map((t, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex gap-0.5 items-end" style={{ height: '80px' }}>
                    <div className="flex-1 rounded-t-sm bg-brand-green/50 transition-all"
                      style={{ height: `${t.income / maxTrend * 100}%`, minHeight: t.income > 0 ? '3px' : '0' }} />
                    <div className="flex-1 rounded-t-sm bg-red-400/50 transition-all"
                      style={{ height: `${t.expense / maxTrend * 100}%`, minHeight: t.expense > 0 ? '3px' : '0' }} />
                  </div>
                  <p className="text-[10px] text-slate-500">{t.label}</p>
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-1">
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-sm bg-brand-green/50"/><span className="text-[10px] text-slate-500">Venituri</span></div>
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-sm bg-red-400/50"/><span className="text-[10px] text-slate-500">Cheltuieli</span></div>
            </div>
          </div>
        </div>
      )}

      {/* Entry list */}
      {tab !== 'statistici' && (
        loading ? <p className="text-center text-slate-500 text-sm py-8">Se încarcă...</p>
        : displayList.length === 0
          ? <div className="card text-center py-10"><p className="text-3xl mb-2">💸</p><p className="text-slate-400 text-sm">{tab === 'luna' ? 'Nicio înregistrare luna asta.' : 'Nicio înregistrare încă.'}</p></div>
          : <div className="space-y-2">
              {displayList.map(e => (
                <div key={e.id} className="card flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0 ${e.type === 'income' ? 'bg-brand-green/15' : 'bg-red-400/10'}`}>
                    {e.category.split(' ')[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {e.category.split(' ').slice(1).join(' ')}
                      {e.note && <span className="text-slate-500 font-normal"> · {e.note}</span>}
                    </p>
                    <p className="text-xs text-slate-500">{new Date(e.date + 'T12:00:00').toLocaleDateString('ro-RO', { day:'numeric', month:'short', year: tab === 'toate' ? 'numeric' : undefined })}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-bold ${e.type === 'income' ? 'text-brand-green' : 'text-red-400'}`}>
                      {e.type === 'income' ? '+' : '-'}{fmt(e.amount)}
                    </p>
                    <p className="text-[10px] text-slate-600">RON</p>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <button onClick={() => openEdit(e)} className="text-xs bg-dark-700 text-slate-400 px-2 py-1 rounded-lg hover:bg-dark-600">✏️</button>
                    <button onClick={() => del(e.id)} className="text-xs bg-red-500/10 text-red-400 px-2 py-1 rounded-lg hover:bg-red-500/20">🗑</button>
                  </div>
                </div>
              ))}
            </div>
      )}

      {/* Add/Edit Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editEntry ? 'Editează' : 'Înregistrare nouă'}>
        <div className="space-y-4">
          {/* Type toggle */}
          <div className="flex gap-1 bg-dark-700 rounded-xl p-1">
            <button onClick={() => setForm(p => ({ ...p, type: 'expense', category: EXPENSE_CATS[0] }))}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${form.type === 'expense' ? 'bg-red-500/20 text-red-400' : 'text-slate-400'}`}>
              ↓ Cheltuială
            </button>
            <button onClick={() => setForm(p => ({ ...p, type: 'income', category: INCOME_CATS[0] }))}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${form.type === 'income' ? 'bg-brand-green/20 text-brand-green' : 'text-slate-400'}`}>
              ↑ Venit
            </button>
          </div>

          {/* Amount */}
          <div>
            <label className="text-xs text-slate-400 block mb-1">Sumă (RON) *</label>
            <input className="input text-lg font-bold" type="number" step="0.01" placeholder="0.00"
              value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
              autoFocus />
          </div>

          {/* Category */}
          <div>
            <label className="text-xs text-slate-400 block mb-1.5">Categorie</label>
            <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto">
              {(form.type === 'expense' ? EXPENSE_CATS : INCOME_CATS).map(cat => (
                <button key={cat} onClick={() => setForm(p => ({ ...p, category: cat }))}
                  className={`text-left px-3 py-2 rounded-xl text-xs transition-all ${form.category === cat ? 'bg-dark-500 text-white ring-1 ring-white/20' : 'bg-dark-700 text-slate-400 hover:bg-dark-600'}`}>
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Date + Note */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Data</label>
              <input className="input" type="date" value={form.date}
                onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Notă (opțional)</label>
              <input className="input" placeholder="ex: Netflix" value={form.note}
                onChange={e => setForm(p => ({ ...p, note: e.target.value }))} />
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={() => setShowModal(false)} className="btn-ghost flex-1 py-3">Anulează</button>
            <button onClick={save} disabled={!form.amount} className="btn-primary flex-1 py-3 disabled:opacity-40">
              {editEntry ? 'Salvează' : 'Adaugă'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
