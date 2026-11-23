import { useState } from 'react'
import { House, Plus } from 'lucide-react'
import { homePath, isHomeId, newHomeId } from './homeId'
import './landing.css'

export function Landing({ invalid }: { invalid?: boolean }) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(invalid ? 'That home ID is not valid.' : null)
  const open = (id: string) => location.assign(homePath(id))
  return (
    <main className="landing">
      <div className="landing-card">
        <div className="landing-brand"><House size={20} aria-hidden="true" />VIRTUAL HOME</div>
        <h1>Your own virtual home.</h1>
        <p>A 3D house with lights, doors and a YouTube TV that an AI agent can control. Each home has its own ID, so people testing at the same time never change each other&apos;s house.</p>

        <button type="button" className="landing-primary" onClick={() => open(newHomeId())}>
          <Plus size={17} aria-hidden="true" />Create a private home
        </button>
        <p className="landing-note">Gets a random ID that is hard to guess. Bookmark the page to come back to it.</p>

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
