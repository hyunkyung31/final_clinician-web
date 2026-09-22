import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { compileTestModule } from './load-api-test-module.mjs'

const { isImagingStudyOwnedByPatient } = await import(compileTestModule(
  readFileSync(new URL('../src/api/imagingOwnership.ts', import.meta.url), 'utf8'),
))

const study = (patientId) => ({
  id: 1032,
  examinationId: 534,
  patientId,
  studyInstanceUid: 'demo-study',
  modality: 'CT',
  description: 'CCTA',
  studyDate: '2026-08-30',
  status: 'AVAILABLE',
})

test('CCTA study is selectable only for its owning patient', () => {
  assert.equal(isImagingStudyOwnedByPatient(study(537), 537), true)
  assert.equal(isImagingStudyOwnedByPatient(study(537), 459), false)
})

test('CCTA study with an unknown owner is not selectable', () => {
  assert.equal(isImagingStudyOwnedByPatient(study(undefined), 537), false)
  assert.equal(isImagingStudyOwnedByPatient(study(537), null), false)
})
