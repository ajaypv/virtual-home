import { isHomeId } from './homeId'

// The private home this browser created, so refreshing or coming back finds the same one instead of making a new one.
const KEY = 'virtual-home:private'

export function getPrivateHome(): string | null {
  try {
    const id = localStorage.getItem(KEY)
    return id && isHomeId(id) ? id : null
  } catch {
    return null // storage can be blocked; the home simply is not remembered
  }
}

export function setPrivateHome(id: string): void {
  try {
    localStorage.setItem(KEY, id)
  } catch {
    // not remembered
  }
}

export function clearPrivateHome(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // nothing to clear
  }
}
