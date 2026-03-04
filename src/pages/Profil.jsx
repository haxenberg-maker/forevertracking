import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Modal from '../components/Modal'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

function getToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

// ─── Strava Card ──────────────────────────────────────

function StravaCard({ session }) {
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(true)
  const [disconnecting, setDisconnecting] = useState(false)

  const STRAVA_CLIENT_ID = import.meta.env.VITE_STRAVA_CLIENT_ID
  const REDIRECT_URI = `${window.location.origin}/strava-callback`
  const SCOPE = 'read,activity:read_all'
  const stravaAuthUrl = `https://www.strava.com/oauth/authorize?client_id=${STRAVA_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&approval_prompt=auto&scope=${SCOPE}`

  useEffect(() => { loadToken() }, [])

  async function loadToken() {
    setLoading(true)
    const { data } = await supabase.from('strava_tokens').select('athlete_id, created_at').eq('user_id', session.user.id).single()
    setToken(data || null)
    setLoading(false)
  }

  async function disconnect() {
    if (!confirm('Deconectezi Strava? Activitățile deja importate rămân.')) return
    setDisconnecting(true)
    await supabase.from('strava_tokens').delete().eq('user_id', session.user.id)
    setToken(null)
    setDisconnecting(false)
  }

  return (
    <div className="card">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center">
          <span className="text-xl">🟠</span>
        </div>
        <div>
          <p className="text-sm font-semibold text-white">Strava</p>
          <p className="text-xs text-slate-400">Importă alergări și antrenamente automat</p>
        </div>
      </div>

      {loading ? (
        <p className="text-xs text-slate-500">Se verifică...</p>
      ) : token ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 bg-brand-green/10 border border-brand-green/20 rounded-xl px-3 py-2">
            <span className="text-brand-green text-sm">✓</span>
            <p className="text-sm text-brand-green font-medium">Conectat</p>
            <p className="text-xs text-slate-500 ml-auto">Athlete #{token.athlete_id}</p>
          </div>
          <p className="text-xs text-slate-500">Apasă 🟠 Strava din tab-urile Alergare sau Forță pentru a importa activități.</p>
          <button onClick={disconnect} disabled={disconnecting}
            className="w-full text-xs bg-red-500/10 text-red-400 border border-red-500/20 py-2 rounded-xl hover:bg-red-500/20 transition-all">
            {disconnecting ? 'Se deconectează...' : 'Deconectează Strava'}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-slate-500 mb-3">
            Conectează contul Strava pentru a importa automat alergările și antrenamentele. Funcționează și cu Garmin dacă ai sincronizarea activată.
          </p>
          <a href={stravaAuthUrl}
            className="flex items-center justify-center gap-2 w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 rounded-xl transition-all text-sm">
            <span>🟠</span> Conectează cu Strava
          </a>
        </div>
      )}
    </div>
  )
}

const ACTIVITY_LEVELS = [
  { key: 'sedentary',   label: 'Sedentar',      desc: 'Birou, fără sport',           multiplier: 1.2,   emoji: '🪑' },
  { key: 'light',       label: 'Ușor activ',     desc: '1-3 zile/săpt sport',         multiplier: 1.375, emoji: '🚶' },
  { key: 'moderate',    label: 'Moderat activ',  desc: '3-5 zile/săpt sport',         multiplier: 1.55,  emoji: '🏃' },
  { key: 'active',      label: 'Activ',          desc: '6-7 zile/săpt sport intens',  multiplier: 1.725, emoji: '💪' },
  { key: 'very_active', label: 'Foarte activ',   desc: 'Sport 2x/zi sau muncă fizică',multiplier: 1.9,   emoji: '🏋️' },
]

const GOALS = [
  { key: 'lose',     label: 'Slăbire',        desc: '-500 kcal/zi', kcalAdjust: -500, emoji: '📉' },
  { key: 'maintain', label: 'Menținere',       desc: '±0 kcal/zi',  kcalAdjust: 0,    emoji: '⚖️' },
  { key: 'gain',     label: 'Masă musculară',  desc: '+300 kcal/zi',kcalAdjust: 300,  emoji: '📈' },
]

function calcBMR(gender, weight, height, age) {
  if (!weight || !height || !age) return 0
  if (gender === 'male') return 10 * weight + 6.25 * height - 5 * age + 5
  return 10 * weight + 6.25 * height - 5 * age - 161
}

function calcTDEE(bmr, activityKey) {
  const level = ACTIVITY_LEVELS.find(l => l.key === activityKey)
  return Math.round(bmr * (level?.multiplier || 1.55))
}

// ─── Macro slider component ───────────────────────────

function MacroSlider({ label, emoji, color, value, onChange, min = 10, max = 70 }) {
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs text-slate-300">{emoji} {label}</span>
        <span className={`text-sm font-bold ${color}`}>{value}%</span>
      </div>
      <input
        type="range" min={min} max={max} step={1} value={value}
        onChange={e => onChange(parseInt(e.target.value))}
        className="w-full h-2 rounded-full appearance-none cursor-pointer"
        style={{
          background: `linear-gradient(to right, var(--slider-color) 0%, var(--slider-color) ${((value - min) / (max - min)) * 100}%, #2e2e42 ${((value - min) / (max - min)) * 100}%, #2e2e42 100%)`,
          '--slider-color': color.includes('green') ? '#4ade80' : color.includes('blue') ? '#60a5fa' : color.includes('orange') ? '#fb923c' : '#a78bfa'
        }}
      />
    </div>
  )
}

export default function Profil({ session }) {
  const [weights, setWeights] = useState([])
  const [profile, setProfile] = useState({ gender: 'male', age: 25, height_cm: 170, activity_level: 'moderate', goal: 'maintain' })
  const [showWeightModal, setShowWeightModal] = useState(false)
  const [weightForm, setWeightForm] = useState({ date: getToday(), weight_kg: '' })
  const [loading, setLoading] = useState(true)
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileSaved, setProfileSaved] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [applyingTargets, setApplyingTargets] = useState(false)
  const [targetApplied, setTargetApplied] = useState(false)

  // Macro percentages — adjustable
  const [macroP, setMacroP] = useState(25) // protein %
  const [macroC, setMacroC] = useState(45) // carbs %
  const [macroF, setMacroF] = useState(30) // fat %

  const macroTotal = macroP + macroC + macroF
  const macroOk = macroTotal === 100

  // Auto-adjust carbs when protein or fat changes to keep total = 100
  function setProtein(val) {
    setMacroP(val)
    const remaining = 100 - val - macroF
    setMacroC(Math.max(10, Math.min(70, remaining)))
  }
  function setFat(val) {
    setMacroF(val)
    const remaining = 100 - macroP - val
    setMacroC(Math.max(10, Math.min(70, remaining)))
  }
  function setCarbs(val) {
    setMacroC(val)
    const remaining = 100 - macroP - val
    setMacroF(Math.max(10, Math.min(70, remaining)))
  }

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const uid = session.user.id
    const { data: wg } = await supabase.from('weight_logs').select('*').eq('user_id', uid).order('date', { ascending: false }).limit(60)
    setWeights(wg || [])
    const { data: pr } = await supabase.from('user_profiles').select('*').eq('user_id', uid).single()
    if (pr) setProfile(p => ({ ...p, ...pr }))
    setLoading(false)
  }

  async function saveProfile() {
    setSavingProfile(true)
    const uid = session.user.id
    const { data: existing } = await supabase.from('user_profiles').select('id').eq('user_id', uid).single()
    const data = { user_id: uid, gender: profile.gender, age: profile.age, height_cm: profile.height_cm, activity_level: profile.activity_level }
    if (existing) await supabase.from('user_profiles').update(data).eq('user_id', uid)
    else await supabase.from('user_profiles').insert(data)
    setSavingProfile(false); setProfileSaved(true); setTimeout(() => setProfileSaved(false), 2000)
  }

  async function saveWeight() {
    if (!weightForm.weight_kg) return
    await supabase.from('weight_logs').insert({ user_id: session.user.id, date: weightForm.date, weight_kg: parseFloat(weightForm.weight_kg) })
    setShowWeightModal(false); setWeightForm({ date: getToday(), weight_kg: '' }); loadData()
  }

  async function deleteWeight(id) {
    await supabase.from('weight_logs').delete().eq('id', id); loadData()
  }

  async function applyTargets() {
    if (!macroOk) return
    setApplyingTargets(true)
    const macros = {
      calories: targetKcal,
      protein_g: Math.round((targetKcal * macroP / 100) / 4),
      carbs_g: Math.round((targetKcal * macroC / 100) / 4),
      fat_g: Math.round((targetKcal * macroF / 100) / 9),
      water_ml: 2000,
    }
    const uid = session.user.id
    const { data: existing } = await supabase.from('user_targets').select('id').eq('user_id', uid).single()
    if (existing) await supabase.from('user_targets').update(macros).eq('user_id', uid)
    else await supabase.from('user_targets').insert({ ...macros, user_id: uid })
    setApplyingTargets(false); setTargetApplied(true)
    setTimeout(() => setTargetApplied(false), 3000)
  }

  // Computed
  const latestWeight = weights[0]?.weight_kg
  const bmr = calcBMR(profile.gender, latestWeight, profile.height_cm, profile.age)
  const tdee = calcTDEE(bmr, profile.activity_level)
  const goal = GOALS.find(g => g.key === (profile.goal || 'maintain')) || GOALS[1]
  const targetKcal = Math.max(1200, tdee + goal.kcalAdjust)

  const suggestedMacros = {
    protein_g: Math.round((targetKcal * macroP / 100) / 4),
    carbs_g: Math.round((targetKcal * macroC / 100) / 4),
    fat_g: Math.round((targetKcal * macroF / 100) / 9),
  }

  const chartData = [...weights].reverse().map(w => ({
    date: new Date(w.date + 'T12:00:00').toLocaleDateString('ro-RO', { day: '2-digit', month: 'short' }),
    kg: w.weight_kg
  }))
  const weightChange = weights.length >= 2 ? (weights[0].weight_kg - weights[weights.length - 1].weight_kg).toFixed(1) : null
  const tooltipStyle = { backgroundColor: '#1a1a24', border: '1px solid #2e2e42', borderRadius: 12, color: '#f1f5f9', fontSize: 12 }

  return (
    <div className="page fade-in space-y-3">
      <h1 className="text-2xl font-bold text-white">👤 Profil</h1>

      {/* Account */}
      <div className="card flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-purple/30 to-brand-blue/30 flex items-center justify-center border border-brand-purple/20">
          <span className="text-xl">👤</span>
        </div>
        <div>
          <p className="font-semibold text-white text-sm">{session.user.email}</p>
          <p className="text-xs text-slate-400">Cont activ</p>
        </div>
      </div>

      {/* Date fizice */}
      <div className="card space-y-4">
        <h2 className="text-sm font-semibold text-white">📊 Date fizice & activitate</h2>

        <div>
          <label className="text-xs text-slate-400 block mb-2">Gen</label>
          <div className="flex gap-2">
            {[{ key: 'male', label: '♂ Masculin' }, { key: 'female', label: '♀ Feminin' }].map(g => (
              <button key={g.key} onClick={() => setProfile(p => ({ ...p, gender: g.key }))}
                className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${profile.gender === g.key ? 'bg-brand-blue/20 text-brand-blue border border-brand-blue/40' : 'bg-dark-700 text-slate-400'}`}>
                {g.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-400 block mb-1">Vârstă (ani)</label>
            <input className="input" type="number" value={profile.age || ''} placeholder="25"
              onChange={e => setProfile(p => ({ ...p, age: parseInt(e.target.value) || '' }))} />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Înălțime (cm)</label>
            <input className="input" type="number" value={profile.height_cm || ''} placeholder="170"
              onChange={e => setProfile(p => ({ ...p, height_cm: parseFloat(e.target.value) || '' }))} />
          </div>
        </div>

        <div>
          <label className="text-xs text-slate-400 block mb-2">Nivel de activitate</label>
          <div className="space-y-1.5">
            {ACTIVITY_LEVELS.map(level => (
              <button key={level.key} onClick={() => setProfile(p => ({ ...p, activity_level: level.key }))}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left ${
                  profile.activity_level === level.key ? 'bg-brand-green/15 border border-brand-green/40' : 'bg-dark-700 hover:bg-dark-600'
                }`}>
                <span className="text-lg">{level.emoji}</span>
                <div className="flex-1">
                  <p className={`text-sm font-medium ${profile.activity_level === level.key ? 'text-brand-green' : 'text-slate-200'}`}>{level.label}</p>
                  <p className="text-xs text-slate-500">{level.desc}</p>
                </div>
                {profile.activity_level === level.key && <span className="text-brand-green text-sm">✓</span>}
              </button>
            ))}
          </div>
        </div>

        <button onClick={saveProfile} disabled={savingProfile} className="btn-primary w-full py-3">
          {profileSaved ? '✅ Salvat!' : savingProfile ? 'Se salvează...' : 'Salvează profilul'}
        </button>
      </div>

      {/* TDEE + Macro calculator */}
      {latestWeight && bmr > 0 ? (
        <div className="card space-y-4">
          <h2 className="text-sm font-semibold text-white">🔥 Calculator calorii & macronutrienți</h2>

          {/* BMR / TDEE */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-dark-700 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-brand-orange">{Math.round(bmr)}</p>
              <p className="text-xs text-slate-400">BMR (repaus)</p>
              <p className="text-xs text-slate-600">kcal/zi</p>
            </div>
            <div className="bg-dark-700 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-brand-green">{tdee}</p>
              <p className="text-xs text-slate-400">TDEE (activ)</p>
              <p className="text-xs text-slate-600">kcal/zi</p>
            </div>
          </div>

          {/* Goal */}
          <div>
            <label className="text-xs text-slate-400 block mb-2">Obiectiv</label>
            <div className="flex gap-1.5">
              {GOALS.map(g => (
                <button key={g.key} onClick={() => setProfile(p => ({ ...p, goal: g.key }))}
                  className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all ${
                    (profile.goal || 'maintain') === g.key
                      ? 'bg-brand-purple/20 text-brand-purple border border-brand-purple/40'
                      : 'bg-dark-700 text-slate-400 hover:bg-dark-600'
                  }`}>
                  {g.emoji} {g.label}
                  <span className="block text-slate-500" style={{ fontSize: 10 }}>{g.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Target kcal */}
          <div className="bg-dark-700 rounded-xl px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-slate-300">🎯 Calorii țintă</span>
            <span className="text-xl font-bold text-brand-green">{targetKcal} kcal</span>
          </div>

          {/* Macro sliders */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-white">Distribuție macronutrienți</p>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${macroOk ? 'bg-brand-green/20 text-brand-green' : 'bg-red-500/20 text-red-400'}`}>
                {macroTotal}% {macroOk ? '✓' : '≠ 100%'}
              </span>
            </div>

            <div className="space-y-4">
              <MacroSlider label="Proteine" emoji="💪" color="text-brand-blue"
                value={macroP} onChange={setProtein} />
              <MacroSlider label="Carbohidrați" emoji="🌾" color="text-brand-orange"
                value={macroC} onChange={setCarbs} />
              <MacroSlider label="Grăsimi" emoji="🥑" color="text-brand-purple"
                value={macroF} onChange={setFat} />
            </div>

            <p className="text-xs text-slate-600 mt-2 text-center">
              Ajustarea unui slider modifică automat carbohidrații pentru a menține totalul la 100%
            </p>
          </div>

          {/* Preview macros */}
          <div className="bg-gradient-to-br from-brand-purple/10 to-transparent border border-brand-purple/20 rounded-xl p-3">
            <p className="text-xs text-slate-400 mb-3">
              Targete sugerate — <span className="text-brand-purple">{goal.label.toLowerCase()}</span>:
            </p>
            <div className="grid grid-cols-4 gap-2 text-center mb-3">
              <div>
                <p className="text-base font-bold text-brand-green">{targetKcal}</p>
                <p className="text-xs text-slate-500">kcal</p>
              </div>
              <div>
                <p className="text-base font-bold text-brand-blue">{suggestedMacros.protein_g}g</p>
                <p className="text-xs text-slate-500">prot. ({macroP}%)</p>
              </div>
              <div>
                <p className="text-base font-bold text-brand-orange">{suggestedMacros.carbs_g}g</p>
                <p className="text-xs text-slate-500">carb. ({macroC}%)</p>
              </div>
              <div>
                <p className="text-base font-bold text-brand-purple">{suggestedMacros.fat_g}g</p>
                <p className="text-xs text-slate-500">grăs. ({macroF}%)</p>
              </div>
            </div>

            {/* Visual bar */}
            <div className="flex h-2 rounded-full overflow-hidden mb-3">
              <div className="bg-brand-blue transition-all" style={{ width: `${macroP}%` }} />
              <div className="bg-brand-orange transition-all" style={{ width: `${macroC}%` }} />
              <div className="bg-brand-purple transition-all" style={{ width: `${macroF}%` }} />
            </div>

            <button onClick={applyTargets} disabled={applyingTargets || !macroOk}
              className="w-full bg-brand-purple/20 text-brand-purple border border-brand-purple/30 font-medium py-2.5 rounded-xl hover:bg-brand-purple/30 transition-all text-sm disabled:opacity-50">
              {targetApplied ? '✅ Target-uri aplicate!' : applyingTargets ? 'Se aplică...' : '→ Aplică aceste target-uri'}
            </button>
          </div>
        </div>
      ) : (
        <div className="card border-brand-orange/20 bg-brand-orange/5 text-center py-4">
          <p className="text-sm text-brand-orange">⚠️ Adaugă greutatea ta pentru a calcula TDEE-ul</p>
        </div>
      )}

      {/* Weight section */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-white">⚖️ Greutate corporală</h2>
          <button onClick={() => setShowWeightModal(true)}
            className="text-xs bg-brand-green/20 text-brand-green px-2.5 py-1 rounded-lg hover:bg-brand-green/30">
            + Adaugă
          </button>
        </div>
        {weights.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mb-3">
            {[
              { label: 'Curent', value: `${latestWeight} kg`, color: 'text-white' },
              { label: 'Minim', value: `${Math.min(...weights.map(w => w.weight_kg))} kg`, color: 'text-brand-green' },
              { label: 'Schimbare', value: weightChange !== null ? `${parseFloat(weightChange) > 0 ? '+' : ''}${weightChange} kg` : '—', color: parseFloat(weightChange) < 0 ? 'text-brand-green' : parseFloat(weightChange) > 0 ? 'text-red-400' : 'text-slate-300' },
            ].map(s => (
              <div key={s.label} className="bg-dark-700 rounded-xl p-2 text-center">
                <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-slate-500">{s.label}</p>
              </div>
            ))}
          </div>
        )}
        {chartData.length > 1 && (
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2e2e42" />
              <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 10 }} domain={['dataMin - 1', 'dataMax + 1']} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="kg" stroke="#a78bfa" strokeWidth={2} dot={{ fill: '#a78bfa', r: 3 }} name="kg" />
            </LineChart>
          </ResponsiveContainer>
        )}
        {!loading && weights.length === 0 ? (
          <p className="text-center text-slate-500 text-sm py-4">Nicio înregistrare. Adaugă prima greutate!</p>
        ) : (
          <div className="mt-3 space-y-1.5 max-h-40 overflow-y-auto">
            {weights.map(w => (
              <div key={w.id} className="flex items-center justify-between bg-dark-700 rounded-xl px-3 py-2">
                <div>
                  <span className="text-sm font-semibold text-white">{w.weight_kg} kg</span>
                  <span className="text-xs text-slate-400 ml-2">📅 {new Date(w.date + 'T12:00:00').toLocaleDateString('ro-RO')}</span>
                </div>
                <button onClick={() => deleteWeight(w.id)} className="text-slate-600 hover:text-red-400 transition-colors">×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Strava */}
      <StravaCard session={session} />

      {/* PWA */}
      <div className="card">
        <h2 className="text-sm font-semibold text-white mb-1">📱 Instalare pe telefon</h2>
        <p className="text-xs text-slate-500">Apasă "Adaugă la ecranul principal" din browser pentru a instala aplicația.</p>
      </div>

      <button onClick={async () => { setSigningOut(true); await supabase.auth.signOut() }} disabled={signingOut}
        className="w-full bg-red-500/10 border border-red-500/20 text-red-400 font-medium py-3 rounded-xl hover:bg-red-500/20 transition-all text-sm">
        {signingOut ? 'Se deconectează...' : '→ Deconectare'}
      </button>

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