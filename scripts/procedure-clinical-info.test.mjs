import test from 'node:test'
import assert from 'node:assert/strict'
import { loadApiTestModule } from './load-api-test-module.mjs'

globalThis.sessionStorage = { getItem: () => 'test-token', removeItem: () => {} }

test('patient diagnoses map backend fields (diagnosis_code_value/diagnosis_name) to camelCase', async () => {
  const { getPatientDiagnoses } = await loadApiTestModule()
  globalThis.fetch = async (url) => {
    assert.equal(url, '/api/patients/10/diagnoses/')
    return Response.json([
      { id: 1, diagnosis_code_value: 'I25.10', diagnosis_name: 'Atherosclerotic heart disease', diagnosis_type: 'PRIMARY', diagnosis_text: '', status: 'ACTIVE', diagnosed_at: '2026-01-01T00:00:00Z', diagnosed_by_name: '김도윤' },
    ])
  }
  const result = await getPatientDiagnoses(10)
  assert.equal(result.length, 1)
  assert.equal(result[0].code, 'I25.10')
  assert.equal(result[0].name, 'Atherosclerotic heart disease')
  assert.equal(result[0].diagnosedByName, '김도윤')
})

test('patient medical histories are read from the existing clinical API', async () => {
  const { getPatientMedicalHistories } = await loadApiTestModule()
  globalThis.fetch = async (url) => {
    assert.equal(url, '/api/patients/10/medical-histories/')
    return Response.json([
      { id: 5, condition_code: null, condition_name: '고혈압', status: 'ACTIVE', onset_date: null, resolved_date: null, note: '' },
    ])
  }
  const result = await getPatientMedicalHistories(10)
  assert.equal(result.length, 1)
  assert.equal(result[0].conditionName, '고혈압')
  assert.equal(result[0].status, 'ACTIVE')
})

test('no known allergy is distinguished from an actual recorded allergy', async () => {
  const { getPatientAllergies } = await loadApiTestModule()
  globalThis.fetch = async () => Response.json([
    { id: 1, allergen_type: null, allergen_name: null, reaction: null, severity: null, status: 'ACTIVE', is_no_known_allergy: true, note: '', verified_at: null },
  ])
  const result = await getPatientAllergies(10)
  assert.equal(result.length, 1)
  assert.equal(result[0].isNoKnownAllergy, true)
  assert.equal(result[0].allergenName, null)
})

test('creating an allergy sends is_no_known_allergy=true without other fields', async () => {
  const { createPatientAllergy } = await loadApiTestModule()
  let sentBody
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/patients/10/allergies/')
    assert.equal(options.method, 'POST')
    sentBody = JSON.parse(options.body)
    return Response.json({ id: 9, allergen_type: null, allergen_name: null, reaction: null, severity: null, status: 'ACTIVE', is_no_known_allergy: true, note: '', verified_at: null })
  }
  const created = await createPatientAllergy(10, { isNoKnownAllergy: true })
  assert.deepEqual(sentBody, { is_no_known_allergy: true })
  assert.equal(created.isNoKnownAllergy, true)
})

test('creating a manual allergy entry sends allergen_type and allergen_name', async () => {
  const { createPatientAllergy } = await loadApiTestModule()
  let sentBody
  globalThis.fetch = async (url, options) => {
    sentBody = JSON.parse(options.body)
    return Response.json({ id: 9, allergen_type: 'OTHER', allergen_name: '조영제(Iodine) 발진', reaction: null, severity: null, status: 'ACTIVE', is_no_known_allergy: false, note: '', verified_at: null })
  }
  const created = await createPatientAllergy(10, { allergenType: 'OTHER', allergenName: '조영제(Iodine) 발진' })
  assert.deepEqual(sentBody, { allergen_type: 'OTHER', allergen_name: '조영제(Iodine) 발진' })
  assert.equal(created.allergenName, '조영제(Iodine) 발진')
})
