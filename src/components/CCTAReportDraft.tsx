import { useEffect, useRef, useState } from 'react'
import { BrainCircuit } from 'lucide-react'
import {
  ApiError,
  createExaminationMedicalResult,
  getMedicalResultDetail,
  getPatientReports,
  getFileContentObjectUrl,
  getReportDownload,
  saveMedicalResultConclusion,
  signoffMedicalResult,
} from '../api/client'
import type { MedicalResultDetail } from '../types'
import { DoctorSignaturePreview } from './DoctorSignaturePreview'

// React StrictMode re-mounts an effect in development.  Report creation is a
// write operation, so concurrent mounts for the same examination must share
// one request instead of each POSTing a new draft.
const cctaReportPreparation = new Map<string, Promise<MedicalResultDetail>>()

function CCTAReportImage({ fileId, label }: { fileId: number | null; label: string }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!fileId) { setUrl(''); setError(''); return }
    let active = true
    let objectUrl = ''
    setUrl(''); setError('')
    void getFileContentObjectUrl(fileId)
      .then((next) => {
        if (!active) { URL.revokeObjectURL(next); return }
        objectUrl = next
        setUrl(next)
      })
      .catch(() => { if (active) setError(`${label} 이미지를 불러오지 못했습니다.`) })
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [fileId, label])

  return <figure className="ccta-report-image">
    <figcaption>{label}</figcaption>
    {!fileId && <p>저장된 이미지가 없습니다.</p>}
    {fileId && !url && !error && <p>이미지 불러오는 중…</p>}
    {url && <img src={url} alt={label} onError={() => setError(`${label} 이미지를 표시하지 못했습니다.`)} />}
    {error && <p className="api-inline-error" role="alert">{error}</p>}
  </figure>
}

export function CCTAReportDraft({ patientId, examinationId, analysisResultId, analysisId, disabled, onBusyChange, onReportChange, onNewAnalysis }: {
  patientId: number
  examinationId: number
  analysisResultId: number
  analysisId?: number
  disabled: boolean
  onBusyChange: (busy: boolean) => void
  onReportChange?: () => void
  onNewAnalysis?: () => void
}) {
  const [detail, setDetail] = useState<MedicalResultDetail | null>(null)
  const [conclusion, setConclusion] = useState('')
  const [saved, setSaved] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [signatureShown, setSignatureShown] = useState(false)
  const [downloadUrl, setDownloadUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)
  const preparedResultId = useRef<number | null>(null)

  useEffect(() => () => onBusyChange(false), [onBusyChange])

  async function act(action: () => Promise<void>) {
    if (lock.current || disabled) return
    lock.current = true
    setBusy(true); setError(''); onBusyChange(true)
    try { await action() }
    catch (caught) { setError(caught instanceof Error ? caught.message : '3D CCTA 보고서 처리에 실패했습니다.') }
    finally { lock.current = false; setBusy(false); onBusyChange(false) }
  }

  function applyDetail(next: MedicalResultDetail) {
    if (next.reportType !== 'CCTA_3D' || next.examinationId !== examinationId || next.patient.id !== patientId) {
      throw new Error('생성된 보고서의 환자, 검사 또는 보고서 종류가 다릅니다.')
    }
    setDetail(next)
    setConclusion(next.conclusion)
    onReportChange?.()
  }

  function prepare() {
    void act(async () => {
      const key = `${patientId}:${examinationId}:CCTA_3D`
      const existingTask = cctaReportPreparation.get(key)
      const task = existingTask ?? (async () => {
        const candidateIds = [...new Set([analysisResultId, analysisId].filter((value): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0))]
        let lastFailure: unknown
        for (const candidateId of candidateIds) {
          try {
            return await createExaminationMedicalResult(examinationId, 'CCTA_3D', candidateId, patientId)
          } catch (failure) {
            if (failure instanceof ApiError && failure.status === 409) {
              // A conflicting draft is exceptional.  Do not make the first
              // report wait on this list request before its initial POST.
              const currentReports = await getPatientReports(patientId, 'CCTA_3D')
              const current = currentReports.find((report) => report.examinationId === examinationId)
              if (current?.medicalResultId) return getMedicalResultDetail(current.medicalResultId)
              throw failure
            }
            lastFailure = failure
          }
        }
        throw lastFailure instanceof Error ? lastFailure : new Error('완료된 CCTA AI 분석 결과를 찾을 수 없습니다.')
      })()
      if (!existingTask) {
        cctaReportPreparation.set(key, task)
        void task.finally(() => cctaReportPreparation.delete(key)).catch(() => undefined)
      }
      const next = await task
      applyDetail(next)
      setSaved(Boolean(next.conclusion.trim()))
      setConfirmed(false); setSignatureShown(false); setDownloadUrl('')
    })
  }

  // 분석이 끝나면 별도 "초안 생성" 버튼을 한 번 더 누르지 않아도
  // 분석 요약과 최종 소견 입력 화면을 바로 보여준다. API는 기존 초안도
  // 반환하므로 이미 작성 중인 보고서는 새로 만들지 않는다.
  useEffect(() => {
    if (disabled || preparedResultId.current === analysisResultId) return
    preparedResultId.current = analysisResultId
    prepare()
  }, [analysisId, analysisResultId, disabled])

  function save() {
    if (!detail || !conclusion.trim()) return
    void act(async () => {
      const next = await saveMedicalResultConclusion(detail.medicalResultId, conclusion.trim())
      applyDetail(next)
      setSaved(true)
    })
  }

  function sign() {
    if (!detail || !saved || !confirmed || !signatureShown) return
    void act(async () => {
      const signed = await signoffMedicalResult(detail.medicalResultId, conclusion.trim())
      if (signed.workflow.status !== 'SIGNED' || !signed.workflow.latestReportId) {
        throw new Error('최종 승인 결과 또는 생성된 CCTA PDF를 확인하지 못했습니다.')
      }
      const file = await getReportDownload(signed.workflow.latestReportId)
      if (file.downloadIntegrationStatus !== 'CONFIGURED' || !file.downloadUrl) {
        throw new Error(`승인됐지만 PDF 다운로드 주소를 받지 못했습니다. 저장소 연결 상태: ${file.downloadIntegrationStatus}`)
      }
      applyDetail(signed)
      setDownloadUrl(file.downloadUrl)
    })
  }

  const ccta = detail?.aiSummaries.ccta
  const finalized = detail && ['SIGNED', 'RELEASED'].includes(detail.workflow.status)

  return <section className="xca-report-draft ccta-report-draft">
    <h3>3D CCTA 결과보고서 작성</h3>
    <p>검사 #{examinationId} · AI 결과 #{analysisResultId}를 연결해 초안을 작성하고, 의료진 검토 후 서명 PDF를 생성합니다.</p>

    {!detail && !error && <p role="status">결과지와 의료진 최종 소견 입력 화면을 준비하고 있습니다.</p>}
    {!detail && error && <button className="primary" type="button" disabled={busy || disabled} onClick={prepare}>결과지 생성 다시 시도</button>}

    {detail && <>
      <p>의료 결과 #{detail.medicalResultId} · 현재 {detail.workflow.status}</p>
      {ccta && <div className="ccta-report-summary"><strong>{ccta.summary || 'CCTA 석회화 분석 결과'}</strong><span>{[ccta.modelName, ccta.modelVersion].filter(Boolean).join(' ') || '모델 정보 없음'}</span></div>}
      <div className="ccta-report-images">
        <CCTAReportImage fileId={ccta?.previewFileAssetId ?? null} label="3D 석회화 preview" />
        <CCTAReportImage fileId={ccta?.overlayFileAssetId ?? null} label="원본 CT 석회화 overlay" />
      </div>

      <label>의료진 최종 소견<textarea maxLength={4000} rows={5} disabled={busy || Boolean(finalized)} value={conclusion} onChange={(event) => { setConclusion(event.target.value); setSaved(false); setConfirmed(false) }} placeholder="3D CCTA 분석 결과에 대한 최종 소견을 입력하세요." /></label>
      {!finalized && <button className="primary" type="button" disabled={busy || !conclusion.trim()} onClick={save}>{busy ? '저장 중…' : saved ? '의료진 소견 저장 완료' : '최종 소견을 보고서 초안에 저장'}</button>}

      {!finalized && saved && <div className="ccta-report-finalize">
        <h3>최종 PDF · 의료진 서명</h3>
        <p>새 검토용 초안의 결과 이미지와 의료진 소견을 확인한 뒤, 로그인한 의료진의 등록 서명으로 최종 승인합니다.</p>
        <label className="feature-check"><input type="checkbox" checked={confirmed} disabled={busy || disabled || Boolean(downloadUrl)} onChange={(event) => setConfirmed(event.target.checked)} /> 이 버전의 결과 이미지와 의료진 최종 소견을 확인했고 최종 승인에 동의합니다.</label>
        {!downloadUrl && <DoctorSignaturePreview resetKey={`${detail.medicalResultId}:${saved}:${confirmed}`} disabled={busy || disabled || !confirmed} onShownChange={setSignatureShown} />}
        {!downloadUrl && <button className="primary" type="button" disabled={busy || disabled || !confirmed || !signatureShown} onClick={sign}>{busy ? '최종 승인 중…' : '검토 승인 · 최종 서명 · PDF 생성'}</button>}
      </div>}

      {finalized && <p className="xca-report-success"><strong>최종 승인 완료</strong><br />승인 의료진 {detail.workflow.signedBy || '-'} · {detail.workflow.signedAt ? new Date(detail.workflow.signedAt).toLocaleString('ko-KR') : '-'}</p>}
      {downloadUrl && <p className="xca-report-success">최종 승인과 CCTA PDF 생성이 완료되었습니다. <a href={downloadUrl} target="_blank" rel="noopener noreferrer">서명된 PDF 열기·다운로드</a></p>}
    </>}

    {busy && <p role="status">보고서 처리 중… 자동으로 재전송하지 않습니다.</p>}
    {error && <p className="api-inline-error" role="alert">{error}</p>}
    {onNewAnalysis && <footer className="ccta-report-footer">
      <span>새 분석은 선택한 CT 원본을 사용합니다.</span>
      <button className="primary" type="button" disabled={busy || disabled} onClick={onNewAnalysis}><BrainCircuit size={16} />분석 다시 보기</button>
    </footer>}
  </section>
}
