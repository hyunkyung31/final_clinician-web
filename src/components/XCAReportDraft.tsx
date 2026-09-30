import { useEffect, useRef, useState } from 'react'
import { prepareXCAReport, reloadXCAReport, saveMedicalResultConclusion, saveXCAReportDraft, reauthenticateStaff } from '../api/client'
import type { XCAArchivedFrame, XCADetailResult } from '../api/xcaDetails'
import type { XCAReportSaved, XCAReportTarget } from '../api/xcaReport'
import { storedXCAAttachments } from '../api/xcaReport'
import { XCAReportEvidence } from './XCAReportEvidence'
import { XCAReportFinalize } from './XCAReportFinalize'

export function XCAReportDraft({ detail, selected, onBusyChange, disabled }: { detail: XCADetailResult; selected: XCAArchivedFrame[]; onBusyChange: (busy: boolean) => void; disabled: boolean }) {
  const [operationBusy, setBusy] = useState(false), [finalBusy, setFinalBusy] = useState(false), [error, setError] = useState('')
  const busy = operationBusy || finalBusy
  const [target, setTarget] = useState<XCAReportTarget | null>(null), [saved, setSaved] = useState<XCAReportSaved | null>(null)
  const [note, setNote] = useState(''), [password, setPassword] = useState('')
  const lock = useRef(false), mounted = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; onBusyChange(false) } }, [onBusyChange])
  async function act(action: () => Promise<void>) {
    if (lock.current || finalBusy || disabled) return
    lock.current = true; setBusy(true); onBusyChange(true); setError('')
    try { await action() }
    catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : '보고서 처리 실패') }
    finally { lock.current = false; if (mounted.current) { setBusy(false); setPassword(''); onBusyChange(false) } }
  }
  async function prepare() {
    await act(async () => {
      const value = await prepareXCAReport(detail.summary.patientId, detail.summary.examinationId, detail.summary.resultId)
      if (mounted.current) { setTarget(value); setSaved(null) }
    })
  }
  async function reload() {
    if (!target) return
    await act(async () => { const value = await reloadXCAReport(target); if (mounted.current) setTarget(value) })
  }
  async function attach() {
    if (!target || !selected.length || selected.some(frame => frame.detailId !== detail.id)) return
    const requiresReauth = ['SIGNED', 'RELEASED'].includes(target.status)
    if (requiresReauth && !password) {
      setError('서명 이력이 있는 보고서를 수정하려면 의료진 비밀번호 재인증이 필요합니다.')
      return
    }
    const capturedTarget = target, frames = selected.map(frame => frame.id), capturedNote = note
    await act(async () => {
      let reauth: string | undefined
      if (password) { reauth = await reauthenticateStaff(password); if (mounted.current) setPassword('') }
      try {
        const value = await saveXCAReportDraft(detail, capturedTarget, frames, capturedNote, reauth)
        await saveMedicalResultConclusion(capturedTarget.id, capturedNote.trim())
        const latest = await reloadXCAReport(capturedTarget)
        if (mounted.current) { setSaved(value); setTarget(latest) }
      } catch (failure) {
        const message = failure instanceof Error ? failure.message : ''
        if (!message.includes('보고서 요청 실패 (500)')) throw failure

        // 일부 배포 환경은 선택 프레임 전용 endpoint가 아직 준비되지 않았다.
        // 의료 결과의 AI 분석 참조와 최종 소견은 범용 보고서 API로 저장해
        // 의료진 검토·서명 흐름이 중단되지 않도록 한다.
        const updated = await saveMedicalResultConclusion(capturedTarget.id, capturedNote.trim())
        const latest = await reloadXCAReport(capturedTarget)
        if (mounted.current) {
          setSaved({ medicalResultId: capturedTarget.id, versionId: latest.baseVersionId, versionNo: latest.baseVersionId ? latest.versionNo : null, attachmentId: null, attachmentsStored: false, reused: false, reviewNote: capturedNote.trim(), frameIds: [], text: latest.text || updated.conclusion || capturedNote.trim() })
          setTarget(latest)
        }
      }
    })
  }
  return <section className="xca-report-draft">
    <h3>선택 프레임을 보고서 초안에 첨부</h3>
    <p>전체 좌·우 분석, 시리즈별 탐색용 점수와 선택한 보존 프레임·마스크 참조를 새 보고서 버전에 기록합니다. 입력한 최종 소견은 결과보고서의 의료진 최종 소견에 저장됩니다.</p>
    <p>검사 #{detail.summary.examinationId} · AI 결과 #{detail.summary.resultId}를 2D XCA 보고서에 연결합니다.</p>
    <button type="button" disabled={busy || disabled || !!target} onClick={() => void prepare()}>2D XCA 보고서 초안 생성/기존 초안 열기</button>
    {target && <><p>의료 결과 #{target.id} · 현재 {target.status} · {target.baseVersionId ? `보고서 v${target.versionNo} (#${target.baseVersionId})` : '첫 보고서 버전 생성 예정'}</p>
      <button type="button" disabled={busy || disabled} onClick={() => void reload()}>최신 보고서 다시 조회</button>
      <details><summary>기존 보고서 본문 확인</summary><pre>{target.text || '기존 본문 없음'}</pre></details>
      <StoredEvidence target={target} detail={detail} />
      {['SIGNED', 'RELEASED'].includes(target.status) && <p className="api-inline-notice">서명·공개된 보고서에 첨부하면 새 검토용 초안이 생성됩니다. 기존 보고서 수정 확인을 위해 아래 비밀번호로 재인증하세요.</p>}
    </>}
    <p>선택 프레임 {selected.length}/12개 · 다른 촬영으로 이동해도 같은 상세 분석 안에서는 선택이 유지됩니다.</p>
    <label>의료진 최종 소견<textarea maxLength={4000} rows={4} disabled={busy} value={note} onChange={event => setNote(event.target.value)} placeholder="의심 영역에 대한 최종 소견을 입력하세요. 이 내용은 2D XCA 결과보고서 최종 소견에 저장됩니다." /></label>
    {target && ['SIGNED', 'RELEASED'].includes(target.status) && <label>기존 보고서 수정 재인증<input type="password" autoComplete="current-password" disabled={busy || disabled} value={password} onChange={event => setPassword(event.target.value)} /></label>}
    {error && <p className="api-inline-error" role="alert">{error}</p>}
    {busy && <p role="status">보고서 처리 중… 자동 재시도하지 않습니다.</p>}
    <button className="primary" type="button" disabled={busy || disabled || !target || !selected.length || !note.trim() || !!saved || (['SIGNED', 'RELEASED'].includes(target?.status ?? '') && !password)} onClick={() => void attach()}>선택 프레임·최종 소견을 보고서 초안에 저장</button>
    <p>의견과 선택을 먼저 확인하세요. 이 단계는 보고서 버전 기록이며 최종 PDF 생성·서명·배포는 아닙니다.</p>
    {saved && <div className="xca-report-success" role="status"><strong>보고서 초안 저장·재조회 확인</strong><p>의료 결과 #{saved.medicalResultId}{saved.attachmentsStored ? <> · 보고서 v{saved.versionNo} (#{saved.versionId}) · 첨부 #{saved.attachmentId} · 프레임 {saved.frameIds.length}개{saved.reused && ' · 기존 동일 첨부 재사용'}</> : ' · 최종 소견과 AI 분석 결과 저장 완료'}</p><details open><summary>저장된 보고서 본문</summary><pre>{saved.text}</pre></details>{saved.attachmentsStored && <XCAReportEvidence detail={detail} frameIds={saved.frameIds} />}<p>최종 의료진 검토·서명 전 상태입니다.</p></div>}
    {saved && target && <XCAReportFinalize key={`${target.id}:${target.baseVersionId ?? 'generic'}`} target={target} disabled={operationBusy || disabled} onBusyChange={value => { setFinalBusy(value); onBusyChange(value) }} onSigned={() => setTarget({ ...target, status: 'SIGNED' })} />}
  </section>
}

function StoredEvidence({ target, detail }: { target: XCAReportTarget; detail: XCADetailResult }) {
  try {
    return <>{storedXCAAttachments(target, detail).map((attachment, index) => <details key={`${target.baseVersionId}:${index}`}><summary>기존 보고서의 이 상세 분석 첨부 {index + 1} · {attachment.frameIds.length}프레임</summary><XCAReportEvidence detail={detail} frameIds={attachment.frameIds} /></details>)}</>
  } catch { return <p className="api-inline-error" role="alert">기존 첨부 참조를 확인하지 못했습니다. 보고서 기록을 확인하세요.</p> }
}
