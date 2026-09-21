import type { ConsultationDetail, ConsultationSummary } from '../types'

export type ConsultationScope = 'received' | 'sent' | 'all'
export type ConsultationStatusFilter = 'ALL' | ConsultationSummary['status']
export type ConsultationPatientSection = '워크스테이션' | '검사·영상' | '시술기록' | '결과보고서'
export interface ReplyDraft { assessment: string; recommendation: string; followUp: string }
export const emptyReply = (): ReplyDraft => ({ assessment: '', recommendation: '', followUp: '' })

export function matchesScope(item: ConsultationSummary, scope: ConsultationScope, userId?: number, doctorId?: number) {
  if (scope === 'all') return true
  if (scope === 'received') return doctorId !== undefined && item.assignedDoctorId === doctorId
  return userId !== undefined && item.requestedById === userId
}

export function isOpenConsultation(item: ConsultationSummary) {
  return item.status === 'REQUESTED' || item.status === 'ACCEPTED'
}

export function isOverdue(item: ConsultationSummary, now = Date.now()) {
  const due = Date.parse(item.dueAt)
  return isOpenConsultation(item) && Number.isFinite(due) && due < now
}

export function requesterDisplay(item: Pick<ConsultationSummary, 'requestedByName' | 'requestedDepartmentName'>) {
  return {
    name: item.requestedByName?.trim() || '',
    department: item.requestedDepartmentName?.trim() || '',
  }
}

export function assigneeDisplay(item: Pick<ConsultationSummary, 'assignedDoctorId' | 'assignedDoctorName' | 'assignedDepartmentName'>) {
  const assigned = item.assignedDoctorId !== undefined || !!item.assignedDoctorName?.trim()
  return {
    name: assigned ? (item.assignedDoctorName?.trim() || '담당 의료진') : '미배정',
    department: item.assignedDepartmentName?.trim() || '',
  }
}

export function formatRequestTime(value: string) {
  const date = new Date(value)
  if (!value || !Number.isFinite(date.getTime())) return '요청 시각 없음'
  const pad = (unit: number) => String(unit).padStart(2, '0')
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function sortConsultations(items: ConsultationSummary[]) {
  const timestamp = (value: string) => Number.isFinite(Date.parse(value)) ? Date.parse(value) : Number.MAX_SAFE_INTEGER
  return [...items].sort((a, b) => Number(isOpenConsultation(b)) - Number(isOpenConsultation(a))
    || Number(b.priority === 'URGENT') - Number(a.priority === 'URGENT')
    || timestamp(a.createdAt) - timestamp(b.createdAt) || a.id - b.id)
}

export function serializeReply(draft: ReplyDraft) {
  return [['평가·소견', draft.assessment], ['권고사항', draft.recommendation], ['추가 검사·추적 계획', draft.followUp]]
    .filter(([, value]) => value.trim()).map(([label, value]) => `[${label}]\n${value.trim()}`).join('\n\n')
}

export class ConsultationReplyError extends Error {
  finalRegistered: boolean
  constructor(message: string, finalRegistered: boolean) {
    super(message)
    this.finalRegistered = finalRegistered
  }
}

// The current API separates opinion registration and completion. Always re-read before retrying.
export async function publishConsultationReply(input: {
  id: number; doctorId: number; text: string; final: boolean
  getDetail: (id: number) => Promise<ConsultationDetail>
  addOpinion: (id: number, text: string, final: boolean) => Promise<void>
  complete: (id: number) => Promise<void>
  onRegistered: () => void
}) {
  let finalRegistered = false
  try {
    const latest = await input.getDetail(input.id)
    finalRegistered = latest.opinions.some((opinion) => opinion.isFinal)
    if (latest.consultation.assignedDoctorId !== input.doctorId) throw new Error('담당 의료진이 변경되었습니다. 새로고침 후 확인해주세요.')
    if (input.final && finalRegistered && latest.consultation.status === 'COMPLETED') return
    if (latest.consultation.status !== 'ACCEPTED') throw new Error('협진 상태가 변경되었습니다. 새로고침 후 확인해주세요.')
    if (!finalRegistered) {
      await input.addOpinion(input.id, input.text, input.final)
      finalRegistered = input.final
      input.onRegistered()
    } else if (!input.final) throw new Error('최종 회신이 이미 등록되어 있습니다.')
    if (input.final) {
      const after = await input.getDetail(input.id)
      if (after.consultation.assignedDoctorId !== input.doctorId) throw new Error('회신 등록 후 담당 의료진이 변경되었습니다.')
      if (after.consultation.status === 'ACCEPTED') await input.complete(input.id)
      else if (after.consultation.status !== 'COMPLETED') throw new Error('회신 등록 후 협진 상태가 변경되었습니다.')
    }
  } catch (error) {
    throw new ConsultationReplyError(error instanceof Error ? error.message : '회신 처리에 실패했습니다.', finalRegistered)
  }
}
