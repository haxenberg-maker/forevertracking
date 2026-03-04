import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import ProgressRing from '../components/ProgressRing'

const today = new Date().toISOString().split('T')[0]
const dayNames = ['Duminică','Luni','Marți','Miercuri','Joi','Vineri','Sâmbătă']
const monthNames = ['ian','feb','mar','apr','mai','iun','iul','aug','sep','oct','nov','dec']

function MacroBar({ label, value, max, color }) {
  const pct = Math.min((value / max) * 100, 100)
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-slate-400">{label}</span>
        <span className="text-slate-300 font-medium">{Math.round(value)}g / {max}g</span>
      </div>
      <div className="h-2 bg-dark-700 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

export default function Dashboard({ session }) {
  const navigate = useNavigate()
  const [targets, setTargets] = useState({ calories: 2000, protein_g: 150, carbs_g: 250, fat_g: 65, water_ml: 2000 })
  const [todayNutrition, setTodayNutrition] = useState({ calories: 0, protein: 0, carbs: 0, fat: 0 })
  const [water, setWater] = useState(0)
  const [weight, setWeight] = useState(null)
  const [todayWorkouts, setTodayWorkouts] = useState([])
  const [loading, setLoading] = useState(true)

  const now = new Date()
  const dateStr = `${dayNames[now.getDay()]}, ${now.getDate()} ${monthNames[now.getMonth()]}`

  const greet = () => {
    const h = now.getHours()
    if (h < 12) return 'Bună dimineața'
    if (h < 18) return 'Bună ziua'
    return 'Bună seara'
  }

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const uid = session.user.id

      // Targets
      const { data: t } = await supabase.from('user_targets').select('*').eq('user_id', uid).single()
      if (t) setTargets(t)

      // Today's nutrition from meal items
      const { data: meals } = await supabase.from('meal_logs').select(`
        id, meal_items(quantity_g, foods(calories, protein, carbs, fat))
      `).eq('user_id', uid).eq('date', today)

      if (meals) {
        let cal = 0, prot = 0, carb = 0, fat = 0
        meals.forEach(m => {
          m.meal_items?.forEach(item => {
            const f = item.foods
            const ratio = item.quantity_g / 100
            cal += (f?.calories || 0) * ratio
            prot += (f?.protein || 0) * ratio
            carb += (f?.carbs || 0) * ratio
            fat += (f?.fat || 0) * ratio
          })
        })
        setTodayNutrition({ calories: cal, protein: prot, carbs: carb, fat })
      }

      // Water
      const { data: wl } = await supabase.from('water_logs').select('amount_ml').eq('user_id', uid).eq('date', today)
      if (wl) setWater(wl.reduce((s, r) => s + r.amount_ml, 0))

      // Weight
      const { data: wg } = await supabase.from('weight_logs').select('weight_kg').eq('user_id', uid).order('date', { ascending: false }).limit(1)
      if (wg?.[0]) setWeight(wg[0].weight_kg)

      // Today's workouts
      const { data: wo } = await supabase.from('workout_logs').select('id, name, type').eq('user_id', uid).eq('date', today)
      if (wo) setTodayWorkouts(wo)
    } catch(e) { console.error(e) }
    setLoading(false)
  }

  async function addWater(amount) {
    await supabase.from('water_logs').insert({ user_id: session.user.id, date: today, amount_ml: amount })
    setWater(w => w + amount)
  }

  return (
    <div className="page fade-in">
      {/* Header */}
      <div className="mb-6">
        <p className="text-slate-400 text-sm">{dateStr}</p>
        <h1 className="text-2xl font-bold text-white">{greet()} 👋</h1>
      </div>

      {/* Calorie ring + macros */}
      <div className="card mb-3" onClick={() => navigate('/nutritie')}>
        <div className="flex items-center gap-4">
          <ProgressRing
            value={todayNutrition.calories}
            max={targets.calories}
            size={100} strokeWidth={9}
            color="#4ade80"
            sublabel="kcal"
          />
          <div className="flex-1 space-y-2.5">
            <MacroBar label="Proteine" value={todayNutrition.protein} max={targets.protein_g} color="#60a5fa" />
            <MacroBar label="Carbohidrați" value={todayNutrition.carbs} max={targets.carbs_g} color="#fb923c" />
            <MacroBar label="Grăsimi" value={todayNutrition.fat} max={targets.fat_g} color="#a78bfa" />
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-dark-600 flex justify-between text-xs">
          <span className="text-slate-400">Calorii consumate</span>
          <span className="text-brand-green font-semibold">{Math.round(todayNutrition.calories)} / {targets.calories} kcal</span>
        </div>
      </div>

      {/* Water tracker */}
      <div className="card mb-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">💧</span>
            <div>
              <p className="text-sm font-semibold text-white">Apă</p>
              <p className="text-xs text-slate-400">{water}ml / {targets.water_ml}ml</p>
            </div>
          </div>
          <div className="w-24 h-2 bg-dark-700 rounded-full overflow-hidden">
            <div className="h-full bg-brand-blue rounded-full transition-all" style={{ width: `${Math.min((water / targets.water_ml) * 100, 100)}%` }} />
          </div>
        </div>
        <div className="flex gap-2">
          {[150, 250, 350, 500].map(ml => (
            <button key={ml} onClick={() => addWater(ml)}
              className="flex-1 py-2 bg-dark-700 hover:bg-brand-blue/20 text-slate-300 hover:text-brand-blue rounded-xl text-xs font-medium transition-all">
              +{ml}ml
            </button>
          ))}
        </div>
      </div>

      {/* Weight */}
      <div className="card mb-3 flex items-center justify-between" onClick={() => navigate('/profil')}>
        <div className="flex items-center gap-3">
          <span className="text-xl">⚖️</span>
          <div>
            <p className="text-sm font-semibold text-white">Greutate</p>
            <p className="text-xs text-slate-400">Ultima măsurătoare</p>
          </div>
        </div>
        <span className="text-2xl font-bold text-white">{weight ? `${weight} kg` : '—'}</span>
      </div>

      {/* Today's sport */}
      <div className="card" onClick={() => navigate('/sport')}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-white">Antrenamente azi</h2>
          <span className="text-xs text-brand-green">→ Sport</span>
        </div>
        {todayWorkouts.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-2">Niciun antrenament înregistrat azi</p>
        ) : (
          <div className="space-y-2">
            {todayWorkouts.map(w => (
              <div key={w.id} className="flex items-center gap-2 bg-dark-700 rounded-xl px-3 py-2">
                <span>{w.type === 'running' ? '🏃' : '🏋️'}</span>
                <span className="text-sm text-slate-200">{w.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
