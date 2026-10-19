import { useEffect, useState } from 'react'

export function useNow(intervalMs = 1000, enabled = true) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!enabled) return
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    // iOS freezes timers in the background; resync on return
    const onVis = () => setNow(Date.now())
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [intervalMs, enabled])
  return now
}
