import test from 'node:test'
import assert from 'node:assert/strict'
import { loadApiTestModule } from './load-api-test-module.mjs'

globalThis.sessionStorage = { getItem: () => 'test-token', removeItem: () => {} }

test('an unconnected CT pipeline cannot create an indefinitely queued job', async () => {
  const { createCTAIAnalysis } = await loadApiTestModule()
  let calls = 0
  globalThis.fetch = async () => { calls++; return Response.json({}) }
  await assert.rejects(createCTAIAnalysis(10, 20, 30), (error) => error.status === 503)
  assert.equal(calls, 0)
})

test('configured CT pipeline sends the selected examination, study, series and model version', async () => {
  const { createCTAIAnalysis } = await loadApiTestModule({ VITE_API_BASE_URL: '', VITE_CT_AI_PIPELINE_READY: 'true', VITE_CT_AI_MODEL_VERSION_ID: '7' })
  const analysis = { analysis: { id: 100, status: 'QUEUED' }, jobs: [{ id: 101, status: 'QUEUED' }] }
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/examinations/10/ai-analyses/')
    assert.equal(options.headers.get('Authorization'), 'Bearer test-token')
    assert.deepEqual(JSON.parse(options.body), { analysis_type: 'CCTA', model_version_ids: [7], input_refs: [{ input_type: 'IMAGING_SERIES', imaging_study_id: 20, imaging_series_id: 30 }] })
    return Response.json(analysis)
  }
  assert.deepEqual(await createCTAIAnalysis(10, 20, 30), analysis)
})

test('CT status and results are retrieved with staff authentication', async () => {
  const { getCTAIAnalysis } = await loadApiTestModule()
  const analysis = { analysis: { id: 100, status: 'SUCCEEDED' }, jobs: [], results: [{ id: 1, summary_text: 'Server result' }] }
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/ai-analyses/100/')
    assert.equal(options.headers.get('Authorization'), 'Bearer test-token')
    return Response.json(analysis)
  }
  assert.deepEqual(await getCTAIAnalysis(100), analysis)
})

test('an invalid source cannot send an analysis request', async () => {
  const { createCTAIAnalysis } = await loadApiTestModule({ VITE_CT_AI_PIPELINE_READY: 'true', VITE_CT_AI_MODEL_VERSION_ID: '7' })
  let calls = 0
  globalThis.fetch = async () => { calls++; return Response.json({}) }
  await assert.rejects(createCTAIAnalysis(0, 20, 30), (error) => error.status === 400)
  assert.equal(calls, 0)
})
