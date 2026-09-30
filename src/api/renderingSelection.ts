import type { Rendering3DSummary } from '../types'

export type AnatomyViewMode = 'FULL_ANATOMY' | 'CORONARY_CALCIFICATION' | 'CALCIFICATION_ONLY'

export const RENDERING_KINDS = [
  { value: 'VESSEL_ONLY', label: '혈관' },
  { value: 'CALCIFICATION_ONLY', label: '석회화' },
  { value: 'VESSEL_CALCIFICATION', label: '혈관 + 석회화' },
  { value: 'CENTERLINE', label: '중심선' },
] as const

export const ANATOMY_VIEW_MODES: Array<{ value: AnatomyViewMode; label: string }> = [
  { value: 'FULL_ANATOMY', label: '전체 구조' },
  { value: 'CORONARY_CALCIFICATION', label: '관상동맥 + 석회화' },
  { value: 'CALCIFICATION_ONLY', label: '석회화만' },
]

export const LOCAL_ANATOMY_GLB_URL = '/test/anatomy.glb?v=yup'

/** 공통 anatomy.glb는 명시적인 테스트 URL에서만 사용한다. */
export const SHOW_ANATOMY_GLB_ON_CCTA_3D = false

export const CCTA_SUPPORTED_RENDERING_TYPES = ['CALCIFICATION_ONLY'] as const

export function isLocalAnatomyGlbTest() {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search)
    if (params.has('anatomyTest')) return true
    if (window.location.pathname.replace(/\/$/, '') === '/anatomy-test') return true
  }
  return SHOW_ANATOMY_GLB_ON_CCTA_3D
}

export function isAnatomyGlbFormat(format?: string) {
  const normalized = (format ?? '').toUpperCase()
  return normalized === 'GLB' || normalized === 'GLTF'
}

export function hasAnatomyGlbCapability(input: {
  rendering?: Rendering3DSummary | null
  fileFormat?: string
  localAnatomy?: boolean
}) {
  if (input.localAnatomy || isLocalAnatomyGlbTest()) return true
  const rendering = input.rendering
  const format = input.fileFormat || rendering?.fileFormat
  if (!isAnatomyGlbFormat(format)) return false
  const components = rendering?.renderingConfig?.components
  if (Array.isArray(components)) {
    return components.some((item) => /heart|aorta|coronary|calcif/i.test(String(item)))
  }
  return rendering?.renderingType === 'VESSEL_CALCIFICATION' || isAnatomyGlbFormat(format)
}

export function renderingLabel(kind: string) {
  return RENDERING_KINDS.find((item) => item.value === kind)?.label ?? kind
}

export function preferredRendering(items: Rendering3DSummary[], kind: string) {
  const priority = (status: string) => status === 'COMPLETED' ? 0 : status === 'PROCESSING' ? 1 : status === 'PENDING' ? 2 : 3
  return items.filter((item) => item.renderingType === kind).sort((a, b) => priority(a.status) - priority(b.status) || b.version - a.version || b.id - a.id)[0]
}

/** 새 환자·검사를 열 때 환자별 전체 해부학 GLB를 우선하고, 없으면 현재 종류를 유지한다. */
export function preferredInitialRendering(items: Rendering3DSummary[], currentKind: string) {
  return preferredRendering(items, 'VESSEL_CALCIFICATION')
    ?? preferredRendering(items, currentKind)
    ?? [...items].sort((a, b) => {
      const priority = (status: string) => status === 'COMPLETED' ? 0 : status === 'PROCESSING' ? 1 : status === 'PENDING' ? 2 : 3
      return priority(a.status) - priority(b.status) || b.version - a.version || b.id - a.id
    })[0]
}

export function isCctaGeneration(input: { modality?: string; generationType?: string }) {
  if (input.generationType === 'CCTA') return true
  if (input.generationType === 'ANGIO_2D_TO_3D') return false
  return (input.modality ?? '').toUpperCase() === 'CT'
}

/** CCTA COCA U-Net은 석회화만 생성한다. 이미 DB에 있는 다른 타입은 그대로 보여 준다. */
export function visibleRenderingKinds(input: {
  modality?: string
  generationType?: string
  existingTypes?: string[]
}) {
  const existing = new Set((input.existingTypes ?? []).filter(Boolean))
  if (!isCctaGeneration(input)) return [...RENDERING_KINDS]
  return RENDERING_KINDS.filter(
    (kind) => CCTA_SUPPORTED_RENDERING_TYPES.includes(kind.value as (typeof CCTA_SUPPORTED_RENDERING_TYPES)[number]) || existing.has(kind.value),
  )
}
