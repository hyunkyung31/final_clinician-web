import type { Rendering3DSummary } from '../types'

export const RENDERING_KINDS = [
  { value: 'VESSEL_ONLY', label: '혈관' },
  { value: 'CALCIFICATION_ONLY', label: '석회화' },
  { value: 'VESSEL_CALCIFICATION', label: '혈관 + 석회화' },
  { value: 'CENTERLINE', label: '중심선' },
] as const

export function renderingLabel(kind: string) {
  return RENDERING_KINDS.find((item) => item.value === kind)?.label ?? kind
}

export function preferredRendering(items: Rendering3DSummary[], kind: string) {
  const priority = (status: string) => status === 'COMPLETED' ? 0 : status === 'PROCESSING' ? 1 : status === 'PENDING' ? 2 : 3
  return items.filter((item) => item.renderingType === kind).sort((a, b) => priority(a.status) - priority(b.status) || b.version - a.version || b.id - a.id)[0]
}
