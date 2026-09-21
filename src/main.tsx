import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AnatomyGlbLocalTest } from './components/AnatomyGlbLocalTest'
import './styles.css'
import './consultation.css'

const isAnatomyTest = window.location.pathname.replace(/\/$/, '') === '/anatomy-test'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isAnatomyTest ? <AnatomyGlbLocalTest /> : <App />}
  </StrictMode>,
)
