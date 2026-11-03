// Cache stale-while-revalidate (SWR) pentru toată aplicația.
//
// Ideea: când intri pe un ecran, vezi INSTANT ce s-a încărcat data trecută,
// iar datele proaspete vin în fundal și înlocuiesc totul fără să blocheze UI-ul.
//
// Reguli:
//  - chei "dinamice" (implicit): se șterg automat la ORICE scriere în baza de date
//    (vezi supabase.js), deci nu vezi niciodată date vechi după ce ai salvat ceva.
//  - chei "statice" (încep cu `static:<tabel>:`): date care se schimbă rar (lista de
//    alimente, citatul zilei). Au TTL și nu se mai cer deloc cât sunt proaspete;
//    se șterg doar când se scrie în tabelul lor.
//  - cererile identice aflate în zbor sunt unite (nu se mai trimite de 3 ori aceeași cerere).

const store = new Map()     // key -> { data, ts }
const inflight = new Map()  // key -> Promise

const isStatic = key => key.includes('static:')

function run(key, fetcher) {
  const existing = inflight.get(key)
  if (existing) return existing
  const p = Promise.resolve()
    .then(fetcher)
    .then(res => {
      // dacă între timp s-a invalidat cheia (ex. o scriere), nu salvăm rezultatul vechi
      if (inflight.get(key) === p && !res?.error) store.set(key, { data: res, ts: Date.now() })
      return res
    })
    .finally(() => { if (inflight.get(key) === p) inflight.delete(key) })
  inflight.set(key, p)
  return p
}

/**
 * Afișează instant din cache (dacă există), apoi aduce date proaspete.
 * @param key     cheie unică (include user id-ul!)
 * @param fetcher funcție async care întoarce rezultatul brut (ex. un răspuns Supabase)
 * @param onData  apelată cu rezultatul — o dată din cache, o dată proaspăt
 * @param opts.ttl    ms cât datele sunt considerate proaspete (fără cerere în rețea)
 * @param opts.force  ignoră cache-ul și cere date noi (după o acțiune a utilizatorului)
 */
export function swr(key, fetcher, onData, { ttl = 0, force = false } = {}) {
  if (force) { store.delete(key); inflight.delete(key) }
  const hit = store.get(key)
  if (hit) {
    onData(hit.data)
    if (ttl > 0 && Date.now() - hit.ts < ttl) return Promise.resolve(hit.data)
  }
  return run(key, fetcher)
    .then(res => { onData(res); return res })
    .catch(err => { console.error(`[swr] ${key}`, err); return null })
}

// ── API vechi (compatibil) ───────────────────────────────
export function getCached(key, ttl = 5 * 60 * 1000) {
  const hit = store.get(key)
  if (!hit) return null
  if (Date.now() - hit.ts > ttl) { store.delete(key); return null }
  return hit.data
}
export function setCached(key, data) { store.set(key, { data, ts: Date.now() }) }
export function invalidateCache(key) { store.delete(key); inflight.delete(key) }
export function clearCache() { store.clear(); inflight.clear() }

// Apelată automat la orice scriere (insert/update/upsert/delete) într-un tabel.
export function markDirty(table) {
  for (const key of [...store.keys(), ...inflight.keys()]) {
    if (!isStatic(key) || key.includes(`static:${table}:`)) {
      store.delete(key); inflight.delete(key)
    }
  }
}

// ── Lista de alimente: UN singur fetch, partajat de toate paginile ──
const FOODS_KEY = 'static:foods:all'
const FOODS_TTL = 10 * 60 * 1000

export async function getFoods(supabase) {
  const hit = store.get(FOODS_KEY)
  if (hit && Date.now() - hit.ts < FOODS_TTL) return hit.data.data || []
  const res = await run(FOODS_KEY, () => supabase.from('foods').select('*').order('name'))
  return res?.data || []
}
export const invalidateFoods = () => invalidateCache(FOODS_KEY)
