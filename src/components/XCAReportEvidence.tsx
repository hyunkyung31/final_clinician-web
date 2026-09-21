import { useEffect, useState } from 'react'
import { getSavedXCAFrame } from '../api/client'
import type { XCAArchivedFrame, XCADetailResult } from '../api/xcaDetails'

/** Preview reads saved relational frame IDs, never unsaved slider positions. */
export function XCAReportEvidence({ detail, frameIds }: { detail: XCADetailResult; frameIds: number[] }) {
  const [frames, setFrames] = useState<XCAArchivedFrame[]>([]), [error, setError] = useState(''), [revision, setRevision] = useState(0)
  const key = frameIds.join(',')
  useEffect(() => {
    let alive = true
    setFrames([]); setError('')
    const ids = key.split(',').filter(Boolean).map(Number)
    if (ids.length > 12 || ids.some(id => !Number.isSafeInteger(id) || id < 1)) { setError('보고서 프레임 참조 오류'); return }
    Promise.all(ids.map(id => getSavedXCAFrame(detail, id))).then(values => { if (alive) setFrames(values) })
      .catch(failure => { if (alive) setError(failure instanceof Error ? failure.message : '첨부 영상 재조회 실패') })
    return () => { alive = false }
  }, [detail, key, revision])
  return <div className="xca-report-evidence"><header><strong>보고서에 기록된 보존 영상</strong><button type="button" onClick={() => setRevision(v => v + 1)}>첨부 영상 URL 갱신</button></header>
    {error && <p className="api-inline-error" role="alert">{error}</p>}{frames.map(frame => <EvidenceFrame key={`${frame.id}:${revision}`} frame={frame} />)}
  </div>
}
function EvidenceFrame({ frame }: { frame: XCAArchivedFrame }) {
  const [error, setError] = useState(false)
  return <figure><figcaption>촬영 {frame.number} · frame_index {frame.index} · 보존 프레임 #{frame.id}</figcaption>
    {!error && <div className="report-preview-row">
      <div><small>원본</small><img src={frame.sourceUrl} alt="원본 대표 프레임" onError={() => setError(true)} /></div>
      {frame.previewUrl && <div><small>협착 의심 영역 합성본</small><img src={frame.previewUrl} alt="협착 의심 영역 합성본" onError={() => setError(true)} /></div>}
    </div>}{error && <p role="alert">영상 표시 실패. 첨부 영상 URL 갱신을 눌러주세요.</p>}
    <small>약한 위치 추정 · 확정 진단 아님{!frame.maskUrl && ' · 필터를 통과한 의심 영역 없음'}</small>
  </figure>
}
