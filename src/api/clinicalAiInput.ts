import type { FollowUpExamination, PatientFollowUpRecords } from '../types'
import { getPatientClinicalFeatureSnapshot, getPatientFollowUpRecords } from './client'
import { selectLabExaminationForPatient } from './patientSelection'

const LAB_CODES = new Set(['FBS', 'CR', 'TG', 'LDL', 'HDL', 'BUN', 'ESR', 'HB', 'K', 'NA', 'WBC', 'LYMPH', 'NEUT', 'PLT', 'EF-TTE'])
const DECIMAL_LAB_CODES = new Set(['CR', 'HDL', 'HB', 'K'])

function isLabExamination(exam: FollowUpExamination) {
  return exam.examinationType.category.toUpperCase().includes('LAB')
    || exam.examinationType.code.toUpperCase().includes('LAB')
}

function labModelName(code: string) {
  if (code === 'NA') return 'Na'
  if (code === 'LYMPH') return 'Lymph'
  if (code === 'NEUT') return 'Neut'
  return code
}

export function buildClinicalAiInput(
  snapshot?: Record<string, string | number> | null,
  exam?: FollowUpExamination | null,
) {
  const payload: Record<string, number | string> = { ...(snapshot ?? {}) }
  ;(exam?.result?.measurements ?? []).forEach((item) => {
    const code = item.code.trim().toUpperCase()
    if (!LAB_CODES.has(code) || item.valueNumeric === undefined) return
    payload[labModelName(code)] = DECIMAL_LAB_CODES.has(code) ? item.valueNumeric : Math.round(item.valueNumeric)
  })
  if (exam?.clinicalInput) return { ...payload, ...exam.clinicalInput }
  return payload
}

export function labAiCandidatesFromRecords(records: PatientFollowUpRecords | null) {
  return (records?.visits ?? []).flatMap((visit) =>
    visit.examinations
      .filter(isLabExamination)
      .map((exam) => ({ exam, stageLabel: visit.stageLabel, visitDate: visit.visitDate })),
  )
}

export async function loadClinicalAiPrefill(patientId: number, preferredExaminationId?: number) {
  const [snapshotResult, followUpResult] = await Promise.allSettled([
    getPatientClinicalFeatureSnapshot(patientId),
    getPatientFollowUpRecords(patientId),
  ])
  const snapshot = snapshotResult.status === 'fulfilled' ? snapshotResult.value : null
  const records = followUpResult.status === 'fulfilled' ? followUpResult.value : null
  const candidates = labAiCandidatesFromRecords(records)
  const selected = selectLabExaminationForPatient(
    candidates,
    preferredExaminationId ?? null,
    patientId,
    records?.patient.id,
  ) ?? (records?.patient.id === patientId ? candidates.at(-1) : undefined)

  return {
    input: buildClinicalAiInput(snapshot, selected?.exam),
    sourceLabel: selected?.stageLabel ?? (snapshot ? '환자 등록 원본 임상기록' : ''),
    examinationId: selected?.exam.examinationId ?? preferredExaminationId,
    examinationPatient: records?.patient.id === patientId ? records.patient : null,
  }
}
