import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { compileTestModule, loadApiTestModule } from './load-api-test-module.mjs'

const { preferredRendering, preferredInitialRendering, visibleRenderingKinds, SHOW_ANATOMY_GLB_ON_CCTA_3D } = await import(compileTestModule(readFileSync(new URL('../src/api/renderingSelection.ts', import.meta.url), 'utf8')))
const workspace = readFileSync(new URL('../src/components/ExaminationImagingWorkspace.tsx', import.meta.url), 'utf8')

test('shared anatomy fixture is disabled in the normal CCTA workspace', () => {
  assert.equal(SHOW_ANATOMY_GLB_ON_CCTA_3D, false)
})
const { getImagingDicomBlob, getFileContentBlob, getRendering3DViewerSource, postFormData } = await loadApiTestModule()

test('kind shortcut never displays another kind and prefers latest completed result', () => {
  const items = [
    { id: 1, renderingType: 'VESSEL_ONLY', version: 10, status: 'COMPLETED' },
    { id: 2, renderingType: 'CALCIFICATION_ONLY', version: 1, status: 'COMPLETED' },
    { id: 3, renderingType: 'CALCIFICATION_ONLY', version: 2, status: 'COMPLETED' },
    { id: 4, renderingType: 'CALCIFICATION_ONLY', version: 3, status: 'PROCESSING' },
  ]
  assert.equal(preferredRendering(items, 'CALCIFICATION_ONLY').id, 3)
  assert.equal(preferredRendering(items, 'CENTERLINE'), undefined)
  assert.deepEqual(items.map((item) => item.id), [1, 2, 3, 4])
  assert.equal(preferredRendering(items.filter((item) => item.status !== 'COMPLETED'), 'CALCIFICATION_ONLY').id, 4)
})

test('patient-specific full anatomy GLB is the initial rendering when available', () => {
  const items = [
    { id: 10, renderingType: 'CALCIFICATION_ONLY', version: 3, status: 'COMPLETED' },
    { id: 11, renderingType: 'VESSEL_CALCIFICATION', version: 1, status: 'COMPLETED' },
  ]
  assert.equal(preferredInitialRendering(items, 'CALCIFICATION_ONLY').id, 11)
  assert.equal(preferredInitialRendering(items.slice(0, 1), 'CALCIFICATION_ONLY').id, 10)
})

test('CCTA empty and failed states start AI analysis instead of posting rendering without an AI job', () => {
  assert.match(workspace, /CCTA AI 분석 시작/)
  assert.match(workspace, /CCTA AI 다시 분석/)
  assert.match(workspace, /selectedStudy\?\.modality\.toUpperCase\(\) === 'CT'/)
})

test('CCTA demo playback requires saved analysis and completed anatomy rendering', () => {
  const panel = readFileSync(new URL('../src/components/CTAIAnalysisPanel.tsx', import.meta.url), 'utf8')
  assert.match(panel, /if \(AI_DEMO_PLAYBACK\) \{\s*if \(hasCompleteAnatomyRendering\) setPrecomputedAnalysis\(latest\)/)
  assert.match(panel, /AI_DEMO_PLAYBACK && precomputedAnalysis && hasCompleteAnatomyRendering/)
  assert.doesNotMatch(panel, /실제 재분석/)
  assert.match(workspace, /item\.renderingType === 'VESSEL_CALCIFICATION'/)
  assert.match(workspace, /isAnatomyGlbFormat\(item\.fileFormat\)/)
})

test('patient anatomy GLB opens in the frontal patient-coordinate view', () => {
  const viewer = readFileSync(new URL('../src/components/MedicalModelViewer.tsx', import.meta.url), 'utf8')
  assert.match(viewer, /new THREE\.Vector3\(0, -1, 0\)/)
  assert.match(viewer, /new THREE\.Vector3\(0, 0, 1\)/)
})

test('patient anatomy modes and legend expose the requested clinical structure groups', () => {
  const selection = readFileSync(new URL('../src/api/renderingSelection.ts', import.meta.url), 'utf8')
  assert.match(selection, /전체 구조/)
  assert.match(selection, /관상동맥 \+ 석회화/)
  assert.match(selection, /석회화만/)
  assert.match(workspace, /3D 해부학 구조 색상 범례/)
})

test('DICOM binary download accepts DRF negotiation while retaining staff authorization', async () => {
  globalThis.window = { location: { origin: 'http://localhost:5173' } }
  globalThis.sessionStorage = { getItem: () => 'test-token', removeItem: () => {} }
  let calls = 0
  globalThis.fetch = async (url, options) => {
    calls++
    assert.equal(url, '/api/imaging-instances/17/dicom/')
    assert.equal(options.headers.get('Accept'), '*/*')
    assert.equal(options.headers.get('Authorization'), 'Bearer test-token')
    return new Response(new Uint8Array([0, 1, 2]), { headers: { 'Content-Type': 'application/dicom' } })
  }
  const blob = await getImagingDicomBlob('/api/imaging-instances/17/dicom/')
  assert.equal(blob.type, 'application/dicom')
  assert.equal(blob.size, 3)
  assert.equal(calls, 1)
})

test('DICOM permission errors remain errors and are not retried as alternate endpoints', async () => {
  let calls = 0
  globalThis.fetch = async () => { calls++; return new Response('', { status: 403 }) }
  await assert.rejects(getImagingDicomBlob('/api/imaging-instances/17/dicom/'), (error) => error.status === 403)
  assert.equal(calls, 1)
})

test('multipart upload leaves the boundary to the browser and retains authenticated request handling', async () => {
  const form = new FormData()
  form.append('ct', new Blob(['test']), 'test.nii.gz')
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/test-upload/')
    assert.equal(options.body, form)
    assert.equal(options.method, 'POST')
    assert.equal(options.headers.has('Content-Type'), false)
    assert.equal(options.headers.get('Authorization'), 'Bearer test-token')
    return Response.json({ status: 'completed' })
  }
  assert.deepEqual(await postFormData('/test-upload/', form), { status: 'completed' })
})

test('CCTA CT studies only expose calcification unless another type already exists', () => {
  assert.deepEqual(visibleRenderingKinds({ modality: 'CT' }).map((item) => item.value), ['CALCIFICATION_ONLY'])
  assert.deepEqual(visibleRenderingKinds({ generationType: 'CCTA' }).map((item) => item.value), ['CALCIFICATION_ONLY'])
  assert.deepEqual(
    visibleRenderingKinds({ modality: 'CT', existingTypes: ['VESSEL_ONLY', 'CALCIFICATION_ONLY'] }).map((item) => item.value),
    ['VESSEL_ONLY', 'CALCIFICATION_ONLY'],
  )
  assert.deepEqual(
    visibleRenderingKinds({ generationType: 'ANGIO_2D_TO_3D', modality: 'XA' }).map((item) => item.value),
    ['VESSEL_ONLY', 'CALCIFICATION_ONLY', 'VESSEL_CALCIFICATION', 'CENTERLINE'],
  )
})

test('3D mesh bytes are fetched from the authenticated content stream, not a RustFS presigned URL', async () => {
  globalThis.window = { location: { origin: 'https://clinician.34-50-57-207.sslip.io' } }
  globalThis.sessionStorage = { getItem: () => 'test-token', removeItem: () => {} }
  globalThis.URL.createObjectURL = (blob) => {
    assert.equal(blob.size, 5)
    return 'blob:ccta-stl'
  }
  const urls = []
  globalThis.fetch = async (url, options) => {
    urls.push(String(url))
    if (String(url).includes('/viewer/')) {
      return Response.json({
        rendering_id: 12,
        file_id: 56261,
        file_format: 'STL',
        viewer_url: '/api/staff/files/56261/download/',
      })
    }
    if (String(url).endsWith('/api/files/56261/content/')) {
      assert.equal(options.headers.get('Accept'), '*/*')
      assert.equal(options.headers.get('Authorization'), 'Bearer test-token')
      return new Response(new Uint8Array([1, 2, 3, 4, 5]), { headers: { 'Content-Type': 'model/stl' } })
    }
    throw new Error(`unexpected url ${url}`)
  }
  const source = await getRendering3DViewerSource(12)
  assert.equal(source.downloadUrl, 'blob:ccta-stl')
  assert.equal(source.fileFormat, 'STL')
  assert.equal(source.fileId, 56261)
  assert.deepEqual(urls, [
    '/api/staff/renderings-3d/12/viewer/',
    '/api/files/56261/content/',
  ])
})

test('file content stream keeps staff authorization and does not follow unsigned storage URLs', async () => {
  globalThis.window = { location: { origin: 'https://clinician.34-50-57-207.sslip.io' } }
  globalThis.sessionStorage = { getItem: () => 'test-token', removeItem: () => {} }
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/files/9/content/')
    assert.equal(options.headers.get('Authorization'), 'Bearer test-token')
    return new Response(new Uint8Array([9]), { headers: { 'Content-Type': 'model/stl' } })
  }
  const blob = await getFileContentBlob(9)
  assert.equal(blob.size, 1)
})
