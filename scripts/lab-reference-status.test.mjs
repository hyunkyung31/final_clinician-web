import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { compileTestModule } from './load-api-test-module.mjs'

const { LAB_REFERENCE_LABELS, labReferenceStatus, labReferenceStatusLabel, labReferenceStatusClass, countLabReferenceStatuses, labVisitHistoryLabel, labCountPhrases, isCriticalLabFlag, formatLabNumber, formatLabReferenceText, formatLabReferenceDisplay } = await import(
  compileTestModule(readFileSync(new URL('../src/labReferenceStatus.ts', import.meta.url), 'utf8'))
)

const followUp = readFileSync(new URL('../src/components/FollowUpTimeline.tsx', import.meta.url), 'utf8')
const imaging = readFileSync(new URL('../src/components/ExaminationImagingWorkspace.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
const labels = readFileSync(new URL('../src/labReferenceStatus.ts', import.meta.url), 'utf8')

test('lab flags map to reference-range labels instead of diagnostic wording', () => {
  assert.equal(labReferenceStatusLabel(labReferenceStatus({ flag: 'NORMAL', value: 88, referenceLow: 0, referenceHigh: 130 })), '정상범위 내')
  assert.equal(labReferenceStatusLabel(labReferenceStatus({ flag: 'HIGH', value: 142, referenceLow: 0, referenceHigh: 130 })), '정상범위 외')
  assert.equal(labReferenceStatusLabel(labReferenceStatus({ flag: 'LOW', value: 40, referenceLow: 70, referenceHigh: 100 })), '정상범위 외')
  assert.equal(labReferenceStatusLabel(labReferenceStatus({ flag: 'ABNORMAL', value: 12 })), '정상범위 외')
  assert.equal(labReferenceStatusLabel(labReferenceStatus({ flag: 'UNKNOWN', value: 92 })), '기준 없음')
  assert.equal(labReferenceStatusLabel(labReferenceStatus({ flag: 'NORMAL', textValue: '' })), '결과 없음')
  assert.equal(labReferenceStatusLabel(labReferenceStatus({ abnormalFlag: 'UNKNOWN', valueText: '-' })), '결과 없음')
})

test('critical flags stay out-of-range copy and do not use diagnostic danger words', () => {
  const status = labReferenceStatus({ flag: 'CRITICAL_HIGH', value: 220, referenceHigh: 130 })
  assert.equal(labReferenceStatusLabel(status), '정상범위 외')
  assert.equal(isCriticalLabFlag({ flag: 'CRITICAL_HIGH', value: 220 }), true)
  assert.equal(labReferenceStatusClass(status), 'out-of-range')
})

test('follow-up card count phrases match the reference-range wording', () => {
  const phrases = labCountPhrases(countLabReferenceStatuses([
    { flag: 'NORMAL', value: 90 },
    { flag: 'NORMAL', value: 80 },
    { flag: 'HIGH', value: 142 },
    { flag: 'UNKNOWN', value: 92 },
    { textValue: '' },
  ]))
  assert.equal(labVisitHistoryLabel(3), '추적검사 3회')
  assert.equal(phrases.total, '총 5항목')
  assert.equal(phrases.inRange, '정상범위 내 2')
  assert.equal(phrases.outOfRange, '정상범위 외 1')
  assert.equal(phrases.noReference, '기준 없음 1')
  assert.equal(phrases.noResult, '결과 없음 1')
  assert.equal(LAB_REFERENCE_LABELS.disclaimer, '참고범위 기준 표시이며, 임상적 판단을 대체하지 않습니다.')
})

test('follow-up and lab review UI drop diagnostic 정상/비정상/NORMAL copy', () => {
  assert.match(labels, /정상범위 내/)
  assert.match(labels, /정상범위 외/)
  assert.match(labels, /기준 없음/)
  assert.match(labels, /결과 없음/)
  assert.match(labels, /추적검사 \$\{count\}회/)
  assert.match(followUp, /labVisitHistoryLabel/)
  assert.match(followUp, /LAB_REFERENCE_LABELS\.disclaimer/)
  assert.match(followUp, /labCountPhrases/)
  assert.equal([...followUp.matchAll(/<LabCountSummary/g)].length, 1)
  assert.equal(followUp.includes('정상 {'), false)
  assert.equal(followUp.includes('비정상'), false)
  assert.equal(followUp.includes('미판정'), false)
  assert.equal(followUp.includes("programGroup || 'FOLLOW-UP'"), false)
  assert.equal(followUp.includes('{measurement.abnormalFlag}'), false)

  assert.match(imaging, /labReferenceStatusLabel/)
  assert.match(imaging, /LAB_REFERENCE_LABELS\.inRange/)
  assert.match(imaging, /LAB_REFERENCE_LABELS\.outOfRange/)
  assert.equal(imaging.includes("return '정상'"), false)
  assert.equal(imaging.includes("return '이상'"), false)
  assert.equal(imaging.includes('<span>정상</span>'), false)
  assert.equal(imaging.includes('<span>비정상</span>'), false)
  assert.equal(imaging.includes('<span>판정</span>'), false)
  assert.equal(imaging.includes("return '위험 높음'"), false)
})

test('out-of-range badges use amber instead of strong red', () => {
  const followUpBadge = css.match(/\.followup-lab-counts b\.out-of-range[\s\S]{0,180}/)?.[0] ?? ''
  const labFlag = css.match(/\.lab-flag\.out-of-range[\s\S]{0,220}/)?.[0] ?? ''
  assert.match(css, /\.lab-flag\.out-of-range/)
  assert.match(css, /\.followup-lab-counts b\.out-of-range/)
  assert.match(css, /#c47a12/)
  assert.match(css, /\.followup-disclaimer/)
  assert.match(followUpBadge, /#c47a12|#d98911|#c4841a|#b7791f/)
  assert.equal(/#b33333|#b83943|#c14951/.test(followUpBadge), false)
  assert.equal(/#b83943|#d94b55|#c14951/.test(labFlag), false)
})

test('reference range text drops padded decimals', () => {
  assert.equal(formatLabNumber(130.000000), '130')
  assert.equal(formatLabNumber(40.000000), '40')
  assert.equal(formatLabNumber(0.590000), '0.59')
  assert.equal(formatLabNumber(1.350000), '1.35')
  assert.equal(formatLabReferenceText('<= 130.000000'), '≤ 130')
  assert.equal(formatLabReferenceText('>= 40.000000'), '≥ 40')
  assert.equal(formatLabReferenceText('6.000000 - 20.000000'), '6–20')
  assert.equal(formatLabReferenceDisplay({ referenceRangeText: '<= 130.000000' }), '≤ 130')
  assert.equal(formatLabReferenceDisplay({ referenceLow: 0.59, referenceHigh: 1.35 }), '0.59–1.35')
  assert.match(imaging, /formatLabReferenceDisplay/)
})
