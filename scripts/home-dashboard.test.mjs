import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const home = readFileSync(new URL('../src/components/HomeDashboard.tsx', import.meta.url), 'utf8')
const consultation = readFileSync(new URL('../src/components/ConsultationWorkspace.tsx', import.meta.url), 'utf8')

test('header To-do icon is not mounted next to notifications', () => {
  assert.equal(app.includes('TodoCenter'), false)
  assert.match(app, /NotificationCenter/)
  assert.equal(home.includes('angiocad:open-todos'), false)
})

test('dashboard To-do card can add and persist through existing staff API', () => {
  assert.match(home, /To-do 추가/)
  assert.match(home, /createStaffTodo/)
  assert.match(home, /updateStaffTodo/)
  assert.match(home, /생성/)
  assert.match(home, /취소/)
})

test('dashboard notice list uses announcement API and user-facing empty/error copy', () => {
  assert.match(home, /getStaffAnnouncements/)
  assert.match(home, /등록된 공지사항이 없습니다/)
  assert.match(home, /공지사항을 불러오지 못했습니다/)
  assert.equal(home.includes('API 연결 필요'), false)
  assert.equal(home.includes('API 요청에 실패했습니다'), false)
})

test('consultation workspace hides developer 500 status text', () => {
  assert.match(consultation, /ApiError/)
  assert.match(consultation, /error\.status >= 500/)
  assert.match(consultation, /협진 상태 변경에 실패했습니다/)
})
