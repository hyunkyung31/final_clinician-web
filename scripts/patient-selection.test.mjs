import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { compileTestModule } from './load-api-test-module.mjs'

const panel = readFileSync(new URL('../src/components/ClinicalAIAnalysisPanel.tsx', import.meta.url), 'utf8')
const workspace = readFileSync(new URL('../src/components/ExaminationImagingWorkspace.tsx', import.meta.url), 'utf8')
const moduleWorkspace = readFileSync(new URL('../src/components/ModuleWorkspace.tsx', import.meta.url), 'utf8')
const search = readFileSync(new URL('../src/components/ExaminationPatientSearch.tsx', import.meta.url), 'utf8')

const { resolveSelectedPatient, exactPatientSearchMatch, selectLabExaminationForPatient, patientExaminationMismatch } =
  await import(compileTestModule(readFileSync(new URL('../src/api/patientSelection.ts', import.meta.url), 'utf8')))

function patient(id, backendId, name) {
  return { id, backendId, name, sex: 'M', age: 50, exam: '', risk: 'normal', status: 'waiting', note: '' }
}

test('A: selecting DEMO-0001 after DEMO-0095 does not keep the previous patient', () => {
  const previous = patient('DEMO-0095', 1624, '홍유진')
  const next = patient('DEMO-0001', 1530, '박하준')
  const selected = resolveSelectedPatient('DEMO-0001', [[previous, next]])
  assert.equal(selected.id, 'DEMO-0001')
  assert.equal(selected.backendId, 1530)
  assert.notEqual(selected.id, previous.id)
})

test('selectedId never silently falls back to another patient', () => {
  const fallback = patient('DEMO-0095', 1624, '홍유진')
  assert.equal(resolveSelectedPatient('DEMO-0001', [[fallback]]), null)
  assert.equal(resolveSelectedPatient('', [[fallback]]), null)
})

test('B: lab examination is taken only from the current patient records', () => {
  const exam0001 = { exam: { examinationId: 1501 } }
  const exam0095 = { exam: { examinationId: 1661 } }
  assert.equal(
    selectLabExaminationForPatient([exam0001], 1661, 1530, 1530),
    undefined,
  )
  assert.equal(
    selectLabExaminationForPatient([exam0001], 1501, 1530, 1530)?.exam.examinationId,
    1501,
  )
  assert.equal(
    selectLabExaminationForPatient([exam0095], 1661, 1530, 1624),
    undefined,
  )
})

test('same-patient examination switch still uses the chosen exam', () => {
  const first = { exam: { examinationId: 1501 } }
  const second = { exam: { examinationId: 1502 } }
  assert.equal(
    selectLabExaminationForPatient([first, second], 1502, 1530, 1530)?.exam.examinationId,
    1502,
  )
})

test('C: mismatch guard blocks a previous patient examination', () => {
  const selected = patient('DEMO-0001', 1530, '박하준')
  assert.equal(patientExaminationMismatch(selected, { id: 1624, medicalRecordNo: 'DEMO-0095' }), true)
  assert.equal(patientExaminationMismatch(selected, { id: 1530, medicalRecordNo: 'DEMO-0001' }), false)
})

test('exact MRN search match auto-selects a single result', () => {
  const items = [patient('DEMO-0001', 1530, '박하준'), patient('DEMO-0002', 1531, '이민준')]
  assert.equal(exactPatientSearchMatch('DEMO-0001', items)?.id, 'DEMO-0001')
  assert.equal(exactPatientSearchMatch('DEMO-00', items), null)
})

test('Clinical AI submit is guarded against patient/examination mismatch', () => {
  assert.match(panel, /patientExaminationMismatch/)
  assert.match(panel, /Selected patient and examination patient mismatch/)
  assert.match(panel, /선택한 환자의 검사정보를 다시 불러와 주세요/)
  assert.match(panel, /examinationPatient/)
})

test('examination workspace remounts and resets on patient change', () => {
  assert.match(moduleWorkspace, /key=\{selectedPatient\?\.backendId/)
  assert.match(workspace, /selectLabExaminationForPatient/)
  assert.match(workspace, /followUpRecords\?\.patient\.id !== patient\?\.backendId/)
  assert.match(search, /exactPatientSearchMatch/)
})
