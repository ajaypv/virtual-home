// Keep in sync with HOME_ID in worker/src/logic.ts
const HOME_ID = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/

export const isHomeId = (value: string): boolean => HOME_ID.test(value)

/** The ID in a /h/<id> path, or null when the path is not a home. */
export function homeIdFromPath(pathname: string): string | null {
  const match = /^\/h\/([^/]+)\/?$/.exec(pathname)
  if (!match) return null
  const id = decodeURIComponent(match[1]).toLowerCase()
  return isHomeId(id) ? id : null
}

/** An unguessable ID for a private home: 10 characters from an alphabet without look-alikes. */
export function newHomeId(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(10))
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

export const homePath = (id: string): string => `/h/${id}`
