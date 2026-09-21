import { useEffect, useRef, useState } from 'react'
import { getPatientFollowUpRecords, prepareXCAReport, reloadXCAReport, saveXCAReportDraft, reauthenticateStaff } from '../api/client'
import type { FollowUpVisit } from '../types'
import type { XCAArchivedFrame, XCADetailResult } from '../api/xcaDetails'
import type { XCAReportSaved, XCAReportTarget } from '../api/xcaReport'
import { storedXCAAttachments } from '../api/xcaReport'
import { XCAReportEvidence } from './XCAReportEvidence'
import { XCAReportFinalize } from './XCAReportFinalize'
import { DoctorSignaturePreview } from './DoctorSignaturePreview'

export function XCAReportDraft({ detail, selected, onBusyChange, disabled }: { detail: XCADetailResult; selected: XCAArchivedFrame[]; onBusyChange: (busy: boolean) => void; disabled: boolean }) {
  const [visits, setVisits] = useState<FollowUpVisit[]>([]), [encounterId, setEncounterId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true), [operationBusy, setBusy] = useState(false), [finalBusy, setFinalBusy] = useState(false), [error, setError] = useState('')
  const busy = operationBusy || finalBusy
  const [target, setTarget] = useState<XCAReportTarget | null>(null), [saved, setSaved] = useState<XCAReportSaved | null>(null)
  const [note, setNote] = useState(''), [password, setPassword] = useState('')
  const lock = useRef(false), mounted = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; onBusyChange(false) } }, [onBusyChange])
  useEffect(() => {
    let alive = true
    getPatientFollowUpRecords(detail.summary.patientId).then(records => {
      if (records.patient.id !== detail.summary.patientId) throw new Error('다른 환자의 진료 기록입니다.')
      if (alive) setVisits(records.visits.filter(visit => Number.isSafeInteger(visit.encounterId) && visit.encounterId > 0 && visit.status !== 'CANCELED'))
    }).catch(failure => { if (alive) setError(failure instanceof Error ? failure.message : '진료 기록 조회 실패') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [detail.summary.patientId])
  async function act(action: () => Promise<void>) {
    if (lock.current || finalBusy || disabled) return
    lock.current = true; setBusy(true); onBusyChange(true); setError('')
    try { await action() }
    catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : '보고서 처리 실패') }
    finally { lock.current = false; if (mounted.current) { setBusy(false); setPassword(''); onBusyChange(false) } }
  }
  async function prepare() {
    if (!encounterId || !visits.some(visit => visit.encounterId === encounterId)) return
    await act(async () => {
      const value = await prepareXCAReport(detail.summary.patientId, encounterId)
      if (mounted.current) { setTarget(value); setSaved(null) }
    })
  }
  async function reload() {
    if (!target) return
    await act(async () => { const value = await reloadXCAReport(target); if (mounted.current) setTarget(value) })
  }
  async function attach() {
    if (!target || !selected.length || selected.some(frame => frame.detailId !== detail.id)) return
    if (import.meta.env.DEV && ['SIGNED', 'RELEASED'].includes(target.status)) {
      setError('서명 이력이 있는 보고서 수정은 백엔드 연동 후 가능합니다. 현재 서명 버튼은 로컬 미리보기입니다.')
      return
    }
    const capturedTarget = target, frames = selected.map(frame => frame.id), capturedNote = note
    await act(async () => {
      let reauth: string | undefined
      if (password) { reauth = await reauthenticateStaff(password); if (mounted.current) setPassword('') }
      const value = await saveXCAReportDraft(detail, capturedTarget, frames, capturedNote, reauth)
      const latest = await reloadXCAReport(capturedTarget)
      if (mounted.current) { setSaved(value); setTarget(latest) }
    })
  }
  return <section className="xca-report-draft">
    <h3>선택 프레임을 보고서 초안에 첨부</h3>
    <p>전체 좌·우 분석, 시리즈별 탐색용 점수, 선택한 보존 프레임·마스크 참조와 의료진 의견을 새 보고서 버전에 기록합니다. 자동 서명·공개하지 않습니다.</p>
    {loading && <p role="status">환자 진료 목록 조회 중…</p>}
    {!loading && !visits.length && <p>연결할 진료 기록이 없습니다. 정상 진료 등록 절차로 진료를 등록한 뒤 다시 열어주세요.</p>}
    <label>첨부할 진료 선택<select value={encounterId ?? ''} disabled={loading || busy || disabled} onChange={event => { setEncounterId(event.target.value ? Number(event.target.value) : null); setTarget(null); setSaved(null); setPassword('') }}>
      <option value="">진료를 직접 선택하세요</option>{visits.map(visit => <option key={visit.encounterId} value={visit.encounterId}>{visit.stageLabel} · {visit.visitDate ? new Date(visit.visitDate).toLocaleDateString('ko-KR') : '날짜 미상'} · 진료 #{visit.encounterId}{visit.examinations.some(exam => exam.examinationId === detail.summary.examinationId) && ' · 이 Angio 검사 연결'}</option>)}
    </select></label>
    <button type="button" disabled={busy || disabled || !encounterId || !!target} onClick={() => void prepare()}>보고서 대상 준비 · 초안 생성/기존 사용</button>
    {target && <><p>의료 결과 #{target.id} · 현재 {target.status} · {target.baseVersionId ? `보고서 v${target.versionNo} (#${target.baseVersionId})` : '첫 보고서 버전 생성 예정'}</p>
      <button type="button" disabled={busy || disabled} onClick={() => void reload()}>최신 보고서 다시 조회</button>
      <details><summary>기존 보고서 본문 확인</summary><pre>{target.text || '기존 본문 없음'}</pre></details>
      <StoredEvidence target={target} detail={detail} />
      {['SIGNED', 'RELEASED'].includes(target.status) && <p className="api-inline-notice">{import.meta.env.DEV ? '서명 이력이 있는 보고서 수정은 백엔드 연동 후 가능합니다.' : '서명·공개된 보고서에 첨부하면 새 검토용 초안이 생깁니다. 아래 비밀번호로 재인증이 필요합니다.'}</p>}
    </>}
    <p>선택 프레임 {selected.length}/12개 · 다른 촬영으로 이동해도 같은 상세 분석 안에서는 선택이 유지됩니다.</p>
    <label>의료진 의견<textarea maxLength={4000} rows={4} disabled={busy} value={note} onChange={event => setNote(event.target.value)} placeholder="의심 영역에 대한 검토 의견을 입력하세요. AI 점수는 확정 진단이 아닙니다." /></label>
    {import.meta.env.DEV ? <DoctorSignaturePreview resetKey={JSON.stringify([detail.id, encounterId, target?.baseVersionId, note, selected.map(frame => frame.id)])} disabled={busy || disabled} /> : <label>서명 이력이 있는 보고서는 의료진 비밀번호로 재인증<input type="password" autoComplete="current-password" disabled={busy} value={password} onChange={event => setPassword(event.target.value)} /></label>}
    {error && <p className="api-inline-error" role="alert">{error}</p>}
    {busy && <p role="status">보고서 처리 중… 자동 재시도하지 않습니다.</p>}
    <button className="primary" type="button" disabled={busy || disabled || !target || !selected.length || !note.trim() || !!saved} onClick={() => void attach()}>선택 프레임·의견을 보고서 초안에 저장</button>
    <p>의견과 선택을 먼저 확인하세요. 이 단계는 보고서 버전 기록이며 최종 PDF 생성·서명·배포는 아닙니다.</p>
    {saved && <div className="xca-report-success" role="status"><strong>보고서 초안 저장·재조회 확인</strong><p>의료 결과 #{saved.medicalResultId} · 보고서 v{saved.versionNo} (#{saved.versionId}) · 첨부 #{saved.attachmentId} · 프레임 {saved.frameIds.length}개{saved.reused && ' · 기존 동일 첨부 재사용'}</p><details open><summary>저장된 보고서 본문</summary><pre>{saved.text}</pre></details><XCAReportEvidence detail={detail} frameIds={saved.frameIds} /><p>최종 의료진 검토·서명 전 상태입니다.</p></div>}
    {target?.baseVersionId && <XCAReportFinalize key={target.baseVersionId} target={target} disabled={operationBusy || disabled} onBusyChange={value => { setFinalBusy(value); onBusyChange(value) }} onSigned={() => setTarget({ ...target, status: 'SIGNED' })} />}
  </section>
}

function StoredEvidence({ target, detail }: { target: XCAReportTarget; detail: XCADetailResult }) {
  try {
    return <>{storedXCAAttachments(target, detail).map((attachment, index) => <details key={`${target.baseVersionId}:${index}`}><summary>기존 보고서의 이 상세 분석 첨부 {index + 1} · {attachment.frameIds.length}프레임</summary><p>의료진 의견: {attachment.note}</p><XCAReportEvidence detail={detail} frameIds={attachment.frameIds} /></details>)}</>
  } catch { return <p className="api-inline-error" role="alert">기존 첨부 참조를 확인하지 못했습니다. 보고서 기록을 확인하세요.</p> }
}
