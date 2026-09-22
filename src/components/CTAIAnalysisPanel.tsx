import { useEffect, useRef, useState } from 'react'
import { BrainCircuit, X } from 'lucide-react'
import { createCTAIAnalysis, createExaminationMedicalResult, getCTAIAnalysis, loadLatestCTAIAnalysis, CT_AI_READY, CT_AI_VERSION_ID, type CTAIAnalysis } from '../api/client'
import type { ImagingStudySummary } from '../types'

// backend CCTA_DOCKER_TIMEOUT(기본 600초) + DICOM 준비/업로드 여유시간을 감안한 폴링 상한.
// 이전에는 120초로 너무 짧아, 실제 AI 추론(docker run)이 40%(추론 시작 직전 체크포인트) 구간에서
// 몇 분씩 걸리는 동안 polling이 먼저 멈춰 화면이 "40%에 멈춘 것"처럼 보이는 문제가 있었다.
const MAX_POLL_DURATION_MS = 900_000 // 15분
const POLL_INTERVAL_MS = 4000

// backend AIAnalysisJob.progress_percent 실제 마일스톤(ai/tasks.py update_job_progress 호출 지점):
// 0(대기) → 10(DICOM 준비) → 20(NIfTI 변환) → 40(AI 추론 시작 직전) → 75(추론 완료·결과 생성)
// → 85(업로드) → 95(DB 저장) → 100(완료). 40→75 구간은 run_ccta_docker(실제 AI 추론)가 차지하며
// 검사 용량에 따라 수 분이 걸릴 수 있다. subprocess.run이 동기/블로킹이라 컨테이너 내부의
// 세부(배치/슬라이스) 진행률은 현재 backend가 받지 못하므로, 실제로 존재하지 않는 세부 진행률을
// 임의로 만들어내지 않고 이미 발행된 마일스톤 값만 단계명/설명에 매핑한다.
const CCTA_STAGES: Array<{ min: number; label: string; description: string }> = [
  { min: 0, label: '분석 대기 중', description: '분석 작업이 대기열에 등록되었습니다.' },
  { min: 10, label: 'DICOM 준비 중', description: '선택한 CT 원본 영상을 불러오고 있습니다.' },
  { min: 20, label: '영상 변환 중', description: 'CT 영상을 AI 모델 입력 형식으로 변환하고 있습니다.' },
  { min: 40, label: 'AI 모델 추론 중', description: 'CT 영상에서 석회화 영역을 분석하고 있습니다. 검사 용량에 따라 수 분이 소요될 수 있습니다.' },
  { min: 75, label: 'AI 추론 완료 · 결과 생성 중', description: '분할 결과와 3D 시각화 자료를 생성하고 있습니다.' },
  { min: 85, label: '결과 업로드 중', description: '생성된 결과 파일을 저장소에 업로드하고 있습니다.' },
  { min: 95, label: '분석 결과 저장 중', description: '분석 결과를 데이터베이스에 저장하고 있습니다.' },
  { min: 100, label: '분석 완료', description: '분석이 완료되었습니다.' },
]

function ctaStageFor(progress: number) {
  let stage = CCTA_STAGES[0]
  for (const candidate of CCTA_STAGES) {
    if (progress >= candidate.min) stage = candidate
  }
  return stage
}

export function CTAIAnalysisPanel({ patientId, study, seriesId, onClose, onRefresh }: { patientId: number | null; study: ImagingStudySummary; seriesId: number | null; onClose: () => void; onRefresh: () => void }) {
  const [analysis, setAnalysis] = useState<CTAIAnalysis | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [reportId, setReportId] = useState<number | null>(null)
  const active = useRef(true)
  const ready = CT_AI_READY && Number.isSafeInteger(CT_AI_VERSION_ID) && CT_AI_VERSION_ID > 0
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  useEffect(() => {
    if (!patientId || !study.examinationId) return
    let live = true
    setBusy(true); setError('')
    void loadLatestCTAIAnalysis(patientId, study.examinationId)
      .then((latest) => { if (live && latest) setAnalysis(latest) })
      .catch((caught) => { if (live) setError(caught instanceof Error ? caught.message : '기존 CCTA 분석 조회 실패') })
      .finally(() => { if (live) setBusy(false) })
    return () => { live = false }
  }, [patientId, study.examinationId])
  useEffect(() => {
    if (!analysis || !['QUEUED', 'RUNNING'].includes(analysis.analysis.status)) return
    const started = Date.now()
    let live = true, querying = false
    const timer = window.setInterval(async () => {
      if (Date.now() - started > MAX_POLL_DURATION_MS) { window.clearInterval(timer); setNotice('분석 작업이 계속 진행 중입니다. 상태 확인 버튼으로 다시 조회할 수 있습니다.'); return }
      if (querying) return
      querying = true
      try { const next = await getCTAIAnalysis(analysis.analysis.id); if (live) setAnalysis(next) }
      catch (caught) { if (live) { setError(caught instanceof Error ? caught.message : '작업 상태 조회 실패'); window.clearInterval(timer) } }
      finally { querying = false }
    }, POLL_INTERVAL_MS)
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
  async function createReport() {
    const result = analysis?.results?.find((item) => item.status !== 'INVALID')
    if (!study.examinationId || !result || busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      const draft = await createExaminationMedicalResult(study.examinationId, 'CCTA_3D', result.id)
      if (active.current) {
        setReportId(draft.medicalResultId)
        setNotice(`3D CCTA 결과보고서 초안 #${draft.medicalResultId}이 준비되었습니다.`)
      }
    } catch (caught) {
      if (active.current) setError(caught instanceof Error ? caught.message : '3D CCTA 보고서 생성 실패')
    } finally { if (active.current) setBusy(false) }
  }
  const status = analysis?.analysis.status
  return <div className="feature-modal-backdrop"><section className="feature-modal ct-ai-modal" role="dialog" aria-modal="true" aria-label="CT 석회화 AI 분석">
    <header><h2><BrainCircuit size={20} />CT 석회화 AI 분석</h2><button type="button" onClick={onClose} aria-label="닫기" disabled={busy}><X size={20} /></button></header>
    <p>선택한 CT 원본을 분석해 석회화 분할 결과를 생성합니다.</p>
    <div className="ct-ai-source"><strong>{study.description}</strong><span>검사 #{study.examinationId ?? '미연결'} · Series #{seriesId ?? '미선택'}</span></div>
    {!ready && <p className="ct-ai-connection">AI 분석 서버가 아직 연결되지 않았습니다. 서버 연결 후 이 버튼으로 선택한 CT를 바로 분석할 수 있습니다.</p>}
    {ready && !study.examinationId && <p>원본 영상에 검사 정보가 연결되어야 분석할 수 있습니다.</p>}
    {status && !['QUEUED', 'RUNNING'].includes(status) && <p role="status">분석 상태: {({ SUCCEEDED: '분석 완료', FAILED: '분석 실패' } as Record<string, string>)[status] ?? status}</p>}
    {analysis?.jobs.map((job) => {
      if (!['QUEUED', 'RUNNING'].includes(job.status)) return null
      const progress = job.progress_percent == null ? NaN : Number(job.progress_percent)
      const clamped = Number.isFinite(progress) ? Math.min(100, Math.max(0, progress)) : 0
      const stage = ctaStageFor(clamped)
      return (
        <div className="ct-ai-progress" key={`progress-${job.id}`}>
          <div className="ct-ai-progress-label"><strong>{stage.label}</strong><span>{clamped}%</span></div>
          <div aria-valuemax={100} aria-valuemin={0} aria-valuenow={clamped} className="ct-ai-progress-track" role="progressbar">
            <div className="ct-ai-progress-bar is-active" style={{ width: `${clamped}%` }} />
          </div>
          <p className="ct-ai-progress-description">{stage.description}</p>
        </div>
      )
    })}
    {status === 'RUNNING' && <p className="ct-ai-connection">전체 분석은 검사 용량에 따라 수 분(최대 10분 이상)까지 걸릴 수 있습니다. 이 창을 열어둔 채 자동으로 상태를 확인합니다.</p>}
    {analysis?.jobs.map((job) => job.error_message && <p className="api-inline-error" key={job.id}>{job.error_message}</p>)}
    {analysis?.results?.map((result) => <div className="ct-ai-source" key={result.id}><strong>{result.summary_text || 'CT 분석 결과'}</strong><span>{result.result_type} · {result.status}</span></div>)}
    {notice && <p role="status">{notice}</p>}{error && <p className="api-inline-error" role="alert">{error}</p>}
    <footer>{analysis ? <>
      <button type="button" onClick={refresh} disabled={busy}>상태 확인</button>
      {status === 'SUCCEEDED' && analysis.results?.some((item) => item.status !== 'INVALID') && <button className="primary" type="button" onClick={() => void createReport()} disabled={busy || Boolean(reportId)}>{reportId ? `보고서 초안 #${reportId} 생성 완료` : '3D CCTA 결과보고서 생성'}</button>}
      {status === 'SUCCEEDED' && <button type="button" onClick={() => { onRefresh(); onClose() }}>렌더링 결과 확인</button>}
      {status === 'FAILED' && <button type="button" disabled={busy} onClick={() => { setAnalysis(null); setError(''); setNotice('') }}>다시 시도</button>}
    </> : <button type="button" onClick={run} disabled={!ready || !study.examinationId || !seriesId || busy}>{busy ? '분석 요청 중…' : 'AI 분석 시작'}</button>}</footer>
  </section></div>
}
