export type ProcedureDeviceCategoryName = 'SHEATH' | 'CATHETER' | 'GUIDEWIRE' | 'BALLOON' | 'STENT' | 'IVUS_OCT' | 'HEMOSTASIS' | 'OTHER'

export type ProcedureTimelineSource =
  | 'PROCEDURE_EVENT'
  | 'MEDICATION_ADMINISTRATION'
  | 'DEVICE_USAGE'
  | 'LEGACY_EVENT'

const MATERIAL_EVENT_CATEGORIES = new Set([
  '혈관 접근',
  '약물 투여',
  'CAG',
  'PCI 시작',
  'Guidewire',
  'Balloon',
  'Stent',
  '확인',
  '종료',
])

export function procedureEventSource(input: {
  eventCategory: string
  medicationOrDevice: string
  prescriptionItemId?: number
}): ProcedureTimelineSource {
  if (input.prescriptionItemId !== undefined || input.eventCategory === '약물 투여') return 'LEGACY_EVENT'
  if (input.medicationOrDevice.trim() && MATERIAL_EVENT_CATEGORIES.has(input.eventCategory)) return 'LEGACY_EVENT'
  return 'PROCEDURE_EVENT'
}

export function deviceCategoryLabel(category: ProcedureDeviceCategoryName): string {
  switch (category) {
    case 'SHEATH': return '혈관 접근'
    case 'CATHETER': return 'CAG'
    case 'GUIDEWIRE': return 'Guidewire'
    case 'BALLOON': return 'Balloon'
    case 'STENT': return 'Stent'
    case 'IVUS_OCT': return '확인'
    case 'HEMOSTASIS': return '종료'
    case 'OTHER': return '확인'
  }
}

export function isDeviceTimelineCategory(category: string): boolean {
  return category === 'Guidewire' || category === 'Balloon' || category === 'Stent'
}

export function resolvedTimelineContent(sourceType: ProcedureTimelineSource, content: string, material: string): string {
  const normalizedContent = content.trim()
  if (normalizedContent) return normalizedContent
  return sourceType === 'DEVICE_USAGE' ? material.trim() : ''
}

export function syncedDeviceContent(
  sourceType: ProcedureTimelineSource,
  content: string,
  previousMaterial: string,
  nextMaterial: string,
): string {
  if (sourceType !== 'DEVICE_USAGE') return content
  const normalizedContent = content.trim().toLowerCase()
  const normalizedPreviousMaterial = previousMaterial.trim().toLowerCase()
  return !normalizedContent || normalizedContent === normalizedPreviousMaterial ? nextMaterial : content
}

export interface TimelineSortItem {
  id: string
  occurredAt?: string
  time: string
}

export function compareTimelineItems(a: TimelineSortItem, b: TimelineSortItem): number {
  const aTime = Date.parse(a.occurredAt || '')
  const bTime = Date.parse(b.occurredAt || '')
  const aValue = Number.isFinite(aTime) ? aTime : Number.MAX_SAFE_INTEGER
  const bValue = Number.isFinite(bTime) ? bTime : Number.MAX_SAFE_INTEGER
  if (aValue !== bValue) return aValue - bValue
  return a.time.localeCompare(b.time) || a.id.localeCompare(b.id)
}
