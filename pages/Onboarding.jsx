import { useState } from 'react'
import { supabase } from '../lib/supabase'

const ACTIVITY_LEVELS = [
  { value: 'sedentary', label: 'Sedentar', desc: 'Birou, mișcare minimă', factor: 1.2 },
  { value: 'light', label: 'Ușor activ', desc: '1-3 zile/săpt sport', factor: 1.375 },
  { value: 'moderate', label: 'Moderat activ', desc: '3-5 zile/săpt sport', factor: 1.55 },
  { value: 'active', label: 'Activ', desc: '6-7 zile/săpt sport', factor: 1.725 },
  { value: 'very_active', label: 'Foarte activ', desc: 'Sport zilnic + muncă fizică', factor: 1.9 },
]

export default function Onboarding({ session, onDone }) {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState({ name: '', age: '', height_cm: '', weight_kg: '', gender: 'male', activity: 'moderate', goal: 'maintain' })
  const [saving, setSaving] = useState(false)

  function set(k, v) { setForm(p => ({ ...p, [k]: v })) }

  function calcTargets() {
    const age = parseInt(form.age) || 25
    const h = parseFloat(form.height_cm) || 170
    const w = parseFloat(form.weight_kg) || 70
    const factor = ACTIVITY_LEVELS.find(a => a.value === form.activity)?.factor || 1.55
    // Mifflin-St Jeor
    const bmr = form.gender === 'male'
      ? 10 * w + 6.25 * h - 5 * age + 5
      : 10 * w + 6.25 * h - 5 * age - 161
    let tdee = Math.round(bmr * factor)
    if (form.goal === 'lose') tdee -= 400
    if (form.goal === 'gain') tdee += 300
    return {
      calories: tdee,
      protein_g: Math.round(w * 2),
      carbs_g: Math.round((tdee * 0.4) / 4),
      fat_g: Math.round((tdee * 0.3) / 9),
      water_ml: Math.round(w * 35),
    }
  }

  async function finish() {
    setSaving(true)
    const uid = session.user.id
    const targets = calcTargets()

    await supabase.from('user_profiles').upsert({
      user_id: uid,
      full_name: form.name || null,
      age: parseInt(form.age) || null,
      height_cm: parseFloat(form.height_cm) || null,
      activity_level: form.activity,
      goal: form.goal,
      onboarding_done: true,
    }, { onConflict: 'user_id' })

    if (form.weight_kg) {
      await supabase.from('weight_logs').insert({
        user_id: uid,
        date: new Date().toISOString().split('T')[0],
        weight_kg: parseFloat(form.weight_kg),
      })
    }

    await supabase.from('user_targets').upsert({ user_id: uid, ...targets }, { onConflict: 'user_id' })
    setSaving(false)
    onDone()
  }

  const steps = [
    // Step 0 — welcome
    <div key="0" className="space-y-6 text-center">
      <div className="w-20 h-20 rounded-3xl bg-brand-green/20 flex items-center justify-center mx-auto">
        <span className="text-4xl">🏋️</span>
      </div>
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">Bun venit!</h1>
        <p className="text-slate-400 text-sm">Hai să configurăm aplicația în funcție de obiectivele tale. Durează doar 1 minut.</p>
      </div>
      <button onClick={() => setStep(1)} className="btn-primary w-full py-4 text-base">Să începem →</button>
    </div>,

    // Step 1 — basic info
    <div key="1" className="space-y-4">
      <div className="text-center mb-2">
        <p className="text-xs text-slate-500 mb-1">Pasul 1 / 3</p>
        <h2 className="text-xl font-bold text-white">Date personale</h2>
      </div>
      <div>
        <label className="text-xs text-slate-400 block mb-1">Cum te cheamă?</label>
        <input className="input" placeholder="ex: Alex" autoFocus value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
      </div>
      <div>
        <label className="text-xs text-slate-400 block mb-1">Gen</label>
        <div className="flex gap-2">
          {[{ v: 'male', l: '♂ Masculin' }, { v: 'female', l: '♀ Feminin' }].map(g => (
            <button key={g.v} onClick={() => set('gender', g.v)}
              className={`flex-1 py-3 rounded-xl text-sm font-medium transition-all ${form.gender === g.v ? 'bg-brand-blue/20 text-brand-blue border border-brand-blue/40' : 'bg-dark-700 text-slate-400'}`}>
              {g.l}
            </button>
          ))}
        </div>
      </div>
      {[
        { key: 'age', label: 'Vârstă', placeholder: '25', unit: 'ani' },
        { key: 'height_cm', label: 'Înălțime', placeholder: '175', unit: 'cm' },
        { key: 'weight_kg', label: 'Greutate actuală', placeholder: '70', unit: 'kg' },
      ].map(f => (
        <div key={f.key}>
          <label className="text-xs text-slate-400 block mb-1">{f.label}</label>
          <div className="relative">
            <input className="input pr-10" type="number" placeholder={f.placeholder}
              value={form[f.key]} onChange={e => set(f.key, e.target.value)} />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">{f.unit}</span>
          </div>
        </div>
      ))}
      <button onClick={() => setStep(2)} className="btn-primary w-full py-3">Continuă →</button>
    </div>,

    // Step 2 — activity
    <div key="2" className="space-y-4">
      <div className="text-center mb-2">
        <p className="text-xs text-slate-500 mb-1">Pasul 2 / 3</p>
        <h2 className="text-xl font-bold text-white">Nivel de activitate</h2>
      </div>
      <div className="space-y-2">
        {ACTIVITY_LEVELS.map(a => (
          <button key={a.value} onClick={() => set('activity', a.value)}
            className={`w-full text-left px-4 py-3 rounded-xl transition-all ${form.activity === a.value ? 'bg-brand-green/20 border border-brand-green/40' : 'bg-dark-700 hover:bg-dark-600'}`}>
            <p className={`text-sm font-medium ${form.activity === a.value ? 'text-brand-green' : 'text-white'}`}>{a.label}</p>
            <p className="text-xs text-slate-400 mt-0.5">{a.desc}</p>
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <button onClick={() => setStep(1)} className="btn-ghost flex-1 py-3">← Înapoi</button>
        <button onClick={() => setStep(3)} className="btn-primary flex-1 py-3">Continuă →</button>
      </div>
    </div>,

    // Step 3 — goal
    <div key="3" className="space-y-4">
      <div className="text-center mb-2">
        <p className="text-xs text-slate-500 mb-1">Pasul 3 / 3</p>
        <h2 className="text-xl font-bold text-white">Obiectiv</h2>
      </div>
      <div className="space-y-2">
        {[
          { v: 'lose', l: '📉 Slăbesc', d: 'Deficit caloric de ~400 kcal/zi' },
          { v: 'maintain', l: '⚖️ Mențin greutatea', d: 'Calorii de menținere' },
          { v: 'gain', l: '📈 Iau în masă', d: 'Surplus caloric de ~300 kcal/zi' },
        ].map(g => (
          <button key={g.v} onClick={() => set('goal', g.v)}
            className={`w-full text-left px-4 py-3 rounded-xl transition-all ${form.goal === g.v ? 'bg-brand-purple/20 border border-brand-purple/40' : 'bg-dark-700 hover:bg-dark-600'}`}>
            <p className={`text-sm font-medium ${form.goal === g.v ? 'text-brand-purple' : 'text-white'}`}>{g.l}</p>
            <p className="text-xs text-slate-400 mt-0.5">{g.d}</p>
          </button>
        ))}
      </div>
      {form.age && form.height_cm && form.weight_kg && (
        <div className="bg-dark-700 rounded-xl px-4 py-3">
          <p className="text-xs text-slate-400 mb-1">Target calculat automat:</p>
          <p className="text-lg font-bold text-brand-green">{calcTargets().calories} kcal / zi</p>
          <p className="text-xs text-slate-500">
            P: {calcTargets().protein_g}g · C: {calcTargets().carbs_g}g · G: {calcTargets().fat_g}g · 💧 {calcTargets().water_ml}ml
          </p>
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={() => setStep(2)} className="btn-ghost flex-1 py-3">← Înapoi</button>
        <button onClick={finish} disabled={saving} className="btn-primary flex-1 py-3">
          {saving ? 'Se salvează...' : '✓ Gata!'}
        </button>
      </div>
    </div>,
  ]

  return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Progress dots */}
        {step > 0 && (
          <div className="flex gap-1.5 justify-center mb-6">
            {[1,2,3].map(i => (
              <div key={i} className={`h-1 rounded-full transition-all ${i <= step ? 'bg-brand-green w-6' : 'bg-dark-700 w-3'}`} />
            ))}
          </div>
        )}
        {steps[step]}
      </div>
    </div>
  )
}