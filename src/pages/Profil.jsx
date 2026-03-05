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
  { key: 'lose',     label: 'Slăbire',       emoji: '📉', kcalAdjust: -400 },
  { key: 'maintain', label: 'Menținere',     emoji: '⚖️', kcalAdjust: 0 },
  { key: 'gain',     label: 'Masă',         emoji: '📈', kcalAdjust: 300 },
]

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
        className="w-full h-2 rounded-full appearance-none cursor-pointer"
        style={{ background: `linear-gradient(to right, ${colorHex} 0%, ${colorHex} ${((value-10)/60)*100}%, #2e2e42 ${((value-10)/60)*100}%, #2e2e42 100%)` }} />
    </div>
  )
}

// ─── Strava Card ──────────────────────────────────────
function StravaCard({ session }) {
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(true)
  const [disconnecting, setDisconnecting] = useState(false)
  const STRAVA_CLIENT_ID = import.meta.env.VITE_STRAVA_CLIENT_ID
  const REDIRECT_URI = `${window.location.origin}/strava-callback`
  const stravaAuthUrl = `https://www.strava.com/oauth/authorize?client_id=${STRAVA_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&approval_prompt=auto&scope=read,activity:read_all`

  useEffect(() => {
    supabase.from('strava_tokens').select('athlete_id').eq('user_id', session.user.id).single()
      .then(({ data }) => { setToken(data || null); setLoading(false) })
  }, [])

  async function disconnect() {
    if (!confirm('Deconectezi Strava?')) return
    setDisconnecting(true)
    await supabase.from('strava_tokens').delete().eq('user_id', session.user.id)
    setToken(null); setDisconnecting(false)
  }

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-lg">🟠</span>
        <div>
          <p className="text-sm font-medium text-white">Strava</p>
          {!loading && <p className="text-xs text-slate-500">{token ? `Conectat · Athlete #${token.athlete_id}` : 'Neconectat'}</p>}
        </div>
      </div>
      {!loading && (token ? (
        <button onClick={disconnect} disabled={disconnecting}
          className="text-xs bg-red-500/10 text-red-400 px-3 py-1.5 rounded-lg hover:bg-red-500/20">
          {disconnecting ? '...' : 'Deconectează'}
        </button>
      ) : (
        <a href={stravaAuthUrl} className="text-xs bg-orange-500/20 text-orange-400 px-3 py-1.5 rounded-lg hover:bg-orange-500/30">Conectează</a>
      ))}
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
  const [showEditTargets, setShowEditTargets] = useState(false)
  const [showWeightModal, setShowWeightModal] = useState(false)
  const [weightForm, setWeightForm] = useState({ date: getToday(), weight_kg: '' })
  const [editProfile, setEditProfile] = useState({})
  const [macroP, setMacroP] = useState(25)
  const [macroC, setMacroC] = useState(45)
  const [macroF, setMacroF] = useState(30)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => { loadData() }, [])

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
    if (tg) setTargets(tg)
    setLoading(false)
  }

  function openEditProfile() {
    setEditProfile({ ...profile })
    setMacroP(25); setMacroC(45); setMacroF(30)
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
  const tooltipStyle = { backgroundColor: '#1a1a24', border: '1px solid #2e2e42', borderRadius: 12, color: '#f1f5f9', fontSize: 12 }
  const activityLabel = ACTIVITY_LEVELS.find(a => a.key === profile.activity_level)
  const goalLabel = GOALS.find(g => g.key === (profile.goal || 'maintain'))

  return (
    <div className="page fade-in space-y-3">
      <h1 className="text-2xl font-bold text-white">👤 Profil</h1>

      {/* CONT */}
      <div className="card">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-purple/30 to-brand-blue/30 flex items-center justify-center border border-brand-purple/20">
            <span className="text-xl">👤</span>
          </div>
          <div className="flex-1">
            <p className="font-semibold text-white text-sm">{session.user.email}</p>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isAdmin ? 'bg-brand-orange/20 text-brand-orange' : 'bg-dark-700 text-slate-400'}`}>
              {isAdmin ? '⚡ Administrator' : '👤 Standard'}
            </span>
          </div>
          <button onClick={openEditProfile} className="text-xs bg-dark-700 text-slate-300 hover:text-white px-3 py-1.5 rounded-lg hover:bg-dark-600 transition-all">
            ✏️ Editează
          </button>
        </div>
      </div>

      {/* PROFIL COMPACT VIEW */}
      {!loading && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">📊 Datele mele</h2>
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
          <div className="flex gap-2">
            <div className="flex-1 bg-dark-700 rounded-xl px-3 py-2 flex items-center gap-2">
              <span>{activityLabel?.emoji}</span>
              <p className="text-xs text-slate-300">{activityLabel?.label || '—'}</p>
            </div>
            <div className="flex-1 bg-dark-700 rounded-xl px-3 py-2 flex items-center gap-2">
              <span>{goalLabel?.emoji}</span>
              <p className="text-xs text-slate-300">{goalLabel?.label || '—'}</p>
            </div>
          </div>
          {targets && (
            <div className="bg-brand-green/10 border border-brand-green/20 rounded-xl px-3 py-2 flex justify-between items-center">
              <span className="text-xs text-slate-400">🎯 Target zilnic</span>
              <span className="text-sm font-bold text-brand-green">{targets.calories} kcal</span>
            </div>
          )}
        </div>
      )}

      {/* GREUTATE */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-white">⚖️ Greutate</h2>
          <button onClick={() => setShowWeightModal(true)}
            className="text-xs bg-brand-green/20 text-brand-green px-2.5 py-1 rounded-lg hover:bg-brand-green/30">+ Adaugă</button>
        </div>
        {weights.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mb-3">
            {[
              { label: 'Curent', value: `${latestWeight} kg`, color: 'text-white' },
              { label: 'Minim', value: `${Math.min(...weights.map(w => w.weight_kg))} kg`, color: 'text-brand-green' },
              { label: 'Schimbare', value: weightChange !== null ? `${parseFloat(weightChange) > 0 ? '+' : ''}${weightChange} kg` : '—', color: parseFloat(weightChange) < 0 ? 'text-brand-green' : parseFloat(weightChange) > 0 ? 'text-red-400' : 'text-slate-300' },
            ].map(s => (
              <div key={s.label} className="bg-dark-700 rounded-xl p-2 text-center">
                <p className={`text-sm font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-slate-500">{s.label}</p>
              </div>
            ))}
          </div>
        )}
        {chartData.length > 1 && (
          <ResponsiveContainer width="100%" height={120}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2e2e42" />
              <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 10 }} domain={['dataMin - 1', 'dataMax + 1']} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="kg" stroke="#a78bfa" strokeWidth={2} dot={{ fill: '#a78bfa', r: 3 }} name="kg" />
            </LineChart>
          </ResponsiveContainer>
        )}
        {weights.length === 0 && <p className="text-center text-slate-500 text-sm py-3">Nicio înregistrare.</p>}
        {weights.length > 0 && (
          <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
            {weights.map(w => (
              <div key={w.id} className="flex items-center justify-between bg-dark-700 rounded-xl px-3 py-2">
                <span className="text-sm text-white">{w.weight_kg} kg</span>
                <span className="text-xs text-slate-400">{new Date(w.date + 'T12:00:00').toLocaleDateString('ro-RO')}</span>
                <button onClick={() => deleteWeight(w.id)} className="text-slate-600 hover:text-red-400 ml-2">×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SETĂRI RAPIDE */}
      <div className="card space-y-3">
        <h2 className="text-sm font-semibold text-white">⚙️ Setări</h2>
        <StravaCard session={session} />
        <div className="border-t border-dark-600 pt-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">📱 Instalează aplicația</p>
              <p className="text-xs text-slate-500">Safari → Share → Adaugă pe ecranul principal</p>
            </div>
          </div>
        </div>
      </div>

      <button onClick={async () => { setSigningOut(true); await supabase.auth.signOut() }} disabled={signingOut}
        className="w-full bg-red-500/10 border border-red-500/20 text-red-400 font-medium py-3 rounded-xl hover:bg-red-500/20 text-sm">
        {signingOut ? 'Se deconectează...' : '→ Deconectare'}
      </button>

      {/* ─── EDIT PROFIL MODAL ─── */}
      <Modal open={showEditProfile} onClose={() => setShowEditProfile(false)} title="Editează profil">
        <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
          {/* Nume */}
          <div>
            <label className="text-xs text-slate-400 block mb-1">Nume afișat</label>
            <input className="input" placeholder="ex: Alex" value={ep.full_name || ''}
              onChange={e => setEditProfile(p => ({ ...p, full_name: e.target.value }))} />
          </div>

          {/* Gen */}
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

          {/* Date fizice */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { key: 'age', label: 'Vârstă', unit: 'ani', placeholder: '25' },
              { key: 'height_cm', label: 'Înălțime', unit: 'cm', placeholder: '170' },
            ].map(f => (
              <div key={f.key}>
                <label className="text-xs text-slate-400 block mb-1">{f.label} ({f.unit})</label>
                <input className="input" type="number" placeholder={f.placeholder}
                  value={ep[f.key] || ''}
                  onChange={e => setEditProfile(p => ({ ...p, [f.key]: parseFloat(e.target.value) || '' }))} />
              </div>
            ))}
          </div>

          {/* Activitate */}
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

          {/* Obiectiv */}
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

          {/* Macros */}
          {bmr > 0 && (
            <div className="bg-dark-700 rounded-xl p-3 space-y-3">
              <div className="flex justify-between items-center">
                <p className="text-xs font-semibold text-white">Macronutrienți</p>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${macroOk ? 'bg-brand-green/20 text-brand-green' : 'bg-red-500/20 text-red-400'}`}>
                  {macroTotal}%
                </span>
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
                  <div key={s.label}>
                    <p className={`text-sm font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-xs text-slate-500">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button onClick={saveProfileAndTargets} disabled={saving || (!macroOk && bmr > 0)}
            className="btn-primary w-full py-3">
            {saved ? '✅ Salvat!' : saving ? 'Se salvează...' : 'Salvează'}
          </button>
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