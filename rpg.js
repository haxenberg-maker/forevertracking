import { supabase } from '../supabase'

export const DEFAULT_EXERCISES = [
  { name: 'Alergare', category: 'endurance', unit: 'km' },
  { name: 'Bicicletă', category: 'endurance', unit: 'km' },
  { name: 'Flotări', category: 'strength', unit: 'reps' },
  { name: 'Tracțiuni', category: 'strength', unit: 'reps' },
  { name: 'Genuflexiuni', category: 'strength', unit: 'reps' },
  { name: 'Plank', category: 'strength', unit: 'seconds' },
  { name: 'Mobilitate', category: 'mobility', unit: 'minutes' },
]

export function levelFromXp(totalXp = 0) {
  let level = 1
  let remaining = Math.max(0, Number(totalXp) || 0)
  let needed = 100
  while (remaining >= needed && level < 100) {
    remaining -= needed
    level += 1
    needed = level * 100
  }
  return { level, progressXp: remaining, nextLevelXp: needed, progressPercent: Math.min(100, (remaining / needed) * 100) }
}

export async function ensureRpgProfile() {
  const { error } = await supabase.rpc('ensure_rpg_profile')
  if (error) throw error
}

export async function ensureDefaultExercises(userId) {
  const { error } = await supabase.from('exercise_definitions').upsert(
    DEFAULT_EXERCISES.map(exercise => ({ ...exercise, user_id: userId })),
    { onConflict: 'user_id,name', ignoreDuplicates: true },
  )
  if (error) throw error
}

export function getMetricFromActivity(activity, metricKey) {
  if (metricKey === 'distance_km') return Number(activity.distance_km || (activity.unit === 'km' ? activity.metric_value : 0) || 0)
  if (metricKey === 'reps') return activity.unit === 'reps' ? Number(activity.metric_value || 0) : 0
  if (metricKey === 'duration_minutes') return Number(activity.duration_minutes || (activity.unit === 'minutes' ? activity.metric_value : activity.unit === 'seconds' ? activity.metric_value / 60 : 0) || 0)
  if (metricKey === 'elevation_gain_m') return Number(activity.elevation_gain_m || 0)
  if (metricKey === 'activity_count') return 1
  return 0
}

// Regulile de XP afișate în aplicație. Ține-le în sincron cu supabase/migrations/202611030001_xp_everything.sql.
export const XP_RULES = [
  { group: 'Apă', rules: [['50% din țintă', '+8'], ['Țintă atinsă', '+12']] },
  { group: 'Nutriție', rules: [['Masă înregistrată', '+5'], ['3 mese în zi', '+10'], ['Proteine la țintă', '+15'], ['Calorii între 85% și 110% din țintă (la sfârșit de zi)', '+20']] },
  { group: 'Suplimente', rules: [['Fiecare supliment luat', '+3'], ['Toate suplimentele luate', '+10']] },
  { group: 'Antrenament', rules: [['Alergare', '5 / km (5–60)'], ['Bicicletă', '2 / km (8–50)'], ['Forță', '+20, plus 2 / set (max +20)'], ['Alt antrenament', '+10'], ['Antrenament din plan bifat', '+10']] },
  { group: 'Bonus', rules: [['Zi completă: apă, mese, suplimente și mișcare', '+25']] },
]
export const TRAINING_DAILY_CAP = 150
