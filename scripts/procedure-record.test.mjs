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

test('createMedicationAdministration does not send a procedure event id', async () => {
  const { createMedicationAdministration } = await loadApiTestModule()
  let sentUrl
  let sentBody
  globalThis.fetch = async (url, options) => {
    sentUrl = url
    sentBody = JSON.parse(options.body)
    return Response.json({
      id: 8,
      examination: 42,
      medication_name: 'Heparin',
      source_type: 'PRESCRIPTION',
      status: 'ACTIVE',
      administered_at: '2026-09-29T09:10:00Z',
      dose_value: '5000',
      dose_unit: 'IU',
      route: 'IV',
      note: '',
      prescription_item: 3,
      medication: 11,
    })
  }
  const saved = await createMedicationAdministration(42, {
    sourceType: 'PRESCRIPTION',
    administeredAt: '2026-09-29T09:10:00.000Z',
    prescriptionItemId: 3,
    medicationId: 11,
    medicationName: 'Heparin',
    procedureRecordId: 9,
    doseValue: '5000',
    doseUnit: 'IU',
    route: 'IV',
  })
  assert.equal(sentUrl, '/api/staff/examinations/42/medication-administrations/')
  assert.equal(sentBody.source_type, 'PRESCRIPTION')
  assert.equal(sentBody.prescription_item_id, 3)
  assert.equal(sentBody.dose_value, '5000')
  assert.equal(sentBody.route, 'IV')
  assert.equal(Object.hasOwn(sentBody, 'procedure_event_id'), false)
  assert.equal(saved.medicationName, 'Heparin')
  assert.equal(saved.prescriptionItemId, 3)
})

test('getMedicationAdministrations keeps active rows and drops canceled rows', async () => {
  const { getMedicationAdministrations } = await loadApiTestModule()
  globalThis.fetch = async (url) => {
    assert.equal(url, '/api/staff/examinations/42/medication-administrations/')
    return Response.json([
      { id: 1, medication_name: 'Heparin', source_type: 'AD_HOC', status: 'CANCELED', administered_at: '2026-09-29T09:00:00Z' },
      { id: 2, medication_name: 'Nitroglycerin', source_type: 'PRESCRIPTION', status: 'ACTIVE', administered_at: '2026-09-29T09:05:00Z', dose_value: '200', dose_unit: 'mcg', route: 'IC', prescription_item: 4 },
    ])
  }
  const items = await getMedicationAdministrations(42)
  assert.equal(items.length, 1)
  assert.equal(items[0].medicationName, 'Nitroglycerin')
  assert.equal(items[0].route, 'IC')
})

test('createProcedureDeviceUsage sends device_id and does not create a procedure event', async () => {
  const { createProcedureDeviceUsage } = await loadApiTestModule()
  let sentUrl
  let sentBody
  globalThis.fetch = async (url, options) => {
    sentUrl = url
    sentBody = JSON.parse(options.body)
    return Response.json({
      id: 6,
      examination: 42,
      device: 15,
      product_name: 'Sion Blue',
      device_detail: { id: 15, code: 'GW-1', category: 'GUIDEWIRE', product_name: 'Sion Blue', is_active: true },
      quantity: 1,
      used_at: '2026-09-29T09:20:00Z',
      status: 'ACTIVE',
      note: 'LAD wiring',
    })
  }
  const saved = await createProcedureDeviceUsage(42, {
    deviceId: 15,
    usedAt: '2026-09-29T09:20:00.000Z',
    procedureRecordId: 9,
    quantity: 1,
    note: 'LAD wiring',
  })
  assert.equal(sentUrl, '/api/staff/examinations/42/procedure-device-usages/')
  assert.equal(sentBody.device_id, 15)
  assert.equal(sentBody.quantity, 1)
  assert.equal(Object.hasOwn(sentBody, 'procedure_event_id'), false)
  assert.equal(saved.productName, 'Sion Blue')
  assert.equal(saved.device?.category, 'GUIDEWIRE')
})
