import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { groupingModuleUrl, xcaModuleUrl, xcaDetailsModuleUrl, xcaReportModuleUrl } from './load-api-test-module.mjs'
// Isolated API adapter tests: replace the build-time env and use only in-memory fetch responses.
const source = readFileSync(new URL('../src/api/client.ts', import.meta.url), 'utf8').replace(/import\.meta\.env/g, '({ VITE_API_BASE_URL: "" })')
const compiled = ts.transpileModule(source.replace("'./angiographyGrouping'", JSON.stringify(groupingModuleUrl)).replace("'./xcaAnalysis'", JSON.stringify(xcaModuleUrl)).replace("'./xcaDetails'", JSON.stringify(xcaDetailsModuleUrl)).replace("'./xcaReport'", JSON.stringify(xcaReportModuleUrl)), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
globalThis.sessionStorage = { getItem: () => null, removeItem: () => {} }
const { getConsultations, getConsultationDetail, createConsultation } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'))
test('consultation adapter follows pagination on own API and maps identity, location, canceled status', async () => {
  const paths = []
  globalThis.fetch = async (path) => {
    paths.push(path)
    return Response.json(path.endsWith('?page=2') ? { next: null, results: [{ id: 2, status: 'CANCELLED', patient: { id: 101, medical_record_no: 'QA-0101', ward_name: 'QA 병동' }, requested_by: { id: 10, name: 'QA 요청자', department_name: 'QA 의뢰과' }, assigned_doctor: { id: 7, name: 'QA 담당자', department_name: 'QA 수신과' } }] } : { next: 'https://backend.example/api/consultations/?page=2', results: [{ id: 1, requested_by: 22, assigned_doctor_id: 7, requested_by_profile: { staff_id: 10, doctor_id: 22, name: 'QA 요청', department_name: '순환기내과' }, assigned_doctor_profile: { staff_id: 3, doctor_id: 7, name: 'QA 담당', department_name: '심장내과' } }] })
  }
  const items = await getConsultations()
  assert.deepEqual(paths, ['/api/consultations/', '/api/consultations/?page=2'])
  assert.equal(items.length, 2)
  assert.equal(items[0].requestedById, 10)
  assert.equal(items[0].requestedByName, 'QA 요청')
  assert.equal(items[0].requestedDepartmentName, '순환기내과')
  assert.equal(items[0].assignedDoctorName, 'QA 담당')
  assert.equal(items[1].status, 'CANCELED')
  assert.equal(items[1].patientNumber, 'QA-0101')
  assert.equal(items[1].patientLocation, 'QA 병동')
  assert.equal(items[1].requestedById, 10)
  assert.equal(items[1].assignedDoctorId, 7)
  assert.equal(items[1].assignedDepartmentName, 'QA 수신과')
})
test('staff profiles fill names and null assigned doctor stays unassigned', async () => {
  globalThis.fetch = async () => Response.json({
    next: null,
    results: [
      {
        id: 1,
        requested_by: 4,
        assigned_doctor: 3,
        requested_by_profile: { staff_id: 7, doctor_id: 4, name: '이서준', department_name: '순환기내과' },
        assigned_doctor_profile: { staff_id: 6, doctor_id: 3, name: '김도윤', department_name: '순환기내과' },
        due_at: '2026-09-19T18:02:20Z',
        created_at: '2026-09-19T18:13:25Z',
      },
      {
        id: 2,
        requested_by: 4,
        assigned_doctor: null,
        requested_by_profile: { staff_id: 7, doctor_id: 4, name: '이서준', department_name: '순환기내과' },
        assigned_doctor_profile: null,
      },
    ],
  })
  const items = await getConsultations()
  assert.equal(items[0].requestedById, 7)
  assert.equal(items[0].requestedByName, '이서준')
  assert.equal(items[0].assignedDoctorId, 3)
  assert.equal(items[0].assignedDoctorName, '김도윤')
  assert.equal(items[0].dueAt, '2026-09-19T18:02:20Z')
  assert.equal(items[1].assignedDoctorId, undefined)
  assert.equal(items[1].assignedDoctorName, '')
})
test('consultation detail maps author profile without treating integer FKs as names', async () => {
  globalThis.fetch = async () => Response.json({
    id: 1,
    requested_by: 4,
    assigned_doctor: 3,
    requested_by_profile: { staff_id: 7, doctor_id: 4, name: '이서준', department_name: '순환기내과' },
    assigned_doctor_profile: { staff_id: 6, doctor_id: 3, name: '김도윤', department_name: '순환기내과' },
    due_at: '2026-09-19T18:02:20Z',
    opinions: [{ id: 9, author_profile: { name: '김도윤' }, opinion_text: '최종 소견', is_final: true, created_at: '2026-09-21T01:00:00Z' }],
  })
  const detail = await getConsultationDetail(1)
  assert.equal(detail.consultation.requestedByName, '이서준')
  assert.equal(detail.consultation.assignedDoctorName, '김도윤')
  assert.equal(detail.consultation.dueAt, '2026-09-19T18:02:20Z')
  assert.equal(detail.opinions[0].doctorName, '김도윤')
})
test('create consultation omits due_at unless a value is provided', async () => {
  const bodies = []
  globalThis.fetch = async (_path, options) => {
    bodies.push(JSON.parse(options.body))
    return new Response('{}', { status: 201 })
  }
  await createConsultation({ patientId: 1, subject: 's', note: 'n', assignedDoctorId: 7, priority: 'NORMAL' })
  assert.equal('due_at' in bodies[0], false)
  await createConsultation({ patientId: 1, subject: 's', note: 'n', assignedDoctorId: 7, priority: 'NORMAL', dueAt: '2026-09-22T00:00:00Z' })
  assert.equal(bodies[1].due_at, '2026-09-22T00:00:00Z')
})
test('unsafe next path and repeated pages fail instead of leaking credentials or silently truncating', async () => {
  globalThis.fetch = async () => Response.json({ next: '/api/other/', results: [] })
  await assert.rejects(getConsultations(), /다음 페이지 경로/)
  globalThis.fetch = async () => Response.json({ next: '/api/consultations/', results: [] })
  await assert.rejects(getConsultations(), /반복/)
})
