import { createClient } from '@supabase/supabase-js'
import { markDirty } from './cache'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Supabase credentials missing! Check your .env file.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Orice scriere într-un tabel invalidează automat cache-ul dinamic,
// ca să nu apară niciodată date vechi după ce utilizatorul a salvat ceva.
const originalFrom = supabase.from.bind(supabase)
supabase.from = (table) => {
  const qb = originalFrom(table)
  for (const method of ['insert', 'update', 'upsert', 'delete']) {
    const original = qb[method].bind(qb)
    qb[method] = (...args) => { markDirty(table); return original(...args) }
  }
  return qb
}
