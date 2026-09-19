import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { compileTestModule, groupingModuleUrl, loadApiTestModule } from './load-api-test-module.mjs'

globalThis.sessionStorage = { getItem: () => null, removeItem: () => {} }
const { getPatientAngiographySequences, getAngiographyFrames } = await loadApiTestModule()
const { groupAngiographySequences, normalizeCoronarySide } = await import(groupingModuleUrl)
const { splitImagingStudies } = await import(compileTestModule(readFileSync(new URL('../src/api/imagingCategories.ts', import.meta.url), 'utf8')))

function sequence(id, examinationId, coronarySide, sequenceNo = id, performedAt = '2026-08-31T10:00:00+09:00') {
  return { id, examinationId, coronarySide, sequenceNo, performedAt, frameCount: 45, displayName: `촬영 ${id}`, coronarySideLabel: '', labels: null }
}

test('six acquisitions in one Angio examination become two sorted side groups, not six examinations', () => {
  const source = [sequence(6, 100, 'RIGHT'), sequence(5, 100, 'LEFT'), sequence(1, 100, 'LEFT'), sequence(3, 100, 'LEFT'), sequence(2, 100, 'LEFT'), sequence(4, 100, 'LEFT')]
  const groups = groupAngiographySequences(source)
  assert.equal(groups.length, 1)
  assert.equal(groups[0].sequenceCount, 6)
  assert.deepEqual(groups[0].sides.map((side) => [side.side, side.sequences.map((item) => item.sequenceNo)]), [['LEFT', [1, 2, 3, 4, 5]], ['RIGHT', [6]]])
  assert.equal(source[0].id, 6)
})

test('same-date different examinations stay separate; UNKNOWN and absent side are never guessed', () => {
  const groups = groupAngiographySequences([sequence(1, 10, 'LEFT'), sequence(2, 11, 'UNKNOWN'), sequence(3, 11, undefined)])
  assert.equal(groups.length, 2)
  const unknown = groups.find((group) => group.examinationId === 11).sides[0]
  assert.equal(unknown.side, 'UNKNOWN')
  assert.equal(unknown.label, '미분류')
  assert.equal(unknown.sequences.length, 2)
  assert.equal(normalizeCoronarySide('OTHER'), 'UNKNOWN')
})

test('unlinked acquisitions never form a fabricated examination; newest dated examinations come first', () => {
  const groups = groupAngiographySequences([sequence(1, undefined, 'LEFT', 1, ''), sequence(2, undefined, 'RIGHT', 2, ''), sequence(3, 12, 'LEFT', 3, '2026-09-01T10:00:00+09:00')])
  assert.equal(groups.length, 3)
  assert.equal(groups[0].examinationId, 12)
  assert.equal(new Set(groups.map((group) => group.key)).size, 3)
  assert.equal(groupAngiographySequences([]).length, 0)
})

test('integrated-data endpoint maps side, display name, capture time and examination; no raw label guessing', async () => {
  const paths = []
  globalThis.fetch = async (path) => {
    paths.push(path)
    return Response.json({ angiography_sequences: [
      { id: 70, sequence_no: 3, frame_count: 64, examination_id: 100, coronary_side: 'LEFT', coronary_side_label: '좌관상동맥', display_name: '좌관상동맥 촬영 3', performed_at: '2026-08-31T10:30:00+09:00' },
      { id: 71, sequence_no: 4, coronary_side: 'UNKNOWN', labels: { side: 'RIGHT' } },
    ] })
  }
  const items = await getPatientAngiographySequences(202)
  // /api/patients/{id}/integrated-data/ is the route that actually exists on the
  // deployed API (verified live: /integrated/ -> 404, /integrated-data/ -> 401),
  // so it must be tried first.
  assert.deepEqual(paths, ['/api/patients/202/integrated-data/'])
  assert.equal(items[0].displayName, '좌관상동맥 촬영 3')
  assert.equal(items[0].coronarySide, 'LEFT')
  assert.equal(items[0].coronarySideLabel, '좌관상동맥')
  assert.equal(items[0].performedAt, '2026-08-31T10:30:00+09:00')
  assert.equal(items[0].examinationId, 100)
  assert.equal(items[1].coronarySide, 'UNKNOWN')
  assert.equal(items[1].displayName, '미분류 촬영 4')
  assert.equal(items[1].performedAt, '')
})

test('404 alone falls back to legacy integrated endpoint; permission and server errors do not', async () => {
  const paths = []
  globalThis.fetch = async (path) => {
    paths.push(path)
    return path.endsWith('/integrated-data/') ? Response.json({ detail: 'Not found' }, { status: 404 }) : Response.json({ angiography_sequences: [{ id: 1, sequence_no: 1 }] })
  }
  const items = await getPatientAngiographySequences(202)
  assert.deepEqual(paths, ['/api/patients/202/integrated-data/', '/api/patients/202/integrated/'])
  assert.equal(items[0].coronarySide, 'UNKNOWN')
  for (const status of [403, 500]) {
    paths.length = 0
    globalThis.fetch = async (path) => { paths.push(path); return Response.json({ detail: 'error' }, { status }) }
    await assert.rejects(getPatientAngiographySequences(202))
    assert.equal(paths.length, 1)
  }
})

test('playback keeps the existing Sequence Frame API and mapping', async () => {
  const paths = []
  globalThis.fetch = async (path) => { paths.push(path); return Response.json({ frames: [{ index: 0, filename: 'frame_0000.png', url: '/frame.png' }] }) }
  const frames = await getAngiographyFrames(70)
  assert.deepEqual(paths, ['/api/angiography-sequences/70/frames/?page=1&page_size=100'])
  assert.equal(frames[0].url, '/frame.png')
})

test('volumetric CT/MR sources are separated from projection studies even with no 3D rendering', () => {
  const studies = [{ id: 1, modality: 'CT' }, { id: 2, modality: 'XA' }, { id: 3, modality: ' mr ' }, { id: 4, modality: 'CR' }]
  const split = splitImagingStudies(studies)
  assert.deepEqual(split.twoD.map((study) => study.id), [2, 4])
  assert.deepEqual(split.threeD.map((study) => study.id), [1, 3])
  assert.equal(studies[0].id, 1)
  assert.deepEqual(splitImagingStudies([]), { twoD: [], threeD: [] })
})

test('workspace uses parent lab/imaging tabs and filtered child lists; lab timeline remains mounted but hidden in imaging', () => {
  const workspace = readFileSync(new URL('../src/components/ExaminationImagingWorkspace.tsx', import.meta.url), 'utf8')
  assert.ok(workspace.includes('aria-label="검사 종류"'))
  assert.ok(workspace.includes('aria-label="영상검사 종류"'))
  assert.ok(workspace.includes("<div hidden={activeSection !== 'LAB'}>"))
  assert.ok(workspace.includes('<FollowUpTimeline scope="LAB"'))
  assert.ok(workspace.includes('visibleStudies.map((study)'))
  assert.ok(workspace.includes("(activeTab === 'IMAGING_2D' ? sequences : []).map"))
  assert.ok(workspace.includes("(viewerMode === '2D' ? angiographyExaminations : []).map"))
})
