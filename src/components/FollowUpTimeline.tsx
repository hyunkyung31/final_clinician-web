import { useEffect, useState } from 'react'
import { BrainCircuit, CalendarClock, FlaskConical, Images, LoaderCircle } from 'lucide-react'
import { getPatientFollowUpRecords } from '../api/client'
import type { LabObservation, PatientFollowUpRecords } from '../types'

function dateLabel(value: string) {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium' }).format(date)
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
    setLoading(true)
    setError('')
    void getPatientFollowUpRecords(patientId)
      .then((payload) => {
        if (active) {
          setRecords(payload)
          onRecords?.(payload)
        }
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
        <div className="followup-header-actions">{currentRecords && <b>{currentRecords.programGroup || 'FOLLOW-UP'} · {currentRecords.visitCount}회</b>}<button className="lab-ai-launch" onClick={onAnalyzeLab} disabled={!hasLab} type="button"><BrainCircuit size={18} />혈액검사 AI 분석</button></div>
      </header>
      {loading && <div className="followup-state"><LoaderCircle className="spin" size={15} />기록을 불러오는 중…</div>}
      {error && <div className="followup-state error">{error}</div>}
      {currentRecords && (
        <div className="followup-visits">
          {currentRecords.visits.map((visit, index) => (
            <article key={`${visit.stage}-${visit.encounterId}`}>
              <div className="followup-step"><b>{index + 1}</b><span /></div>
              <header><strong>{visit.stageLabel}</strong><time>{dateLabel(visit.visitDate)}</time></header>
              <div className="followup-exams">
                {visit.examinations.map((exam) => {
                  const measurements = exam.result?.measurements ?? []
                  const loaded = labObservations.filter((item) => item.examinationId === exam.examinationId)
                  const flags = loaded.length ? loaded.map((item) => item.flag) : measurements.map((item) => item.abnormalFlag)
                  const normal = flags.filter((flag) => flag === 'NORMAL').length
                  const abnormal = flags.filter((flag) => ['HIGH', 'LOW', 'CRITICAL_HIGH', 'CRITICAL_LOW', 'ABNORMAL'].includes(flag)).length
                  const unknown = flags.length - normal - abnormal
                  const isLab = exam.examinationType.category.toUpperCase().includes('LAB') || exam.examinationType.code.toUpperCase().includes('LAB')
                  if (scope === 'LAB' && !isLab) return null
                  if (isLab) return (
                    <button className={`followup-lab-select ${selectedExaminationId === exam.examinationId ? 'selected' : ''}`} key={`${exam.orderId}-${exam.examinationId}`} onClick={() => onSelectLab?.(exam.examinationId)} type="button" aria-pressed={selectedExaminationId === exam.examinationId}>
                      <span><FlaskConical size={13} /><strong>{exam.examinationType.name}</strong></span>
                      <div className="followup-lab-counts"><small>검사 {flags.length}개</small><b className="normal">정상 {normal}</b><b className={abnormal ? 'abnormal' : ''}>비정상 {abnormal}</b>{unknown > 0 && <small>미판정 {unknown}</small>}</div>
                    </button>
                  )
                  return (
                    <details key={`${exam.orderId}-${exam.examinationId}`}>
                      <summary>
                        <span>{exam.examinationType.category === 'LAB' ? <FlaskConical size={13} /> : <Images size={13} />}<strong>{exam.examinationType.name}</strong></span>
                        {abnormal > 0 && <b>{abnormal} 이상</b>}
                      </summary>
                      {measurements.length > 0 && <div className="followup-measurements">
                        {measurements.map((measurement) => <span key={measurement.id} className={measurement.abnormalFlag.toLowerCase()}><b>{measurement.code}</b>{measurement.valueNumeric ?? measurement.valueText ?? '-'} {measurement.unit}<em>{measurement.abnormalFlag}</em></span>)}
                      </div>}
                      {measurements.length === 0 && <p>결과 데이터가 없습니다.</p>}
                    </details>
                  )
                })}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
