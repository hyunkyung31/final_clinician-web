export const SECTION_STORAGE_KEY = 'angiocad.active-section'

export const APP_SHELL_NAV_WIDTH = '64px'
export const APP_SHELL_CHAT_RAIL_WIDTH = '48px'
export const APP_SHELL_CHAT_PANE_WIDTH = '340px'
export const APP_SHELL_HEADER_HEIGHT = '64px'

export const HOME_RECENT_LIMIT = 5
export const HOME_TODO_LIMIT = 4
export const HOME_NOTICE_LIMIT = 4
export const HOME_CONSULT_LIMIT = 3
export const HOME_KPI_DESTINATIONS = [
  '일정',
  '검사·영상',
  '워크스테이션',
  '협진',
  '결과보고서',
  'angiocad:open-notifications',
] as const

export const GLOBAL_SECTIONS = [
  '홈',
  '워크스테이션',
  '일정',
  '예약',
  '환자 관리',
  '검사·영상',
  'AI 분석',
  '시술기록',
  '협진',
  '채팅',
  '결과보고서',
  '설정',
] as const

export type AppShellSection = (typeof GLOBAL_SECTIONS)[number]

const PATIENT_CONTEXT_SECTIONS = new Set<AppShellSection>([
  '워크스테이션',
  '환자 관리',
  '검사·영상',
  'AI 분석',
  '시술기록',
  '결과보고서',
])

export function isAppShellSection(value: string | null | undefined): value is AppShellSection {
  return Boolean(value && (GLOBAL_SECTIONS as readonly string[]).includes(value))
}

export function landingSectionAfterLogin(): AppShellSection {
  return '홈'
}

export function initialActiveSection(hasSession: boolean, stored: string | null | undefined): AppShellSection {
  if (!hasSession) return '홈'
  if (isAppShellSection(stored) && stored !== '채팅') return stored
  return '홈'
}

export function fallbackSectionForRole(
  current: AppShellSection,
  allowed: Iterable<string>,
): AppShellSection {
  const allowedSet = new Set(allowed)
  if (current !== '채팅' && allowedSet.has(current)) return current
  if (allowedSet.has('홈')) return '홈'
  const first = [...allowedSet].find((section) => isAppShellSection(section) && section !== '채팅')
  return first && isAppShellSection(first) ? first : '홈'
}

export function pageHeaderCopy(
  section: AppShellSection,
  patient?: { name?: string; id?: string } | null,
) {
  if (section === '워크스테이션' && patient?.name && patient?.id) {
    return { title: `${patient.name} / ${patient.id}`, subtitle: '워크스테이션' }
  }

  const titles: Record<AppShellSection, { title: string; subtitle: string }> = {
    '홈': { title: '오늘의 업무', subtitle: '' },
    '워크스테이션': { title: '워크스테이션', subtitle: '' },
    '일정': { title: '일정', subtitle: '' },
    '예약': { title: '예약', subtitle: '' },
    '환자 관리': { title: '환자 관리', subtitle: '' },
    '검사·영상': { title: '검사·영상', subtitle: '' },
    'AI 분석': { title: 'AI 분석', subtitle: '' },
    '시술기록': { title: '시술기록', subtitle: '' },
    '협진': { title: '협진', subtitle: '' },
    '채팅': { title: '채팅', subtitle: '' },
    '결과보고서': { title: '결과보고서', subtitle: '' },
    '설정': { title: '설정', subtitle: '' },
  }

  return titles[section]
}

export function showChatPatientContext(section: AppShellSection) {
  return PATIENT_CONTEXT_SECTIONS.has(section)
}
