import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { compileTestModule } from './load-api-test-module.mjs'

const {
  formatClinicalShapValue,
  rankClinicalShapFeatures,
} = await import(
  compileTestModule(
    readFileSync(
      new URL('../src/clinicalShapPresentation.ts', import.meta.url),
      'utf8',
    ),
  )
)

const validationSource = readFileSync(
  new URL('../src/clinicalShapValidation.ts', import.meta.url),
  'utf8',
).replace("import type { ClinicalShapFeature } from './api/client'\n", '')
const { validateClinicalShapPayload } = await import(compileTestModule(validationSource))

test('SHAP features are ranked by absolute local contribution', () => {
  const ranked = rankClinicalShapFeatures([
    { feature: 'Age', value: 77, shap_value: 0.12, direction: 'increase' },
    { feature: 'Na', value: 182, shap_value: -0.8, direction: 'decrease' },
    { feature: 'K', value: 6.2, shap_value: 0.4, direction: 'increase' },
  ])

  assert.deepEqual(ranked.map((item) => item.feature), ['Na', 'K', 'Age'])
  assert.equal(ranked[0].rank, 1)
  assert.equal(ranked[0].scalePercent, 100)
  assert.equal(ranked[0].signedDirection, 'decrease')
  assert.equal(Math.round(ranked.reduce((sum, item) => sum + item.relativePercent, 0)), 100)
})

test('SHAP values keep an explicit sign and compact precision', () => {
  assert.equal(formatClinicalShapValue(0.123456), '+0.1235')
  assert.equal(formatClinicalShapValue(-0.25), '-0.25')
  assert.equal(formatClinicalShapValue(0), '0')
  assert.equal(formatClinicalShapValue(0.00004), '+4.00e-5')
})

test('duplicate SHAP features keep only the strongest contribution', () => {
  const ranked = rankClinicalShapFeatures([
    { feature: 'Age', value: 77, shap_value: 0.12, direction: 'increase' },
    { feature: 'Age', value: 77, shap_value: 0.5, direction: 'increase' },
    { feature: 'K', value: 6.2, shap_value: -0.4, direction: 'decrease' },
  ])
  assert.deepEqual(ranked.map((item) => [item.feature, item.shap_value]), [['Age', 0.5], ['K', -0.4]])
})

test('SHAP payload validation catches duplicate, non-finite and sign mismatches', () => {
  const validation = validateClinicalShapPayload([
    { feature: 'Age', value: 77, shap_value: 0.2, direction: 'decrease' },
    { feature: 'Age', value: 77, shap_value: Number.NaN, direction: 'increase' },
  ])
  assert.equal(validation.valid, false)
  assert.match(validation.issues.join(' '), /부호.*불일치/)
  assert.match(validation.issues.join(' '), /중복 변수/)
  assert.match(validation.issues.join(' '), /유효하지 않은 SHAP 값/)
  assert.equal(validation.additivityStatus, 'NOT_VERIFIABLE')
  assert.match(validation.additivityReason, /base value.*전체 SHAP 벡터/)
})
