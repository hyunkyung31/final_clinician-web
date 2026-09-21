export const LAB_REFERENCE_LABELS = {
  inRange: '정상범위 내',
  outOfRange: '정상범위 외',
  noReference: '기준 없음',
  noResult: '결과 없음',
  tableStatusHeader: '참고범위 기준',
  referencePrefix: '참고범위',
  disclaimer: '참고범위 기준 표시이며, 임상적 판단을 대체하지 않습니다.',
} as const

export type LabReferenceStatus = 'IN_RANGE' | 'OUT_OF_RANGE' | 'NO_REFERENCE' | 'NO_RESULT'

export type LabStatusInput = {
  id?: number | string
  code?: string
  name?: string
  unit?: string
  flag?: string | null
  abnormalFlag?: string | null
  value?: number | null
  valueNumeric?: number | null
  textValue?: string | null
  valueText?: string | null
  referenceLow?: number
  referenceHigh?: number
  referenceRangeText?: string
}

export type LabReferenceCounts = {
  total: number
  inRange: number
  outOfRange: number
  noReference: number
  noResult: number
}

const OUT_OF_RANGE_FLAGS = new Set([
  'HIGH',
  'LOW',
  'CRITICAL_HIGH',
  'CRITICAL_LOW',
  'ABNORMAL',
])

export function hasLabResultValue(item: LabStatusInput): boolean {
  if (item.value != null || item.valueNumeric != null) return true
  const text = String(item.textValue ?? item.valueText ?? '').trim()
  return text !== '' && text !== '-'
}

export function hasLabReference(item: LabStatusInput): boolean {
  return item.referenceLow !== undefined || item.referenceHigh !== undefined || Boolean(item.referenceRangeText)
}

export function labFlagValue(item: LabStatusInput): string {
  return String(item.flag ?? item.abnormalFlag ?? '').toUpperCase()
}

export function isCriticalLabFlag(item: LabStatusInput): boolean {
  const flag = labFlagValue(item)
  return flag === 'CRITICAL_HIGH' || flag === 'CRITICAL_LOW'
}

export function labReferenceStatus(item: LabStatusInput): LabReferenceStatus {
  if (!hasLabResultValue(item)) return 'NO_RESULT'
  const flag = labFlagValue(item)
  if (flag === 'NORMAL') return 'IN_RANGE'
  if (OUT_OF_RANGE_FLAGS.has(flag)) return 'OUT_OF_RANGE'
  return 'NO_REFERENCE'
}

export function labReferenceStatusLabel(status: LabReferenceStatus): string {
  if (status === 'IN_RANGE') return LAB_REFERENCE_LABELS.inRange
  if (status === 'OUT_OF_RANGE') return LAB_REFERENCE_LABELS.outOfRange
  if (status === 'NO_RESULT') return LAB_REFERENCE_LABELS.noResult
  return LAB_REFERENCE_LABELS.noReference
}

export function labReferenceStatusClass(status: LabReferenceStatus): string {
  if (status === 'IN_RANGE') return 'in-range'
  if (status === 'OUT_OF_RANGE') return 'out-of-range'
  if (status === 'NO_RESULT') return 'no-result'
  return 'no-reference'
}

export function countLabReferenceStatuses(items: LabStatusInput[]): LabReferenceCounts {
  return items.reduce<LabReferenceCounts>(
    (counts, item) => {
      counts.total += 1
      const status = labReferenceStatus(item)
      if (status === 'IN_RANGE') counts.inRange += 1
      else if (status === 'OUT_OF_RANGE') counts.outOfRange += 1
      else if (status === 'NO_RESULT') counts.noResult += 1
      else counts.noReference += 1
      return counts
    },
    { total: 0, inRange: 0, outOfRange: 0, noReference: 0, noResult: 0 },
  )
}

export function labVisitHistoryLabel(count: number): string {
  return `추적검사 ${count}회`
}

export function labCountPhrases(counts: LabReferenceCounts) {
  return {
    total: `총 ${counts.total}항목`,
    inRange: `${LAB_REFERENCE_LABELS.inRange} ${counts.inRange}`,
    outOfRange: `${LAB_REFERENCE_LABELS.outOfRange} ${counts.outOfRange}`,
    noReference: counts.noReference > 0 ? `${LAB_REFERENCE_LABELS.noReference} ${counts.noReference}` : '',
    noResult: counts.noResult > 0 ? `${LAB_REFERENCE_LABELS.noResult} ${counts.noResult}` : '',
  }
}

export function formatLabNumber(value: number): string {
  if (!Number.isFinite(value)) return String(value)
  return String(Number(value.toFixed(4)))
}

export function formatLabReferenceText(text: string): string {
  return text
    .replace(/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g, (match) => {
      const n = Number(match)
      return Number.isFinite(n) ? formatLabNumber(n) : match
    })
    .replace(/<=/g, '≤')
    .replace(/>=/g, '≥')
    .replace(/(\d)\s*-\s*(?=\d)/g, '$1–')
}

export function formatLabReferenceDisplay(item: LabStatusInput): string {
  if (item.referenceRangeText) return formatLabReferenceText(item.referenceRangeText)
  if (item.referenceLow !== undefined && item.referenceHigh !== undefined) {
    return `${formatLabNumber(item.referenceLow)}–${formatLabNumber(item.referenceHigh)}`
  }
  if (item.referenceLow !== undefined) return `≥ ${formatLabNumber(item.referenceLow)}`
  if (item.referenceHigh !== undefined) return `≤ ${formatLabNumber(item.referenceHigh)}`
  return LAB_REFERENCE_LABELS.noReference
}
