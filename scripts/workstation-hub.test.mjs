import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { compileTestModule } from './load-api-test-module.mjs'

const disclosureModuleUrl = compileTestModule(
  readFileSync(
    new URL('../src/clinicalModelDisclosure.ts', import.meta.url),
    'utf8',
  ),
)

const workstationSource = readFileSync(
  new URL('../src/workstationHub.ts', import.meta.url),
  'utf8',
).replace(
  "'./clinicalModelDisclosure'",
  JSON.stringify(disclosureModuleUrl),
)

const {
  HUB_COPY,
  reportApprovalSteps,
  latestReportStatus,
  reportStatusCopy,
  aiStatusCopy,
  studyFilterKey,
  studyKindLabel,
  studyStatusLabel,
  cctaAssistBullets,
  clinicianErrorMessage,
  matchRecommendedOrderTypes,
  canonicalExaminationKey,
  isDuplicateOrderError,
} = await import(compileTestModule(workstationSource))

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const hub = readFileSync(new URL('../src/components/WorkstationHub.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/workstation-hub.css', import.meta.url), 'utf8')
const nav = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const orderWorkspace = readFileSync(new URL('../src/components/OrderWorkspace.tsx', import.meta.url), 'utf8')
const prescriptionPanel = readFileSync(new URL('../src/components/PrescriptionPanel.tsx', import.meta.url), 'utf8')

test('workstation hub uses clinical action copy instead of generator labels', () => {
  assert.equal(hub.includes('원본 생성'), false)
  assert.equal(hub.includes('리포트 생성'), false)
  assert.equal(hub.includes('report generate'), false)
  assert.match(hub, /영상 보기/)
  assert.match(hub, /보고서 작성|보고서 보기|보고서 열기/)
  assert.match(hub, /오더·처방 현황/)
  assert.match(hub, /Promise\.allSettled/)
  assert.match(hub, /\[active, encounterId, patientId\]/)
  assert.match(app, /active=\{activeSection === "워크스테이션"\}/)
  assert.match(hub, /결과보고서를 최종 승인하시겠습니까/)
  assert.match(hub, /환자에게 결과보고서를 공개하시겠습니까/)
})

test('left nav labels stay in the current order', () => {
  assert.match(nav, /label: "홈"/)
  assert.match(nav, /label: "워크스테이션"/)
  assert.match(nav, /label: "오더·처방"/)
  assert.match(nav, /label: "시술기록"/)
  assert.ok(nav.indexOf('label: "예약"') < nav.indexOf('label: "시술기록"'))
  assert.ok(nav.indexOf('label: "시술기록"') < nav.indexOf('label: "설정"'))
  assert.match(nav, /ChatDock/)
  assert.match(app, /<WorkstationHub/)
})

test('prescription order workspace is patient scoped and linked from workstation', () => {
  assert.match(orderWorkspace, /patientId=\{selectedPatient\.backendId\}/)
  assert.match(orderWorkspace, /encounterId=\{encounterId\}/)
  assert.match(orderWorkspace, /환자명 또는 환자번호 검색/)
  assert.match(hub, /오더·처방에서 검토/)
  assert.match(app, /onOpenPrescriptions=\{\(\) => setActiveSection\('오더·처방'\)\}/)
  assert.match(orderWorkspace, /검사·시술 오더/)
  assert.match(orderWorkspace, /약물 처방/)
  assert.match(orderWorkspace, /order-prescription-split/)
  assert.equal(orderWorkspace.includes('order-workspace-tabs'), false)
  assert.equal(orderWorkspace.includes('exam-order-category-tabs'), false)
  assert.match(orderWorkspace, /getExaminationOrders\(patientId\)/)
  assert.match(orderWorkspace, /createExaminationOrder\(encounterId/)
  assert.match(orderWorkspace, /진행 중 오더/)
  assert.match(orderWorkspace, /Promise\.allSettled/)
  assert.match(orderWorkspace, /오더 처리 결과/)
  assert.match(orderWorkspace, /중복 제외/)
  assert.match(orderWorkspace, /약물 처방과 별도로/)
  assert.match(orderWorkspace, /검사 오더와 별도로/)
  assert.match(prescriptionPanel, /환자 전체 처방/)
  assert.match(prescriptionPanel, /전체 처방 이력/)
  assert.match(prescriptionPanel, /getPrescriptions\(patientId\)/)
  assert.match(prescriptionPanel, /전체 약품/)
  assert.equal(prescriptionPanel.includes('조영실·PCI'), false)
  assert.equal(prescriptionPanel.includes('흉부외과'), false)
  assert.equal(prescriptionPanel.includes('순환기'), false)
  assert.match(prescriptionPanel, /처방 서명 및 확정/)
})

test('order duplicate detection groups clinical aliases and classifies server conflicts', () => {
  assert.equal(canonicalExaminationKey({ code: 'ANGIO_2D-XA', name: '2D 관상동맥 혈관조영술' }), 'CAG')
  assert.equal(canonicalExaminationKey({ code: 'ANGIOGRAPHY-XA', name: '관상동맥조영술' }), 'CAG')
  assert.equal(canonicalExaminationKey({ code: 'CCTA_3D', name: '관상동맥 CT 혈관조영술' }), 'CCTA')
  assert.equal(canonicalExaminationKey({ code: 'CCTA', name: '관상동맥 CT 혈관조영술' }), 'CCTA')
  assert.equal(canonicalExaminationKey({ code: 'CARDIAC_LAB_PANEL', name: '심혈관 혈액·임상 패널' }), 'CARDIAC_LAB_PANEL')
  assert.equal(isDuplicateOrderError(new Error('검사 오더 중복을 반환하지 못했습니다.')), true)
  assert.equal(isDuplicateOrderError(new Error('이 기능을 사용할 권한이 없습니다.')), false)
})

test('report lifecycle copy stays non-diagnostic', () => {
  assert.equal(latestReportStatus('SIGNED'), 'SIGNED')
  assert.equal(reportStatusCopy('SIGNED'), '최종 승인 완료 · 환자 공개 가능')
  assert.equal(reportStatusCopy('RELEASED'), '환자 공개 완료')
  assert.equal(aiStatusCopy({ queued: 2, running: 0, failed: 0, completed: 0, cancelled: 0, total: 2, date: '' }, false), 'AI 분석 대기 2건')
})

test('approval stepper stays vertical and does not clip labels', () => {
  assert.deepEqual(reportApprovalSteps('DRAFT').map((step) => step.hint), ['완료', '진행 가능', '대기'])
  assert.deepEqual(reportApprovalSteps('SIGNED').map((step) => step.hint), ['완료', '완료', '진행 가능'])
  assert.deepEqual(reportApprovalSteps('RELEASED').map((step) => step.hint), ['완료', '완료', '완료'])
  assert.match(css, /\.ws-steps \{[\s\S]*flex-direction:\s*column/)
  assert.match(hub, /reportApprovalSteps/)
  assert.match(hub, /보고서 열기/)
})

test('CCTA copy stays calcification-only and empty states are clinical', () => {
  const bullets = cctaAssistBullets({
    examinationId: 1, examName: 'CCTA', examCode: 'CCTA', performedAt: null, analysisId: 1, jobId: 1, resultId: 1,
    modelName: null, modelVersion: null, probability: null, prediction: null, summary: 'calcification overlay ready',
    overlayFileAssetId: 1, sourceFileAssetId: null, previewFileAssetId: 2, sides: [],
  })
  assert.match(bullets.join(' '), /석회화/)
  assert.equal(bullets.some((line) => /재구성 완료|혈관을 재구성/.test(line)), false)
  assert.equal(HUB_COPY.noExam, '등록된 검사 결과가 없습니다.')
  assert.equal(HUB_COPY.noMemo, '등록된 환자 메모가 없습니다.')
  assert.equal(clinicianErrorMessage(new Error('CORS blocked 500')), HUB_COPY.loadFailed)
  assert.equal(studyFilterKey({ id: 1, studyInstanceUid: '', modality: 'XA', description: 'Coronary Angiography', studyDate: '', status: 'COMPLETED' }), 'XCA')
  assert.equal(studyKindLabel({ id: 1, studyInstanceUid: '', modality: 'XA', description: '영상검사', studyDate: '', status: 'RECEIVED' }), 'XCA')
  assert.equal(studyKindLabel({ id: 2, studyInstanceUid: '', modality: 'CT', description: '영상검사', studyDate: '', status: 'RECEIVED' }), 'CCTA')
  assert.equal(studyStatusLabel({ id: 1, studyInstanceUid: '', modality: 'XA', description: '영상검사', studyDate: '', status: 'RECEIVED' }).label, '결과 대기')
  assert.equal(matchRecommendedOrderTypes([{ name: '관상동맥 조영술', code: 'CAG', category: 'IMAGING' }]).length, 1)
})

test('workstation hub adapts to available container width without horizontal clipping', () => {
  assert.match(css, /container-type:\s*inline-size/)
  assert.match(css, /minmax\(180px,\s*220px\)/)
  assert.match(css, /minmax\(420px,\s*1fr\)/)
  assert.match(css, /minmax\(320px,\s*340px\)/)
  assert.match(css, /@container\s*\(max-width:\s*1080px\)/)
  assert.match(css, /grid-column:\s*1\s*\/\s*-1/)
  assert.match(css, /overflow-x:\s*hidden/)
  assert.equal(css.includes('min-width: 1100px'), false)

  assert.match(hub, /ws-overview-card/)
  assert.equal(hub.includes('createExaminationOrder'), false)
  assert.equal(hub.includes('createPrescriptionItem'), false)
  assert.equal(hub.includes('최근 활동 기록'), false)
  assert.equal(hub.includes('환자 메모'), false)
  assert.match(hub, /onOpenXcaDetail/)
  assert.match(hub, /onOpenCcta3d/)
  assert.match(hub, /완료된 CCTA 분석 결과가 없습니다/)

  const summaryBlock = hub.slice(
    hub.indexOf("view === 'summary'"),
    hub.indexOf("view === 'imaging'"),
  )

  assert.equal(summaryBlock.includes('StudyDicomViewer'), false)
  assert.equal(summaryBlock.includes('onOpenReports()}>상세'), false)
})

test('desktop workstation summary uses the available vertical canvas', () => {
  assert.match(css, /@container\s*\(min-width:\s*1081px\)/)
  assert.match(css, /\.ws-hub-grid-clean\s*\{[\s\S]*min-height:\s*min\(650px,\s*calc\(100vh\s*-\s*150px\)\)/)
  assert.match(css, /\.ws-hub-grid-clean \.ws-card-recommend\s*\{[\s\S]*min-height:\s*140px/)
  assert.match(css, /\.ws-hub-grid-clean \.ws-col-left \.ws-card-exams\s*\{[\s\S]*flex:\s*1\s+1\s+auto/)
})
