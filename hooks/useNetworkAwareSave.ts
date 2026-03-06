'use client'
import { useCallback, useRef, useEffect } from 'react'

interface SavePayload {
  item_id: string
  response_data: unknown
}

type SaveFn = (payload: SavePayload) => Promise<boolean>

export function useNetworkAwareSave(saveFn: SaveFn, debounceMs = 1500) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>()
  const offlineQueue = useRef<SavePayload[]>([])
  const isFlushing = useRef(false)

  const flushQueue = useCallback(async () => {
    if (isFlushing.current || offlineQueue.current.length === 0) return
    isFlushing.current = true
    const toFlush = [...offlineQueue.current]
    offlineQueue.current = []
    for (const payload of toFlush) {
      let retries = 0
      while (retries < 3) {
        const ok = await saveFn(payload)
        if (ok) break
        retries++
        await new Promise(r => setTimeout(r, 500 * Math.pow(2, retries)))
      }
    }
    isFlushing.current = false
  }, [saveFn])

  // Flush offline queue when network comes back
  useEffect(() => {
    const handler = () => {
      if (navigator.onLine) flushQueue()
    }
    window.addEventListener('online', handler)
    return () => window.removeEventListener('online', handler)
  }, [flushQueue])

  // Debounced save — queues offline, retries on reconnect
  const save = useCallback((payload: SavePayload) => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      if (!navigator.onLine) {
        const idx = offlineQueue.current.findIndex(q => q.item_id === payload.item_id)
        if (idx >= 0) offlineQueue.current[idx] = payload
        else offlineQueue.current.push(payload)
        return
      }
      const ok = await saveFn(payload)
      if (!ok) {
        offlineQueue.current.push(payload)
      }
    }, debounceMs)
  }, [saveFn, debounceMs])

  // Immediate save (clears pending debounce) — used on manual submit
  const saveImmediate = useCallback(async (payload: SavePayload) => {
    clearTimeout(timerRef.current)
    return saveFn(payload)
  }, [saveFn])

  return { save, saveImmediate, flushQueue }
}
