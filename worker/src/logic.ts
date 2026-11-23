/** Rules for one virtual house. Pure functions: no Cloudflare APIs, so they run under plain Node in tests.
 *  Simulated devices only; nothing physical is ever controlled. */

export const ROOMS = { living: 'Living room', kitchen: 'Kitchen', bedroom: 'Bedroom', reading: 'Reading nook' } as const
export const DOORS = { front: 'Front door', bedroom: 'Bedroom door' } as const
export type Room = keyof typeof ROOMS
export type Door = keyof typeof DOORS

export const DEFAULT_VIDEO_ID = 'M7lc1UVf-VE'

export interface House {
  id: string
  name: string
  revision: number
  lights: Record<Room, { name: string; on: boolean; brightness: number }>
  doors: Record<Door, { name: string; open: boolean }>
  tv: { on: boolean; video_id: string }
  last_action: string
}

/** A request the house cannot honour. The message is safe to show to the user or the agent. */
export class HomeError extends Error {}

// Keep in sync with HOME_ID in frontend/src/homeId.ts
const HOME_ID = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/

export function isHomeId(value: unknown): value is string {
  return typeof value === 'string' && HOME_ID.test(value)
}

const ALIASES: Record<string, Room | 'all'> = {
  living: 'living', 'living room': 'living', lounge: 'living',
  kitchen: 'kitchen', dining: 'kitchen', 'dining room': 'kitchen',
  bedroom: 'bedroom', upstairs: 'bedroom', reading: 'reading', 'reading nook': 'reading',
  all: 'all', house: 'all', 'whole house': 'all',
}

const entries = <T extends object>(o: T) => Object.entries(o) as [keyof T & string, T[keyof T]][]

export function initialHouse(id: string): House {
  return {
    id, name: 'Cozy home', revision: 0,
    lights: Object.fromEntries(entries(ROOMS).map(([k, name]) => [k, { name, on: true, brightness: 80 }])) as House['lights'],
    doors: Object.fromEntries(entries(DOORS).map(([k, name]) => [k, { name, open: false }])) as House['doors'],
    tv: { on: false, video_id: DEFAULT_VIDEO_ID },
    last_action: 'Welcome home. Change a light, a door or the TV.',
  }
}

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/

export function youtubeVideoId(value: unknown): string {
  if (typeof value !== 'string') throw new HomeError('Use a YouTube video link or an 11-character video ID.')
  const text = value.trim()
  if (VIDEO_ID.test(text)) return text
  try {
    const url = new URL(text)
    const plain = url.protocol === 'https:' && !url.username && !url.password && (url.port === '' || url.port === '443')
    let id = ''
    if (plain && (url.hostname === 'youtu.be' || url.hostname === 'www.youtu.be')) {
      id = url.pathname.replace(/^\//, '')
    } else if (plain && ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'www.youtube-nocookie.com'].includes(url.hostname)) {
      if (url.pathname === '/watch') id = url.searchParams.get('v') ?? ''
      else if (/^\/(?:embed|shorts)\/[A-Za-z0-9_-]{11}$/.test(url.pathname)) id = url.pathname.split('/')[2]
    }
    if (VIDEO_ID.test(id)) return id
  } catch {
    // not a URL: fall through to the error
  }
  throw new HomeError('Use a valid HTTPS YouTube video link, not a playlist or another website.')
}

function next(house: House, message: string, change: (draft: House) => void): House {
  const draft = structuredClone(house)
  change(draft)
  draft.last_action = message
  draft.revision += 1
  return draft
}

export function setLights(house: House, room: unknown, on?: unknown, brightness?: unknown): House {
  const target = typeof room === 'string' ? ALIASES[room.trim().toLowerCase()] : undefined
  if (!target) throw new HomeError('Unknown room. Choose living room, kitchen, bedroom, reading nook or all.')
  if (on !== undefined && on !== null && typeof on !== 'boolean') throw new HomeError('on must be true or false.')
  const level = brightness ?? undefined
  if (level !== undefined && (typeof level !== 'number' || !Number.isInteger(level) || level < 0 || level > 100)) {
    throw new HomeError('Brightness must be a whole number from 0 to 100.')
  }
  const power = on ?? undefined
  if (power === undefined && level === undefined) throw new HomeError('Specify on, off or a brightness.')
  if (power === true && level === 0) throw new HomeError('Zero brightness means off. Choose a positive brightness to turn a light on.')
  const label = target === 'all' ? 'All lights' : `${ROOMS[target]} lights`
  const value = level !== undefined && power !== false ? `set to ${level}%` : power ? 'on' : 'off'
  return next(house, `${label} ${value}.`, (draft) => {
    for (const key of target === 'all' ? (Object.keys(ROOMS) as Room[]) : [target]) {
      const light = draft.lights[key]
      if (level !== undefined) {
        light.brightness = level
        light.on = level > 0
      }
      if (power !== undefined) {
        light.on = power as boolean
        if (power && light.brightness === 0) light.brightness = 80
      }
    }
  })
}

export function setDoor(house: House, door: unknown, open: unknown): House {
  if (typeof door !== 'string' || !(door in DOORS)) throw new HomeError('Choose the front door or bedroom door.')
  if (typeof open !== 'boolean') throw new HomeError('open must be true or false.')
  return next(house, `${DOORS[door as Door]} ${open ? 'opened' : 'closed'}.`, (draft) => {
    draft.doors[door as Door].open = open
  })
}

/** One line describing the whole house, for an agent that has just changed something. */
export function describe(house: House): string {
  const lights = Object.values(house.lights).map((l) => `${l.name} ${l.on ? `${l.brightness}%` : 'off'}`).join(', ')
  const doors = Object.values(house.doors).map((d) => `${d.name} ${d.open ? 'open' : 'closed'}`).join(', ')
  return `Lights: ${lights}. Doors: ${doors}. TV: ${house.tv.on ? `on (YouTube ${house.tv.video_id})` : 'off'}.`
}

export function setTv(house: House, on: unknown, videoUrl?: unknown): House {
  if (typeof on !== 'boolean') throw new HomeError('on must be true or false.')
  const videoId = videoUrl === undefined || videoUrl === null ? undefined : youtubeVideoId(videoUrl)
  return next(house, on ? 'TV turned on. YouTube may need a tap to play.' : 'TV turned off.', (draft) => {
    if (videoId) draft.tv.video_id = videoId
    draft.tv.on = on
  })
}

const TV = String.raw`(?:the |my |our )?(?:living room )?(?:tv|television)`
const LIGHT = String.raw`(?:(?:the|all|all the|my|our)\s+)?(?<room>[a-z ]*?)(?:\s+)?(?:lights?|lamps?)`

/** A plain-English request such as "turn off the kitchen lights". No AI model: matched by rules. */
export function runCommand(house: House, input: unknown): { house: House; reply: string } {
  if (typeof input !== 'string' || !input.trim()) throw new HomeError('Say what to change, for example: turn off the kitchen lights.')
  const text = input.trim()
  const low = text.toLowerCase().replace(/\b(please|can you|could you|would you)\b/g, '').trim().replace(/^[ .?!,]+|[ .?!,]+$/g, '').replace(/\s+/g, ' ')
  const done = (h: House) => ({ house: h, reply: h.last_action })
  let m = new RegExp(String.raw`^(?:(?:turn|switch|power)\s+)?(?<power>on|off)\s+${TV}$`).exec(low)
    ?? new RegExp(String.raw`^(?:(?:turn|switch|power)\s+)?${TV}\s+(?<power>on|off)$`).exec(low)
  if (m) return done(setTv(house, m.groups!.power === 'on'))
  // The original text keeps the case-sensitive video ID.
  m = new RegExp(String.raw`^(?:please\s+)?play\s+(?<url>https://\S+)\s+on\s+${TV}[.!?]?$`, 'i').exec(text)
  if (m) return done(setTv(house, true, m.groups!.url))
  m = new RegExp(String.raw`^(?:(?:turn|switch)\s+)?(?<power>on|off)\s+${LIGHT}$`).exec(low)
    ?? new RegExp(String.raw`^(?:(?:turn|switch)\s+)?${LIGHT}\s+(?<power>on|off)$`).exec(low)
    ?? /^(?:(?:turn|switch)\s+)?(?<power>on|off)\s+(?:the\s+)?(?:lights?|lamps?)\s+in\s+(?:the\s+)?(?<room>[a-z ]+)$/.exec(low)
  if (m) return done(setLights(house, m.groups!.room.trim() || 'all', m.groups!.power === 'on'))
  m = new RegExp(String.raw`^(?:dim|set)\s+${LIGHT}\s+to\s+(?<level>\d+)\s*(?:%|percent)$`).exec(low)
  if (m) return done(setLights(house, m.groups!.room.trim() || 'all', undefined, Number(m.groups!.level)))
  m = /^(?<action>open|close|shut)\s+(?:the\s+)?(?<door>front|bedroom)\s+door$/.exec(low)
  if (m) return done(setDoor(house, m.groups!.door, m.groups!.action === 'open'))
  throw new HomeError('I could not match that. Try: turn off the kitchen lights, set bedroom lights to 30 percent, open the front door, turn on the TV.')
}
