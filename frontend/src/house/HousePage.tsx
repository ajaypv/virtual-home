import { useState } from 'react'
import { DoorOpen, House, Lightbulb } from 'lucide-react'
import { api } from '@/api'
import { useHome } from '@/useHome'
import { ConnectAgent } from './ConnectAgent'
import { HouseScene } from './HouseScene'
import { HouseTv } from './HouseTv'
import { HOUSE_DOORS, HOUSE_ROOMS, type HouseRoom, type HouseView, type HouseState } from './types'
import './house.css'

export function HousePage({ homeId }: { homeId: string }) {
  const { house, error, merge, reconnect } = useHome(homeId)
  const [focus, setFocus] = useState<HouseView>('all')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  async function apply(run: () => Promise<HouseState>) {
    setBusy(true)
    setActionError(null)
    try {
      merge(await run())
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not change the house.')
    } finally {
      setBusy(false)
    }
  }
  const lit = house ? HOUSE_ROOMS.filter((key) => house.lights[key].on).length : 0
  const lightTarget: HouseRoom | 'all' = focus === 'all' || focus === 'tv' ? 'all' : focus
  const targetOn = house ? (lightTarget === 'all' ? lit > 0 : house.lights[lightTarget].on) : false
  const targetLabel = house && lightTarget !== 'all' ? house.lights[lightTarget].name.toLowerCase() : 'all'
  return (
    <main className="house-page">
      <HouseScene house={house} focus={focus} onReset={() => setFocus('all')} />
      <header className="house-header">
        <a className="house-brand" href="/" aria-label="Virtual home, choose another home"><House size={21} aria-hidden="true" /><span>VIRTUAL HOME<span className="house-eyebrow">home · {homeId}</span></span></a>
        <ConnectAgent homeId={homeId} />
      </header>
      <section className="house-intro" aria-label="House connection">
        <div className="house-eyebrow">YOUR VIRTUAL HOUSE</div>
        <h1>Cozy home.</h1>
        <p>Drag to explore.<br />Tap to change it.</p>
        <span className={`house-connection ${house && !error ? 'is-live' : ''}`} role="status">
          <span aria-hidden="true" />{error ? 'Sync unavailable' : house ? 'Live' : 'Connecting...'}
        </span>
      </section>
      {error && <div className="house-sync-error" role="alert">
        <span>{error} {house ? 'Showing the last confirmed state.' : ''}</span>
        <button type="button" onClick={reconnect}>Retry connection</button>
      </div>}
      <footer className="house-footer">
        {house && <HouseTv homeId={homeId} house={house} unavailable={error !== null} onWatch={() => setFocus('tv')} onUpdate={merge} />}
        {house && <nav className="house-rooms" aria-label="Focus a room">
          <button type="button" aria-pressed={focus === 'all'} onClick={() => setFocus('all')}>
            <House size={17} aria-hidden="true" /><span>Whole house<small>{lit} of 4 lights on</small></span>
          </button>
          {HOUSE_ROOMS.map((key) => {
            const light = house.lights[key]
            return <button type="button" key={key} className={light.on ? 'light-on' : ''} aria-pressed={focus === key} onClick={() => setFocus(key)}>
              <Lightbulb size={17} aria-hidden="true" /><span>{light.name}<small>{light.on ? `${light.brightness}% brightness` : 'Light off'}</small></span>
            </button>
          })}
        </nav>}
        <div className="house-bottom">
          <div className="house-current">
            <p className="house-action" role="status">{house?.last_action ?? 'Drag to explore. Scroll or pinch to zoom.'}</p>
            {house && <div className="house-doors" aria-label="Doors">{HOUSE_DOORS.map((key) => (
              <button type="button" key={key} disabled={busy || error !== null} onClick={() => void apply(() => api.house.door(homeId, key, !house.doors[key].open))}>
                <DoorOpen size={13} aria-hidden="true" />{house.doors[key].name}: {house.doors[key].open ? 'open' : 'closed'}
              </button>
            ))}</div>}
            {actionError && <p className="house-action-error" role="alert">{actionError}</p>}
          </div>
          {house && <button type="button" className="house-ask" disabled={busy || error !== null} onClick={() => void apply(() => api.house.lights(homeId, lightTarget, { on: !targetOn }))}>
            {targetOn ? 'Turn off' : 'Turn on'} {targetLabel} {lightTarget === 'all' ? 'lights' : 'light'}<Lightbulb size={17} aria-hidden="true" />
          </button>}
        </div>
        <div className="house-fineprint"><span>Virtual devices only · Drag to orbit · Scroll to zoom</span><a href="https://3dassets.dev/packs/cozy-home-interiors" target="_blank" rel="noopener noreferrer">3D Assets · CC0</a></div>
      </footer>
    </main>
  )
}
