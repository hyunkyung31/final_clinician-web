import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { compileTestModule, loadApiTestModule } from './load-api-test-module.mjs'

const { preferredRendering } = await import(compileTestModule(readFileSync(new URL('../src/api/renderingSelection.ts', import.meta.url), 'utf8')))
const { getImagingDicomBlob, postFormData } = await loadApiTestModule()

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
