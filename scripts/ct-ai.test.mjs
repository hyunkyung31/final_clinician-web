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

test('patient report lookup returns the latest successful CCTA analysis per examination', async () => {
  const { getPatientCCTAAnalyses } = await loadApiTestModule()
  globalThis.fetch = async (url) => {
    assert.equal(url, '/api/ai-analyses/?patient_id=52&type=CCTA&status=SUCCEEDED')
    return Response.json([
      { id: 101, examination: 485, analysis_type: 'CCTA', status: 'SUCCEEDED', completed_at: '2026-09-29T10:00:00Z' },
      { id: 103, examination: 485, analysis_type: 'CCTA', status: 'SUCCEEDED', completed_at: '2026-09-29T12:00:00Z' },
      { id: 102, examination: 486, analysis_type: 'CCTA', status: 'SUCCEEDED', completed_at: '2026-09-29T11:00:00Z' },
      { id: 104, examination: 487, analysis_type: 'CCTA', status: 'FAILED', completed_at: '2026-09-29T13:00:00Z' },
    ])
  }
  const rows = await getPatientCCTAAnalyses(52)
  assert.deepEqual(rows.map((item) => item.id), [103, 102])
})

test('latest CCTA lookup falls back to the linked source examination for demo patients', async () => {
  const { loadLatestCTAIAnalysis } = await loadApiTestModule()
  const calls = []
  globalThis.fetch = async (url) => {
    calls.push(url)
    if (url === '/api/ai-analyses/?patient_id=52&type=CCTA&status=SUCCEEDED') {
      return Response.json([])
    }
    if (url === '/api/ai-analyses/?examination_id=534&type=CCTA&status=SUCCEEDED') {
      return Response.json([
        { id: 201, examination: 534, analysis_type: 'CCTA', status: 'SUCCEEDED', completed_at: '2026-09-29T10:00:00Z' },
        { id: 202, examination: 534, analysis_type: 'CCTA', status: 'SUCCEEDED', completed_at: '2026-09-29T12:00:00Z' },
        { id: 203, examination: 999, analysis_type: 'CCTA', status: 'SUCCEEDED', completed_at: '2026-09-29T13:00:00Z' },
      ])
    }
    if (url === '/api/ai-analyses/202/') {
      return Response.json({ analysis: { id: 202, examination: 534, analysis_type: 'CCTA', status: 'SUCCEEDED' }, jobs: [], results: [] })
    }
    throw new Error(`unexpected URL: ${url}`)
  }

  const result = await loadLatestCTAIAnalysis(52, 534)
  assert.equal(result.analysis.id, 202)
  assert.deepEqual(calls, [
    '/api/ai-analyses/?patient_id=52&type=CCTA&status=SUCCEEDED',
    '/api/ai-analyses/?examination_id=534&type=CCTA&status=SUCCEEDED',
    '/api/ai-analyses/202/',
  ])
})

test('an invalid source cannot send an analysis request', async () => {
  const { createCTAIAnalysis } = await loadApiTestModule({ VITE_CT_AI_PIPELINE_READY: 'true', VITE_CT_AI_MODEL_VERSION_ID: '7' })
  let calls = 0
  globalThis.fetch = async () => { calls++; return Response.json({}) }
  await assert.rejects(createCTAIAnalysis(0, 20, 30), (error) => error.status === 400)
  assert.equal(calls, 0)
})
