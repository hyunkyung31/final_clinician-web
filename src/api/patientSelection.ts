import type { PatientSummary } from '../types'

export interface ExaminationPatientIdentity {
  id?: number
  medicalRecordNo?: string
}

export function resolveSelectedPatient(
  selectedId: string,
  lists: Array<Iterable<PatientSummary> | null | undefined>,
): PatientSummary | null {
  const seen = new Set<PatientSummary>()
  const patients: PatientSummary[] = []
  for (const list of lists) {
    if (!list) continue
    for (const patient of list) {
      if (!patient || seen.has(patient)) continue
      seen.add(patient)
      patients.push(patient)
    }
  }
  if (!selectedId) return null
  return patients.find((patient) => patient.id === selectedId)
    ?? patients.find((patient) => patient.backendId != null && String(patient.backendId) === selectedId)
    ?? null
}

export function exactPatientSearchMatch(keyword: string, results: PatientSummary[]): PatientSummary | null {
  const query = keyword.trim().toUpperCase()
  if (!query) return null
  const matches = results.filter((patient) => patient.id.toUpperCase() === query)
  return matches.length === 1 ? matches[0] : null
}

export function selectLabExaminationForPatient<T extends { exam: { examinationId: number } }>(
  candidates: T[],
  selectedExaminationId: number | null,
  selectedPatientBackendId?: number,
  recordsPatientId?: number,
): T | undefined {
  if (
    selectedPatientBackendId == null
    || recordsPatientId == null
    || selectedPatientBackendId !== recordsPatientId
  ) {
    return undefined
  }
  const selected = candidates.find((candidate) => candidate.exam.examinationId === selectedExaminationId)
  if (selected) return selected
  if (selectedExaminationId != null) return undefined
  return candidates.at(-1)
}

export function patientExaminationMismatch(
  selectedPatient: PatientSummary | null | undefined,
  examinationPatient: ExaminationPatientIdentity | null | undefined,
): boolean {
  if (!selectedPatient || !examinationPatient) return false
  if (selectedPatient.backendId != null && examinationPatient.id != null) {
    return selectedPatient.backendId !== examinationPatient.id
  }
  if (selectedPatient.id && examinationPatient.medicalRecordNo) {
    return selectedPatient.id !== examinationPatient.medicalRecordNo
  }
  return false
}
