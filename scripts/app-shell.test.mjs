import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { compileTestModule } from './load-api-test-module.mjs'

const {
  landingSectionAfterLogin,
  initialActiveSection,
  fallbackSectionForRole,
  pageHeaderCopy,
  showChatPatientContext,
  APP_SHELL_CHAT_RAIL_WIDTH,
  APP_SHELL_CHAT_PANE_WIDTH,
  HOME_KPI_DESTINATIONS,
  HOME_RECENT_LIMIT,
  HOME_TODO_LIMIT,
  HOME_NOTICE_LIMIT,
  HOME_CONSULT_LIMIT,
} = await import(compileTestModule(readFileSync(new URL('../src/appShell.ts', import.meta.url), 'utf8')))

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const header = readFileSync(new URL('../src/components/AppPageHeader.tsx', import.meta.url), 'utf8')
const home = readFileSync(new URL('../src/components/HomeDashboard.tsx', import.meta.url), 'utf8')
const dock = readFileSync(new URL('../src/components/ChatDock.tsx', import.meta.url), 'utf8')
const notifications = readFileSync(new URL('../src/components/NotificationCenter.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
const shellCss = css.slice(css.lastIndexOf('APP SHELL'))

test('login success lands on Home without forcing refresh away from Workstation', () => {
  assert.equal(landingSectionAfterLogin(), '홈')
  assert.equal(initialActiveSection(true, '워크스테이션'), '워크스테이션')
  assert.equal(initialActiveSection(true, '협진'), '협진')
  assert.equal(initialActiveSection(true, '채팅'), '홈')
  assert.equal(initialActiveSection(true, null), '홈')
  assert.equal(initialActiveSection(false, '워크스테이션'), '홈')
  const loginBlock = app.slice(app.indexOf('const handleLogin'), app.indexOf('const reloadPatientMemos'))
  assert.match(loginBlock, /landingSectionAfterLogin\(\)/)
  assert.match(loginBlock, /sessionStorage\.setItem\(SECTION_STORAGE_KEY, landing\)/)
  assert.match(loginBlock, /setActiveSection\(landing\)/)
  assert.equal(loginBlock.includes('워크스테이션'), false)
  assert.match(app, /sessionStorage\.getItem\(SECTION_STORAGE_KEY\)/)
})

test('unauthorized role fallback prefers Home instead of Workstation', () => {
  assert.equal(fallbackSectionForRole('홈', ['홈', '워크스테이션']), '홈')
  assert.equal(fallbackSectionForRole('워크스테이션', ['홈', '워크스테이션']), '워크스테이션')
  assert.equal(fallbackSectionForRole('결과보고서', ['홈', '설정']), '홈')
})

test('common utility header groups notification, user, and chat toggle', () => {
  assert.match(header, /className="app-page-header"/)
  assert.match(header, /page-header-actions utility-actions/)
  assert.match(header, /utility-button/)
  assert.match(header, /utility-user/)
  assert.match(header, /userDepartment/)
  assert.match(app, /userDepartment=\{clinicianDepartment\}/)
  assert.match(shellCss, /min-width: 132px/)
  assert.match(app, /<AppPageHeader/)
  assert.match(app, /<NotificationCenter/)
  assert.match(notifications, /utility-button notification-trigger/)
  assert.match(shellCss, /\.utility-actions/)
  assert.match(shellCss, /\.notification-center \{[\s\S]*position: relative/)
  assert.equal(shellCss.includes('position: fixed'), false)
})

test('chat dock is a right-pane grid column instead of a floating overlay', () => {
  assert.equal(APP_SHELL_CHAT_RAIL_WIDTH, '48px')
  assert.equal(APP_SHELL_CHAT_PANE_WIDTH, '340px')
  assert.match(shellCss, /grid-template-columns:\s*var\(--nav-width\)\s+minmax\(0,\s*1fr\)\s+var\(--chat-width\)/)
  assert.match(shellCss, /--chat-width: 48px/)
  assert.match(shellCss, /--chat-width: 340px/)
  assert.match(shellCss, /\.chat-dock \{[\s\S]*position: relative/)
  assert.match(shellCss, /overflow-x:\s*hidden/)
  assert.match(app, /chat-dock-open/)
  assert.match(app, /chat-dock-collapsed/)
  assert.match(dock, /DUGN Assistant/)
  assert.match(dock, /patientContext/)
  assert.match(dock, /채팅 최소화/)
})

test('Home recent patient click resolves through patientSelection then Workstation', () => {
  assert.match(app, /resolveSelectedPatient\(String\(patientId\)/)
  assert.match(home, /onOpenPatient\(patient\.patientId\)/)
  assert.match(home, /HOME_RECENT_LIMIT/)
  assert.equal(HOME_RECENT_LIMIT, 5)
})

test('Home layout contract keeps KPI, ops row, notices, and compact status', () => {
  assert.deepEqual([...HOME_KPI_DESTINATIONS], [
    '일정',
    '검사·영상',
    '워크스테이션',
    '협진',
    '결과보고서',
    'angiocad:open-notifications',
  ])
  assert.equal(HOME_TODO_LIMIT, 4)
  assert.equal(HOME_NOTICE_LIMIT, 4)
  assert.equal(HOME_CONSULT_LIMIT, 3)
  assert.match(home, /home-ops-grid/)
  assert.match(home, /home-info-grid/)
  assert.match(home, /home-status-compact/)
  assert.match(home, /home-status-segment/)
  assert.match(home, /현재 검토 대기 없음/)
  assert.match(home, /onNavigate\('워크스테이션'\)/)
  assert.match(home, /onNavigate\('결과보고서'\)/)
  assert.match(home, /getStaffAnnouncements/)
  assert.match(home, /getDashboardConsultations/)
  assert.match(home, /createStaffTodo/)
  assert.match(shellCss, /grid-template-columns: minmax\(0, 48%\) minmax\(0, 27%\) minmax\(0, 25%\)/)
  assert.match(shellCss, /grid-template-columns: minmax\(0, 60%\) minmax\(0, 40%\)/)
  assert.equal(pageHeaderCopy('홈').title, '오늘의 업무')
  assert.equal(pageHeaderCopy('워크스테이션', { name: '안지민', id: 'DEMO-0002' }).title, '안지민 / DEMO-0002')
  assert.equal(showChatPatientContext('워크스테이션'), true)
  assert.equal(showChatPatientContext('홈'), false)
  assert.equal(showChatPatientContext('협진'), false)
})
