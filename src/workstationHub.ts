import type { DashboardAIStatus, ImagingStudySummary, MedicalResultDetail, ReportAiSummary, TimelineItem } from './types'

export type HubView = 'summary' | 'imaging' | 'ai' | 'report'
export type ReportLifecycle = 'NONE' | 'DRAFT' | 'REVIEWING' | 'SIGNED' | 'RELEASED'

export const HUB_COPY = {
  bannerTitle: 'DUGN 두근',
  bannerLead: 'AI와 함께하는 더 정확한 심장 진료',
  bannerSub: '환자의 검사정보를 통합하여 의료진의 의사결정을 지원합니다.',
  noExam: '등록된 검사 결과가 없습니다.',
  noAi: '완료된 AI 분석 결과가 없습니다.',
  noImage: '선택한 검사에 연결된 영상이 없습니다.',
  imageError: '영상을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
  noReport: '작성된 결과보고서가 없습니다.',
  noOrder: '선택한 오더가 없습니다.',
  noMemo: '등록된 환자 메모가 없습니다.',
  noPrescription: '작성 중인 처방 초안이 없습니다.',
  noDur: '현재 확인된 DUR 주의사항이 없습니다.',
  loadFailed: '정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
  recommendationNote: '권고안은 의료진의 판단을 보조하기 위한 참고정보입니다.',
  rangeDisclaimer: '참고범위 기준 표시이며, 임상적 판단을 대체하지 않습니다.',
} as const

export const reportStatusLabels: Record<string, string> = {
  DRAFT: '초안',
  REVIEWING: '검토 중',
  SIGNED: '최종 승인',
  RELEASED: '환자 공개',
}

export function clinicianErrorMessage(error: unknown, fallback: string = HUB_COPY.loadFailed): string {
  const raw = error instanceof Error ? error.message : ''
  if (!raw) return fallback
  if (/CORS|traceback|stack|endpoint|OpenAPI|ECONN|Failed to fetch|500\b/i.test(raw)) return fallback
  return raw
}

export function formatHubDate(value?: string | null, withTime = false): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('ko-KR', withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }).format(date)
}

export function formatHubDateTime(value?: string | null): string {
  return formatHubDate(value, true)
}

export function latestReportStatus(status?: string | null): ReportLifecycle {
  const value = String(status || '').toUpperCase()
  if (value === 'RELEASED') return 'RELEASED'
  if (value === 'SIGNED') return 'SIGNED'
  if (value === 'REVIEWING') return 'REVIEWING'
  if (value === 'DRAFT') return 'DRAFT'
  return 'NONE'
}

export function reportStatusCopy(status: ReportLifecycle): string {
  if (status === 'RELEASED') return '환자 공개 완료'
  if (status === 'SIGNED') return '최종 승인 완료 · 환자 공개 가능'
  if (status === 'REVIEWING') return '의료진 최종 검토가 필요합니다.'
  if (status === 'DRAFT') return '보고서 초안 작성 중'
  return HUB_COPY.noReport
}

export function reportApprovalSteps(status: ReportLifecycle) {
  const drafted = status !== 'NONE'
  const signed = status === 'SIGNED' || status === 'RELEASED'
  const released = status === 'RELEASED'
  const signing = status === 'DRAFT' || status === 'REVIEWING'
  const releasing = status === 'SIGNED'

  return [
    {
      key: 'draft',
      label: '초안 작성',
      tone: drafted ? 'done' : 'current',
      hint: drafted ? '완료' : '진행 가능',
    },
    {
      key: 'signoff',
      label: '최종 승인',
      tone: signed ? 'done' : signing ? 'current' : 'pending',
      hint: signed ? '완료' : signing ? '진행 가능' : '대기',
    },
    {
      key: 'release',
      label: '환자 공개',
      tone: released ? 'done' : releasing ? 'current' : 'pending',
      hint: released ? '완료' : releasing ? '진행 가능' : '대기',
    },
  ] as const
}

export function reportBadgeClass(status: ReportLifecycle): string {
  if (status === 'RELEASED' || status === 'SIGNED') return 'ok'
  if (status === 'REVIEWING' || status === 'DRAFT') return 'warn'
  return 'muted'
}

export function aiStatusCopy(aiStatus: DashboardAIStatus | null, hasCompletedAi: boolean): string {
  if (aiStatus?.failed) return `분석 실패 ${aiStatus.failed}건`
  if (aiStatus?.running) return `AI 분석 중 ${aiStatus.running}건`
  if (aiStatus?.queued) return `AI 분석 대기 ${aiStatus.queued}건`
  if (hasCompletedAi || (aiStatus?.completed ?? 0) > 0) return 'AI 분석 완료'
  return 'AI 결과 없음'
}

export function studyFilterKey(study: ImagingStudySummary): 'CT' | 'XCA' | 'US' | 'OTHER' {
  const haystack = `${study.modality} ${study.description}`.toUpperCase()
  if (haystack.includes('XA') || haystack.includes('XCA') || haystack.includes('ANGIO') || haystack.includes('CAG')) return 'XCA'
  if (haystack.includes('CT') || haystack.includes('CCTA')) return 'CT'
  if (haystack.includes('US') || haystack.includes('ECHO') || haystack.includes('TTE')) return 'US'
  return 'OTHER'
}

export function studyKindLabel(study: ImagingStudySummary): string {
  const haystack = `${study.modality} ${study.description}`.toUpperCase()
  if (haystack.includes('CCTA') || haystack.includes('CALCI') || ((haystack.includes('CT') || haystack.includes('CTA')) && (haystack.includes('CORON') || haystack.includes('CARDI')))) return 'CCTA'
  if (haystack.includes('XA') || haystack.includes('XCA') || haystack.includes('ANGIO') || haystack.includes('CAG')) return 'XCA'
  if (haystack.includes('CT') || haystack.includes('CTA')) return 'CCTA'
  if (haystack.includes('US') || haystack.includes('ECHO') || haystack.includes('TTE')) return 'US'
  return study.modality || '검사'
}

export function studyStatusLabel(study: ImagingStudySummary): { label: string; tone: 'ok' | 'info' | 'warn' | 'muted' } {
  const status = study.status.toUpperCase()
  if (status.includes('COMPLETE') || status === 'AVAILABLE') return { label: '판독 완료', tone: 'ok' }
  if (status.includes('AI') || status.includes('ANALY') || status.includes('PROCESS')) return { label: '분석 중', tone: 'info' }
  if (status === 'RECEIVED' || status === 'STORED' || status.includes('PENDING') || status.includes('WAIT')) return { label: '결과 대기', tone: 'warn' }
  if (status) return { label: '접수', tone: 'info' }
  return { label: '결과 대기', tone: 'muted' }
}

export function activityLabel(item: TimelineItem): string {
  if (item.eventType === 'AI_ANALYSIS') return item.title || 'AI 분석'
  if (item.eventType === 'EXAMINATION') return item.title || '검사 등록'
  if (item.eventType === 'REPORT') return item.title || '결과보고서'
  if (item.eventType === 'ENCOUNTER') return item.title || '진료'
  return item.title
}

export function clinicalAssistCopy(summary: ReportAiSummary | null): { headline: string; bullets: string[] } {
  if (!summary) return { headline: '', bullets: [] }
  const prediction = String(summary.prediction || '').trim()
  const high = prediction.toUpperCase().includes('HIGH') || prediction.toUpperCase().includes('SIGNIFICANT') || prediction === '1'
  const riskLabel = high ? 'High' : prediction || '확인됨'
  return {
    headline: `CAD 위험도 ${riskLabel}`,
    bullets: [
      summary.probability != null ? `예측 확률 ${formatProbability(summary.probability)}` : '',
    ].filter(Boolean),
  }
}

export function formatProbability(value: number): string {
  const ratio = value > 1 ? value / 100 : value
  return `${Math.round(ratio * 1000) / 10}%`
}

export function xcaAssistBullets(summary: ReportAiSummary | null): string[] {
  if (!summary) return []
  const bullets: string[] = []
  for (const side of summary.sides) {
    const score = side.significantStenosis ?? side.anyStenosis
    if (score == null) continue
    const label = String(side.side || '혈관').toUpperCase()
    bullets.push(`${label} 협착 의심 ${formatProbability(score)}`)
  }
  if (!bullets.length && summary.summary) bullets.push(summary.summary)
  return bullets.slice(0, 3)
}

export function cctaAssistBullets(summary: ReportAiSummary | null): string[] {
  if (!summary) return []
  const text = summary.summary || ''
  const bullets = ['관상동맥 석회화 분석 결과가 있습니다.']
  const agatston = text.match(/agatston[^\d]*(\d+(?:\.\d+)?)/i)
  if (agatston) bullets.push(`Agatston ${agatston[1]}`)
  return bullets.slice(0, 2)
}

export function impressionBullets(detail: MedicalResultDetail | null): string[] {
  const fromConclusion = (detail?.conclusion || detail?.summary || '')
    .split(/\n|•|\u2022/)
    .map((line) => line.replace(/^[\d.\-\s]+/, '').trim())
    .filter((line) => line.length > 8)
  if (fromConclusion.length) return fromConclusion.slice(0, 4)
  const bullets: string[] = []
  const clinical = clinicalAssistCopy(detail?.aiSummaries.clinical ?? null)
  if (clinical.headline) bullets.push(clinical.headline)
  bullets.push(...xcaAssistBullets(detail?.aiSummaries.xca ?? null).slice(0, 2))
  bullets.push(...cctaAssistBullets(detail?.aiSummaries.ccta ?? null).slice(0, 1))
  return bullets.slice(0, 4)
}

export function synthesisHeadline(detail: MedicalResultDetail | null): string {
  const source = detail?.conclusion?.trim() || detail?.summary?.trim() || ''
  if (source) {
    const first = source.split(/[\n.。]/).map((line) => line.trim()).find(Boolean) || source
    return first.length > 88 ? `${first.slice(0, 85)}…` : first
  }
  const hasAny = detail?.aiSummaries.clinical || detail?.aiSummaries.xca || detail?.aiSummaries.ccta
  if (!hasAny) return ''
  return 'Clinical · XCA · CCTA 결과를 종합해 추가 평가가 필요할 수 있습니다.'
}

export function nextStepRecommendations(detail: MedicalResultDetail | null): string[] {
  if (!detail) return []
  const steps: string[] = []
  const xca = detail.aiSummaries.xca
  const significant = xca?.sides.some((side) => (side.significantStenosis ?? 0) > 0.5) || /signif|협착/i.test(xca?.summary || '')
  if (significant) steps.push('CAG 또는 PCI 여부를 임상적으로 검토하세요.')
  if (detail.aiSummaries.ccta) steps.push('석회화 부담을 고려한 추가적인 기능적 허혈 평가를 검토하세요.')
  if (detail.aiSummaries.clinical) steps.push('필요 시 심장혈관 관련 협진을 고려하세요.')
  if (!steps.length) steps.push('현재 분석 결과를 임상정보와 함께 검토한 뒤 다음 검사를 결정하세요.')
  return steps.slice(0, 3)
}

export function matchRecommendedOrderTypes<T extends { name: string; code: string; category: string }>(types: T[]): T[] {
  const keys = ['CAG', 'CCTA', 'TTE', 'MPI', 'TREADMILL', '관상동맥', '심장초음파', '운동부하', '심근관류']
  return types.filter((type) => keys.some((key) => `${type.name} ${type.code} ${type.category}`.toUpperCase().includes(key.toUpperCase())))
}

export function orderCategoryTab(category: string, name: string, code: string): 'exam' | 'procedure' | 'other' {
  const haystack = `${category} ${name} ${code}`.toUpperCase()
  if (haystack.includes('PCI') || haystack.includes('PROCEDURE') || haystack.includes('시술') || haystack.includes('CAG')) return 'procedure'
  if (haystack.includes('LAB') || haystack.includes('OTHER') || haystack.includes('CONSULT')) return 'other'
  return 'exam'
}

export type DurTone = 'ok' | 'warn' | 'alert' | 'muted'

export function durToneFromResults(results: Array<{ severity?: string }>): DurTone {
  const levels = results.map((item) => String(item.severity || '').toUpperCase())
  if (levels.some((level) => level === 'CRITICAL')) return 'alert'
  if (levels.some((level) => level === 'WARNING' || level === 'WARN')) return 'warn'
  if (results.length === 0) return 'ok'
  return 'warn'
}
