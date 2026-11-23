import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HousePage } from './house/HousePage'
import { homeIdFromPath } from './homeId'
import { Landing } from './Landing'
import './index.css'

const homeId = homeIdFromPath(location.pathname)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {homeId ? <HousePage homeId={homeId} /> : <Landing invalid={location.pathname.startsWith('/h/')} />}
  </StrictMode>,
)
