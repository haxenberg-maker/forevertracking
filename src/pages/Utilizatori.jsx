import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Modal from '../components/Modal'

function MacroSlider({ label, emoji, colorClass, colorHex, value, onChange }) {
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs text-slate-300">{emoji} {label}</span>
        <span className={`text-sm font-bold ${colorClass}`}>{value}%</span>
      </div>
      <input type="range" min={10} max={70} step={1} value={value}
        onChange={e => onChange(parseInt(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
        style={{ accentColor: colorHex }} />
    </div>
  )
}

const ACCOUNT_TYPES = [
  { key: 'user',  label: '👤 Utilizator', color: 'text-slate-400' },
  { key: 'elev',  label: '🎓 Elev',       color: 'text-brand-blue' },
  { key: 'admin', label: '⭐ Admin',       color: 'text-brand-orange' },
]
const ACTIVITY_LEVELS = [
  { key: 'sedentary',   label: 'Sedentar',       emoji: '🪑', mult: 1.2 },
  { key: 'light',       label: 'Ușor activ',      emoji: '🚶', mult: 1.375 },
  { key: 'moderate',    label: 'Moderat activ',   emoji: '🏃', mult: 1.55 },
  { key: 'active',      label: 'Activ',           emoji: '💪', mult: 1.725 },
  { key: 'very_active', label: 'Foarte activ',    emoji: '🏋️', mult: 1.9 },
]
const GOALS = [
  { key: 'lose',     label: 'Slăbire',   kcalAdj: -400 },
  { key: 'maintain', label: 'Menținere', kcalAdj: 0 },
  { key: 'gain',     label: 'Masă',      kcalAdj: 300 },
]

function calcBMR(gender, weight, height, age) {
  if (!weight || !height || !age) return 0
  return gender === 'male'
    ? 10 * weight + 6.25 * height - 5 * age + 5
    : 10 * weight + 6.25 * height - 5 * age - 161
}

function ProgressBar({ pct, color = 'bg-brand-green' }) {
  const w = Math.min(Math.round(pct), 100)
  return (
    <div className="h-1.5 bg-dark-600 rounded-full overflow-hidden">
      <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${w}%` }} />
    </div>
  )
}

function PctBadge({ pct }) {
  const v = Math.round(pct)
  const color = v >= 90 ? 'text-brand-green' : v >= 60 ? 'text-brand-orange' : 'text-red-400'
  return <span className={`text-xs font-bold ${color}`}>{v}%</span>
}

export default function Utilizatori({ session }) {
  const [users, setUsers]               = useState([])
  const [loading, setLoading]           = useState(true)
  const [selectedUser, setSelectedUser] = useState(null)
  const [showModal, setShowModal]       = useState(false)
  const [activeTab, setActiveTab]       = useState('profile') // 'profile' | 'history'
  const [saving, setSaving]             = useState(false)
  const [saved, setSaved]               = useState(false)
  // Edit fields
  const [editTargets, setEditTargets]   = useState({ calories: '', protein_g: '', carbs_g: '', fat_g: '', water_ml: '' })
  const [editActivity, setEditActivity] = useState('moderate')
  const [editAccountType, setEditAccountType] = useState('user')
  const [editGoal, setEditGoal]         = useState('maintain')
  // Macro sliders
  const [macroP, setMacroP] = useState(25)
  const [macroC, setMacroC] = useState(45)
  const [macroF, setMacroF] = useState(30)
  // History
  const [history, setHistory]           = useState([])
  const [histLoading, setHistLoading]   = useState(false)

  const macroTotal = macroP + macroC + macroF
  const macroOk = macroTotal === 100
  function setProtein(v) { setMacroP(v); setMacroC(Math.max(10, Math.min(70, 100 - v - macroF))) }
  function setFat(v)     { setMacroF(v); setMacroC(Math.max(10, Math.min(70, 100 - macroP - v))) }
  function setCarbs(v)   { setMacroC(v); setMacroF(Math.max(10, Math.min(70, 100 - macroP - v))) }

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('user_profiles').select('*').order('created_at', { ascending: false })
    setUsers(data || [])
    setLoading(false)
  }

  async function openUser(u) {
    setSelectedUser(u)
    setEditAccountType(u.account_type || 'user')
    setEditActivity(u.activity_level || 'moderate')
    setEditGoal(u.goal || 'maintain')
    setActiveTab('profile')
    setHistory([]) // reset history when switching user
    const { data: targets } = await supabase.from('user_targets').select('*').eq('user_id', u.user_id).single()
    const cal = targets?.calories ?? ''
    const pg  = targets?.protein_g ?? ''
    const fg  = targets?.fat_g ?? ''
    setEditTargets({
      calories: String(cal),
      protein_g: String(pg),
      carbs_g: String(targets?.carbs_g ?? ''),
      fat_g: String(fg),
      water_ml: String(targets?.water_ml ?? ''),
    })
    if (pg && fg && cal) {
      const p = Math.round((pg * 4 / cal) * 100)
      const f = Math.round((fg * 9 / cal) * 100)
      setMacroP(Math.max(10, Math.min(70, p)))
      setMacroF(Math.max(10, Math.min(70, f)))
      setMacroC(Math.max(10, 100 - p - f))
    } else { setMacroP(25); setMacroC(45); setMacroF(30) }
    setShowModal(true)
  }

  async function loadHistory(uid, targets) {
    setHistLoading(true)
    const days = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i)
      days.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`)
    }
    const oldest = days[0]

    const [
      { data: meals },
      { data: water },
      { data: workoutLogs },
      { data: supLogs },
      { data: allSups },
      { data: allSchedules },
    ] = await Promise.all([
      supabase.from('meal_logs').select('date, meal_items(quantity_g, foods(calories))').eq('user_id', uid).gte('date', oldest),
      supabase.from('water_logs').select('date, amount_ml').eq('user_id', uid).gte('date', oldest),
      supabase.from('workout_schedule_logs').select('date, done').eq('user_id', uid).gte('date', oldest),
      supabase.from('supplement_logs').select('date, taken').eq('user_id', uid).gte('date', oldest),
      supabase.from('daily_supplements').select('id').eq('user_id', uid),
      supabase.from('workout_schedules').select('id, recurrence, weekdays, scheduled_date').eq('user_id', uid),
    ])

    const result = days.map(date => {
      // Calories
      const dayMeals = (meals || []).filter(m => m.date === date)
      const kcal = dayMeals.reduce((s, m) => s + (m.meal_items || []).reduce((ss, it) =>
        ss + ((it.foods?.calories || 0) * (it.quantity_g || 0) / 100), 0), 0)

      // Water
      const waterMl = (water || []).filter(w => w.date === date).reduce((s, w) => s + (w.amount_ml || 0), 0)

      // Supplements
      const supTotal = (allSups || []).length
      const supDone  = (supLogs || []).filter(l => l.date === date && l.taken).length

      // Workouts planned that day
      const wd = new Date(date + 'T12:00:00').getDay()
      const wdIdx = wd === 0 ? 6 : wd - 1
      const planned = (allSchedules || []).filter(s =>
        (s.recurrence === 'once' && s.scheduled_date === date) ||
        (s.recurrence === 'weekly' && (s.weekdays || []).includes(wdIdx))
      ).length
      const done = (workoutLogs || []).filter(l => l.date === date && l.done).length

      const calTarget  = parseInt(editTargets.calories) || 2000
      const waterTarget = parseInt(editTargets.water_ml) || 2000

      return {
        date,
        label: new Date(date + 'T12:00:00').toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' }),
        kcal: Math.round(kcal),
        kcalPct:    calTarget  ? (kcal / calTarget * 100)  : 0,
        waterMl,
        waterPct:   waterTarget ? (waterMl / waterTarget * 100) : 0,
        supPct:     supTotal ? (supDone / supTotal * 100) : null,
        workoutPct: planned > 0 ? (done / planned * 100) : null,
      }
    })

    setHistory(result)
    setHistLoading(false)
  }

  async function saveUser() {
    if (!selectedUser) return
    setSaving(true)
    await supabase.from('user_profiles').update({
      account_type: editAccountType,
      activity_level: editActivity,
      goal: editGoal,
    }).eq('user_id', selectedUser.user_id)

    const targetKcal = parseInt(editTargets.calories) || 2000
    await supabase.from('user_targets').upsert({
      user_id: selectedUser.user_id,
      calories:   targetKcal,
      protein_g:  Math.round((targetKcal * macroP / 100) / 4),
      carbs_g:    Math.round((targetKcal * macroC / 100) / 4),
      fat_g:      Math.round((targetKcal * macroF / 100) / 9),
      water_ml:   parseInt(editTargets.water_ml) || 0,
    }, { onConflict: 'user_id' })

    setSaving(false); setSaved(true)
    setTimeout(() => { setSaved(false); setShowModal(false); load() }, 1200)
  }

  // Calorie algorithm
  const u = selectedUser
  const bmr = calcBMR(u?.gender, u?.weight_kg, u?.height_cm, u?.age)
  const actMult = ACTIVITY_LEVELS.find(a => a.key === editActivity)?.mult || 1.55
  const tdee = Math.round(bmr * actMult)
  const goalAdj = GOALS.find(g => g.key === u?.goal)?.kcalAdj || 0
  const suggestedCal = tdee + goalAdj
  const calTarget = parseInt(editTargets.calories) || 0

  const typeInfo = (type) => ACCOUNT_TYPES.find(t => t.key === type) || ACCOUNT_TYPES[0]

  return (
    <div className="page fade-in">
      <h1 className="text-2xl font-bold text-white mb-1">👥 Utilizatori</h1>
      <p className="text-slate-500 text-xs mb-4">{users.length} conturi înregistrate</p>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-2">
          {users.map(u => {
            const t = typeInfo(u.account_type)
            return (
              <button key={u.user_id} onClick={() => openUser(u)}
                className="w-full card flex items-center gap-3 hover:border-brand-green/30 transition-all text-left">
                <div className="w-10 h-10 rounded-full bg-dark-600 flex items-center justify-center shrink-0 text-lg">
                  {u.account_type === 'admin' ? '⭐' : u.account_type === 'elev' ? '🎓' : '👤'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-white text-sm truncate">{u.full_name || '—'}</p>
                  <p className="text-xs text-slate-500 truncate">{u.email || u.user_id?.slice(0, 8)}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className={`text-xs font-medium ${t.color}`}>{t.label}</p>
                  <p className="text-xs text-slate-600 mt-0.5">{ACTIVITY_LEVELS.find(a => a.key === u.activity_level)?.label || 'Moderat'}</p>
                </div>
              </button>
            )
          })}
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title={selectedUser?.full_name || 'Utilizator'}>
        {selectedUser && (
          <div className="space-y-4">
            {/* Tabs */}
            <div className="flex gap-1 bg-dark-700 rounded-xl p-1">
              {[
                { k: 'profile', l: '👤 Profil' },
                { k: 'history', l: '📊 Istoric' },
              ].map(t => (
                <button key={t.k}
                  onClick={() => {
                    setActiveTab(t.k)
                    if (t.k === 'history' && history.length === 0) loadHistory(selectedUser.user_id, editTargets)
                  }}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${activeTab === t.k ? 'bg-dark-500 text-white' : 'text-slate-500'}`}>
                  {t.l}
                </button>
              ))}
            </div>

            {/* ── PROFILE TAB ── */}
            {activeTab === 'profile' && (
              <div className="space-y-4">
                {/* Basic info */}
                <div className="bg-dark-700 rounded-xl px-3 py-2.5 space-y-0.5">
                  <p className="text-xs text-slate-400">{selectedUser.email}</p>
                  {selectedUser.gender && (
                    <p className="text-xs text-slate-500">
                      {selectedUser.gender === 'male' ? '👨' : '👩'} {selectedUser.gender} · {selectedUser.age} ani · {selectedUser.weight_kg} kg · {selectedUser.height_cm} cm
                    </p>
                  )}
                  {selectedUser.goal && (
                    <p className="text-xs text-slate-500">Obiectiv: {GOALS.find(g => g.key === selectedUser.goal)?.label || selectedUser.goal}</p>
                  )}
                </div>

                {/* Account type */}
                <div>
                  <label className="text-xs text-slate-400 block mb-2">Tip cont</label>
                  <div className="grid grid-cols-3 gap-2">
                    {ACCOUNT_TYPES.map(t => (
                      <button key={t.key} onClick={() => setEditAccountType(t.key)}
                        className={`py-2 rounded-xl text-xs font-medium transition-all border ${editAccountType === t.key ? 'border-brand-green bg-brand-green/10 text-brand-green' : 'border-dark-600 bg-dark-700 text-slate-400'}`}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Activity level */}
                <div>
                  <label className="text-xs text-slate-400 block mb-2">Nivel activitate</label>
                  <div className="space-y-1.5">
                    {ACTIVITY_LEVELS.map(a => (
                      <button key={a.key} onClick={() => setEditActivity(a.key)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm transition-all border ${editActivity === a.key ? 'border-brand-orange/50 bg-brand-orange/10 text-brand-orange' : 'border-dark-600 bg-dark-700 text-slate-400'}`}>
                        <span>{a.emoji} {a.label}</span>
                        <span className="text-xs opacity-60">×{a.mult}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Calorie algorithm */}
                {bmr > 0 && (
                  <div className="bg-dark-700 rounded-xl p-3 space-y-2">
                    <p className="text-xs font-semibold text-white">🔥 Algoritm calorii</p>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-dark-600 rounded-lg py-2">
                        <p className="text-sm font-bold text-white">{Math.round(bmr)}</p>
                        <p className="text-[10px] text-slate-500">BMR</p>
                      </div>
                      <div className="bg-dark-600 rounded-lg py-2">
                        <p className="text-sm font-bold text-brand-orange">{tdee}</p>
                        <p className="text-[10px] text-slate-500">TDEE</p>
                      </div>
                      <div className="bg-dark-600 rounded-lg py-2">
                        <p className="text-sm font-bold text-brand-green">{suggestedCal}</p>
                        <p className="text-[10px] text-slate-500">Recomandat</p>
                      </div>
                    </div>
                    {calTarget > 0 && calTarget !== suggestedCal && (
                      <div className="flex items-center gap-2 text-xs text-brand-blue bg-brand-blue/10 rounded-lg px-2.5 py-1.5">
                        <span>💡</span>
                        <span>Target setat: <strong>{calTarget} kcal</strong> vs recomandat: <strong>{suggestedCal} kcal</strong></span>
                      </div>
                    )}
                    <button onClick={() => setEditTargets(p => ({ ...p, calories: String(suggestedCal) }))}
                      className="text-xs text-brand-green hover:text-brand-green/80 transition-colors">
                      ← Aplică valoarea recomandată
                    </button>
                  </div>
                )}

                {/* Goal */}
                <div>
                  <label className="text-xs text-slate-400 block mb-2">Obiectiv</label>
                  <div className="flex gap-2">
                    {GOALS.map(g => (
                      <button key={g.key} onClick={() => setEditGoal(g.key)}
                        className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all ${editGoal === g.key ? 'bg-brand-purple/20 text-brand-purple border border-brand-purple/40' : 'bg-dark-700 text-slate-400'}`}>
                        {g.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Calorie algorithm */}
                {bmr > 0 && (
                  <div className="bg-dark-700 rounded-xl p-3 space-y-2">
                    <p className="text-xs font-semibold text-white">🔥 Algoritm calorii</p>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-dark-600 rounded-lg py-2">
                        <p className="text-sm font-bold text-white">{Math.round(bmr)}</p>
                        <p className="text-[10px] text-slate-500">BMR</p>
                      </div>
                      <div className="bg-dark-600 rounded-lg py-2">
                        <p className="text-sm font-bold text-brand-orange">{tdee}</p>
                        <p className="text-[10px] text-slate-500">TDEE</p>
                      </div>
                      <div className="bg-dark-600 rounded-lg py-2">
                        <p className="text-sm font-bold text-brand-green">{suggestedCal}</p>
                        <p className="text-[10px] text-slate-500">Recomandat</p>
                      </div>
                    </div>
                    <button onClick={() => setEditTargets(p => ({ ...p, calories: String(suggestedCal) }))}
                      className="text-xs text-brand-green hover:text-brand-green/80 transition-colors">
                      ← Aplică valoarea recomandată ({suggestedCal} kcal)
                    </button>
                  </div>
                )}

                {/* Calories + Water */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Calorii (kcal/zi)</label>
                    <input className="input" type="number" value={editTargets.calories}
                      onChange={e => setEditTargets(p => ({ ...p, calories: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Apă (ml/zi)</label>
                    <input className="input" type="number" value={editTargets.water_ml}
                      onChange={e => setEditTargets(p => ({ ...p, water_ml: e.target.value }))} />
                  </div>
                </div>

                {/* Macro sliders — identical to Profil */}
                {parseInt(editTargets.calories) > 0 && (
                  <div className="bg-dark-700 rounded-xl p-3 space-y-3">
                    <div className="flex justify-between items-center">
                      <p className="text-xs font-semibold text-white">Macronutrienți</p>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${macroOk ? 'bg-brand-green/20 text-brand-green' : 'bg-red-500/20 text-red-400'}`}>{macroTotal}%</span>
                    </div>
                    <MacroSlider label="Proteine"      emoji="💪" colorClass="text-brand-blue"   colorHex="#60a5fa" value={macroP} onChange={setProtein} />
                    <MacroSlider label="Carbohidrați"  emoji="🌾" colorClass="text-brand-orange" colorHex="#fb923c" value={macroC} onChange={setCarbs} />
                    <MacroSlider label="Grăsimi"       emoji="🥑" colorClass="text-brand-purple" colorHex="#a78bfa" value={macroF} onChange={setFat} />
                    <div className="flex h-1.5 rounded-full overflow-hidden">
                      <div className="bg-brand-blue transition-all"   style={{ width: `${macroP}%` }} />
                      <div className="bg-brand-orange transition-all" style={{ width: `${macroC}%` }} />
                      <div className="bg-brand-purple transition-all" style={{ width: `${macroF}%` }} />
                    </div>
                    {(() => {
                      const kcal = parseInt(editTargets.calories) || 0
                      return (
                        <div className="grid grid-cols-4 gap-1 text-center">
                          {[
                            { label: 'kcal', value: kcal, color: 'text-brand-green' },
                            { label: 'prot.', value: `${Math.round((kcal * macroP / 100) / 4)}g`, color: 'text-brand-blue' },
                            { label: 'carb.', value: `${Math.round((kcal * macroC / 100) / 4)}g`, color: 'text-brand-orange' },
                            { label: 'grăs.', value: `${Math.round((kcal * macroF / 100) / 9)}g`, color: 'text-brand-purple' },
                          ].map(s => (
                            <div key={s.label}><p className={`text-sm font-bold ${s.color}`}>{s.value}</p><p className="text-xs text-slate-500">{s.label}</p></div>
                          ))}
                        </div>
                      )
                    })()}
                  </div>
                )}

                <button onClick={saveUser} disabled={saving}
                  className={`btn-primary w-full py-3 transition-all ${saved ? 'bg-brand-green/50' : ''}`}>
                  {saved ? '✓ Salvat!' : saving ? 'Se salvează...' : 'Salvează modificările'}
                </button>
              </div>
            )}

            {/* ── HISTORY TAB ── */}
            {activeTab === 'history' && (
              <div className="space-y-3">
                {histLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="w-6 h-6 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-slate-500">Ultimele 14 zile — % din target zilnic</p>

                    {/* Legend */}
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {[['bg-brand-green','Calorii'],['bg-brand-blue','Apă'],['bg-brand-orange','Antrenamente'],['bg-brand-purple','Suplimente']].map(([c,l]) => (
                        <div key={l} className="flex items-center gap-1">
                          <div className={`w-2 h-2 rounded-full ${c}`} />
                          <span className="text-[10px] text-slate-500">{l}</span>
                        </div>
                      ))}
                    </div>

                    {/* Day rows */}
                    <div className="space-y-2">
                      {[...history].reverse().map(d => {
                        const hasData = d.kcal > 0 || d.waterMl > 0 || d.workoutPct !== null || d.supPct !== null
                        return (
                          <div key={d.date} className={`rounded-xl px-3 py-2.5 ${hasData ? 'bg-dark-700' : 'bg-dark-700/40'}`}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-medium text-white">{d.label}</span>
                              {!hasData && <span className="text-[10px] text-slate-600">fără date</span>}
                            </div>
                            {hasData && (
                              <div className="space-y-1.5">
                                {/* Calorii */}
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-slate-500 w-20 shrink-0">🔥 {d.kcal} kcal</span>
                                  <div className="flex-1"><ProgressBar pct={d.kcalPct} color="bg-brand-green" /></div>
                                  <PctBadge pct={d.kcalPct} />
                                </div>
                                {/* Apă */}
                                {d.waterMl > 0 && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-slate-500 w-20 shrink-0">💧 {d.waterMl}ml</span>
                                    <div className="flex-1"><ProgressBar pct={d.waterPct} color="bg-brand-blue" /></div>
                                    <PctBadge pct={d.waterPct} />
                                  </div>
                                )}
                                {/* Antrenamente */}
                                {d.workoutPct !== null && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-slate-500 w-20 shrink-0">🏋️ Antren.</span>
                                    <div className="flex-1"><ProgressBar pct={d.workoutPct} color="bg-brand-orange" /></div>
                                    <PctBadge pct={d.workoutPct} />
                                  </div>
                                )}
                                {/* Suplimente */}
                                {d.supPct !== null && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-slate-500 w-20 shrink-0">💊 Supli.</span>
                                    <div className="flex-1"><ProgressBar pct={d.supPct} color="bg-brand-purple" /></div>
                                    <PctBadge pct={d.supPct} />
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>

                    {/* Summary stats */}
                    {history.length > 0 && (() => {
                      const withData = history.filter(d => d.kcal > 0)
                      const avgCal = withData.length ? Math.round(withData.reduce((s, d) => s + d.kcal, 0) / withData.length) : 0
                      const avgCalPct = withData.length ? Math.round(withData.reduce((s, d) => s + d.kcalPct, 0) / withData.length) : 0
                      const workoutDays = history.filter(d => d.workoutPct === 100).length
                      return (
                        <div className="bg-dark-700 rounded-xl p-3 grid grid-cols-2 gap-2 mt-2">
                          <div className="text-center">
                            <p className="text-lg font-bold text-white">{avgCal}</p>
                            <p className="text-[10px] text-slate-500">Kcal medii/zi</p>
                            <p className="text-xs text-brand-green">{avgCalPct}% din target</p>
                          </div>
                          <div className="text-center">
                            <p className="text-lg font-bold text-white">{workoutDays}</p>
                            <p className="text-[10px] text-slate-500">Zile antrenament 100%</p>
                            <p className="text-xs text-brand-orange">din {history.filter(d => d.workoutPct !== null).length} planificate</p>
                          </div>
                        </div>
                      )
                    })()}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
