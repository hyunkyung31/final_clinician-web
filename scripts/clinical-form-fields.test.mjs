import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const panel = readFileSync(new URL('../src/components/ClinicalAIAnalysisPanel.tsx', import.meta.url), 'utf8')

const expected = [
  'Age', 'Weight', 'Length', 'Sex', 'BMI', 'DM', 'HTN', 'Current Smoker', 'EX-Smoker', 'FH',
  'Obesity', 'CRF', 'CVA', 'Airway disease', 'Thyroid Disease', 'CHF', 'DLP', 'BP', 'PR',
  'Edema', 'Weak Peripheral Pulse', 'Lung rales', 'Systolic Murmur', 'Diastolic Murmur',
  'Typical Chest Pain', 'Dyspnea', 'Function Class', 'Atypical', 'Nonanginal', 'LowTH Ang',
  'Q Wave', 'St Elevation', 'St Depression', 'Tinversion', 'LVH', 'Poor R Progression', 'BBB',
  'FBS', 'CR', 'TG', 'LDL', 'HDL', 'BUN', 'ESR', 'HB', 'K', 'Na', 'WBC', 'Lymph', 'Neut', 'PLT',
  'EF-TTE', 'Region RWMA', 'VHD',
]

test('Clinical AI explanation is optional model metadata', () => {
  assert.match(panel, /LOCAL EXPLANATION · SHAP/)
  assert.match(panel, /환자별 모델 기여도/)
  assert.match(panel, /SHAP 기여값/)
  assert.match(panel, /상위 변수 내/)
  assert.match(panel, /인과관계, 임상적 중증도 또는 치료 효과를 의미하지 않습니다/)
  assert.match(panel, /모델 범위 밖/)
  assert.match(panel, /자동 보정값/)
  assert.match(panel, /explanation\?\.type === 'SHAP'/)
  assert.doesNotMatch(panel, /shap_value\.toFixed/)
})

test('Clinical AI separates laboratory reference flags from model development range warnings', () => {
  assert.match(panel, /검사실 참고범위에 따른 표시이며 질환 진단을 의미하지 않습니다/)
  assert.match(panel, /모델 신뢰도 확인 필요/)
  assert.match(panel, /기술 상세 보기/)
  assert.match(panel, /표시된 범위는 임상 정상범위가 아니라 모델 개발 데이터의 관찰범위입니다/)
  assert.match(panel, /입력 수정됨/)
})

test('Clinical AI form declares all 54 model input fields', () => {
  assert.equal(expected.length, 54)
  for (const column of expected) {
    const escaped = column.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    assert.match(
      panel,
      new RegExp(`(?:name: |numeric\\(|binary\\()['"]${escaped}['"]`),
      `missing ${column}`,
    )
  }
})

test('Clinical AI supports guarded auto-run and changes the completed action to reanalysis', () => {
  assert.match(panel, /autoRunStarted/)
  assert.match(panel, /completedCount !== allFields\.length/)
  assert.match(panel, /Clinical AI 재분석/)
  assert.match(panel, /입력 변경됨 · 재분석 필요/)
})
