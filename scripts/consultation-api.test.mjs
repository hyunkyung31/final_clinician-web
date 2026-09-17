import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
// Isolated API adapter tests: replace the build-time env and use only in-memory fetch responses.
const source = readFileSync(new URL('../src/api/client.ts', import.meta.url), 'utf8').replace(/import\.meta\.env/g, '({ VITE_API_BASE_URL: "" })')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
globalThis.sessionStorage = { getItem: () => null, removeItem: () => {} }
const { getConsultations } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'))
test('consultation adapter follows pagination on own API and maps identity, location, canceled status', async () => {
  const paths = []
  globalThis.fetch = async (path) => {
    paths.push(path)
    return Response.json(path.endsWith('?page=2') ? { next: null, results: [{ id: 2, status: 'CANCELLED', patient: { id: 101, medical_record_no: 'QA-0101', ward_name: 'QA 병동' }, requested_by: { id: 10, name: 'QA 요청자', department_name: 'QA 의뢰과' }, assigned_doctor: { id: 7, name: 'QA 담당자', department_name: 'QA 수신과' } }] } : { next: 'https://backend.example/api/consultations/?page=2', results: [{ id: 1, requested_by: 10, assigned_doctor_id: 7 }] })
  }
  const items = await getConsultations()
  assert.deepEqual(paths, ['/api/consultations/', '/api/consultations/?page=2'])
  assert.equal(items.length, 2)
  assert.equal(items[0].requestedById, 10)
  assert.equal(items[1].status, 'CANCELED')
  assert.equal(items[1].patientNumber, 'QA-0101')
  assert.equal(items[1].patientLocation, 'QA 병동')
  assert.equal(items[1].requestedById, 10)
  assert.equal(items[1].assignedDoctorId, 7)
  assert.equal(items[1].assignedDepartmentName, 'QA 수신과')
})
test('unsafe next path and repeated pages fail instead of leaking credentials or silently truncating', async () => {
  globalThis.fetch = async () => Response.json({ next: '/api/other/', results: [] })
  await assert.rejects(getConsultations(), /다음 페이지 경로/)
  globalThis.fetch = async () => Response.json({ next: '/api/consultations/', results: [] })
  await assert.rejects(getConsultations(), /반복/)
})
