import test from 'node:test'
import assert from 'node:assert/strict'
import { loadApiTestModule } from './load-api-test-module.mjs'

globalThis.sessionStorage = { getItem: () => 'test-token', removeItem: () => {} }

test('getProcedureRecord reads nested latest from GET /procedure-record/', async () => {
  const { getProcedureRecord } = await loadApiTestModule()
  globalThis.fetch = async (url) => {
    assert.equal(url, '/api/staff/examinations/42/procedure-record/')
    return Response.json({
      latest: {
        id: 9,
        status: 'FINAL',
        procedure_name: 'CAG',
        access_site: 'Right femoral artery',
        special_notes: '특이사항 없음',
        primary_operator: 3,
      },
      history: [{ id: 9, status: 'FINAL' }],
    })
  }
  const record = await getProcedureRecord(42)
  assert.equal(record.id, 9)
  assert.equal(record.status, 'FINAL')
  assert.equal(record.procedureName, 'CAG')
  assert.equal(record.accessSite, 'Right femoral artery')
  assert.equal(record.specialNotes, '특이사항 없음')
})

test('getProcedureRecord treats empty latest as a draft, not the wrapper payload', async () => {
  const { getProcedureRecord } = await loadApiTestModule()
  globalThis.fetch = async () => Response.json({ latest: null, history: [] })
  const record = await getProcedureRecord(42)
  assert.equal(record.status, 'DRAFT')
  assert.equal(record.procedureName, '')
  assert.equal(record.accessSite, '')
})

test('createProcedureEvent sends timeline clinical fields', async () => {
  const { createProcedureEvent } = await loadApiTestModule()
  let sentBody
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/staff/examinations/42/procedure-events/')
    sentBody = JSON.parse(options.body)
    return Response.json({
      id: 15,
      event_code: '약물_투여',
      event_category: '약물 투여',
      event_text: 'Heparin IV',
      medication_or_device: 'Heparin',
      actual_dose_or_spec: '5000 IU',
      note: '',
      event_at: '2026-09-21T02:08:00Z',
      created_by_name: '김도윤',
      status: 'ACTIVE',
    })
  }
  const saved = await createProcedureEvent(42, {
    eventCode: '약물_투여',
    eventCategory: '약물 투여',
    eventText: 'Heparin IV',
    medicationOrDevice: 'Heparin',
    actualDoseOrSpec: '5000 IU',
    eventAt: '2026-09-21T02:08:00.000Z',
    procedureRecordId: 9,
  })
  assert.equal(sentBody.event_code, '약물_투여')
  assert.equal(sentBody.event_category, '약물 투여')
  assert.equal(sentBody.event_text, 'Heparin IV')
  assert.equal(sentBody.medication_or_device, 'Heparin')
  assert.equal(sentBody.procedure_record_id, 9)
  assert.equal(saved.medicationOrDevice, 'Heparin')
  assert.equal(saved.createdByName, '김도윤')
})
