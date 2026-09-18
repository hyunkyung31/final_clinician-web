import { useCallback, useEffect, useId, useState } from 'react'
import { getSavedXCADetails, getSavedXCAFrames } from '../api/client'
import type { XCAAnalysisResult } from '../api/xcaAnalysis'
import type { XCAArchivedFrame, XCADetailResult } from '../api/xcaDetails'
import { XCAReportDraft } from './XCAReportDraft'

export function XCASavedDetails({ patientId, examinationId, refreshKey, onSummary, onReportBusy, analysisBusy }: {
  patientId: number; examinationId: number; refreshKey: number; onSummary: (result: XCAAnalysisResult) => void; onReportBusy: (busy: boolean) => void; analysisBusy: boolean
}) {
  const [reportBusy, setReportBusy] = useState(false)
  const handleReportBusy = useCallback((value: boolean) => { setReportBusy(value); onReportBusy(value) }, [onReportBusy])
  const [details, setDetails] = useState<XCADetailResult[]>([]), [id, setId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [revision, setRevision] = useState(0)
  useEffect(() => {
    let alive = true
    setLoading(true); setError('')
    getSavedXCADetails(patientId, examinationId).then(values => {
      if (!alive) return
      setDetails(values); setId(values[0]?.id ?? null)
      if (values[0]) onSummary(values[0].summary)
    }).catch(failure => { if (alive) setError(failure instanceof Error ? failure.message : '저장 이력 조회 실패') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [patientId, examinationId, refreshKey, revision, onSummary])
  const detail = details.find(item => item.id === id)
  return <section className="xca-saved">
    <header><h3>VM에 보존된 상세 분석</h3><button type="button" disabled={loading || reportBusy || analysisBusy} onClick={() => setRevision(v => v + 1)}>이력 새로고침</button></header>
    <p>이 조회는 GPU 연결 없이 가능합니다. 최근 저장 이력 최대 20건을 표시합니다.</p>
    {loading && <p role="status">저장 이력 조회 중…</p>}
    {error && <p className="api-inline-error" role="alert">{error}</p>}
    {!loading && !error && !details.length && <p>보존된 상세 결과가 없습니다. 전체 검사 분석을 실행하면 원본·마스크도 함께 저장됩니다.</p>}
    {!!details.length && <label>저장된 분석 선택<select disabled={reportBusy || analysisBusy} value={id ?? ''} onChange={event => {
      const selected = details.find(item => item.id === Number(event.target.value)); if (selected) { setId(selected.id); onSummary(selected.summary) }
    }}>{details.map(item => <option key={item.id} value={item.id}>상세 #{item.id} · 분석 #{item.summary.analysisId} · {item.createdAt ? new Date(item.createdAt).toLocaleString('ko-KR') : '저장 시각 미상'}</option>)}</select></label>}
    {detail && !loading && <SavedFrames key={detail.id} detail={detail} onReportBusy={handleReportBusy} analysisBusy={analysisBusy} />}
  </section>
}

function SavedFrames({ detail, onReportBusy, analysisBusy }: { detail: XCADetailResult; onReportBusy: (busy: boolean) => void; analysisBusy: boolean }) {
  const [selected, setSelected] = useState<XCAArchivedFrame[]>([]), [reportBusy, setReportBusy] = useState(false)
  const handleBusy = useCallback((value: boolean) => { setReportBusy(value); onReportBusy(value) }, [onReportBusy])
  const [sequenceId, setSequenceId] = useState(detail.series[0]?.sequenceId)
  const [frames, setFrames] = useState<XCAArchivedFrame[]>([]), [index, setIndex] = useState(0)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [imageError, setImageError] = useState(false)
  const [overlay, setOverlay] = useState(true), [revision, setRevision] = useState(0)
  const maskId = 'xca-mask-' + useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const series = detail.series.find(item => item.sequenceId === sequenceId)
  useEffect(() => {
    if (!series) return
    let alive = true
    setBusy(true); setFrames([]); setError(''); setImageError(false)
    getSavedXCAFrames(detail, series.sequenceId).then(values => {
      if (alive) { setFrames(values); setIndex(series.representative ?? 0) }
    }).catch(failure => { if (alive) setError(failure instanceof Error ? failure.message : '보존 영상 조회 실패') })
      .finally(() => { if (alive) setBusy(false) })
    return () => { alive = false }
  }, [detail, series, revision])
  const frame = frames[index]
  useEffect(() => { setImageError(false) }, [frame?.id, revision])
  return <div>
    <h3>시리즈별 참고 점수 · 검증 전</h3>
    <div className="xca-series-list">{detail.series.map(item => <button key={item.sequenceId} type="button" aria-pressed={sequenceId === item.sequenceId} onClick={() => setSequenceId(item.sequenceId)}>
      <strong>{item.side === 'LEFT' ? '좌관상동맥' : '우관상동맥'} · 촬영 {item.number}</strong>
      <span>협착 AI score {item.any.aiScore.toFixed(3)} · 유의한 협착 AI score {item.significant.aiScore.toFixed(3)}</span>
      <small>{item.frameCount}프레임 · 의심 영역 표시 {item.suspected.length}프레임</small>
    </button>)}</div>
    {series && <><h3>촬영 {series.number} · {series.side} · 보존 프레임</h3>
      <p>의심 영역은 약한 위치 추정입니다. 확정 병변·협착률이 아니며 의료진 검토가 필요합니다.</p>
      <div className="xca-frame-tools"><label><input type="checkbox" checked={overlay} onChange={event => setOverlay(event.target.checked)} />의심 영역 표시</label><button type="button" disabled={busy} onClick={() => setRevision(v => v + 1)}>영상 URL 갱신</button></div>
      {busy && <p role="status">보존 프레임 조회 중…</p>}{error && <p role="alert" className="api-inline-error">{error}</p>}
      {frame && <>
        <div className="xca-archived-image">{!imageError && <svg viewBox={`0 0 ${frame.width} ${frame.height}`} role="img" aria-label={`촬영 ${frame.number}, frame_index ${frame.index}, ${overlay && frame.maskUrl ? '의심 영역 표시' : '원본'}`}>
          <image href={frame.sourceUrl} width={frame.width} height={frame.height} onError={() => setImageError(true)} />
          {overlay && frame.maskUrl && <><defs><mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width={frame.width} height={frame.height} style={{ maskType: 'luminance' }}><image href={frame.maskUrl} width={frame.width} height={frame.height} onError={() => setImageError(true)} /></mask></defs><rect width={frame.width} height={frame.height} fill="orangered" opacity=".55" mask={`url(#${maskId})`} /></>}
        </svg>}{imageError && <p role="alert">보존 영상 또는 마스크를 열지 못했습니다. 영상 URL 갱신을 눌러주세요.</p>}</div>
        <div className="xca-frame-tools"><button type="button" disabled={index === 0} onClick={() => setIndex(v => v - 1)}>이전</button><input aria-label="보존 프레임 이동" type="range" min="0" max={frames.length - 1} value={index} onChange={event => setIndex(Number(event.target.value))} /><span>{index + 1}/{frames.length} · frame_index {frame.index}</span><button type="button" disabled={index === frames.length - 1} onClick={() => setIndex(v => v + 1)}>다음</button></div>
        <p>{frame.maskUrl ? '필터를 통과한 의심 영역이 표시된 프레임입니다.' : '필터를 통과한 의심 영역 없음 — 정상 판정을 의미하지 않습니다.'} · 보존 프레임 #{frame.id}</p>
        <button type="button" disabled={reportBusy || !selected.some(item => item.id === frame.id) && selected.length >= 12} aria-pressed={selected.some(item => item.id === frame.id)} onClick={() => setSelected(items => items.some(item => item.id === frame.id) ? items.filter(item => item.id !== frame.id) : [...items, frame])}>{selected.some(item => item.id === frame.id) ? '보고서 선택 해제' : '현재 프레임을 보고서에 선택'}</button>
      </>}
      <div className="xca-suspected-links"><strong>의심 프레임 바로가기 (frame_index)</strong>{!series.suspected.length && <span>표시 후보 없음</span>}{series.suspected.map(candidate => <button type="button" key={candidate} disabled={!frames.length} aria-pressed={index === candidate} onClick={() => setIndex(candidate)}>{candidate}{series.representative === candidate && ' · 대표'}</button>)}</div>
    </>}
    {!!selected.length && <div className="xca-report-selected"><strong>보고서 선택 프레임</strong>{selected.map(item => <button type="button" key={item.id} disabled={reportBusy} onClick={() => setSelected(items => items.filter(frame => frame.id !== item.id))}>촬영 {item.number} · frame_index {item.index} · 선택 해제</button>)}</div>}
    <XCAReportDraft detail={detail} selected={selected} onBusyChange={handleBusy} disabled={analysisBusy} />
  </div>
}
