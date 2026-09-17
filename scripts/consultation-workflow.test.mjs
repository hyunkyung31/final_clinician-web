import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const source = readFileSync(new URL('../src/components/consultationWorkflow.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { matchesScope, isOverdue, sortConsultations, serializeReply, publishConsultationReply, ConsultationReplyError } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'))
const item = (overrides = {}) => ({ id: 1, assignedDoctorId: 7, requestedById: 10, status: 'REQUESTED', priority: 'NORMAL', createdAt: '2026-09-17T00:00:00Z', dueAt: '', ...overrides })
test('received uses doctor ID and sent uses requester user ID; missing identity never matches', () => {
  assert.equal(matchesScope(item(), 'received', 10, 7), true)
  assert.equal(matchesScope(item(), 'received', 7, 10), false)
  assert.equal(matchesScope(item(), 'sent', 10, 7), true)
  assert.equal(matchesScope(item(), 'sent', 7, 10), false)
  assert.equal(matchesScope(item({ requestedById: undefined }), 'sent', 10, 7), false)
  assert.equal(matchesScope(item({ assignedDoctorId: undefined }), 'received'), false)
  assert.equal(matchesScope(item(), 'all'), true)
})
test('only active requests with a valid past due time are overdue', () => {
  const now = Date.parse('2026-09-17T02:00:00Z')
  assert.equal(isOverdue(item({ dueAt: '2026-09-17T01:00:00Z' }), now), true)
  assert.equal(isOverdue(item({ status: 'COMPLETED', dueAt: '2026-09-17T01:00:00Z' }), now), false)
  assert.equal(isOverdue(item({ dueAt: 'invalid' }), now), false)
  assert.equal(isOverdue(item({ dueAt: '2026-09-17T03:00:00Z' }), now), false)
})
test('active urgent first, oldest within priority, completed last; input remains unchanged', () => {
  const entries = [item({ id: 1, status: 'COMPLETED', priority: 'URGENT' }), item({ id: 2 }), item({ id: 3, priority: 'URGENT' }), item({ id: 4, priority: 'URGENT', createdAt: '2026-09-16T00:00:00Z' })]
  assert.deepEqual(sortConsultations(entries).map((entry) => entry.id), [4, 3, 2, 1])
  assert.deepEqual(entries.map((entry) => entry.id), [1, 2, 3, 4])
})
test('structured reply trims input and omits optional empty follow-up', () => {
  assert.equal(serializeReply({ assessment: ' 평가 ', recommendation: ' 권고 ', followUp: '' }), '[평가·소견]\n평가\n\n[권고사항]\n권고')
  assert.equal(serializeReply({ assessment: '', recommendation: '', followUp: '' }), '')
})

function replyFixture() {
  const state = { consultation: item({ status: 'ACCEPTED' }), opinions: [] }
  const calls = { opinions: 0, completions: 0, cleared: 0 }
  const input = { id: 1, doctorId: 7, text: 'QA reply', final: true,
    getDetail: async () => structuredClone(state),
    addOpinion: async (_id, _text, final) => { calls.opinions++; state.opinions.push({ isFinal: final }) },
    complete: async () => { calls.completions++; state.consultation.status = 'COMPLETED' },
    onRegistered: () => { calls.cleared++ },
  }
  return { state, calls, input }
}
test('final reply registers then completes; retry after a completion failure never posts another final', async () => {
  const { state, calls, input } = replyFixture()
  await assert.rejects(publishConsultationReply({ ...input, complete: async () => { throw new Error('temporary completion failure') } }), (error) => error instanceof ConsultationReplyError && error.finalRegistered)
  assert.equal(state.consultation.status, 'ACCEPTED')
  await publishConsultationReply(input)
  assert.deepEqual(calls, { opinions: 1, completions: 1, cleared: 1 })
  assert.equal(state.consultation.status, 'COMPLETED')
  await publishConsultationReply(input)
  assert.equal(calls.opinions, 1)
  assert.equal(calls.completions, 1)
})
test('interim opinion leaves consultation open', async () => {
  const { state, calls, input } = replyFixture()
  await publishConsultationReply({ ...input, final: false })
  assert.equal(state.consultation.status, 'ACCEPTED')
  assert.deepEqual(calls, { opinions: 1, completions: 0, cleared: 1 })
})
test('changed assignee and unaccepted requests block reply without mutations', async () => {
  const { state, calls, input } = replyFixture()
  state.consultation.assignedDoctorId = 8
  await assert.rejects(publishConsultationReply(input), /담당 의료진/)
  state.consultation.assignedDoctorId = 7
  state.consultation.status = 'REQUESTED'
  await assert.rejects(publishConsultationReply(input), /협진 상태/)
  assert.deepEqual(calls, { opinions: 0, completions: 0, cleared: 0 })
})
