import { useRef, useState } from 'react'
import { getReportDownload, signoffMedicalResult } from '../api/client'
import type { XCAReportTarget } from '../api/xcaReport'
import { DoctorSignaturePreview } from './DoctorSignaturePreview'

export function XCAReportFinalize({ target, disabled, onBusyChange, onSigned }: { target: XCAReportTarget; disabled: boolean; onBusyChange: (busy: boolean) => void; onSigned: () => void }) {
  const [confirmed, setConfirmed] = useState(false)
  const [signatureShown, setSignatureShown] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [downloadUrl, setDownloadUrl] = useState('')
  const lock = useRef(false)

  async function sign() {
    if (lock.current || disabled || !confirmed || !signatureShown) return
    lock.current = true
    setBusy(true)
    setError('')
    onBusyChange(true)
    try {
      const result = await signoffMedicalResult(target.id)
      if (result.status !== 'SIGNED' || !result.workflow.latestReportId) {
        throw new Error('최종 승인 결과 또는 생성된 PDF를 확인하지 못했습니다.')
      }
      const file = await getReportDownload(result.workflow.latestReportId)
      if (file.downloadIntegrationStatus !== 'CONFIGURED' || !file.downloadUrl) {
        throw new Error(`승인됐지만 PDF 다운로드 주소를 받지 못했습니다. 저장소 연결 상태: ${file.downloadIntegrationStatus}`)
      }
      setDownloadUrl(file.downloadUrl)
      onSigned()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '최종 승인·PDF 생성에 실패했습니다.')
    } finally {
      lock.current = false
      setBusy(false)
      onBusyChange(false)
    }
  }

  return <section className="xca-report-draft">
    <h3>최종 PDF · 의료진 서명</h3>
    <p>새 검토용 초안의 본문·의견·선택 영상을 확인한 뒤, 로그인한 의료진의 등록 서명으로 최종 승인합니다.</p>
    <label><input type="checkbox" checked={confirmed} disabled={busy || disabled || Boolean(downloadUrl)} onChange={event => setConfirmed(event.target.checked)} /> 이 버전의 본문·의견·선택 영상과 AI 연구 제한을 확인했고 최종 승인에 동의합니다.</label>
    {!downloadUrl && <DoctorSignaturePreview resetKey={`${target.baseVersionId}:${confirmed}`} disabled={busy || disabled || !confirmed} onShownChange={setSignatureShown} />}
    {!downloadUrl && <button type="button" className="primary" disabled={busy || disabled || !confirmed || !signatureShown} onClick={() => void sign()}>{busy ? '최종 승인 중…' : '검토 승인 · 최종 서명 · PDF 생성'}</button>}
    {downloadUrl && <p className="xca-report-success">최종 승인과 서명 PDF 생성이 완료되었습니다. <a href={downloadUrl} target="_blank" rel="noopener noreferrer">서명된 PDF 열기·다운로드</a></p>}
    {busy && <p role="status">최종 승인·PDF 생성 중… 자동 재전송하지 않습니다.</p>}
    {error && <p role="alert" className="api-inline-error">{error}</p>}
  </section>
}
