import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { groupingModuleUrl, xcaModuleUrl, xcaDetailsModuleUrl, xcaReportModuleUrl } from './load-api-test-module.mjs'

const source = readFileSync(new URL('../src/api/client.ts', import.meta.url), 'utf8').replace(/import\.meta\.env/g, '({ VITE_API_BASE_URL: "" })')
const compiled = ts.transpileModule(source.replace("'./angiographyGrouping'", JSON.stringify(groupingModuleUrl)).replace("'./xcaAnalysis'", JSON.stringify(xcaModuleUrl)).replace("'./xcaDetails'", JSON.stringify(xcaDetailsModuleUrl)).replace("'./xcaReport'", JSON.stringify(xcaReportModuleUrl)), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
globalThis.sessionStorage = { getItem: () => null, removeItem: () => {} }
const { ApiError, getStaffAnnouncements, getStaffAnnouncement } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'))

test('announcement adapter maps published notices from /api/announcements/', async () => {
  const paths = []
  globalThis.fetch = async (path) => {
    paths.push(path)
    return Response.json([
      {
        id: 11,
        title: '시스템 점검 안내',
        body: '점검 본문',
        category: 'IT_SYSTEM',
        category_label: '전산·시스템',
        priority: 'IMPORTANT',
        priority_label: '중요',
        author: '시스템관리자',
        published_at: '2026-09-20T09:00:00Z',
        expires_at: null,
      },
    ])
  }
  const items = await getStaffAnnouncements()
  assert.deepEqual(paths, ['/api/announcements/'])
  assert.equal(items.length, 1)
  assert.equal(items[0].id, 11)
  assert.equal(items[0].title, '시스템 점검 안내')
  assert.equal(items[0].priority, 'IMPORTANT')
  assert.equal(items[0].publishedAt, '2026-09-20T09:00:00Z')
})

test('announcement detail uses existing staff announcement route', async () => {
  globalThis.fetch = async (path) => {
    assert.equal(path, '/api/announcements/11/')
    return Response.json({ id: 11, title: '상세 공지', body: '본문' })
  }
  const item = await getStaffAnnouncement(11)
  assert.equal(item.title, '상세 공지')
  assert.equal(item.body, '본문')
})

test('failed API fallback does not expose status codes', async () => {
  globalThis.fetch = async () => new Response('{}', { status: 500, headers: { 'content-type': 'application/json' } })
  await assert.rejects(getStaffAnnouncements(), (error) => {
    assert.equal(error instanceof ApiError, true)
    assert.equal(error.status, 500)
    assert.doesNotMatch(error.message, /500/)
    assert.doesNotMatch(error.message, /API 요청에 실패했습니다/)
    return true
  })
})
