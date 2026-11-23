import type { HouseDoor, HouseRoom, HouseState } from './house/types'

async function request<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  })
  if (!res.ok) {
    let detail = `Request failed (${res.status}).`
    try {
      const data = await res.json()
      if (typeof data.detail === 'string') detail = data.detail
    } catch {
      // keep the status message
    }
    throw new Error(detail)
  }
  return res.json() as Promise<T>
}

export const api = {
  house: {
    get: (signal?: AbortSignal) => request<HouseState>('/house', undefined, signal),
    lights: (room: HouseRoom | 'all', change: { on?: boolean; brightness?: number }) =>
      request<HouseState>('/house/lights', { room, ...change }),
    door: (door: HouseDoor, open: boolean) => request<HouseState>('/house/door', { door, open }),
    tv: (on: boolean, video_url?: string) => request<HouseState>('/house/tv', { on, ...(video_url ? { video_url } : {}) }),
  },
}
