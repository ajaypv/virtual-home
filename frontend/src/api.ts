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

const home = (id: string) => `/homes/${encodeURIComponent(id)}`

export const api = {
  house: {
    get: (id: string, signal?: AbortSignal) => request<HouseState>(home(id), undefined, signal),
    lights: (id: string, room: HouseRoom | 'all', change: { on?: boolean; brightness?: number }) =>
      request<HouseState>(`${home(id)}/lights`, { room, ...change }),
    door: (id: string, door: HouseDoor, open: boolean) => request<HouseState>(`${home(id)}/door`, { door, open }),
    tv: (id: string, on: boolean, video_url?: string) => request<HouseState>(`${home(id)}/tv`, { on, ...(video_url ? { video_url } : {}) }),
    command: (id: string, text: string) => request<{ reply: string; house: HouseState }>(`${home(id)}/command`, { text }),
  },
}

export function socketUrl(id: string): string {
  return `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api${home(id)}/ws`
}
