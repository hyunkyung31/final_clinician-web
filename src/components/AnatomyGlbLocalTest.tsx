import { useState } from 'react'
import { MedicalModelViewer } from './MedicalModelViewer'
import {
  ANATOMY_VIEW_MODES,
  LOCAL_ANATOMY_GLB_URL,
  type AnatomyViewMode,
} from '../api/renderingSelection'
import './rendering-shortcuts.css'

export function AnatomyGlbLocalTest() {
  const [viewMode, setViewMode] = useState<AnatomyViewMode>('VESSEL_CALCIFICATION')
  const [status, setStatus] = useState('대기')
  const [error, setError] = useState('')

  return (
    <main className="anatomy-glb-local-test">
      <header className="anatomy-glb-local-test-header">
        <div>
          <p className="anatomy-glb-local-test-kicker">LOCAL TEST · backend 미연결</p>
          <h1>patient 209 anatomy.glb</h1>
          <p>{error || status}</p>
        </div>
        <nav className="rendering-kind-buttons" aria-label="해부 구조 표시">
          {ANATOMY_VIEW_MODES.map((mode) => (
            <button
              key={mode.value}
              type="button"
              aria-pressed={viewMode === mode.value}
              className={viewMode === mode.value ? 'active' : ''}
              onClick={() => setViewMode(mode.value)}
            >
              {mode.label}
            </button>
          ))}
        </nav>
      </header>
      <section className="anatomy-glb-local-test-stage">
        <MedicalModelViewer
          sourceUrl={LOCAL_ANATOMY_GLB_URL}
          format="GLB"
          viewMode={viewMode}
          dumpScene
          onStatus={setStatus}
          onError={setError}
        />
      </section>
    </main>
  )
}
