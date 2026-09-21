import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { compileTestModule } from './load-api-test-module.mjs'

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
} = await import(compileTestModule(readFileSync(new URL('../src/workstationHub.ts', import.meta.url), 'utf8')))

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const hub = readFileSync(new URL('../src/components/WorkstationHub.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/workstation-hub.css', import.meta.url), 'utf8')
const nav = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')

test('workstation hub uses clinical action copy instead of generator labels', () => {
  assert.equal(hub.includes('원본 생성'), false)
  assert.equal(hub.includes('리포트 생성'), false)
  assert.equal(hub.includes('report generate'), false)
  assert.match(hub, /영상 보기/)
  assert.match(hub, /보고서 작성|보고서 보기|보고서 열기/)
  assert.match(hub, /서명 미등록/)
  assert.match(hub, /결과보고서를 최종 승인하시겠습니까/)
  assert.match(hub, /환자에게 결과보고서를 공개하시겠습니까/)
})

test('left nav labels stay in the current order', () => {
  assert.match(nav, /label: "홈"/)
  assert.match(nav, /label: "워크스테이션"/)
  assert.match(nav, /label: "시술기록"/)
  assert.match(nav, /ChatDock/)
  assert.match(app, /<WorkstationHub/)
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

test('desktop hub keeps a fixed 3-column action layout', () => {
  assert.match(css, /grid-template-columns:\s*220px\s+minmax\(0,\s*1fr\)\s+300px/)
  assert.equal(css.includes('min-width: 1100px'), false)
  assert.match(css, /overflow-x:\s*hidden/)
  assert.equal(css.includes('grid-column: 1 / -1'), false)
  assert.match(hub, /ws-action-tabs/)
  assert.match(hub, /onOpenXcaDetail/)
  assert.match(hub, /onOpenCcta3d/)
  assert.match(hub, /완료된 CCTA 분석 결과가 없습니다/)
  const summaryBlock = hub.slice(hub.indexOf("view === 'summary'"), hub.indexOf("view === 'imaging'"))
  assert.equal(summaryBlock.includes('StudyDicomViewer'), false)
  assert.equal(summaryBlock.includes('onOpenReports()}>상세'), false)
})
