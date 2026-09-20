import test from 'node:test'
import assert from 'node:assert/strict'
import { loadApiTestModule } from './load-api-test-module.mjs'

globalThis.sessionStorage = { getItem: () => 'test-token', removeItem: () => {} }

const LAB_CODES = new Set(['FBS', 'CR', 'TG', 'LDL', 'HDL', 'BUN', 'ESR', 'HB', 'K', 'NA', 'WBC', 'LYMPH', 'NEUT', 'PLT', 'EF-TTE'])
const DECIMAL = new Set(['CR', 'HDL', 'HB', 'K'])

function hydrateClinicalInput(snapshot, labMeasurements, clinicalInput) {
  const payload = { ...(snapshot ?? {}) }
  for (const item of labMeasurements ?? []) {
    const code = String(item.code ?? '').trim().toUpperCase()
    if (!LAB_CODES.has(code) || item.valueNumeric === undefined) continue
    const modelName = code === 'NA' ? 'Na' : code === 'LYMPH' ? 'Lymph' : code === 'NEUT' ? 'Neut' : code
    payload[modelName] = DECIMAL.has(code) ? item.valueNumeric : Math.round(item.valueNumeric)
  }
  if (clinicalInput) return { ...payload, ...clinicalInput }
  return payload
}

test('clinical_feature_snapshot is mapped from integrated-data without inventing zeros', async () => {
  const { getPatientClinicalFeatureSnapshot } = await loadApiTestModule()
  globalThis.fetch = async (url) => {
    assert.equal(url, '/api/patients/1530/integrated/')
    return Response.json({
      clinical_feature_snapshot: {
        Age: 61,
        Sex: 1,
        DM: 0,
        BBB: 'N',
      },
    })
  }
  const snapshot = await getPatientClinicalFeatureSnapshot(1530)
  assert.equal(snapshot.Age, '61')
  assert.equal(snapshot.Sex, '1')
  assert.equal(snapshot.BBB, 'N')
  assert.equal(snapshot.HTN, undefined)
  assert.equal(snapshot._clinical_demo_backfill, undefined)
})

test('latest lab overwrites snapshot labs; stored clinicalInput wins last', () => {
  const snapshot = { Age: 61, FBS: 90, CR: 0.7, HTN: 1 }
  const lab = [
    { code: 'FBS', valueNumeric: 112 },
    { code: 'K', valueNumeric: 4.2 },
  ]
  const merged = hydrateClinicalInput(snapshot, lab, null)
  assert.equal(merged.Age, 61)
  assert.equal(merged.FBS, 112)
  assert.equal(merged.CR, 0.7)
  assert.equal(merged.K, 4.2)
  assert.equal(merged.HTN, 1)

  const clinician = hydrateClinicalInput(snapshot, lab, { FBS: 130, FH: 1 })
  assert.equal(clinician.FBS, 130)
  assert.equal(clinician.FH, 1)
  assert.equal(clinician.K, 4.2)
})
