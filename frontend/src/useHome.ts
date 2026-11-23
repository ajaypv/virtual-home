import { useCallback, useEffect, useState } from 'react'
import { socketUrl } from './api'
import type { HouseState } from './house/types'

const PING_MS = 25_000
const SILENCE_MS = 70_000

/** A home kept live over a WebSocket: the server sends the full house on connect and again after every change. */
export function useHome(homeId: string) {
  const [house, setHouse] = useState<HouseState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  // A REST answer and a pushed update can cross; never go back to an older revision.
  const merge = useCallback((next: HouseState) => setHouse((prev) => (prev && prev.revision > next.revision ? prev : next)), [])

  useEffect(() => {
    let disposed = false
    let socket: WebSocket | null = null
    let retry = 0
    let ping = 0
    let silence = 0
    let failures = 0

    function connect() {
      const current = new WebSocket(socketUrl(homeId))
      socket = current
      let first = true
      const watch = () => {
        window.clearTimeout(silence)
        silence = window.setTimeout(() => current.close(), SILENCE_MS)
      }
      current.onopen = () => {
        watch()
        ping = window.setInterval(() => current.readyState === WebSocket.OPEN && current.send('ping'), PING_MS)
      }
      current.onmessage = (event) => {
        watch()
        if (event.data === 'pong') return
        try {
          const next = JSON.parse(String(event.data)) as HouseState
          failures = 0
          setError(null)
          if (first) setHouse(next) // the first message is the current truth, even after a server-side reset
          else merge(next)
          first = false
        } catch {
          // ignore a malformed frame
        }
      }
      current.onclose = () => {
        window.clearInterval(ping)
        window.clearTimeout(silence)
        if (disposed) return
        failures += 1
        setError('Live connection lost. Reconnecting...')
        retry = window.setTimeout(connect, Math.min(1000 * 2 ** failures, 10_000))
      }
    }

    connect()
    return () => {
      disposed = true
      window.clearTimeout(retry)
      window.clearInterval(ping)
      window.clearTimeout(silence)
      socket?.close()
    }
  }, [homeId, attempt, merge])

  const reconnect = useCallback(() => setAttempt((n) => n + 1), [])
  return { house, error, merge, reconnect }
}
