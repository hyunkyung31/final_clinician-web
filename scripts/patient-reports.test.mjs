import test from 'node:test'
import assert from 'node:assert/strict'
import { loadApiTestModule } from './load-api-test-module.mjs'

globalThis.sessionStorage = { getItem: () => 'test-token', removeItem: () => {} }

test('release posts the medical result ID with staff authentication and no body', async () => {
  const { releasePatientReport } = await loadApiTestModule()
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/medical-results/42/release/')
    assert.equal(options.method, 'POST')
    assert.equal(options.body, undefined)
    assert.equal(new Headers(options.headers).get('Authorization'), 'Bearer test-token')
    return Response.json({ medical_result: { id: 42, status: 'RELEASED' } })
  }
  await releasePatientReport(42)
})

test('release rejects a successful HTTP response without released status', async () => {
  const { releasePatientReport } = await loadApiTestModule()
  globalThis.fetch = async () => Response.json({ medical_result: { status: 'SIGNED' } })
  await assert.rejects(releasePatientReport(42), /공개 결과를 확인하지 못했습니다/)
})

test('release does not automatically retry an unauthorized POST', async () => {
  const { releasePatientReport } = await loadApiTestModule()
  let requests = 0
  globalThis.fetch = async () => {
    requests += 1
    return Response.json({ detail: '로그인이 필요합니다.' }, { status: 401 })
  }
  await assert.rejects(releasePatientReport(42))
  assert.equal(requests, 1)
})

test('patient reports are read from the medical-results endpoint and mapped to camelCase', async () => {
  const { getPatientReports } = await loadApiTestModule()
  globalThis.fetch = async (url) => {
    assert.equal(url, '/api/patients/10/medical-results/')
    return Response.json([
      {
        medical_result_id: 5,
        encounter_id: 3,
        visit_date: '2026-01-01T00:00:00Z',
        encounter_type: 'INITIAL',
        doctor_name: '김도윤',
        status: 'RELEASED',
        latest_version: { version_no: 1, source_type: 'DOCTOR_EDIT', created_at: '2026-01-02T00:00:00Z' },
        latest_signoff: { signed_at: '2026-01-03T00:00:00Z', doctor_name: '김도윤' },
        latest_report: { report_id: 9, report_name: 'r.pdf', status: 'FINAL', created_at: '2026-01-03T00:00:00Z' },
        latest_release: { released_at: '2026-01-03T01:00:00Z', release_status: 'RELEASED' },
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-03T00:00:00Z',
      },
    ])
  }
  const result = await getPatientReports(10)
  assert.equal(result.length, 1)
  assert.equal(result[0].status, 'RELEASED')
  assert.equal(result[0].latestReport?.reportId, 9)
  assert.equal(result[0].latestSignoff?.doctorName, '김도윤')
  assert.equal(result[0].latestRelease?.releaseStatus, 'RELEASED')
})

test('draft results without a version/report map optional fields to null', async () => {
  const { getPatientReports } = await loadApiTestModule()
  globalThis.fetch = async () => Response.json([
    { medical_result_id: 6, encounter_id: 4, visit_date: null, encounter_type: 'INITIAL', doctor_name: null, status: 'DRAFT', latest_version: null, latest_signoff: null, latest_report: null, latest_release: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  ])
  const result = await getPatientReports(10)
  assert.equal(result[0].latestVersion, null)
  assert.equal(result[0].latestReport, null)
})

test('report download reads the file download_url from the reports download endpoint', async () => {
  const { getReportDownload } = await loadApiTestModule()
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/reports/9/download/')
    assert.equal(new Headers(options.headers).get('Authorization'), 'Bearer test-token')
    return Response.json({
      report: { id: 9, report_name: 'r.pdf' },
      file: { download_url: 'https://rustfs.example.com/reports/r.pdf', download_integration_status: 'CONFIGURED', download_expires_in: 300, download_expires_at: '2026-09-21T12:05:00Z', mime_type: 'application/pdf' },
    })
  }
  const info = await getReportDownload(9)
  assert.equal(info.downloadUrl, 'https://rustfs.example.com/reports/r.pdf')
  assert.equal(info.downloadIntegrationStatus, 'CONFIGURED')
  assert.equal(info.downloadExpiresIn, 300)
  assert.equal(info.downloadExpiresAt, '2026-09-21T12:05:00Z')
  assert.equal(info.mimeType, 'application/pdf')
})

test('report download surfaces a null downloadUrl when storage is not configured', async () => {
  const { getReportDownload } = await loadApiTestModule()
  globalThis.fetch = async () => Response.json({
    report: { id: 9, report_name: 'r.pdf' },
    file: { download_url: null, download_integration_status: 'STORAGE_URL_NOT_CONFIGURED' },
  })
  const info = await getReportDownload(9)
  assert.equal(info.downloadUrl, null)
  assert.equal(info.downloadIntegrationStatus, 'STORAGE_URL_NOT_CONFIGURED')
  assert.equal(info.downloadExpiresIn, null)
  assert.equal(info.downloadExpiresAt, null)
  assert.equal(info.mimeType, null)
})

const detailPayload = {
  medical_result: { id: 5, encounter: 3, conclusion: '추적 관찰', status: 'REVIEWING' },
  patient: { id: 10, name: '김환자', medical_record_no: 'P-10', birth_date: '1960-01-01', gender: 'M' },
  encounter: { id: 3, visit_date: '2026-01-01T00:00:00Z', encounter_type: 'INITIAL', doctor_name: '김도윤' },
  workflow: {
    status: 'REVIEWING',
    can_edit: true,
    can_signoff: true,
    can_release: false,
        signed_by: null,
        signed_department: null,
        signed_at: null,
        signed_version_id: null,
        signed_version_no: null,
        signature_file_asset_id: null,
        released_at: null,
    patient_visible: false,
    latest_report_id: null,
    exam_name: '2D 혈관조영',
  },
  ai_summaries: {
    clinical: { prediction: 'HIGH', probability: 0.91, model_version: '2.1.0' },
    xca: { summary: '좌측 유의 협착 의심' },
    ccta: { summary: '석회화 확인', overlay_file_asset_id: 11, preview_file_asset_id: 12 },
  },
}

test('medical result detail maps AI summaries and workflow flags without raw JSON', async () => {
  const { getMedicalResultDetail } = await loadApiTestModule()
  globalThis.fetch = async (url) => {
    assert.equal(url, '/api/medical-results/5/')
    return Response.json(detailPayload)
  }
  const detail = await getMedicalResultDetail(5)
  assert.equal(detail.status, 'REVIEWING')
  assert.equal(detail.aiSummaries.clinical?.prediction, 'HIGH')
  assert.equal(detail.aiSummaries.xca?.summary, '좌측 유의 협착 의심')
  assert.equal(detail.workflow.canSignoff, true)
  assert.equal(detail.workflow.canRelease, false)
  assert.equal(detail.workflow.signatureFileAssetId, null)
})

test('signoff and release post to the dedicated medical-result endpoints', async () => {
  const { signoffMedicalResult, releaseMedicalResult } = await loadApiTestModule()
  const urls = []
  globalThis.fetch = async (url, init) => {
    urls.push(`${init?.method || 'GET'} ${url}`)
    return Response.json({
      ...detailPayload,
      medical_result: { ...detailPayload.medical_result, status: url.includes('release') ? 'RELEASED' : 'SIGNED' },
      workflow: {
        ...detailPayload.workflow,
        status: url.includes('release') ? 'RELEASED' : 'SIGNED',
        can_signoff: false,
        can_release: !url.includes('release'),
        patient_visible: url.includes('release'),
        signed_by: '김도윤',
      },
    })
  }
  const signed = await signoffMedicalResult(5, '최종 소견')
  assert.equal(signed.workflow.status, 'SIGNED')
  const released = await releaseMedicalResult(5)
  assert.equal(released.workflow.status, 'RELEASED')
  assert.deepEqual(urls, ['POST /api/medical-results/5/signoff/', 'POST /api/medical-results/5/release/'])
})

for (const [functionName, endpoint] of [
  ['signoffMedicalResult', 'signoff'],
  ['releaseMedicalResult', 'release'],
]) {
  test(`${functionName} does not replay an unauthorized request`, async () => {
    const api = await loadApiTestModule()
    let requests = 0
    globalThis.fetch = async (url, options) => {
      requests += 1
      assert.equal(url, `/api/medical-results/42/${endpoint}/`)
      assert.equal(options.method, 'POST')
      return Response.json({ detail: '로그인이 필요합니다.' }, { status: 401 })
    }
    await assert.rejects(api[functionName](42))
    assert.equal(requests, 1)
  })
}

test('integrated report keeps selected source and mask pairs from the signed version', async () => {
  const { getMedicalResultDetail } = await loadApiTestModule()
  const attachment = { review_note: '협착 의심 영역 확인', frames: [
    { id: 101, sequence_no: '7', frame_index: 12, source_file_asset_id: 201, mask_file_asset_id: 301 },
    { id: 102, sequence_no: '7', frame_index: 13, source_file_asset_id: 202, mask_file_asset_id: null },
  ] }
  globalThis.fetch = async () => Response.json({ ...detailPayload,
    workflow: { ...detailPayload.workflow, status: 'SIGNED', signed_version_id: 90 },
    versions: [
      { id: 91, version_no: 4, content_json: { xca_attachments: [] } },
      { id: 90, version_no: 3, content_json: { xca_attachments: [attachment] } },
    ],
  })
  const detail = await getMedicalResultDetail(5)
  assert.equal(detail.xcaAttachments[0].note, attachment.review_note)
  assert.deepEqual(detail.xcaAttachments[0].frames, [
    { id: 101, sequenceNo: '7', frameIndex: 12, sourceFileAssetId: 201, maskFileAssetId: 301 },
    { id: 102, sequenceNo: '7', frameIndex: 13, sourceFileAssetId: 202, maskFileAssetId: null },
  ])
})

test('draft attachments use the latest version and missing signed versions do not borrow draft images', async () => {
  const { getMedicalResultDetail } = await loadApiTestModule()
  const payload = { ...detailPayload, versions: [
    { id: 1, version_no: 1, content_json: { xca_attachments: [{ review_note: 'old', frames: [] }] } },
    { id: 2, version_no: 2, content_json: { xca_attachments: [{ review_note: 'latest', frames: [] }] } },
  ] }
  globalThis.fetch = async () => Response.json(payload)
  assert.equal((await getMedicalResultDetail(5)).xcaAttachments[0].note, 'latest')
  globalThis.fetch = async () => Response.json({ ...payload, workflow: { ...payload.workflow, signed_version_id: 3 } })
  assert.deepEqual((await getMedicalResultDetail(5)).xcaAttachments, [])
})
