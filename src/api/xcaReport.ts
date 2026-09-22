/** Explicit staff actions only. Never refresh credentials/replay a report POST. */
import type { XCADetailResult } from './xcaDetails'
export interface XCAReportTarget { id: number; patientId: number; encounterId: number; status: string; baseVersionId: number | null; versionNo: number; content: Record<string, unknown>; text: string }
export interface XCAReportSaved { medicalResultId: number; versionId: number; versionNo: number; attachmentId: number; reused: boolean; reviewNote: string; frameIds: number[]; text: string }
export interface XCAPDFPreview { blob: Blob; digest: string; state: 'DRAFT' | 'SIGNED'; versionId: number }
export interface XCAFinalReceipt { versionId: number; signoffId: number; reportId: number; digest: string; pdfDigest: string; reused: boolean }
export async function fetchXCAPDF(base: string, token: string | null, target: XCAReportTarget): Promise<XCAPDFPreview> {
  if (!token || !target.baseVersionId) throw new Error('로그인 후 저장된 보고서 버전을 선택하세요.')
  let response: Response
  try { response = await fetch(`${base}/api/report-versions/${id(target.baseVersionId)}/xca-pdf/?patient_id=${id(target.patientId)}`, { headers: { Authorization: `Bearer ${token}` }, redirect: 'error', cache: 'no-store' }) }
  catch { throw new Error('PDF 조회에 실패했습니다. 연결을 확인하세요.') }
  const digest = response.headers.get('X-XCA-Content-SHA256'), state = response.headers.get('X-XCA-PDF-State')
  if (!response.ok) throw new Error(`PDF 생성·검증 실패 (${response.status}). 최신 보고서와 보존 파일을 확인하세요.`)
  if (!response.headers.get('Content-Type')?.startsWith('application/pdf') || !digest || !/^[a-f0-9]{64}$/.test(digest) || !['DRAFT', 'SIGNED'].includes(state ?? '')) throw new Error('PDF 응답 검증 실패')
  const blob = await response.blob()
  if (!blob.size || blob.size > 32 * 1024 * 1024 || !new TextDecoder().decode(await blob.slice(0, 5).arrayBuffer()).startsWith('%PDF-')) throw new Error('PDF 파일 형식 오류')
  return { blob, digest, state: state as 'DRAFT' | 'SIGNED', versionId: target.baseVersionId }
}
export async function finalizeXCAReport(base: string, token: string | null, target: XCAReportTarget, preview: XCAPDFPreview, reauthToken: string, confirmed: boolean): Promise<XCAFinalReceipt> {
  if (!confirmed || !reauthToken || preview.state !== 'DRAFT' || preview.versionId !== target.baseVersionId || !/^[a-f0-9]{64}$/.test(preview.digest)) throw new Error('현재 버전의 초안 PDF를 확인하고 재인증·검토 동의 후 서명하세요.')
  const result = obj(await call(base, `/api/report-versions/${id(preview.versionId)}/xca-finalize/`, token, { patient_id: target.patientId, medical_result_id: target.id, content_sha256: preview.digest, reauth_token: reauthToken, confirm_reviewed: true }))
  if (result.patient_id !== target.patientId || result.medical_result_id !== target.id || result.version_id !== preview.versionId || result.version_no !== target.versionNo || result.content_sha256 !== preview.digest || result.status !== 'SIGNED' || result.release_status !== 'NOT_RELEASED' || typeof result.reused !== 'boolean' || !/^[a-f0-9]{64}$/.test(String(result.pdf_sha256))) throw new Error('서명 응답 확인 실패. 저장됐을 수 있으니 재전송 전 최신 PDF를 조회하세요.')
  return { versionId: id(result.version_id), signoffId: id(result.signoff_id), reportId: id(result.report_id), digest: preview.digest, pdfDigest: String(result.pdf_sha256), reused: result.reused }
}
export function storedXCAAttachments(target: XCAReportTarget, detail: XCADetailResult): { note: string; frameIds: number[] }[] {
  if (target.patientId !== detail.summary.patientId) throw new Error('다른 환자의 첨부 기록입니다.')
  const attachments = target.content.xca_attachments ?? []
  if (!Array.isArray(attachments)) throw new Error('보고서 첨부 목록 오류')
  return attachments.map(obj).filter(a => a.detail_id === detail.id).map(a => {
    const context = obj(obj(a.summary).backend_context)
    if (context.backend_patient_id !== target.patientId || a.examination_id !== detail.summary.examinationId || typeof a.review_note !== 'string' || !Array.isArray(a.frames)) throw new Error('보고서 첨부 환자·검사 오류')
    const frameIds = a.frames.map(frame => id(obj(frame).id))
    if (!frameIds.length || frameIds.length > 12 || new Set(frameIds).size !== frameIds.length) throw new Error('보고서 첨부 프레임 참조 오류')
    return { note: a.review_note, frameIds }
  })
}
function obj(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('보고서 응답 형식 오류'); return value as Record<string, unknown> }
function id(value: unknown): number { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) throw new Error('보고서 ID 오류'); return value }
function stable(value: unknown): string { return JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item) }
async function call(base: string, path: string, token: string | null, body?: unknown): Promise<unknown> {
  if (!token) throw new Error('의료진 로그인이 필요합니다.')
  let response: Response
  try { response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST', redirect: 'error', cache: 'no-store', headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }) }
  catch { throw new Error('보고서 응답이 끊겼습니다. 저장됐을 수 있으니 기존 기록을 확인하세요. 자동 재시도하지 않습니다.') }
  if (!response.ok) {
    if (response.status === 409) throw new Error('보고서가 변경됐습니다. 최신 보고서 다시 조회 후 내용을 확인하고 첨부하세요.')
    if (response.status === 401) throw new Error('로그인 또는 서명 이력에 대한 재인증이 필요합니다. 로그인·비밀번호를 확인하세요. 자동 재전송하지 않습니다.')
    throw new Error(`보고서 요청 실패 (${response.status}). 환자·프레임·의견·접근 권한을 확인하세요.`)
  }
  return response.json()
}
export async function readXCAReportTarget(base: string, token: string | null, medicalId: number, patientId: number, encounterId: number): Promise<XCAReportTarget> {
  const payload = obj(await call(base, `/api/medical-results/${id(medicalId)}/`, token)), medical = obj(payload.medical_result)
  if (medical.id !== medicalId || medical.patient !== patientId || medical.encounter !== encounterId || !['DRAFT', 'REVIEWING', 'SIGNED', 'RELEASED'].includes(String(medical.status))) throw new Error('다른 환자·진료의 보고서입니다.')
  if (!Array.isArray(payload.versions)) throw new Error('보고서 버전 목록 오류')
  const versions = payload.versions.map(obj).sort((a,b) => Number(b.version_no) - Number(a.version_no))
  for (const v of versions) { id(v.id); id(v.version_no); if (v.medical_result !== medicalId) throw new Error('다른 의료 결과의 보고서 버전입니다.') }
  const latest = versions[0]
  const content = latest ? obj(latest.content_json) : {}
  if (latest && typeof latest.content_text !== 'string') throw new Error('보고서 본문 형식 오류')
  if (content.xca_attachments !== undefined && !Array.isArray(content.xca_attachments)) throw new Error('기존 XCA 첨부 형식이 올바르지 않습니다.')
  return { id: medicalId, patientId, encounterId, status: String(medical.status), baseVersionId: latest ? id(latest.id) : null, versionNo: latest ? id(latest.version_no) : 0, content, text: latest ? String(latest.content_text) : '' }
}
export async function prepareXCAReportTarget(base: string, token: string | null, patientId: number, examinationId: number, analysisResultId: number): Promise<XCAReportTarget> {
  id(patientId); id(examinationId); id(analysisResultId)
  const response = obj(await call(base, `/api/examinations/${examinationId}/medical-results/`, token, {
    report_type: 'XCA_2D', analysis_result_id: analysisResultId,
  }))
  const medical = response.medical_result && typeof response.medical_result === 'object' && !Array.isArray(response.medical_result)
    ? obj(response.medical_result)
    : response
  const encounterId = id(medical.encounter)
  if (medical.patient !== patientId || medical.examination !== examinationId || medical.report_type !== 'XCA_2D') {
    throw new Error('생성된 2D XCA 초안의 환자·검사가 다릅니다.')
  }
  return readXCAReportTarget(base, token, id(medical.id), patientId, encounterId)
}
export function validateXCAReportSelection(detail: XCADetailResult, target: XCAReportTarget, frameIds: number[], note: string): string {
  if (target.patientId !== detail.summary.patientId) throw new Error('다른 환자의 보고서에는 첨부할 수 없습니다.')
  if (!frameIds.length || frameIds.length > 12 || new Set(frameIds).size !== frameIds.length) throw new Error('보존 프레임을 중복 없이 1~12개 선택하세요.')
  frameIds.forEach(id)
  const trimmed = note.trim()
  if (!trimmed || trimmed.length > 4000) throw new Error('의료진 의견을 1~4000자로 입력하세요.')
  return trimmed
}
export async function attachXCAReportDraft(base: string, token: string | null, detail: XCADetailResult, target: XCAReportTarget, frameIds: number[], reviewNote: string, reauthToken?: string): Promise<XCAReportSaved> {
  const note = validateXCAReportSelection(detail, target, frameIds, reviewNote)
  const response = obj(await call(base, `/api/medical-results/${target.id}/xca-attachments/`, token, { detail_id: detail.id, frame_ids: frameIds, review_note: note, base_version_id: target.baseVersionId, ...(reauthToken ? { reauth_token: reauthToken } : {}) }))
  const version = obj(response.report_version), versionId = id(version.id), attachmentId = id(response.attachment_id)
  if (version.medical_result !== target.id || version.source_type !== 'DOCTOR_EDIT' || typeof version.content_text !== 'string' || typeof response.reused !== 'boolean') throw new Error('첨부 보고서 버전 확인 실패. 재전송 전 기존 기록을 확인하세요.')
  const content = obj(version.content_json), attachments = content.xca_attachments
  if (response.reused === false && version.version_no !== target.versionNo + 1) throw new Error('보고서 버전 번호 확인 실패')
  if (!Array.isArray(attachments)) throw new Error('저장된 보고서 첨부 확인 실패')
  const selected = attachments.map(obj).find(a => a.detail_id === detail.id && a.review_note === note && a.base_version_id === target.baseVersionId && Array.isArray(a.frames) && stable(a.frames.map(f => id(obj(f).id)).sort((a,b)=>a-b)) === stable([...frameIds].sort((a,b)=>a-b)))
  if (!selected || selected.status !== 'DRAFT_REQUIRES_REVIEW' || selected.analysis_id !== detail.summary.analysisId || selected.result_id !== detail.summary.resultId || selected.examination_id !== detail.summary.examinationId || selected.source_bundle_sha256 !== '18ffc48b71309379598a3dc6d1b1ac4a858e567f4d6ee917532e2a08e01a3569') throw new Error('저장된 첨부의 환자·상세·프레임 계약 확인 실패')
  const summary = obj(selected.summary), context = obj(summary.backend_context)
  if (context.backend_patient_id !== target.patientId || context.examination_id !== detail.summary.examinationId || String(summary.patient_id) !== detail.summary.originalPatientId) throw new Error('첨부된 분석 환자·검사가 다릅니다.')
  for (const [key, value] of Object.entries(target.content)) { if (key !== 'xca_attachments' && stable(content[key]) !== stable(value)) throw new Error('기존 보고서 내용 보존 확인 실패') }
  const oldAttachments = Array.isArray(target.content.xca_attachments) ? target.content.xca_attachments : []
  if (stable(attachments.slice(0, oldAttachments.length)) !== stable(oldAttachments) || !String(version.content_text).startsWith(target.text)) throw new Error('기존 보고서 첨부·본문 보존 확인 실패')
  const persisted = obj(await call(base, `/api/report-versions/${versionId}/`, token))
  if (persisted.id !== versionId || persisted.medical_result !== target.id || stable(persisted.content_json) !== stable(content) || persisted.content_text !== version.content_text) throw new Error('첨부 후 보고서 재조회 실패. 저장됐을 수 있으니 재전송 전 확인하세요.')
  const latest = obj(await call(base, `/api/medical-results/${target.id}/`, token)), medical = obj(latest.medical_result)
  if (medical.patient !== target.patientId || medical.encounter !== target.encounterId || medical.status !== 'DRAFT') throw new Error('보고서 초안 상태 확인 실패. 재전송 대신 현재 기록을 확인하세요.')
  return { medicalResultId: target.id, versionId, versionNo: id(version.version_no), attachmentId, reused: response.reused, reviewNote: note, frameIds: [...frameIds], text: String(version.content_text) }
}
