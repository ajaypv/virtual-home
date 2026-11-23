import { useState } from 'react'
import { House, Plus } from 'lucide-react'
import { api } from './api'
import { homePath, isHomeId, newHomeId } from './homeId'
import { getPrivateHome, setPrivateHome } from './privateHome'
import './landing.css'

export function Landing({ invalid }: { invalid?: boolean }) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(invalid ? 'That home ID is not valid.' : null)
  const [busy, setBusy] = useState(false)
  const mine = getPrivateHome()
  const open = (id: string) => location.assign(homePath(id))
  async function createNew() {
    setBusy(true)
    // Starting over deletes the previous private home so unused homes do not pile up.
    if (mine) await api.house.remove(mine)
    const id = newHomeId()
    setPrivateHome(id)
    open(id)
  }
  return (
    <main className="landing">
      <div className="landing-card">
        <div className="landing-brand"><House size={20} aria-hidden="true" />VIRTUAL HOME</div>
        <h1>Your own virtual home.</h1>
        <p>A 3D house with lights, doors and a YouTube TV that an AI agent can control. Each home has its own ID, so people testing at the same time never change each other&apos;s house.</p>

        {mine ? (
          <>
            <button type="button" className="landing-primary" onClick={() => open(mine)} disabled={busy}>
              <House size={17} aria-hidden="true" />Open my private home
            </button>
            <p className="landing-note">Your home <code>{mine}</code> is saved in this browser, so refreshing or coming back finds it again.</p>
            <button type="button" className="landing-secondary" onClick={() => void createNew()} disabled={busy}>
              <Plus size={15} aria-hidden="true" />Start over with a new home
            </button>
            <p className="landing-note">This deletes your current home and everything in it.</p>
          </>
        ) : (
          <>
            <button type="button" className="landing-primary" onClick={() => void createNew()} disabled={busy}>
              <Plus size={17} aria-hidden="true" />Create a private home
            </button>
            <p className="landing-note">Gets a random ID that is hard to guess, and is remembered in this browser.</p>
          </>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault()
            const id = name.trim().toLowerCase()
            if (!isHomeId(id)) {
              setError('Use 3-32 lowercase letters, digits or hyphens, starting and ending with a letter or digit.')
              return
            }
            open(id)
          }}
        >
          <label htmlFor="home-id">Or open a home by ID</label>
          <div>
            <input id="home-id" value={name} maxLength={32} autoComplete="off" spellCheck={false} placeholder="my-home" onChange={(e) => { setName(e.target.value); setError(null) }} />
            <button type="submit" disabled={!name.trim()}>Open</button>
          </div>
          {error && <p className="landing-error" role="alert">{error}</p>}
        </form>
        <p className="landing-note">Anyone who knows a home&apos;s ID can watch and control it. A simple name like &quot;demo&quot; is shared with everyone who types it, so use the private option for your own tests.</p>
      </div>
    </main>
  )
}
