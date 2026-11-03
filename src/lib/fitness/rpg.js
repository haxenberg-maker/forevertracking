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
