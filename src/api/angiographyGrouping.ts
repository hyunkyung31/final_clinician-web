import type { AngiographySequenceSummary, CoronarySide } from '../types'

export const coronarySideLabels: Record<CoronarySide, string> = {
  LEFT: '좌관상동맥',
  RIGHT: '우관상동맥',
  UNKNOWN: '미분류',
}

export function normalizeCoronarySide(value: unknown): CoronarySide {
  return value === 'LEFT' || value === 'RIGHT' ? value : 'UNKNOWN'
}

export interface AngiographyExaminationGroup {
  key: string
  examinationId?: number
  performedAt: string
  sequenceCount: number
  sides: { side: CoronarySide; label: string; sequences: AngiographySequenceSummary[] }[]
}

export function groupAngiographySequences(sequences: AngiographySequenceSummary[]): AngiographyExaminationGroup[] {
  const examinations = new Map<string, AngiographySequenceSummary[]>()
  for (const sequence of sequences) {
    // Missing examination references must not merge unrelated acquisitions.
    const key = sequence.examinationId !== undefined
      ? `examination-${sequence.examinationId}`
      : `unlinked-sequence-${sequence.id}`
    const items = examinations.get(key) ?? []
    items.push(sequence)
    examinations.set(key, items)
  }
  return [...examinations.entries()].map(([key, items]) => {
    const dates = items.map((item) => item.performedAt).filter(Boolean).sort()
    return {
      key,
      examinationId: items[0].examinationId,
      performedAt: dates[0] ?? '',
      sequenceCount: items.length,
      sides: (['LEFT', 'RIGHT', 'UNKNOWN'] as const).flatMap((side) => {
        const matching = items.filter((item) => normalizeCoronarySide(item.coronarySide) === side)
          .sort((a, b) => a.sequenceNo - b.sequenceNo || a.id - b.id)
        return matching.length ? [{ side, label: coronarySideLabels[side], sequences: matching }] : []
      }),
    }
  }).sort((a, b) => b.performedAt.localeCompare(a.performedAt) || a.key.localeCompare(b.key, undefined, { numeric: true }))
}
