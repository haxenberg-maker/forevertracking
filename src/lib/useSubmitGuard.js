import { useRef, useState, useCallback } from 'react'

/**
 * Prevents a mutation from firing twice from a rapid double-click / double-tap.
 * Returns [pending, guard] — wrap your async save/delete function with `guard`,
 * and use `pending` to disable the button and show a loading label.
 *
 * Usage:
 *   const [saving, guard] = useSubmitGuard()
 *   <button disabled={saving} onClick={() => guard(saveRun)}>
 *     {saving ? 'Se salvează...' : 'Salvează'}
 *   </button>
 */
export function useSubmitGuard() {
  const [pending, setPending] = useState(false)
  const runningRef = useRef(false) // ref avoids the setState-is-async race on fast double clicks

  const guard = useCallback(async (fn) => {
    if (runningRef.current) return
    runningRef.current = true
    setPending(true)
    try {
      await fn()
    } finally {
      runningRef.current = false
      setPending(false)
    }
  }, [])

  return [pending, guard]
}
