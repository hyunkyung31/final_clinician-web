import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { compileTestModule } from './load-api-test-module.mjs'

const { withDicomTimeout } = await import(compileTestModule(readFileSync(new URL('../src/api/dicomLoading.ts', import.meta.url), 'utf8')))

test('completed decoding preserves its result', async () => {
  assert.equal(await withDicomTimeout(Promise.resolve('image'), 100, 'timeout'), 'image')
})

test('a decoding failure preserves the original error', async () => {
  const error = new Error('invalid DICOM')
  await assert.rejects(withDicomTimeout(Promise.reject(error), 100, 'timeout'), (caught) => caught === error)
})

test('an unresponsive decoder times out rather than leaving the screen loading forever', async () => {
  await assert.rejects(withDicomTimeout(new Promise(() => {}), 5, '영상 해석 시간 초과'), /영상 해석 시간 초과/)
})

test('a late decoder rejection after timeout is handled', async () => {
  let rejectOperation
  const operation = new Promise((resolve, reject) => { rejectOperation = reject })
  await assert.rejects(withDicomTimeout(operation, 5, 'timeout'), /timeout/)
  rejectOperation(new Error('worker failed late'))
  await new Promise((resolve) => setTimeout(resolve, 5))
})
