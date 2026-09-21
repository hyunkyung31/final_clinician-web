import { useEffect, useState } from 'react'
import { BrainCircuit, CalendarClock, FlaskConical, Images, LoaderCircle } from 'lucide-react'
import { getPatientFollowUpRecords } from '../api/client'
import {
  LAB_REFERENCE_LABELS,
  countLabReferenceStatuses,
  labCountPhrases,
  labReferenceStatus,
  labReferenceStatusClass,
  labReferenceStatusLabel,
  labVisitHistoryLabel,
  type LabStatusInput,
} from '../labReferenceStatus'
import type { FollowUpExamination, LabObservation, PatientFollowUpRecords } from '../types'

function dateLabel(value: string) {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium' }).format(date)
}

function isLabExamination(exam: FollowUpExamination) {
  return exam.examinationType.category.toUpperCase().includes('LAB') || exam.examinationType.code.toUpperCase().includes('LAB')
}

function examStatusInputs(exam: FollowUpExamination, labObservations: LabObservation[]): LabStatusInput[] {
  const loaded = labObservations.filter((item) => item.examinationId === exam.examinationId)
  return loaded.length ? loaded : exam.result?.measurements ?? []
}

function LabCountSummary({ items }: { items: LabStatusInput[] }) {
  const counts = countLabReferenceStatuses(items)
  const phrases = labCountPhrases(counts)
  return (
    <div className="followup-lab-counts">
      <small>{phrases.total}</small>
      <b className="in-range">{phrases.inRange}</b>
      <b className={counts.outOfRange ? 'out-of-range' : ''}>{phrases.outOfRange}</b>
      {phrases.noReference && <small className="no-reference">{phrases.noReference}</small>}
      {phrases.noResult && <small className="no-result">{phrases.noResult}</small>}
    </div>
  )
}

export function FollowUpTimeline({
  patientId,
  onRecords,
  onAnalyzeLab,
  onSelectLab,
  selectedExaminationId,
  labObservations = [],
  refreshKey = 0,
  scope = 'ALL',
}: {
  patientId?: number
  onRecords?: (records: PatientFollowUpRecords | null) => void
  onAnalyzeLab?: () => void
  onSelectLab?: (examinationId: number) => void
  selectedExaminationId?: number
  labObservations?: LabObservation[]
  refreshKey?: number
  scope?: 'ALL' | 'LAB'
}) {
  const [records, setRecords] = useState<PatientFollowUpRecords | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setRecords(null)
    onRecords?.(null)
    setError('')
    if (!patientId) {
      setLoading(false)
      return
    }
    let active = true
    const requestedPatientId = patientId
    setLoading(true)
    setError('')
    void getPatientFollowUpRecords(requestedPatientId)
      .then((payload) => {
        if (!active || payload.patient.id !== requestedPatientId) return
        setRecords(payload)
        onRecords?.(payload)
      })
      .catch((requestError) => {
        if (active) setError(requestError instanceof Error ? requestError.message : '추적관찰 기록을 불러오지 못했습니다.')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [onRecords, patientId, refreshKey])

  if (!patientId) return null
  const currentRecords = records?.patient.id === patientId ? records : null
  const hasLab = currentRecords?.visits.some((visit) => visit.examinations.some((exam) => exam.result?.resultType === 'LAB_PANEL'))

  return (
    <section className={`followup-panel${scope === 'LAB' ? ' lab-followup-panel' : ''}`}>
      <header>
        <div><CalendarClock size={17} /><span><strong>{scope === 'LAB' ? '혈액검사 추적관찰' : '환자 추적관찰'}</strong><small>최초검사 → 1차 추적검사 → 2차 추적검사</small></span></div>
        <div className="followup-header-actions">{currentRecords && <b>{labVisitHistoryLabel(currentRecords.visitCount)}</b>}<button className="lab-ai-launch" onClick={onAnalyzeLab} disabled={!hasLab} type="button"><BrainCircuit size={18} />혈액검사 AI 분석</button></div>
      </header>
      <p className="followup-disclaimer">{LAB_REFERENCE_LABELS.disclaimer}</p>
      {loading && <div className="followup-state"><LoaderCircle className="spin" size={15} />기록을 불러오는 중…</div>}
      {error && <div className="followup-state error">{error}</div>}
      {currentRecords && (
        <div className="followup-visits">
          {currentRecords.visits.map((visit, index) => {
            const visitItems = visit.examinations.filter(isLabExamination).flatMap((exam) => examStatusInputs(exam, labObservations))
            return (
            <article key={`${visit.stage}-${visit.encounterId}`}>
              <div className="followup-step"><b>{index + 1}</b><span /></div>
              <header><strong>{visit.stageLabel}</strong><time>{dateLabel(visit.visitDate)}</time></header>
              {scope === 'LAB' && visitItems.length > 0 && <LabCountSummary items={visitItems} />}
              <div className="followup-exams">
                {visit.examinations.map((exam) => {
                  const isLab = isLabExamination(exam)
                  if (scope === 'LAB' && !isLab) return null
                  if (isLab) return (
                    <button className={`followup-lab-select ${selectedExaminationId === exam.examinationId ? 'selected' : ''}`} key={`${exam.orderId}-${exam.examinationId}`} onClick={() => onSelectLab?.(exam.examinationId)} type="button" aria-pressed={selectedExaminationId === exam.examinationId}>
                      <span><FlaskConical size={13} /><strong>{exam.examinationType.name}</strong></span>
                    </button>
                  )
                  const items = examStatusInputs(exam, labObservations)
                  const counts = countLabReferenceStatuses(items)
                  return (
                    <details key={`${exam.orderId}-${exam.examinationId}`}>
                      <summary>
                        <span>{exam.examinationType.category === 'LAB' ? <FlaskConical size={13} /> : <Images size={13} />}<strong>{exam.examinationType.name}</strong></span>
                        {counts.outOfRange > 0 && <b className="out-of-range">{LAB_REFERENCE_LABELS.outOfRange} {counts.outOfRange}</b>}
                      </summary>
                      {items.length > 0 && <div className="followup-measurements">
                        {items.map((measurement, measurementIndex) => {
                          const status = labReferenceStatus(measurement)
                          const value = measurement.value ?? measurement.valueNumeric ?? measurement.textValue ?? measurement.valueText ?? '-'
                          const name = measurement.code || measurement.name || '검사'
                          return (
                            <span key={measurement.id ?? `${name}-${measurementIndex}`} className={labReferenceStatusClass(status)}>
                              <b>{name}</b>{value} {measurement.unit}<em>{labReferenceStatusLabel(status)}</em>
                            </span>
                          )
                        })}
                      </div>}
                      {items.length === 0 && <p>결과 데이터가 없습니다.</p>}
                    </details>
                  )
                })}
              </div>
            </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
