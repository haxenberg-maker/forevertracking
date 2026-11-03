import { createClient } from '@supabase/supabase-js'
import { markDirty, notifyWritten } from './cache'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Supabase credentials missing! Check your .env file.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Orice scriere într-un tabel invalidează automat cache-ul dinamic (să nu apară date vechi după salvare)
// și, când se termină cu succes, anunță restul aplicației (sincronizarea XP).
const originalFrom = supabase.from.bind(supabase)
supabase.from = (table) => {
  const qb = originalFrom(table)
  for (const method of ['insert', 'update', 'upsert', 'delete']) {
    const original = qb[method].bind(qb)
    qb[method] = (...args) => {
      markDirty(table)
      const builder = original(...args)
      // După ce scrierea s-a terminat CU SUCCES, anunțăm ascultătorii (ex. sincronizarea XP).
      // Rezultatul ajunge neschimbat la codul care a făcut scrierea.
      const originalThen = builder.then.bind(builder)
      builder.then = (onFulfilled, onRejected) => originalThen(res => {
        if (!res?.error) notifyWritten(table)
        return onFulfilled ? onFulfilled(res) : res
      }, onRejected)
      return builder
    }
  }
  return qb
}
