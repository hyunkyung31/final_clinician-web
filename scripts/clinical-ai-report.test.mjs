import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const workspace = readFileSync(new URL('../src/components/ReportWorkspace.tsx', import.meta.url), 'utf8')
const detail = readFileSync(new URL('../src/components/ClinicalAiReportDetail.tsx', import.meta.url), 'utf8')
const documentBuilder = readFileSync(new URL('../src/clinicalAiReportDocument.ts', import.meta.url), 'utf8')
const client = readFileSync(new URL('../src/api/client.ts', import.meta.url), 'utf8')

test('report workspace lists patient-scoped Clinical AI analyses', () => {
  assert.match(workspace, /getPatientClinicalAnalyses\(reportPatient\.backendId\)/)
  assert.match(workspace, /\['CLINICAL_AI', 'Clinical AI'\]/)
  assert.match(workspace, /검사 #\$\{item\.examination\}/)
  assert.match(client, /patient_id=\$\{patientId\}&type=CLINICAL&status=SUCCEEDED/)
})

test('Clinical AI report stays clinician-only and read-only', () => {
  assert.match(detail, /의료진 전용 · 읽기 전용/)
  assert.match(detail, /자동 진단·자동 오더·환자 공개 문서가 아닙니다/)
  assert.equal(detail.includes('releaseMedicalResult'), false)
  assert.equal(detail.includes('signoffMedicalResult'), false)
})

test('Clinical AI PDF includes score, threshold, SHAP, warnings, and limitation', () => {
  assert.match(documentBuilder, /모델 결과/)
  assert.match(documentBuilder, /주요 기여 변수 \(SHAP\)/)
  assert.match(documentBuilder, /모델 경고 및 확인사항/)
  assert.match(documentBuilder, /CLINICAL_MODEL_DISCLOSURE\.limitation/)
  assert.match(documentBuilder, /window\.print\(\)/)
  assert.match(documentBuilder, /escapeHtml/)
})
