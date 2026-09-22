import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import './consultation.css'

const AnatomyGlbLocalTest = lazy(() =>
  import('./components/AnatomyGlbLocalTest').then((module) => ({
    default: module.AnatomyGlbLocalTest,
  })),
)

const isAnatomyTest = window.location.pathname.replace(/\/$/, '') === '/anatomy-test'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isAnatomyTest ? (
      <Suspense fallback={null}>
        <AnatomyGlbLocalTest />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
)
