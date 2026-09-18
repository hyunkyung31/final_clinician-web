import test from 'node:test'
import assert from 'node:assert/strict'
import { xcaModuleUrl, loadApiTestModule } from './load-api-test-module.mjs'
const { parseXCAAnalysis, xcaContextKey } = await import(xcaModuleUrl)
const { analyzeXCAExamination, getXCABridgeHealth } = await loadApiTestModule()

function fixture() {
  const context = { backend_patient_id: 1614, source_subject_id: '241', examination_id: 1198,
    scope: 'all_classified_series_in_examination', excluded_unknown_sequence_ids: [999], sequences: [
      { sequence_id: 1450, sequence_no: '1', side: 'RIGHT', frame_count: 38 },
      { sequence_id: 1452, sequence_no: '4', side: 'LEFT', frame_count: 24 }] }
  return { verified: true, backend_patient_id: 1614, examination_id: 1198, reused: false,
    analysis: { id: 459, examination: 1198, analysis_type: 'ANGIO_2D', status: 'SUCCEEDED' },
    job: { id: 9, ai_analysis: 459, status: 'SUCCEEDED' },
    result: { id: 7, ai_analysis_job: 9, status: 'REVIEW_REQUIRED', confidence: null, result_json: {
      status: 'COMPLETED', serving_scope: 'VALIDATED_ANGIOCAD_DEMO_INTEGRATION', api_version: '1.0.0-demo',
      analysis_unit: 'patient_side', patient_id: '241', fold: 3, n_series: 2, n_frames: 62, processing_seconds: 5.1,
      backend_context: context, warnings: ['미분류 제외'], sides: [
        { side: 'RIGHT', features: { n_series: 1, n_frames: 38 }, threshold: 0.5,
          any_stenosis: { ai_score: .115, prediction: 0 }, significant_stenosis: { ai_score: .126, prediction: 0 } },
        { side: 'LEFT', features: { n_series: 1, n_frames: 24 }, threshold: 0.5,
          any_stenosis: { ai_score: .573, prediction: 1 }, significant_stenosis: { ai_score: .561, prediction: 1 } }] } } }
}
test('verified XCA results retain patient/source distinction, raw AI scores, review state and side counts', () => {
  const result = parseXCAAnalysis(fixture(), 1614, 1198)
  assert.equal(result.patientId, 1614); assert.equal(result.originalPatientId, '241')
  assert.equal(result.resultId, 7); assert.equal(result.seriesCount, 2); assert.equal(result.frameCount, 62)
  assert.deepEqual(result.sides.map(s => [s.side, s.frameCount]), [['LEFT', 24], ['RIGHT', 38]])
  assert.equal(result.sides[0].anyStenosis.aiScore, .573); assert.equal(result.excludedUnknownCount, 1)
})
test('another patient/examination, clinical task and unverified result are rejected', () => {
  for (const change of ['patient', 'examination', 'clinical', 'confidence', 'unverified', 'source']) {
    const data = fixture()
    if (change === 'patient') data.backend_patient_id = 1626
    if (change === 'examination') data.analysis.examination = 1210
    if (change === 'clinical') data.analysis.analysis_type = 'CLINICAL'
    if (change === 'confidence') data.result.confidence = .9
    if (change === 'unverified') data.verified = false
    if (change === 'source') data.result.result_json.patient_id = '1614'
    assert.throws(() => parseXCAAnalysis(data, 1614, 1198), undefined, change)
  }
})
test('unknown/duplicate side, partial counts, invalid score and prediction are rejected', () => {
  for (const change of ['unknown', 'duplicate', 'count', 'nan', 'out-of-range', 'prediction']) {
    const data = fixture(), raw = data.result.result_json
    if (change === 'unknown') raw.sides[0].side = 'UNKNOWN'
    if (change === 'duplicate') raw.sides[0].side = 'LEFT'
    if (change === 'count') raw.sides[0].features.n_frames = 37
    if (change === 'nan') raw.sides[0].any_stenosis.ai_score = NaN
    if (change === 'out-of-range') raw.sides[0].any_stenosis.ai_score = 1.1
    if (change === 'prediction') raw.sides[0].any_stenosis.prediction = 1
    assert.throws(() => parseXCAAnalysis(data, 1614, 1198), undefined, change)
  }
})
test('button request sends only backend patient/examination IDs and current bearer token to loopback bridge', async () => {
  globalThis.sessionStorage = { getItem: key => key === 'angiocad.staff.accessToken' ? 'local-test-token' : null }
  const calls = []
  globalThis.fetch = async (url, init) => { calls.push([url, init]); return Response.json(fixture()) }
  await analyzeXCAExamination(1614, 1198)
  assert.equal(calls.length, 1); assert.equal(calls[0][0], 'http://127.0.0.1:8003/xca/analyze')
  assert.deepEqual(JSON.parse(calls[0][1].body), { patient_id: 1614, examination_id: 1198 })
  assert.equal(calls[0][1].headers.Authorization, 'Bearer local-test-token')
  assert.equal(calls[0][1].credentials, 'omit'); assert.equal(calls[0][1].redirect, 'error')
})
test('401 and upstream errors do not refresh credentials or automatically replay GPU inference', async () => {
  globalThis.sessionStorage = { getItem: () => 'local-test-token' }
  for (const status of [401, 502]) {
    let calls = 0
    globalThis.fetch = async () => { calls++; return Response.json({ detail: { message: '로그인 확인 필요' } }, { status }) }
    await assert.rejects(analyzeXCAExamination(1614, 1198), /로그인 확인 필요/)
    assert.equal(calls, 1)
  }
})
test('logged out button requests do not call any server', async () => {
  globalThis.sessionStorage = { getItem: () => null }
  let called = false; globalThis.fetch = async () => { called = true }
  await assert.rejects(analyzeXCAExamination(1614, 1198), /로그인/)
  assert.equal(called, false)
})
test('health checks carry no token and map availability without guessing', async () => {
  let options
  globalThis.fetch = async (_, init) => { options = init; return Response.json({ bridge_ready: true, model_ready: false, busy: true }) }
  assert.deepEqual(await getXCABridgeHealth(), { bridgeReady: true, modelReady: false, busy: true })
  assert.equal(options.headers, undefined)
})
test('context keys distinguish patient and examination changes', () => {
  assert.notEqual(xcaContextKey(1614, 1198), xcaContextKey(1626, 1198))
  assert.notEqual(xcaContextKey(1614, 1198), xcaContextKey(1614, 1210))
})
