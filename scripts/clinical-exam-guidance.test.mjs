import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { compileTestModule } from './load-api-test-module.mjs'

const { buildClinicalExamGuidance } = await import(
  compileTestModule(
    readFileSync(
      new URL('../src/clinicalExamGuidance.ts', import.meta.url),
      'utf8',
    ),
  )
)

test('critical source values take priority over imaging selection', () => {
  const guidance = buildClinicalExamGuidance({
    values: { 'Typical Chest Pain': '1' },
    prediction: 1,
    criticalLabCount: 2,
    modelWarningCount: 0,
  })

  assert.equal(guidance.tone, 'urgent-review')
  assert.match(guidance.route, /원자료/)
  assert.doesNotMatch(guidance.route, /CCTA|XCA/)
  assert.deepEqual(guidance.candidates, [])
})

test('possible high-risk findings surface invasive angiography criteria review', () => {
  const guidance = buildClinicalExamGuidance({
    values: { 'St Elevation': '1', BP: '120', 'EF-TTE': '55' },
    prediction: 1,
    criticalLabCount: 0,
    modelWarningCount: 0,
  })

  assert.equal(guidance.tone, 'invasive-review')
  assert.match(guidance.route, /2D XCA\/CAG/)
  assert.match(guidance.checks.join(' '), /troponin/)
  assert.deepEqual(guidance.candidates.map((candidate) => candidate.id), ['XCA_CAG'])
})

test('stable symptomatic pathway presents CCTA with functional testing alternative', () => {
  const guidance = buildClinicalExamGuidance({
    values: { Atypical: '1', CRF: '1', BP: '120', 'EF-TTE': '55' },
    prediction: 1,
    criticalLabCount: 0,
    modelWarningCount: 0,
  })

  assert.equal(guidance.tone, 'noninvasive-review')
  assert.match(guidance.route, /3D CCTA/)
  assert.match(guidance.checks.join(' '), /기능검사/)
  assert.match(guidance.checks.join(' '), /eGFR/)
  assert.deepEqual(
    guidance.candidates.map((candidate) => candidate.id),
    ['CCTA', 'FUNCTIONAL_TEST'],
  )
})

test('low signal without symptoms does not automatically recommend imaging', () => {
  const guidance = buildClinicalExamGuidance({
    values: { BP: '120', 'EF-TTE': '55' },
    prediction: 0,
    criticalLabCount: 0,
    modelWarningCount: 1,
  })

  assert.equal(guidance.tone, 'clinical-review')
  assert.match(guidance.route, /자동 권고하지 않음/)
  assert.match(guidance.checks.join(' '), /모델 개발범위 밖/)
  assert.deepEqual(guidance.candidates, [])
})

test('already performed or actively ordered tests are excluded from candidates', () => {
  const guidance = buildClinicalExamGuidance({
    values: { Atypical: '1', BP: '120', 'EF-TTE': '55' },
    prediction: 1,
    criticalLabCount: 0,
    modelWarningCount: 0,
    existingExaminations: [
      { code: 'CCTA', name: 'Coronary CTA', status: 'COMPLETED' },
      { code: 'SPECT', name: 'Myocardial perfusion SPECT', status: 'CANCELLED' },
    ],
  })

  assert.deepEqual(guidance.candidates.map((candidate) => candidate.id), ['FUNCTIONAL_TEST'])
  assert.match(guidance.excludedTests.join(' '), /CCTA/)
})

test('high-risk pathway never displays noninvasive candidates', () => {
  const guidance = buildClinicalExamGuidance({
    values: { 'St Depression': '1', BP: '120', 'EF-TTE': '55' },
    prediction: 1,
    criticalLabCount: 0,
    modelWarningCount: 0,
    existingExaminations: [{ code: 'CAG', name: 'Coronary angiography', status: 'SCHEDULED' }],
  })

  assert.deepEqual(guidance.candidates, [])
  assert.equal(guidance.excludedTests.length, 1)
})
