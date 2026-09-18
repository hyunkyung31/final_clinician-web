import { useEffect, useRef, useState } from 'react'
import { BrainCircuit, X } from 'lucide-react'
import { createCTAIAnalysis, getCTAIAnalysis, CT_AI_READY, CT_AI_VERSION_ID, type CTAIAnalysis } from '../api/client'
import type { ImagingStudySummary } from '../types'

export function CTAIAnalysisPanel({ study, seriesId, onClose, onRefresh }: { study: ImagingStudySummary; seriesId: number | null; onClose: () => void; onRefresh: () => void }) {
  const [analysis, setAnalysis] = useState<CTAIAnalysis | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const active = useRef(true)
  const ready = CT_AI_READY && Number.isSafeInteger(CT_AI_VERSION_ID) && CT_AI_VERSION_ID > 0
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  useEffect(() => {
    if (!analysis || !['QUEUED', 'RUNNING'].includes(analysis.analysis.status)) return
    const started = Date.now()
    let live = true, querying = false
    const timer = window.setInterval(async () => {
      if (Date.now() - started > 120000) { window.clearInterval(timer); setNotice('분석 작업이 계속 대기 중입니다. 상태 확인 버튼으로 다시 조회할 수 있습니다.'); return }
      if (querying) return
      querying = true
      try { const next = await getCTAIAnalysis(analysis.analysis.id); if (live) setAnalysis(next) }
      catch (caught) { if (live) { setError(caught instanceof Error ? caught.message : '작업 상태 조회 실패'); window.clearInterval(timer) } }
      finally { querying = false }
    }, 4000)
    return () => { live = false; window.clearInterval(timer) }
  }, [analysis?.analysis.id, analysis?.analysis.status])
  async function run() {
    if (!study.examinationId || !seriesId || busy) return
    setBusy(true); setError(''); setNotice('')
    try { const next = await createCTAIAnalysis(study.examinationId, study.id, seriesId); if (active.current) setAnalysis(next) }
    catch (caught) { if (active.current) setError(caught instanceof Error ? caught.message : '분석 요청 실패') }
    finally { if (active.current) setBusy(false) }
  }
  async function refresh() {
    if (!analysis || busy) return
    setBusy(true)
    try { const next = await getCTAIAnalysis(analysis.analysis.id); if (active.current) { setAnalysis(next); setError('') } }
    catch (caught) { if (active.current) setError(caught instanceof Error ? caught.message : '상태 조회 실패') }
    finally { if (active.current) setBusy(false) }
  }
  const status = analysis?.analysis.status
  return <div className="feature-modal-backdrop"><section className="feature-modal ct-ai-modal" role="dialog" aria-modal="true" aria-label="CT 석회화 AI 분석">
    <header><h2><BrainCircuit size={20} />CT 석회화 AI 분석</h2><button type="button" onClick={onClose} aria-label="닫기" disabled={busy}><X size={20} /></button></header>
    <p>선택한 CT 원본을 분석해 석회화 분할 결과를 생성합니다.</p>
    <div className="ct-ai-source"><strong>{study.description}</strong><span>검사 #{study.examinationId ?? '미연결'} · Series #{seriesId ?? '미선택'}</span></div>
    {!ready && <p className="ct-ai-connection">AI 분석 서버가 아직 연결되지 않았습니다. 서버 연결 후 이 버튼으로 선택한 CT를 바로 분석할 수 있습니다.</p>}
    {ready && !study.examinationId && <p>원본 영상에 검사 정보가 연결되어야 분석할 수 있습니다.</p>}
    {status && <p role="status">분석 상태: {({ QUEUED: '대기 중', RUNNING: '분석 중', SUCCEEDED: '분석 완료', FAILED: '분석 실패' } as Record<string, string>)[status] ?? status}</p>}
    {analysis?.jobs.map((job) => {
      const progress = job.progress_percent == null ? NaN : Number(job.progress_percent)
      return job.status === 'RUNNING' && Number.isFinite(progress) ? <p key={`progress-${job.id}`} role="status">작업 진행률: {Math.min(100, Math.max(0, progress))}%</p> : null
    })}
    {analysis?.jobs.map((job) => job.error_message && <p className="api-inline-error" key={job.id}>{job.error_message}</p>)}
    {analysis?.results?.map((result) => <div className="ct-ai-source" key={result.id}><strong>{result.summary_text || 'CT 분석 결과'}</strong><span>{result.result_type} · {result.status}</span></div>)}
    {notice && <p role="status">{notice}</p>}{error && <p className="api-inline-error" role="alert">{error}</p>}
    <footer>{analysis ? <><button type="button" onClick={refresh} disabled={busy}>상태 확인</button>{status === 'SUCCEEDED' && <button type="button" onClick={() => { onRefresh(); onClose() }}>렌더링 결과 확인</button>}</> : <button type="button" onClick={run} disabled={!ready || !study.examinationId || !seriesId || busy}>{busy ? '분석 요청 중…' : 'AI 분석 시작'}</button>}</footer>
  </section></div>
}
