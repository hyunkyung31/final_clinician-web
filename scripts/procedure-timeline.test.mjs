import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { compileTestModule } from './load-api-test-module.mjs'

const timelineModuleUrl = compileTestModule(readFileSync(new URL('../src/procedureTimeline.ts', import.meta.url), 'utf8'))
const timeline = await import(timelineModuleUrl)

test('stored medication and material events stay legacy instead of becoming new administrations', () => {
  assert.equal(timeline.procedureEventSource({
    eventCategory: '약물 투여',
    medicationOrDevice: 'Heparin',
    prescriptionItemId: 3,
  }), 'LEGACY_EVENT')
  assert.equal(timeline.procedureEventSource({
    eventCategory: 'Guidewire',
    medicationOrDevice: 'Sion Blue',
  }), 'LEGACY_EVENT')
  assert.equal(timeline.procedureEventSource({
    eventCategory: 'CAG',
    medicationOrDevice: '',
  }), 'PROCEDURE_EVENT')
})

test('timeline rows from separate records sort by time without merging their ids', () => {
  const sorted = [
    { id: 'event:2', occurredAt: '2026-09-29T09:30:00Z', time: '09:30' },
    { id: 'medication:1', occurredAt: '2026-09-29T09:10:00Z', time: '09:10' },
    { id: 'device:4', occurredAt: '2026-09-29T09:20:00Z', time: '09:20' },
  ].sort(timeline.compareTimelineItems)
  assert.deepEqual(sorted.map((item) => item.id), ['medication:1', 'device:4', 'event:2'])
})

test('device material fills empty procedure content and keeps later clinician edits', () => {
  assert.equal(timeline.syncedDeviceContent('DEVICE_USAGE', '', '', 'Sion Blue'), 'Sion Blue')
  assert.equal(timeline.syncedDeviceContent('DEVICE_USAGE', 'Sion Blue', 'Sion Blue', 'Runthrough NS'), 'Runthrough NS')
  assert.equal(timeline.syncedDeviceContent('DEVICE_USAGE', 'LAD wiring 완료', 'Sion Blue', 'Runthrough NS'), 'LAD wiring 완료')
  assert.equal(timeline.resolvedTimelineContent('DEVICE_USAGE', '', 'Sion Blue'), 'Sion Blue')
  assert.equal(timeline.resolvedTimelineContent('PROCEDURE_EVENT', '', 'Sion Blue'), '')
})
