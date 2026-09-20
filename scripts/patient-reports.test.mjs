import test from 'node:test'
import assert from 'node:assert/strict'
import { loadApiTestModule } from './load-api-test-module.mjs'

globalThis.sessionStorage = { getItem: () => 'test-token', removeItem: () => {} }

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
})

test('draft results without a version/report map optional fields to null', async () => {
  const { getPatientReports } = await loadApiTestModule()
  globalThis.fetch = async () => Response.json([
    { medical_result_id: 6, encounter_id: 4, visit_date: null, encounter_type: 'INITIAL', doctor_name: null, status: 'DRAFT', latest_version: null, latest_signoff: null, latest_report: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  ])
  const result = await getPatientReports(10)
  assert.equal(result[0].latestVersion, null)
  assert.equal(result[0].latestReport, null)
})

test('report download reads the file download_url from the reports download endpoint', async () => {
  const { getReportDownload } = await loadApiTestModule()
  globalThis.fetch = async (url) => {
    assert.equal(url, '/api/reports/9/download/')
    return Response.json({
      report: { id: 9, report_name: 'r.pdf' },
      file: { download_url: 'https://rustfs.example.com/reports/r.pdf', download_integration_status: 'CONFIGURED' },
    })
  }
  const info = await getReportDownload(9)
  assert.equal(info.downloadUrl, 'https://rustfs.example.com/reports/r.pdf')
  assert.equal(info.downloadIntegrationStatus, 'CONFIGURED')
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
})
