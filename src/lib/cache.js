// Simple in-memory cache for data that rarely changes (foods list, etc.)
// Survives navigation between pages, resets on full page reload

const store = {}

export function getCached(key) {
  const entry = store[key]
  if (!entry) return null
  // 5 minute TTL
  if (Date.now() - entry.ts > 5 * 60 * 1000) {
    delete store[key]
    return null
  }
  return entry.data
}

export function setCached(key, data) {
  store[key] = { data, ts: Date.now() }
}

export function invalidateCache(key) {
  delete store[key]
}
