import test from 'node:test'
import assert from 'node:assert/strict'
import { loadApiTestModule } from './load-api-test-module.mjs'

globalThis.sessionStorage = { getItem: () => 'staff-token', removeItem: () => {} }

test('pending reservation queue uses the staff status filter and maps approval fields', async () => {
  const { getPendingStaffReservations } = await loadApiTestModule()
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/staff/reservations/?status=REQUESTED')
    assert.equal(new Headers(options.headers).get('Authorization'), 'Bearer staff-token')
    return Response.json([{
      id: 14,
      patient: null,
      doctor: 7,
      department: 3,
      applicant_name: '예약환자',
      applicant_birth_date: '1990-02-03',
      applicant_contact: '010-1234-5678',
      applicant_gender: 'FEMALE',
      reserved_at: '2026-09-24T01:00:00Z',
      status: 'REQUESTED',
      accepted_at: null,
      created_at: '2026-09-21T01:00:00Z',
    }])
  }
  const reservations = await getPendingStaffReservations()
  assert.equal(reservations.length, 1)
  assert.equal(reservations[0].doctorId, 7)
  assert.equal(reservations[0].applicantGender, 'FEMALE')
})

test('doctor reservation view scopes the staff list by doctor ID', async () => {
  const { getAllStaffReservations } = await loadApiTestModule()
  globalThis.fetch = async (url) => {
    assert.equal(url, '/api/staff/reservations/?doctor_id=7')
    return Response.json([])
  }
  assert.deepEqual(await getAllStaffReservations(7), [])
})

test('reservation approval posts the selected doctor and does not replay an unauthorized request', async () => {
  const { acceptStaffReservation } = await loadApiTestModule()
  let requests = 0
  globalThis.fetch = async (url, options) => {
    requests += 1
    assert.equal(url, '/api/staff/reservations/14/accept/')
    assert.equal(options.method, 'POST')
    assert.deepEqual(JSON.parse(options.body), { doctor_id: 7 })
    return Response.json({ id: 14, doctor: 7, status: 'ACCEPTED', applicant_name: '예약환자' })
  }
  const approved = await acceptStaffReservation(14, 7)
  assert.equal(approved.status, 'ACCEPTED')
  assert.equal(requests, 1)

  globalThis.fetch = async () => {
    requests += 1
    return Response.json({ detail: '로그인이 필요합니다.' }, { status: 401 })
  }
  await assert.rejects(acceptStaffReservation(14, 7))
  assert.equal(requests, 2)
})
