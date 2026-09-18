import { useCallback, useEffect, useRef, useState } from 'react'
import { BrainCircuit, CheckCircle2, LoaderCircle, RefreshCw, X } from 'lucide-react'
import { analyzeXCAExamination, getXCABridgeHealth, type XCAAnalysisResult, type XCABridgeHealth } from '../api/client'
import { xcaContextKey } from '../api/xcaAnalysis'
import type { AngiographySequenceSummary, PatientSummary } from '../types'
import { XCASavedDetails } from './XCASavedDetails'

export function XCAAnalysisPanel({ open, patient, examinationId, sequences, onClose, onBusyChange }: {
  open: boolean; patient: PatientSummary | null; examinationId?: number
  sequences: AngiographySequenceSummary[]; onClose: () => void; onBusyChange: (busy: boolean) => void
}) {
  const [busy, setBusy] = useState(false), [health, setHealth] = useState<XCABridgeHealth | null>(null)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<{ key: string; message: string } | null>(null)
  const [result, setResult] = useState<XCAAnalysisResult | null>(null)
  const [savedRevision, setSavedRevision] = useState(0)
  const [reportBusy, setReportBusy] = useState(false)
  const panelRef = useRef<HTMLElement>(null), inFlight = useRef(false), mounted = useRef(false)
  const key = xcaContextKey(patient?.backendId, examinationId), currentKey = useRef(key)
  currentKey.current = key
  const classified = sequences.filter((item) => item.coronarySide === 'LEFT' || item.coronarySide === 'RIGHT')
  const unknownCount = sequences.length - classified.length
  const frameCount = classified.reduce((count, sequence) => count + sequence.frameCount, 0)
  const visibleResult = result && xcaContextKey(result.patientId, result.examinationId) === key ? result : null
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => { onBusyChange(busy || reportBusy) }, [busy, reportBusy, onBusyChange])
  const checkHealth = useCallback(async () => {
    const captured = currentKey.current
    setChecking(true)
    try {
      const value = await getXCABridgeHealth()
      if (mounted.current && currentKey.current === captured) setHealth(value)
    } catch { if (mounted.current && currentKey.current === captured) setHealth(null) }
    finally { if (mounted.current && currentKey.current === captured) setChecking(false) }
  }, [])
  useEffect(() => { if (open) { setHealth(null); void checkHealth() } }, [open, key, checkHealth])
  useEffect(() => {
    if (!open || !panelRef.current) return
    const previousFocus = document.activeElement as HTMLElement | null, previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'; panelRef.current.focus()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); if (!reportBusy) onClose() }
      if (event.key !== 'Tab') return
      const nodes = [...(panelRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]') ?? [])]
      const first = nodes[0], last = nodes.at(-1)
      if (!first) { event.preventDefault(); return }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panelRef.current)) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', keydown)
    return () => { document.removeEventListener('keydown', keydown); document.body.style.overflow = previousOverflow; previousFocus?.focus() }
  }, [open, onClose, reportBusy])
  async function analyze() {
    if (inFlight.current || !patient?.backendId || !examinationId || !classified.length) return
    const captured = key, patientId = patient.backendId, examId = examinationId
    inFlight.current = true; setBusy(true); setError(null); setResult(null)
    try {
      const value = await analyzeXCAExamination(patientId, examId)
      if (mounted.current && currentKey.current === captured) { setResult(value); setSavedRevision(v => v + 1) }
    } catch (failure) {
      if (mounted.current && currentKey.current === captured) setError({ key: captured, message: failure instanceof Error ? failure.message : 'XCA 분석 요청에 실패했습니다.' })
    } finally {
      inFlight.current = false
      if (mounted.current) { setBusy(false); void checkHealth() }
    }
  }
  if (!open || !patient || !examinationId) return null
  const ready = health?.bridgeReady && health.modelReady && !health.busy
  return <div className="feature-modal-backdrop xca-modal-backdrop">
    <section className="xca-modal" role="dialog" aria-modal="true" aria-label="2D XCA AI 분석" tabIndex={-1} ref={panelRef}>
      <header><div><small>XCA · STENUNET + LOGISTIC REGRESSION</small><h2><BrainCircuit size={22} />2D 영상 AI 분석</h2><p>{patient.name} · 검사 #{examinationId}</p></div>
        <button type="button" disabled={reportBusy} onClick={onClose} aria-label="닫기"><X size={20} /></button></header>
      <div className="xca-scope"><strong>선택한 Angio 검사의 LEFT·RIGHT 전체 시리즈</strong>
        <span>시리즈 {classified.length}개 · 프레임 {frameCount}장 · 미분류 제외 {unknownCount}개</span><small>현재 보고 있는 촬영 영상 하나만 분석하는 것이 아닙니다.</small></div>
      <div className="xca-connection"><span>{checking ? '연결 확인 중…' : !health?.bridgeReady ? '로컬 연결 서버(8003) 확인 필요' : !health.modelReady ? 'GPU 모델(8002) 확인 필요' : health.busy ? '연결 서버에서 분석 실행 중' : '로컬 GPU 모델 연결됨'}</span>
        <button type="button" onClick={() => void checkHealth()} disabled={checking || busy}><RefreshCw size={14} />연결 확인</button></div>
      <p className="xca-disclaimer">GPU PC에서 사용하는 데모 분석입니다. AI score는 협착률·보정된 신뢰도가 아니며 결과는 의료진 검토가 필요합니다.</p>
      {error?.key === key && <p className="api-inline-error" role="alert">{error.message}</p>}
      {busy && <div className="xca-running" role="status"><LoaderCircle className="spin" size={20} /><div><strong>분석 요청 처리 중…</strong><span>영상 다운로드 → GPU 추론 → VM 저장·재조회</span><small>창을 닫거나 환자·검사를 바꿔도 시작된 처리는 계속됩니다. 자동 재시도하지 않습니다.</small></div></div>}
      {visibleResult && <section className="xca-results" aria-live="polite">
        <header><CheckCircle2 size={18} /><strong>분석 완료 · VM 저장 확인</strong><span>검토 필요</span></header>
        <p>시리즈 {visibleResult.seriesCount}개 · 프레임 {visibleResult.frameCount}장 · GPU 추론 {visibleResult.processingSeconds.toFixed(1)}초</p>
        <div className="xca-side-grid">{visibleResult.sides.map((side) => <article key={side.side}>
          <h3>{side.side === 'LEFT' ? '좌관상동맥' : '우관상동맥'} <small>{side.side}</small></h3><p>시리즈 {side.seriesCount}개 · 프레임 {side.frameCount}장</p>
          <dl>{([['협착 분류', side.anyStenosis], ['유의한 협착 분류', side.significantStenosis]] as const).map(([label, score]) => <div key={label}>
            <dt>{label}</dt><dd><strong>{score.aiScore.toFixed(3)}</strong><span>AI score</span><b className={score.prediction === 1 ? 'positive' : ''}>{score.prediction === 1 ? '기준 이상' : '기준 미만'}</b></dd></div>)}</dl>
          <small>분류 기준 0.5 · 확정 진단 아님</small>
        </article>)}</div>
        <p className="xca-identifiers">원본 AngioCAD #{visibleResult.originalPatientId} · fold {visibleResult.fold} · 분석 #{visibleResult.analysisId} · 작업 #{visibleResult.jobId} · 결과 #{visibleResult.resultId}{visibleResult.reused && ' · 기존 동일 결과 재사용'}</p>
        {visibleResult.excludedUnknownCount > 0 && <p>미분류 시리즈 {visibleResult.excludedUnknownCount}개는 제외됐습니다.</p>}
        {visibleResult.warnings.length > 0 && <ul>{visibleResult.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
      </section>}
      <XCASavedDetails key={key} patientId={patient.backendId!} examinationId={examinationId} refreshKey={savedRevision} onSummary={setResult} onReportBusy={setReportBusy} analysisBusy={busy} />
      <footer><span>전체 검사 분석은 원본·의심 영역 마스크도 VM에 보존합니다.</span><button className="primary" type="button" disabled={busy || reportBusy || checking || !ready || !classified.length} onClick={() => void analyze()}>
        {busy ? <LoaderCircle className="spin" size={16} /> : <BrainCircuit size={16} />}{busy ? '분석 처리 중…' : visibleResult ? '새 분석 실행' : '전체 검사 분석 실행'}</button></footer>
    </section>
  </div>
}
