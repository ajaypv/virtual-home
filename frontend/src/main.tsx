import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HousePage } from './house/HousePage'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HousePage />
  </StrictMode>,
)
