import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Modal from '../components/Modal'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

function getToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

const ACTIVITY_LEVELS = [
  { key: 'sedentary',   label: 'Sedentar',      emoji: '🪑', multiplier: 1.2 },
  { key: 'light',       label: 'Ușor activ',     emoji: '🚶', multiplier: 1.375 },
  { key: 'moderate',    label: 'Moderat activ',  emoji: '🏃', multiplier: 1.55 },
  { key: 'active',      label: 'Activ',          emoji: '💪', multiplier: 1.725 },
  { key: 'very_active', label: 'Foarte activ',   emoji: '🏋️', multiplier: 1.9 },
]

const GOALS = [
  { key: 'lose',     label: 'Slăbire',   emoji: '📉', kcalAdjust: -400 },
  { key: 'maintain', label: 'Menținere', emoji: '⚖️', kcalAdjust: 0 },
  { key: 'gain',     label: 'Masă',      emoji: '📈', kcalAdjust: 300 },
]

const THEMES = [
  { key: 'dark',  label: 'Dark',  preview: ['#0f0f13','#1a1a24','#4ade80'] },
  { key: 'ocean', label: 'Ocean', preview: ['#040d18','#071525','#38bdf8'] },
  { key: 'vibe',  label: 'Vibe',  preview: ['#120700','#1e0e00','#fb923c'] },
  { key: 'light', label: 'Light', preview: ['#f1f5f9','#ffffff','#16a34a'] },
]

const THEME_VARS = {
  dark: {
    '--bg-900':'#0f0f13','--bg-800':'#1a1a24','--bg-700':'#242433','--bg-600':'#2e2e42','--bg-500':'#383850',
    '--accent':'#4ade80','--accent-fg':'#052e16',
    '--t1':'#f8fafc','--t2':'#e2e8f0','--t3':'#cbd5e1','--t4':'#94a3b8','--t5':'#64748b','--t6':'#475569',
    '--border':'#2e2e42',
  },
  ocean: {
    '--bg-900':'#040d18','--bg-800':'#071525','--bg-700':'#0c1f38','--bg-600':'#132b4f','--bg-500':'#1a3a6e',
    '--accent':'#38bdf8','--accent-fg':'#082f49',
    '--t1':'#f0f9ff','--t2':'#e0f2fe','--t3':'#bae6fd','--t4':'#7dd3fc','--t5':'#38bdf8','--t6':'#0ea5e9',
    '--border':'#1e3a6e',
  },
  vibe: {
    '--bg-900':'#120700','--bg-800':'#1e0e00','--bg-700':'#2c1500','--bg-600':'#3d1d00','--bg-500':'#522600',
    '--accent':'#fb923c','--accent-fg':'#431407',
    '--t1':'#fff7ed','--t2':'#ffedd5','--t3':'#fed7aa','--t4':'#fdba74','--t5':'#fb923c','--t6':'#f97316',
    '--border':'#7c2d12',
  },
  light: {
    '--bg-900':'#f1f5f9','--bg-800':'#ffffff','--bg-700':'#f8fafc','--bg-600':'#e2e8f0','--bg-500':'#cbd5e1',
    '--accent':'#16a34a','--accent-fg':'#ffffff',
    '--t1':'#0f172a','--t2':'#1e293b','--t3':'#334155','--t4':'#475569','--t5':'#64748b','--t6':'#94a3b8',
    '--border':'#cbd5e1',
  },
  // ── Teme noi moderne ──
  abyss: {
    '--bg-900':'#010203','--bg-800':'#04080d','--bg-700':'#070e14','--bg-600':'#0b1520','--bg-500':'#101d2b',
    '--accent':'#00e5ff','--accent-fg':'#001a1f',
    '--t1':'#e0faff','--t2':'#b3f5ff','--t3':'#80eeff','--t4':'#33e0ff','--t5':'#00e5ff','--t6':'#00b8cc',
    '--border':'#0d1f2d',
  },
  velvet: {
    '--bg-900':'#0a0005','--bg-800':'#140008','--bg-700':'#1e000d','--bg-600':'#2e0015','--bg-500':'#40001e',
    '--accent':'#c8003a','--accent-fg':'#0a0005',
    '--t1':'#fff0f3','--t2':'#ffc2cf','--t3':'#ff8099','--t4':'#ff4060','--t5':'#c8003a','--t6':'#96002a',
    '--border':'#3d0018',
  },
  barbie: {
    '--bg-900':'#1a0022','--bg-800':'#2e0040','--bg-700':'#420060','--bg-600':'#600080','--bg-500':'#7800a0',
    '--accent':'#ff10f0','--accent-fg':'#1a0022',
    '--t1':'#fff0ff','--t2':'#ffccff','--t3':'#ff99ff','--t4':'#ff55ff','--t5':'#ff10f0','--t6':'#cc00cc',
    '--border':'#6600aa',
  },
  gothic: {
    '--bg-900':'#080508','--bg-800':'#100d10','--bg-700':'#1a141a','--bg-600':'#251a25','--bg-500':'#30223a',
    '--accent':'#9b30ff','--accent-fg':'#1a0040',
    '--t1':'#f0e6ff','--t2':'#dcc8ff','--t3':'#c4a0ff','--t4':'#a870ff','--t5':'#9b30ff','--t6':'#7a00ff',
    '--border':'#2d1a3d',
  },
  slate: {
    '--bg-900':'#0c1320','--bg-800':'#131e2e','--bg-700':'#1a293d','--bg-600':'#22364f','--bg-500':'#2b4464',
    '--accent':'#38bdf8','--accent-fg':'#0c4a6e',
    '--t1':'#f0f9ff','--t2':'#e0f2fe','--t3':'#bae6fd','--t4':'#93c5fd','--t5':'#60a5fa','--t6':'#3b82f6',
    '--border':'#1e3352',
  },
}

const THEME_META = [
  { key: 'dark',    label: 'Dark',    preview: ['#0f0f13','#1a1a24','#4ade80'] },
  { key: 'ocean',   label: 'Ocean',   preview: ['#040d18','#0c1f38','#38bdf8'] },
  { key: 'abyss',   label: 'Abyss',   preview: ['#010203','#070e14','#00e5ff'] },
  { key: 'vibe',    label: 'Vibe',    preview: ['#120700','#2c1500','#fb923c'] },
  { key: 'gothic',  label: 'Gothic',  preview: ['#080508','#1a141a','#9b30ff'] },
  { key: 'velvet',  label: 'Velvet',  preview: ['#0a0005','#1e000d','#c8003a'] },
  { key: 'barbie',  label: 'Barbie',  preview: ['#1a0022','#420060','#ff10f0'] },
  { key: 'slate',   label: 'Slate',   preview: ['#0c1320','#1a293d','#38bdf8'] },
  { key: 'light',   label: 'Light',   preview: ['#f1f5f9','#ffffff','#16a34a'] },
]

function applyTheme(key) {
  const vars = THEME_VARS[key] || THEME_VARS.dark
  const root = document.documentElement
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v))
  root.setAttribute('data-theme', key)
  localStorage.setItem('app_theme', key)
}

function calcBMR(gender, weight, height, age) {
  if (!weight || !height || !age) return 0
  return gender === 'male'
    ? 10 * weight + 6.25 * height - 5 * age + 5
    : 10 * weight + 6.25 * height - 5 * age - 161
}

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

// ─── STRAVA CARD ──────────────────────────────────────
function StravaCard({ session }) {
  const [connected, setConnected] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState(null)

  useEffect(() => { checkStrava() }, [])

  async function checkStrava() {
    const { data } = await supabase.from('strava_tokens').select('id, updated_at').eq('user_id', session.user.id).single()
    if (data) { setConnected(true); setLastSync(data.updated_at) }
  }

  async function syncStrava() {
    setSyncing(true)
    try {
      const res = await fetch('/.netlify/functions/strava-sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: session.user.id }),
      })
      if (res.ok) { setLastSync(new Date().toISOString()); alert('✅ Sincronizat!') }
      else { const e = await res.json(); alert('Eroare: ' + (e.error || 'necunoscută')) }
    } catch { alert('Eroare de rețea') }
    setSyncing(false)
  }

  function connectStrava() {
    const clientId = import.meta.env.VITE_STRAVA_CLIENT_ID
    const redirect = encodeURIComponent(window.location.origin + '/strava-callback')
    window.location.href = `https://www.strava.com/oauth/authorize?client_id=${clientId}&response_type=code&redirect_uri=${redirect}&scope=activity:read_all`
  }

  async function disconnectStrava() {
    if (!confirm('Deconectezi Strava?')) return
    await supabase.from('strava_tokens').delete().eq('user_id', session.user.id)
    setConnected(false)
  }

  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-white">🟠 Strava</p>
        {connected && lastSync && <p className="text-xs text-slate-500">Sincronizat: {new Date(lastSync).toLocaleDateString('ro-RO')}</p>}
        {!connected && <p className="text-xs text-slate-500">Conectează pentru import activități</p>}
      </div>
      {connected ? (
        <div className="flex gap-2">
          <button onClick={syncStrava} disabled={syncing} className="text-xs bg-brand-orange/20 text-brand-orange px-3 py-1.5 rounded-lg">{syncing ? '...' : '🔄'}</button>
          <button onClick={disconnectStrava} className="text-xs bg-red-500/10 text-red-400 px-3 py-1.5 rounded-lg">✕</button>
        </div>
      ) : (
        <button onClick={connectStrava} className="text-xs bg-brand-orange/20 text-brand-orange border border-brand-orange/30 px-3 py-2 rounded-xl">Conectează</button>
      )}
    </div>
  )
}

// ─── MAIN ─────────────────────────────────────────────
export default function Profil({ session, isAdmin }) {
  const [weights, setWeights] = useState([])
  const [profile, setProfile] = useState({ gender: 'male', age: '', height_cm: '', activity_level: 'moderate', goal: 'maintain' })
  const [targets, setTargets] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showEditProfile, setShowEditProfile] = useState(false)
  const [showWeightModal, setShowWeightModal] = useState(false)
  const [showWaterModal, setShowWaterModal] = useState(false)
  const [waterTarget, setWaterTarget] = useState(2000)
  const [weightForm, setWeightForm] = useState({ date: getToday(), weight_kg: '' })
  const [editProfile, setEditProfile] = useState({})
  const [macroP, setMacroP] = useState(25)
  const [macroC, setMacroC] = useState(45)
  const [macroF, setMacroF] = useState(30)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [activeTheme, setActiveTheme] = useState(() => localStorage.getItem('app_theme') || 'dark')
  const [navPrefs, setNavPrefs] = useState(() => {
    try { return JSON.parse(localStorage.getItem('nav_prefs') || '{}') } catch { return {} }
  })

  function toggleNavPref(key) {
    setNavPrefs(prev => {
      // Default-ul e true (vizibil) — toggle înseamnă setare explicită
      const current = prev[key] !== false // dacă nu e setat explicit false, e true
      const next = { ...prev, [key]: !current }
      localStorage.setItem('nav_prefs', JSON.stringify(next))
      window.dispatchEvent(new Event('nav-prefs-changed'))
      return next
    })
  }

  useEffect(() => { loadData(); applyTheme(activeTheme) }, [])

  async function loadData() {
    setLoading(true)
    const uid = session.user.id
    const [{ data: wg }, { data: pr }, { data: tg }] = await Promise.all([
      supabase.from('weight_logs').select('*').eq('user_id', uid).order('date', { ascending: false }).limit(60),
      supabase.from('user_profiles').select('*').eq('user_id', uid).single(),
      supabase.from('user_targets').select('*').eq('user_id', uid).single(),
    ])
    setWeights(wg || [])
    if (pr) setProfile(p => ({ ...p, ...pr }))
    if (tg) { setTargets(tg); setWaterTarget(tg.water_ml || 2000) }
    setLoading(false)
  }

  function openEditProfile() {
    setEditProfile({ ...profile })
    // Calculate actual saved macro % from targets
    if (targets && targets.calories > 0) {
      const p = Math.round((targets.protein_g * 4 / targets.calories) * 100)
      const f = Math.round((targets.fat_g * 9 / targets.calories) * 100)
      const c = 100 - p - f
      setMacroP(p); setMacroF(f); setMacroC(Math.max(10, c))
    } else {
      setMacroP(25); setMacroC(45); setMacroF(30)
    }
    setShowEditProfile(true)
  }

  function setProtein(v) { setMacroP(v); setMacroC(Math.max(10, Math.min(70, 100 - v - macroF))) }
  function setFat(v) { setMacroF(v); setMacroC(Math.max(10, Math.min(70, 100 - macroP - v))) }
  function setCarbs(v) { setMacroC(v); setMacroF(Math.max(10, Math.min(70, 100 - macroP - v))) }

  const latestWeight = weights[0]?.weight_kg
  const ep = editProfile
  const bmr = calcBMR(ep.gender, latestWeight, ep.height_cm, ep.age)
  const actMultiplier = ACTIVITY_LEVELS.find(a => a.key === ep.activity_level)?.multiplier || 1.55
  const tdee = Math.round(bmr * actMultiplier)
  const goalAdj = GOALS.find(g => g.key === ep.goal)?.kcalAdjust || 0
  const targetKcal = Math.max(1200, tdee + goalAdj)
  const macroTotal = macroP + macroC + macroF
  const macroOk = macroTotal === 100

  async function saveProfileAndTargets() {
    setSaving(true)
    const uid = session.user.id
    await supabase.from('user_profiles').upsert({
      user_id: uid, full_name: ep.full_name || null, gender: ep.gender, age: ep.age, height_cm: ep.height_cm,
      activity_level: ep.activity_level, goal: ep.goal, onboarding_done: true,
    }, { onConflict: 'user_id' })
    if (macroOk && bmr > 0) {
      await supabase.from('user_targets').upsert({
        user_id: uid, calories: targetKcal,
        protein_g: Math.round((targetKcal * macroP / 100) / 4),
        carbs_g: Math.round((targetKcal * macroC / 100) / 4),
        fat_g: Math.round((targetKcal * macroF / 100) / 9),
        water_ml: Math.round((parseFloat(ep.weight_kg || latestWeight || 70)) * 35),
      }, { onConflict: 'user_id' })
    }
    setProfile({ ...ep }); setSaving(false); setSaved(true)
    setTimeout(() => { setSaved(false); setShowEditProfile(false); loadData() }, 1500)
  }

  async function saveWaterTarget() {
    await supabase.from('user_targets').upsert({ user_id: session.user.id, water_ml: waterTarget }, { onConflict: 'user_id' })
    setShowWaterModal(false); loadData()
  }

  async function saveWeight() {
    if (!weightForm.weight_kg) return
    await supabase.from('weight_logs').insert({ user_id: session.user.id, date: weightForm.date, weight_kg: parseFloat(weightForm.weight_kg) })
    setShowWeightModal(false); setWeightForm({ date: getToday(), weight_kg: '' }); loadData()
  }

  async function deleteWeight(id) {
    await supabase.from('weight_logs').delete().eq('id', id); loadData()
  }

  const weightChange = weights.length >= 2 ? (weights[0].weight_kg - weights[weights.length - 1].weight_kg).toFixed(1) : null
  const chartData = [...weights].reverse().map(w => ({
    date: new Date(w.date + 'T12:00:00').toLocaleDateString('ro-RO', { day: '2-digit', month: 'short' }),
    kg: w.weight_kg
  }))

  if (loading) return <div className="page flex items-center justify-center"><div className="w-8 h-8 border-2 border-brand-green border-t-transparent rounded-full animate-spin" /></div>

  const currentBMR = calcBMR(profile.gender, latestWeight, profile.height_cm, profile.age)
  const currentAct = ACTIVITY_LEVELS.find(a => a.key === profile.activity_level)
  const currentGoal = GOALS.find(g => g.key === profile.goal)
  const currentTDEE = currentBMR > 0 ? Math.round(currentBMR * (currentAct?.multiplier || 1.55)) : null
  const currentTarget = currentTDEE ? Math.max(1200, currentTDEE + (currentGoal?.kcalAdjust || 0)) : null

  return (
    <div className="page fade-in space-y-4">
      {/* Header */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-green/30 to-brand-blue/20 flex items-center justify-center text-2xl">
              {profile.gender === 'female' ? '👩' : '👨'}
            </div>
            <div>
              <p className="font-bold text-white text-lg">{profile.full_name || session.user.email?.split('@')[0]}</p>
              <p className="text-xs text-slate-400">{session.user.email}</p>
              {isAdmin && <span className="text-xs bg-brand-purple/20 text-brand-purple px-2 py-0.5 rounded-full mt-0.5 inline-block">⭐ Administrator</span>}
              {!isAdmin && profile.account_type === 'elev' && <span className="text-xs bg-brand-blue/20 text-brand-blue px-2 py-0.5 rounded-full mt-0.5 inline-block">🎓 Cont Elev</span>}
            </div>
          </div>
          <button onClick={openEditProfile} className="text-xs bg-dark-700 text-slate-300 px-3 py-2 rounded-xl hover:bg-dark-600">✏️ Editează</button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Vârstă', value: profile.age ? `${profile.age} ani` : '—' },
            { label: 'Înălțime', value: profile.height_cm ? `${profile.height_cm} cm` : '—' },
            { label: 'Greutate', value: latestWeight ? `${latestWeight} kg` : '—' },
          ].map(s => (
            <div key={s.label} className="bg-dark-700 rounded-xl p-2.5 text-center">
              <p className="text-sm font-bold text-white">{s.value}</p>
              <p className="text-xs text-slate-500">{s.label}</p>
            </div>
          ))}
        </div>
        {profile.activity_level && (
          <div className="flex gap-2 mt-2">
            <span className="text-xs bg-dark-700 text-slate-300 px-3 py-1.5 rounded-full">
              {currentAct?.emoji} {currentAct?.label}
            </span>
            <span className="text-xs bg-dark-700 text-slate-300 px-3 py-1.5 rounded-full">
              {currentGoal?.emoji} {currentGoal?.label}
            </span>
          </div>
        )}
      </div>

      {/* Target caloric + explanation */}
      {targets && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">🎯 Targeturi zilnice</h2>
            <button onClick={() => setShowWaterModal(true)} className="text-xs text-brand-blue hover:text-brand-blue/80">💧 {targets.water_ml || 2000} ml</button>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              { label: 'kcal', value: targets.calories, color: 'text-brand-green' },
              { label: 'prot.', value: `${targets.protein_g}g`, color: 'text-brand-blue' },
              { label: 'carb.', value: `${targets.carbs_g}g`, color: 'text-brand-orange' },
              { label: 'grăs.', value: `${targets.fat_g}g`, color: 'text-brand-purple' },
            ].map(s => (
              <div key={s.label} className="bg-dark-700 rounded-xl p-2">
                <p className={`text-base font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-slate-500">{s.label}</p>
              </div>
            ))}
          </div>
          {/* Calorie explanation */}
          {currentBMR > 0 && currentTDEE && (
            <div className="bg-dark-700 rounded-xl p-3 space-y-1.5">
              <p className="text-xs font-semibold text-slate-300 mb-2">📐 Cum s-a calculat targetul caloric</p>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">BMR (Mifflin-St Jeor)</span>
                  <span className="text-white font-medium">{Math.round(currentBMR)} kcal</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">× {currentAct?.label} ({currentAct?.multiplier})</span>
                  <span className="text-white font-medium">TDEE: {currentTDEE} kcal</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">{currentGoal?.emoji} {currentGoal?.label} ({currentGoal?.kcalAdjust > 0 ? '+' : ''}{currentGoal?.kcalAdjust} kcal)</span>
                  <span className="text-brand-green font-bold">= {currentTarget} kcal</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Weight chart */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-white">⚖️ Greutate</h2>
          <button onClick={() => setShowWeightModal(true)} className="text-xs bg-brand-green/20 text-brand-green px-3 py-1.5 rounded-xl">+ Adaugă</button>
        </div>
        {weights.length >= 2 && (
          <div className="grid grid-cols-3 gap-2 text-center mb-3">
            {[
              { label: 'Curent', value: `${weights[0].weight_kg} kg`, color: 'text-white' },
              { label: 'Minim', value: `${Math.min(...weights.map(w => w.weight_kg))} kg`, color: 'text-brand-green' },
              { label: 'Schimbare', value: weightChange !== null ? `${parseFloat(weightChange) > 0 ? '+' : ''}${weightChange} kg` : '—', color: parseFloat(weightChange) < 0 ? 'text-brand-green' : parseFloat(weightChange) > 0 ? 'text-red-400' : 'text-slate-300' },
            ].map(s => (
              <div key={s.label} className="bg-dark-700 rounded-xl p-2">
                <p className={`text-base font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-slate-500">{s.label}</p>
              </div>
            ))}
          </div>
        )}
        {chartData.length >= 2 && (
          <ResponsiveContainer width="100%" height={120}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2e2e42" />
              <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 10 }} domain={['auto', 'auto']} />
              <Tooltip contentStyle={{ background: '#1a1a24', border: '1px solid #2e2e42', borderRadius: 12, fontSize: 12 }} />
              <Line type="monotone" dataKey="kg" stroke="#4ade80" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
        {weights.length === 0 && <p className="text-center text-slate-500 text-sm py-3">Nicio înregistrare.</p>}
        {weights.length > 0 && (
          <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
            {weights.map(w => (
              <div key={w.id} className="grid grid-cols-3 items-center bg-dark-700 rounded-xl px-3 py-2">
                <span className="text-sm font-medium text-white">{w.weight_kg} kg</span>
                <span className="text-xs text-slate-400 text-center">{new Date(w.date + 'T12:00:00').toLocaleDateString('ro-RO')}</span>
                <div className="flex justify-end">
                  <button onClick={() => deleteWeight(w.id)} className="text-slate-600 hover:text-red-400 text-lg leading-none">×</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SETĂRI */}
      <div className="card space-y-4">
        <h2 className="text-sm font-semibold text-white">⚙️ Setări</h2>
        <StravaCard session={session} />

        {/* Theme selector */}
        <div className="border-t border-dark-600 pt-3">
          <p className="text-sm font-medium text-white mb-3">🎨 Temă culori</p>
          <div className="grid grid-cols-4 gap-2">
            {THEME_META.map(t => (
              <button key={t.key} onClick={() => { applyTheme(t.key); setActiveTheme(t.key) }}
                className={`flex flex-col items-center gap-1.5 px-2 py-2.5 rounded-xl border transition-all ${activeTheme === t.key ? 'border-brand-green bg-brand-green/10' : 'border-dark-600 bg-dark-700 hover:bg-dark-600'}`}>
                {/* Color swatches */}
                <div className="flex gap-0.5">
                  {t.preview.map((c, i) => (
                    <div key={i} className={`h-5 rounded-md ${i === 0 ? 'w-4' : i === 1 ? 'w-3' : 'w-2.5'}`} style={{ backgroundColor: c }} />
                  ))}
                </div>
                <span className={`text-[10px] font-medium leading-none ${activeTheme === t.key ? 'text-brand-green' : 'text-slate-400'}`}>{t.label}</span>
                {activeTheme === t.key && <span className="text-brand-green text-[9px] leading-none">✓ activ</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Install */}
        <div className="border-t border-dark-600 pt-3">
          <p className="text-sm font-medium text-white mb-3">🧭 Pagini vizibile în meniu</p>
          <div className="space-y-2">
            {[
              { key: 'showBuget',  label: 'Buget',  icon: '💰', desc: 'Urmărire venituri & cheltuieli' },
              { key: 'showCamara', label: 'Cămară', icon: '🧺', desc: 'Stoc alimente acasă' },
            ].map(item => {
              const isOn = navPrefs[item.key] !== false
              return (
                <button key={item.key} onClick={() => toggleNavPref(item.key)}
                  className="w-full flex items-center justify-between bg-dark-700 rounded-xl px-4 py-3 hover:bg-dark-600 transition-all">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{item.icon}</span>
                    <div className="text-left">
                      <p className="text-sm text-white font-medium">{item.label}</p>
                      <p className="text-[11px] text-slate-500">{item.desc}</p>
                    </div>
                  </div>
                  <div className={`w-11 h-6 rounded-full transition-all relative ${isOn ? 'bg-brand-green' : 'bg-dark-500'}`}>
                    <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${isOn ? 'left-5' : 'left-0.5'}`} />
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Install */}
        <div className="border-t border-dark-600 pt-3">
          <p className="text-sm font-medium text-white">📱 Instalează aplicația</p>
          <p className="text-xs text-slate-500">Safari → Share → Adaugă pe ecranul principal</p>
        </div>
      </div>

      <button onClick={async () => { setSigningOut(true); await supabase.auth.signOut() }} disabled={signingOut}
        className="w-full bg-red-500/10 border border-red-500/20 text-red-400 font-medium py-3 rounded-xl hover:bg-red-500/20 text-sm">
        {signingOut ? 'Se deconectează...' : '→ Deconectare'}
      </button>

      {/* ─── EDIT PROFIL MODAL ─── */}
      <Modal open={showEditProfile} onClose={() => setShowEditProfile(false)} title="Editează profil">
        <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
          <div>
            <label className="text-xs text-slate-400 block mb-1">Nume afișat</label>
            <input className="input" placeholder="ex: Alex" value={ep.full_name || ''}
              onChange={e => setEditProfile(p => ({ ...p, full_name: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Gen</label>
            <div className="flex gap-2">
              {[{ k: 'male', l: '♂ Masculin' }, { k: 'female', l: '♀ Feminin' }].map(g => (
                <button key={g.k} onClick={() => setEditProfile(p => ({ ...p, gender: g.k }))}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${ep.gender === g.k ? 'bg-brand-blue/20 text-brand-blue border border-brand-blue/40' : 'bg-dark-700 text-slate-400'}`}>
                  {g.l}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[{ key: 'age', label: 'Vârstă', unit: 'ani', placeholder: '25' }, { key: 'height_cm', label: 'Înălțime', unit: 'cm', placeholder: '170' }].map(f => (
              <div key={f.key}>
                <label className="text-xs text-slate-400 block mb-1">{f.label} ({f.unit})</label>
                <input className="input" type="number" placeholder={f.placeholder} value={ep[f.key] || ''}
                  onChange={e => setEditProfile(p => ({ ...p, [f.key]: parseFloat(e.target.value) || '' }))} />
              </div>
            ))}
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Nivel de activitate</label>
            <div className="space-y-1.5">
              {ACTIVITY_LEVELS.map(a => (
                <button key={a.key} onClick={() => setEditProfile(p => ({ ...p, activity_level: a.key }))}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left transition-all ${ep.activity_level === a.key ? 'bg-brand-green/15 border border-brand-green/40' : 'bg-dark-700 hover:bg-dark-600'}`}>
                  <span>{a.emoji}</span>
                  <p className={`text-sm font-medium ${ep.activity_level === a.key ? 'text-brand-green' : 'text-slate-200'}`}>{a.label}</p>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Obiectiv</label>
            <div className="flex gap-2">
              {GOALS.map(g => (
                <button key={g.key} onClick={() => setEditProfile(p => ({ ...p, goal: g.key }))}
                  className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all ${(ep.goal || 'maintain') === g.key ? 'bg-brand-purple/20 text-brand-purple border border-brand-purple/40' : 'bg-dark-700 text-slate-400'}`}>
                  {g.emoji} {g.label}
                </button>
              ))}
            </div>
          </div>
          {bmr > 0 && (
            <div className="bg-dark-700 rounded-xl p-3 space-y-3">
              <div className="flex justify-between items-center">
                <p className="text-xs font-semibold text-white">Macronutrienți</p>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${macroOk ? 'bg-brand-green/20 text-brand-green' : 'bg-red-500/20 text-red-400'}`}>{macroTotal}%</span>
              </div>
              <MacroSlider label="Proteine" emoji="💪" colorClass="text-brand-blue" colorHex="#60a5fa" value={macroP} onChange={setProtein} />
              <MacroSlider label="Carbohidrați" emoji="🌾" colorClass="text-brand-orange" colorHex="#fb923c" value={macroC} onChange={setCarbs} />
              <MacroSlider label="Grăsimi" emoji="🥑" colorClass="text-brand-purple" colorHex="#a78bfa" value={macroF} onChange={setFat} />
              <div className="flex h-1.5 rounded-full overflow-hidden">
                <div className="bg-brand-blue transition-all" style={{ width: `${macroP}%` }} />
                <div className="bg-brand-orange transition-all" style={{ width: `${macroC}%` }} />
                <div className="bg-brand-purple transition-all" style={{ width: `${macroF}%` }} />
              </div>
              <div className="grid grid-cols-4 gap-1 text-center">
                {[
                  { label: 'kcal', value: targetKcal, color: 'text-brand-green' },
                  { label: 'prot.', value: `${Math.round((targetKcal * macroP / 100) / 4)}g`, color: 'text-brand-blue' },
                  { label: 'carb.', value: `${Math.round((targetKcal * macroC / 100) / 4)}g`, color: 'text-brand-orange' },
                  { label: 'grăs.', value: `${Math.round((targetKcal * macroF / 100) / 9)}g`, color: 'text-brand-purple' },
                ].map(s => (
                  <div key={s.label}><p className={`text-sm font-bold ${s.color}`}>{s.value}</p><p className="text-xs text-slate-500">{s.label}</p></div>
                ))}
              </div>
            </div>
          )}
          <button onClick={saveProfileAndTargets} disabled={saving || (!macroOk && bmr > 0)} className="btn-primary w-full py-3">
            {saved ? '✅ Salvat!' : saving ? 'Se salvează...' : 'Salvează'}
          </button>
        </div>
      </Modal>

      {/* Water target modal */}
      <Modal open={showWaterModal} onClose={() => setShowWaterModal(false)} title="💧 Target apă zilnic">
        <div className="space-y-3">
          <p className="text-xs text-slate-400">Recomandare: ~35ml × greutatea ta corporală</p>
          {latestWeight && <p className="text-xs text-brand-blue">Pentru {latestWeight}kg → {Math.round(latestWeight * 35)}ml recomandat</p>}
          <div>
            <label className="text-xs text-slate-400 block mb-1">Target (ml/zi)</label>
            <input className="input" type="number" step="100" value={waterTarget}
              onChange={e => setWaterTarget(parseInt(e.target.value) || 2000)} autoFocus />
          </div>
          <div className="flex gap-2 flex-wrap">
            {[1500, 2000, 2500, 3000, 3500].map(v => (
              <button key={v} onClick={() => setWaterTarget(v)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${waterTarget === v ? 'bg-brand-blue/20 text-brand-blue border border-brand-blue/40' : 'bg-dark-700 text-slate-400'}`}>
                {v}ml
              </button>
            ))}
          </div>
          <button onClick={saveWaterTarget} className="btn-primary w-full py-3">Salvează</button>
        </div>
      </Modal>

      {/* Weight modal */}
      <Modal open={showWeightModal} onClose={() => setShowWeightModal(false)} title="Adaugă greutate">
        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-400 block mb-1">Data</label>
            <input className="input" type="date" value={weightForm.date} onChange={e => setWeightForm(p => ({ ...p, date: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Greutate (kg)</label>
            <input className="input" type="number" step="0.1" placeholder="75.5" autoFocus
              value={weightForm.weight_kg} onChange={e => setWeightForm(p => ({ ...p, weight_kg: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && saveWeight()} />
          </div>
          <button onClick={saveWeight} className="btn-primary w-full py-3">Salvează</button>
        </div>
      </Modal>
    </div>
  )
}