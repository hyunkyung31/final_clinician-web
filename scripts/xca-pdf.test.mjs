import test from 'node:test'
import assert from 'node:assert/strict'
import { xcaReportModuleUrl } from './load-api-test-module.mjs'
const { fetchXCAPDF, finalizeXCAReport } = await import(xcaReportModuleUrl)
const target = { id: 1, patientId: 2, encounterId: 3, baseVersionId: 4, versionNo: 1 }
const digest = 'a'.repeat(64), pdfDigest = 'b'.repeat(64)
const preview = { digest, versionId: 4, state: 'DRAFT' }
const good = { patient_id: 2, medical_result_id: 1, version_id: 4, version_no: 1, signoff_id: 5, report_id: 6, content_sha256: digest, pdf_sha256: pdfDigest, status: 'SIGNED', release_status: 'NOT_RELEASED', reused: false }
test('PDF GET sends staff token only to own API and validates binary/header state', async () => {
  globalThis.fetch = async (path, init) => {
    assert.equal(path, '/api/report-versions/4/xca-pdf/?patient_id=2')
    assert.equal(init.headers.Authorization, 'Bearer test-token'); assert.equal(init.redirect, 'error')
    return new Response('%PDF-test', { headers: { 'Content-Type': 'application/pdf', 'X-XCA-Content-SHA256': digest, 'X-XCA-PDF-State': 'DRAFT' } })
  }
  const result = await fetchXCAPDF('', 'test-token', target)
  assert.equal(result.digest, digest); assert.equal(result.state, 'DRAFT'); assert.equal(result.versionId, 4)
})
test('foreign or untyped PDF response is rejected', async () => {
  globalThis.fetch = async () => Response.json({ download_url: 'https://foreign.test/pdf' })
  await assert.rejects(fetchXCAPDF('', 'test', target), /응답 검증/)
})
test('HTML masquerading as PDF is rejected', async () => {
  globalThis.fetch = async () => new Response('<html>bad</html>', { headers: { 'Content-Type': 'application/pdf', 'X-XCA-Content-SHA256': digest, 'X-XCA-PDF-State': 'SIGNED' } })
  await assert.rejects(fetchXCAPDF('', 'test', target), /파일 형식/)
})
test('explicit confirm and current preview are required without any mutation', async () => {
  globalThis.fetch = async () => { throw new Error('must not send') }
  await assert.rejects(finalizeXCAReport('', 'test', target, preview, 'reauth', false), /동의/)
  await assert.rejects(finalizeXCAReport('', 'test', target, { ...preview, versionId: 999 }, 'reauth', true), /현재 버전/)
  await assert.rejects(finalizeXCAReport('', 'test', target, { ...preview, state: 'SIGNED' }, 'reauth', true), /현재 버전/)
})
test('sign POST binds patient/version/digest and never supplies external signature/PDF asset IDs', async () => {
  let calls = 0
  globalThis.fetch = async (path, init) => {
    calls++; assert.equal(path, '/api/report-versions/4/xca-finalize/')
    assert.deepEqual(JSON.parse(init.body), { patient_id: 2, medical_result_id: 1, content_sha256: digest, reauth_token: 'reauth', confirm_reviewed: true })
    return Response.json(good)
  }
  const result = await finalizeXCAReport('', 'test', target, preview, 'reauth', true)
  assert.equal(calls, 1); assert.equal(result.signoffId, 5); assert.equal(result.pdfDigest, pdfDigest)
})
test('401 and network uncertainty never refresh/replay sign POST', async () => {
  for (const network of [false, true]) {
    let calls = 0; globalThis.fetch = async () => { calls++; if (network) throw new Error('connection interrupted'); return new Response('', { status: 401 }) }
    await assert.rejects(finalizeXCAReport('', 'test', target, preview, 'reauth', true))
    assert.equal(calls, 1)
  }
})
test('foreign receipt or unexpected patient release is rejected', async () => {
  for (const change of [{ patient_id: 999 }, { content_sha256: 'c'.repeat(64) }, { release_status: 'RELEASED' }]) {
    globalThis.fetch = async () => Response.json({ ...good, ...change })
    await assert.rejects(finalizeXCAReport('', 'test', target, preview, 'reauth', true), /서명 응답/)
  }
})
