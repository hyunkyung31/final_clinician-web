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
