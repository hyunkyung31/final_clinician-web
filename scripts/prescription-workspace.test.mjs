import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { loadApiTestModule } from './load-api-test-module.mjs'

globalThis.sessionStorage = { getItem: () => 'test-token', removeItem: () => {} }

test('examination orders accept serializer foreign-key fields and remain independently creatable', async () => {
  const { createExaminationOrder, getExaminationOrders } = await loadApiTestModule()
  const payload = {
    id: 71,
    encounter: 22,
    examination_type: 5,
    ordered_by: 3,
    priority: 'NORMAL',
    status: 'ORDERED',
    clinical_note: '흉통 평가',
    ordered_at: '2026-09-29T08:00:00Z',
  }
  let call = 0
  globalThis.fetch = async (url, options = {}) => {
    call += 1
    if (call === 1) {
      assert.equal(url, '/api/encounters/22/examination-orders/')
      assert.equal(options.method, 'POST')
      return Response.json(payload, { status: 201 })
    }
    assert.equal(url, '/api/examinations/orders/?patient_id=9')
    return Response.json([payload])
  }

  const created = await createExaminationOrder(22, 5, '흉통 평가')
  assert.equal(created.encounterId, 22)
  assert.equal(created.examinationTypeId, 5)
  const listed = await getExaminationOrders(9)
  assert.equal(listed.length, 1)
  assert.equal(listed[0].id, 71)
})

test('DUR check maps result details required by the prescription review UI', async () => {
  const { runPrescriptionDurCheck } = await loadApiTestModule()
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/prescriptions/17/dur-check/')
    assert.equal(options.method, 'POST')
    return Response.json({
      dur_check: { id: 9, status: 'WARNING', checked_at: '2026-09-29T08:00:00Z' },
      results: [{
        id: 4,
        severity: 'WARNING',
        warning_message: '고령 환자 용량을 확인하세요.',
        action: '용량 재확인',
        prescription_item: 31,
        rule_detail: { rule_name: '고령자 주의', rule_type: 'AGE' },
      }],
    })
  }

  const result = await runPrescriptionDurCheck(17)
  assert.equal(result.status, 'WARNING')
  assert.equal(result.results[0].warningMessage, '고령 환자 용량을 확인하세요.')
  assert.equal(result.results[0].ruleName, '고령자 주의')
})

test('prescription signing reauthenticates through the server without exposing a signature file id', async () => {
  const { signPrescription } = await loadApiTestModule()
  let body
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/prescriptions/17/sign/')
    assert.equal(options.method, 'POST')
    body = JSON.parse(options.body)
    return Response.json({
      prescription: {
        id: 17,
        encounter: 22,
        patient: 8,
        prescribed_by: 3,
        prescribed_at: '2026-09-29T08:00:00Z',
        status: 'SIGNED',
      },
      items: [],
    })
  }

  const signed = await signPrescription(17, 'reauth-token')
  assert.deepEqual(body, { reauth_token: 'reauth-token' })
  assert.equal(signed.prescription.status, 'SIGNED')
})

test('prescription workspace keeps visit drafts isolated and exposes review, history, and sign controls', () => {
  const source = readFileSync(new URL('../src/components/PrescriptionPanel.tsx', import.meta.url), 'utf8')
  assert.match(source, /prescription\.status\s*===\s*"DRAFT"\s*&&\s*detail\.prescription\.encounterId\s*===\s*encounterId/)
  assert.match(source, /aria-label="전체 처방 이력"/)
  assert.match(source, /처방 서명 및 확정/)
  assert.match(source, /처리되지 않은 중대 DUR 경고/)
  assert.match(source, /DUR 검사 결과 확인 항목/)
  assert.equal(source.includes('전자서명 예정'), false)
})
