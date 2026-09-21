import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const workspace = readFileSync(new URL('../src/components/ConsultationWorkspace.tsx', import.meta.url), 'utf8')
const workflow = readFileSync(new URL('../src/components/consultationWorkflow.ts', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/consultation.css', import.meta.url), 'utf8')
const client = readFileSync(new URL('../src/api/client.ts', import.meta.url), 'utf8')

test('consultation screens drop due-date and ward UI while keeping legacy due_at mapping', () => {
  assert.equal(workspace.includes('회신 희망 기한'), false)
  assert.equal(workspace.includes('병동·위치'), false)
  assert.equal(workspace.includes('기한 경과'), false)
  assert.equal(workspace.includes('연동 정보 없음'), false)
  assert.match(workspace, /assigneeDisplay/)
  assert.match(workspace, /요청 시간/)
  assert.match(workflow, /미배정/)
  assert.match(css, /repeat\(3/)
  assert.match(client, /requested_by_profile/)
  assert.match(client, /assigned_doctor_profile/)
  assert.match(client, /dueAt: readString\(record, 'due_at'\)/)
})
