import test from 'node:test'
import assert from 'node:assert/strict'
import { loadApiTestModule } from './load-api-test-module.mjs'

globalThis.sessionStorage = { getItem: () => 'test-token', removeItem: () => {} }

const emptySchema = { paths: { '/api/patients/': { get: { parameters: [] } } } }

function makePatientListResponse(count, results) {
  return { count, next: null, previous: null, results }
}

test('patient list request does not force scope=all (would leak non-demo source patients)', async () => {
  const { getPatientsPage } = await loadApiTestModule()
  const requestedUrls = []
  globalThis.fetch = async (url) => {
    requestedUrls.push(String(url))
    if (String(url).startsWith('/api/schema/')) return Response.json(emptySchema)
    return Response.json(makePatientListResponse(100, []))
  }
  await getPatientsPage('', false, { page: 1, size: 50 })
  const patientsRequest = requestedUrls.find((url) => url.startsWith('/api/patients/'))
  assert.ok(patientsRequest, 'expected a request to /api/patients/')
  const params = new URL(patientsRequest, 'http://localhost').searchParams
  assert.equal(params.get('scope'), null)
  assert.equal(params.get('size'), '50')
  assert.equal(params.get('page'), '1')
})

test('patient list page/count/hasNext are read from the backend pagination contract', async () => {
  const { getPatientsPage } = await loadApiTestModule()
  globalThis.fetch = async (url) => {
    if (String(url).startsWith('/api/schema/')) return Response.json(emptySchema)
    return Response.json({
      count: 100,
      next: 'https://api.example.com/api/patients/?page=2&size=50',
      previous: null,
      results: [{ id: 1, medical_record_no: 'DEMO-0001', name: '홍길동', birth_date: '1970-01-01', gender: 'M', contact: '010-0000-0000', registered_at: '2024-01-01T00:00:00Z' }],
    })
  }
  const page = await getPatientsPage('', false, { page: 1, size: 50 })
  assert.equal(page.count, 100)
  assert.equal(page.hasNext, true)
  assert.equal(page.page, 1)
  assert.equal(page.results.length, 1)
})

test('patient search keyword is forwarded as the backend "search" query param', async () => {
  const { getPatientsPage } = await loadApiTestModule()
  const requestedUrls = []
  globalThis.fetch = async (url) => {
    requestedUrls.push(String(url))
    if (String(url).startsWith('/api/schema/')) return Response.json(emptySchema)
    return Response.json(makePatientListResponse(1, []))
  }
  await getPatientsPage('홍길동', false, { page: 1, size: 50 })
  const patientsRequest = requestedUrls.find((url) => url.startsWith('/api/patients/'))
  const params = new URL(patientsRequest, 'http://localhost').searchParams
  assert.equal(params.get('search'), '홍길동')
})
