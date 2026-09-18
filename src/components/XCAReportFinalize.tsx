import { useEffect, useRef, useState } from 'react'
import { getXCAReportPDF, signXCAReport, reauthenticateStaff, reloadXCAReport } from '../api/client'
import type { XCAReportTarget, XCAPDFPreview, XCAFinalReceipt } from '../api/xcaReport'

export function XCAReportFinalize({ target, disabled, onBusyChange, onSigned }: { target: XCAReportTarget; disabled: boolean; onBusyChange: (busy: boolean) => void; onSigned: () => void }) {
  const [preview, setPreview] = useState<XCAPDFPreview | null>(null), [url, setUrl] = useState('')
  const [password, setPassword] = useState(''), [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false)
  const [error, setError] = useState(''), [receipt, setReceipt] = useState<XCAFinalReceipt | null>(null)
  const lock = useRef(false), alive = useRef(false)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => { if (!preview) { setUrl(''); return }; const value = URL.createObjectURL(preview.blob); setUrl(value); return () => URL.revokeObjectURL(value) }, [preview])
  async function act(action: () => Promise<void>) {
    if (lock.current || disabled) return
    lock.current = true; setBusy(true); setError(''); onBusyChange(true)
    try { await action() } catch (failure) { if (alive.current) setError(failure instanceof Error ? failure.message : 'PDF·서명 처리 실패') }
    finally { lock.current = false; if (alive.current) { setBusy(false); setPassword(''); onBusyChange(false) } }
  }
  function load() { void act(async () => { const value = await getXCAReportPDF(target); if (alive.current) { setPreview(value); setConfirmed(false) } }) }
  function sign() {
    if (!preview || !password || !confirmed) return
    const capturedPassword = password, capturedPreview = preview
    void act(async () => {
      const latest = await reloadXCAReport(target)
      if (latest.baseVersionId !== target.baseVersionId) throw new Error('최신 보고서 버전이 변경됐습니다. 보고서를 다시 조회하세요.')
      const reauth = await reauthenticateStaff(capturedPassword); if (alive.current) setPassword('')
      const result = await signXCAReport(target, capturedPreview, reauth, confirmed)
      if (alive.current) { setReceipt(result); setPreview(null); setConfirmed(false); onSigned() }
      const final = await getXCAReportPDF(target)
      if (final.state !== 'SIGNED' || final.digest !== result.digest) throw new Error('최종 PDF 재조회 실패. 재서명하지 말고 PDF 다시 조회를 누르세요.')
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await final.blob.arrayBuffer())), b => b.toString(16).padStart(2, '0')).join('')
      if (hash !== result.pdfDigest) throw new Error('최종 PDF 체크섬 검증 실패. 관리자에게 확인하세요.')
      if (alive.current) setPreview(final)
    })
  }
  return <section className="xca-report-draft"><h3>최종 PDF · 의료진 서명</h3>
    <p>저장된 본문·점수·선택 영상이 PDF에 포함됩니다. 의사 계정의 명시적 검토·재인증 후 서명합니다. 환자 앱에 자동 공개하지 않습니다.</p>
    <p>앱 내 서명자·시각·내용 해시 기록이며, 인증서 기반 PDF 전자서명은 아닙니다.</p>
    <button type="button" disabled={busy || disabled} onClick={load}>PDF 생성·다시 조회</button>
    {url && preview && <p><a href={url} target="_blank" rel="noopener noreferrer">{preview.state === 'SIGNED' ? '서명 기록 포함 PDF 확인' : '미서명 초안 PDF 확인'}</a>{' · '}<a href={url} download={`xca-result-${target.id}-v${target.versionNo}-${preview.state.toLowerCase()}.pdf`}>PDF 다운로드</a></p>}
    {preview?.state === 'DRAFT' && !receipt && <><label><input type="checkbox" checked={confirmed} disabled={busy || disabled} onChange={event => setConfirmed(event.target.checked)} /> 이 버전의 PDF 본문·의견·선택 영상과 AI 연구 제한을 확인했고 최종 서명에 동의합니다.</label>
      <label>의료진 비밀번호 재인증<input type="password" autoComplete="current-password" value={password} disabled={busy || disabled} onChange={event => setPassword(event.target.value)} /></label>
      <button type="button" className="primary" disabled={busy || disabled || !password || !confirmed} onClick={sign}>검토 승인 · 최종 서명 · PDF 보존</button></>}
    {(receipt || preview?.state === 'SIGNED') && <p className="xca-report-success">서명된 PDF {receipt && `· 서명 #${receipt.signoffId} · 보고서 #${receipt.reportId}`} · 환자 공개 전 상태</p>}
    {busy && <p role="status">PDF·서명 처리 중… 자동 재전송하지 않습니다.</p>}
    {error && <p role="alert" className="api-inline-error">{error}</p>}
  </section>
}
