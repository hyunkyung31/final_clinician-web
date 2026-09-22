import type { ImagingStudySummary } from '../types'

export function isImagingStudyOwnedByPatient(study: ImagingStudySummary, patientId?: number | null): boolean {
  return Number.isSafeInteger(patientId) && patientId! > 0 && study.patientId === patientId
}
