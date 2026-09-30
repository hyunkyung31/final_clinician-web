import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const workspace = readFileSync(new URL('../src/components/ReportWorkspace.tsx', import.meta.url), 'utf8')
const detail = readFileSync(new URL('../src/components/ClinicalAiReportDetail.tsx', import.meta.url), 'utf8')
const documentBuilder = readFileSync(new URL('../src/clinicalAiReportDocument.ts', import.meta.url), 'utf8')
const client = readFileSync(new URL('../src/api/client.ts', import.meta.url), 'utf8')
const cctaDraft = readFileSync(new URL('../src/components/CCTAReportDraft.tsx', import.meta.url), 'utf8')
const cctaPanel = readFileSync(new URL('../src/components/CTAIAnalysisPanel.tsx', import.meta.url), 'utf8')

test('report workspace lists patient-scoped Clinical AI analyses', () => {
  assert.match(workspace, /getPatientClinicalAnalyses\(reportPatient\.backendId\)/)
  assert.match(workspace, /\['CLINICAL_AI', 'Clinical AI'\]/)
  assert.match(workspace, /검사 #\$\{item\.examination\}/)
  assert.match(client, /patient_id=\$\{patientId\}&type=CLINICAL&status=SUCCEEDED/)
})

test('report workspace lists completed CCTA analyses before a medical report draft exists', () => {
  assert.match(workspace, /getPatientCCTAAnalyses\(reportPatient\.backendId\)/)
  assert.match(workspace, /pendingCctaReports/)
  assert.match(workspace, /보고서 작성 전/)
  assert.match(workspace, /<CCTAReportDraft/)
  assert.match(client, /patient_id=\$\{patientId\}&type=CCTA&status=SUCCEEDED/)
  assert.match(client, /candidate\.results\?\.some\(\(result\) => result\.status !== 'INVALID'\)/)
})

test('CCTA analysis completion automatically opens the report draft and conclusion editor', () => {
  assert.match(cctaDraft, /preparedResultId\.current === analysisResultId/)
  assert.match(cctaDraft, /prepare\(\)/)
  assert.match(cctaDraft, /\[analysisResultId, analysisId\]/)
  assert.match(cctaDraft, /for \(const candidateId of candidateIds\)/)
  assert.match(cctaPanel, /analysisId=\{analysis\?\.analysis\.id\}/)
  assert.match(cctaDraft, /결과지와 의료진 최종 소견 입력 화면을 준비하고 있습니다/)
  assert.match(cctaDraft, /의료진 최종 소견/)
  assert.match(cctaDraft, /최종 소견을 보고서 초안에 저장/)
  assert.match(cctaDraft, /<button className="primary" type="button" disabled=\{busy \|\| !conclusion\.trim\(\)\}/)
  assert.match(cctaDraft, /이 버전의 결과 이미지와 의료진 최종 소견을 확인했고 최종 승인에 동의합니다/)
  assert.match(cctaDraft, /label className="feature-check"/)
  assert.match(cctaDraft, /검토 승인 · 최종 서명 · PDF 생성/)
  assert.match(cctaDraft, /분석 다시 보기/)
  assert.match(cctaDraft, /<BrainCircuit size=\{16\} \/>/)
  assert.match(cctaPanel, /onNewAnalysis=\{\(\) => \{ setShowReport\(false\); setAnalysis\(null\)/)
  assert.doesNotMatch(cctaPanel, /분석 결과를 불러오고 있습니다/)
})

test('report workspace preserves the signed 2D and 3D integrated approval workflow', () => {
  assert.match(workspace, /\['INTEGRATED', '통합'\]/)
  assert.match(workspace, /signedXcaReports/)
  assert.match(workspace, /signedCctaReports/)
  assert.match(workspace, /createPatientMedicalResult/)
  assert.match(workspace, /선택한 2D·3D 통합 초안 생성/)
  assert.match(client, /xca_medical_result_id/)
  assert.match(client, /ccta_medical_result_id/)
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
