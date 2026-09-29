import { useEffect, useMemo, useState } from 'react'
import { ClipboardList, LoaderCircle, Pill } from 'lucide-react'

import {
  getExaminationOrders,
  getExaminationTypes,
  getMedicalResultDetail,
  getPatientReports,
  getPrescriptionDetail,
  getPrescriptions,
  releaseMedicalResult,
  signoffMedicalResult,
} from '../api/client'
import type {
  DashboardAIStatus,
  ExaminationOrderSummary,
  ExaminationTypeSummary,
  ImagingStudySummary,
  MedicalResultDetail,
  PatientDetail,
  PatientMemo,
  PatientReportSummary,
  PatientSummary,
  PrescriptionDetail,
  StaffDoctor,
  StaffIdentity,
  TimelineItem,
} from '../types'
import {
  HUB_COPY,
  aiStatusCopy,
  cctaAssistBullets,
  clinicalAssistCopy,
  clinicianErrorMessage,
  formatHubDate,
  formatHubDateTime,
  impressionBullets,
  latestReportStatus,
  nextStepRecommendations,
  reportApprovalSteps,
  reportBadgeClass,
  reportStatusCopy,
  reportStatusLabels,
  studyFilterKey,
  studyKindLabel,
  studyStatusLabel,
  synthesisHeadline,
  xcaAssistBullets,
  type HubView,
} from '../workstationHub'
import { ClinicalAIAnalysisPanel } from './ClinicalAIAnalysisPanel'
import { StudyDicomViewer } from './StudyDicomViewer'
import '../workstation-hub.css'

interface WorkstationHubProps {
  patient: PatientSummary
  patientDetail: PatientDetail | null
  patientDetailLoading: boolean
  patientDetailError: string
  imagingStudies: ImagingStudySummary[]
  studiesLoading: boolean
  studiesError: string
  selectedStudy: ImagingStudySummary | null
  onSelectStudy: (studyId: number) => void
  timelineItems: TimelineItem[]
  timelineLoading: boolean
  memos: PatientMemo[]
  memosLoading: boolean
  memoError: string
  onReloadMemos: () => Promise<void>
  encounterId: number | null
  examinationId?: number
  aiStatus: DashboardAIStatus | null
  staffIdentity: StaffIdentity | null
  staffDoctor: StaffDoctor | null
  onOpenPrescriptions: () => void
  onOpenReports: () => void
  onOpenExamImaging: () => void
  onOpenXcaDetail: () => void
  onOpenCcta3d: () => void
}

type ExamFilter = 'ALL' | 'CT' | 'XCA' | 'US'
type ConfirmKind = 'signoff' | 'release' | null

const orderStatusLabel: Record<ExaminationOrderSummary['status'], string> = {
  ORDERED: '오더됨',
  SCHEDULED: '예약됨',
  COMPLETED: '완료',
  CANCELED: '취소',
}

export function WorkstationHub({
  patient,
  patientDetail,
  patientDetailLoading,
  patientDetailError,
  imagingStudies,
  studiesLoading,
  studiesError,
  selectedStudy,
  onSelectStudy,
  encounterId,
  examinationId,
  aiStatus,
  staffIdentity,
  staffDoctor,
  onOpenPrescriptions,
  onOpenReports,
  onOpenExamImaging,
  onOpenXcaDetail,
  onOpenCcta3d,
}: WorkstationHubProps) {
  const [view, setView] = useState<HubView>('summary')
  const [examFilter, setExamFilter] = useState<ExamFilter>('ALL')
  const [reports, setReports] = useState<PatientReportSummary[]>([])
  const [detail, setDetail] = useState<MedicalResultDetail | null>(null)
  const [orders, setOrders] = useState<ExaminationOrderSummary[]>([])
  const [orderTypes, setOrderTypes] = useState<ExaminationTypeSummary[]>([])
  const [prescription, setPrescription] = useState<PrescriptionDetail | null>(null)
  const [hubError, setHubError] = useState('')
  const [busyAction, setBusyAction] = useState('')
  const [confirm, setConfirm] = useState<ConfirmKind>(null)

  const patientId = patient.backendId
  const latestReport = reports[0] ?? null
  const reportStatus = latestReportStatus(detail?.workflow.status || latestReport?.status)
  const hasCompletedAi = Boolean(detail?.aiSummaries.clinical || detail?.aiSummaries.xca || detail?.aiSummaries.ccta)
  const aiLabel = aiStatusCopy(aiStatus, hasCompletedAi)

  useEffect(() => {
    setView('summary')
    setConfirm(null)
    setDetail(null)
    setReports([])
    setOrders([])
    setPrescription(null)
    setHubError('')
  }, [patientId])

  useEffect(() => {
    let active = true
    void getExaminationTypes()
      .then((items) => { if (active) setOrderTypes(items) })
      .catch(() => { if (active) setOrderTypes([]) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!patientId) return
    let active = true
    void Promise.all([
      getPatientReports(patientId),
      getExaminationOrders(patientId),
      getPrescriptions(patientId),
    ])
      .then(async ([reportItems, orderItems, prescriptionItems]) => {
        if (!active) return
        setReports(reportItems)
        setOrders([...orderItems].sort((left, right) => (
          (Date.parse(right.orderedAt) || right.id) - (Date.parse(left.orderedAt) || left.id)
        )))

        const latestPrescription = [...prescriptionItems].sort((left, right) => (
          (Date.parse(right.prescribedAt || right.updatedAt) || right.id) -
          (Date.parse(left.prescribedAt || left.updatedAt) || left.id)
        ))[0]
        setPrescription(latestPrescription ? await getPrescriptionDetail(latestPrescription.id) : null)

        const firstReport = reportItems[0]
        setDetail(firstReport ? await getMedicalResultDetail(firstReport.medicalResultId) : null)
      })
      .catch((error) => {
        if (active) setHubError(clinicianErrorMessage(error, HUB_COPY.loadFailed))
      })
    return () => { active = false }
  }, [patientId])

  const filteredStudies = imagingStudies.filter((study) => (
    examFilter === 'ALL' || studyFilterKey(study) === examFilter
  ))
  const visibleStudies = filteredStudies.slice(0, 6)
  const currentOrders = orders.filter((item) => item.encounterId === encounterId).slice(0, 4)
  const visibleOrders = currentOrders.length ? currentOrders : orders.slice(0, 4)
  const orderTypeMap = useMemo(
    () => new Map(orderTypes.map((item) => [item.id, item])),
    [orderTypes],
  )

  const clinical = clinicalAssistCopy(detail?.aiSummaries.clinical ?? null)
  const synthesisLines = impressionBullets(detail).slice(0, 3)
  const xcaLines = xcaAssistBullets(detail?.aiSummaries.xca ?? null).slice(0, 3)
  const cctaLines = cctaAssistBullets(detail?.aiSummaries.ccta ?? null).slice(0, 2)
  const recommendLines = nextStepRecommendations(detail).slice(0, 3)
  const doctorName = detail?.workflow.signedBy || detail?.encounter.doctorName || latestReport?.doctorName || staffDoctor?.name || staffIdentity?.name || '-'
  const departmentName = detail?.workflow.signedDepartment || staffDoctor?.departmentName || staffIdentity?.departmentName || '-'
  const sexAge = `${patientDetail?.sex ?? patient.sex} / ${patientDetail?.age ?? patient.age}`

  const runReportAction = async (
    name: string,
    action: () => Promise<MedicalResultDetail>,
  ) => {
    setBusyAction(name)
    setHubError('')
    try {
      setDetail(await action())
      if (patientId) setReports(await getPatientReports(patientId))
    } catch (error) {
      setHubError(clinicianErrorMessage(error, '요청을 처리하지 못했습니다.'))
    } finally {
      setBusyAction('')
      setConfirm(null)
    }
  }

  return (
    <div className="ws-hub ws-hub-clean">
      <header className="ws-hub-header">
        <div className="ws-hub-identity">
          <strong>{patientDetail?.name ?? patient.name}</strong>
          <span>{sexAge}</span>
          <span>환자번호 <b>{patientDetail?.medicalRecordNo ?? patient.id}</b></span>
          <span>진료과 <b>{departmentName}</b></span>
          <span>담당의 <b>{doctorName}</b></span>
          {patientDetailLoading && <small>환자 정보 불러오는 중…</small>}
          <span className={`ws-badge ${aiLabel.includes('완료') ? 'ok' : aiLabel.includes('실패') ? 'alert' : 'info'}`}>{aiLabel}</span>
          <span className={`ws-badge ${reportBadgeClass(reportStatus)}`}>{reportStatus === 'NONE' ? '보고서 없음' : reportStatusLabels[reportStatus]}</span>
        </div>
        <div className="ws-hub-actions">
          <button type="button" onClick={() => setView('imaging')}>영상 보기</button>
          <button type="button" onClick={() => setView('ai')}>AI 결과</button>
          <button className="primary" type="button" onClick={onOpenReports}>결과보고서</button>
        </div>
      </header>

      <nav className="ws-hub-tabs" aria-label="워크스테이션 보기">
        <button className={view === 'summary' ? 'active' : ''} onClick={() => setView('summary')} type="button">통합 요약</button>
        <button className={view === 'imaging' ? 'active' : ''} onClick={() => setView('imaging')} type="button">영상 보기</button>
        <button className={view === 'ai' ? 'active' : ''} onClick={() => setView('ai')} type="button">AI 결과</button>
        <button className={view === 'report' ? 'active' : ''} onClick={() => setView('report')} type="button">보고서</button>
      </nav>

      {(hubError || patientDetailError) && <p className="ws-empty ws-alert" role="alert">{hubError || HUB_COPY.loadFailed}</p>}

      <div className="ws-hub-body">
        {view === 'summary' && (
          <div className="ws-hub-grid ws-hub-grid-clean">
            <div className="ws-col ws-col-left">
              <section className="ws-card ws-card-exams">
                <header><h3>최근 검사</h3><button type="button" onClick={onOpenExamImaging}>전체보기</button></header>
                <div className="ws-filters">
                  {(['ALL', 'CT', 'XCA', 'US'] as const).map((key) => (
                    <button className={examFilter === key ? 'active' : ''} key={key} onClick={() => setExamFilter(key)} type="button">{key === 'ALL' ? '전체' : key}</button>
                  ))}
                </div>
                <div className="ws-exam-list">
                  {studiesLoading && <p className="ws-empty"><LoaderCircle className="spin" size={14} /> 검사 목록을 불러오는 중…</p>}
                  {!studiesLoading && studiesError && <p className="ws-empty">{HUB_COPY.loadFailed}</p>}
                  {!studiesLoading && !studiesError && visibleStudies.map((study) => {
                    const status = studyStatusLabel(study)
                    const kind = studyKindLabel(study)
                    return (
                      <button className={`ws-exam-row ${selectedStudy?.id === study.id ? 'active' : ''}`} key={study.id} onClick={() => {
                        onSelectStudy(study.id)
                        if (kind === 'XCA') onOpenXcaDetail()
                        else setView('imaging')
                      }} type="button">
                        <span className="ws-kind">{kind}</span>
                        <span><strong>{study.description || kind}</strong><small>{(study.studyDate || '').slice(0, 10) || formatHubDate(study.studyDate)}</small></span>
                        <span className={`ws-badge ${status.tone}`}>{status.label}</span>
                      </button>
                    )
                  })}
                  {!studiesLoading && !studiesError && visibleStudies.length === 0 && <p className="ws-empty">{HUB_COPY.noExam}</p>}
                </div>
              </section>
            </div>

            <div className="ws-col ws-col-center">
              <div className="ws-hub-banner">
                <span className="ws-hub-banner-mark" aria-hidden="true">AI</span>
                <div><strong>{HUB_COPY.bannerTitle}</strong><p>{HUB_COPY.bannerLead}</p></div>
              </div>

              <section className="ws-card ws-synthesis">
                <header><h3>종합 판독 요약</h3><span className={`ws-badge ${reportBadgeClass(reportStatus)}`}>{reportStatus === 'NONE' ? '작성 전' : reportStatusLabels[reportStatus]}</span></header>
                {synthesisHeadline(detail) ? <p className="lead">{synthesisHeadline(detail)}</p> : <p className="ws-empty">{HUB_COPY.noAi}</p>}
                {synthesisLines.length > 0 && <ul className="ws-list">{synthesisLines.map((line) => <li key={line}>{line}</li>)}</ul>}
                <small className="ws-meta">담당의 {doctorName} · {formatHubDateTime(detail?.workflow.signedAt || latestReport?.updatedAt)}</small>
              </section>

              <div className="ws-ai-grid">
                <section className="ws-card ws-ai-card">
                  <header><strong>Clinical AI</strong><span className={`ws-badge ${detail?.aiSummaries.clinical ? 'ok' : 'muted'}`}>{detail?.aiSummaries.clinical ? '분석 완료' : '결과 없음'}</span></header>
                  {clinical.headline ? <p className="metric">{clinical.headline}</p> : <p className="ws-empty">{HUB_COPY.noAi}</p>}
                  {clinical.bullets.map((line) => <p className="metric" key={line}>{line}</p>)}
                  <div className="ws-card-actions"><button type="button" onClick={() => setView('ai')}>상세 결과</button></div>
                </section>
                <section className="ws-card ws-ai-card">
                  <header><strong>2D XCA</strong><span className={`ws-badge ${detail?.aiSummaries.xca ? 'ok' : 'muted'}`}>{detail?.aiSummaries.xca ? '분석 완료' : '결과 없음'}</span></header>
                  {xcaLines.length ? xcaLines.map((line) => <p className="metric" key={line}>{line}</p>) : <p className="ws-empty">{HUB_COPY.noAi}</p>}
                  <div className="ws-card-actions"><button type="button" onClick={onOpenXcaDetail}>상세 결과</button></div>
                </section>
                <section className="ws-card ws-ai-card">
                  <header><strong>3D CCTA 석회화</strong><span className={`ws-badge ${detail?.aiSummaries.ccta ? 'ok' : 'muted'}`}>{detail?.aiSummaries.ccta ? '분석 완료' : '결과 없음'}</span></header>
                  {detail?.aiSummaries.ccta && cctaLines.length ? cctaLines.map((line) => <p className="metric" key={line}>{line}</p>) : <p className="ws-empty">완료된 CCTA 분석 결과가 없습니다.</p>}
                  <div className="ws-card-actions"><button disabled={!detail?.aiSummaries.ccta} type="button" onClick={onOpenCcta3d}>3D 결과</button></div>
                </section>
              </div>

              <section className="ws-card ws-card-recommend">
                <header><h3>권고 사항 및 다음 단계</h3><span className="ws-badge info">임상 판단 참고</span></header>
                {recommendLines.length ? <ol className="ws-list">{recommendLines.map((line) => <li key={line}>{line}</li>)}</ol> : <p className="ws-empty">연결된 분석 결과가 없어 권고안을 구성하지 않았습니다.</p>}
                <div className="ws-card-actions"><button disabled={!recommendLines.length} onClick={onOpenPrescriptions} type="button">오더·처방에서 검토</button></div>
              </section>
            </div>

            <div className="ws-col ws-col-right">
              <section className="ws-card ws-overview-card">
                <header><div><h3>오더·처방 현황</h3><small>조회 전용</small></div><button type="button" onClick={onOpenPrescriptions}>전체보기</button></header>

                <div className="ws-overview-block">
                  <div className="ws-overview-title"><span><ClipboardList size={14} />검사·시술 오더</span><b>{orders.length}건</b></div>
                  {visibleOrders.length ? visibleOrders.map((order) => {
                    const type = orderTypeMap.get(order.examinationTypeId)
                    return (
                      <div className="ws-overview-row" key={order.id}>
                        <span><strong>{type?.name ?? `검사 #${order.examinationTypeId}`}</strong><small>{type?.code ?? `Order #${order.id}`}</small></span>
                        <b className={`order-status ${order.status.toLowerCase()}`}>{orderStatusLabel[order.status]}</b>
                      </div>
                    )
                  }) : <p className="ws-empty">등록된 오더가 없습니다.</p>}
                </div>

                <div className="ws-overview-block">
                  <div className="ws-overview-title"><span><Pill size={14} />최근 약물 처방</span><b>{prescription?.items.length ?? 0}건</b></div>
                  {prescription?.items.length ? prescription.items.slice(0, 4).map((item) => (
                    <div className="ws-overview-row" key={item.id}>
                      <span><strong>{item.medication?.name ?? `약품 #${item.medicationId}`}</strong><small>{[item.doseValue, item.doseUnit, item.route].filter(Boolean).join(' · ') || '세부 용법 미입력'}</small></span>
                      <b>{prescription.prescription.status === 'SIGNED' ? '서명 완료' : prescription.prescription.status === 'DRAFT' ? '작성 중' : '취소'}</b>
                    </div>
                  )) : <p className="ws-empty">등록된 약물 처방이 없습니다.</p>}
                </div>
              </section>

              <section className="ws-card ws-card-sign">
                <header><h3>결과보고서 상태</h3></header>
                <div className="ws-steps">
                  {reportApprovalSteps(reportStatus).map((step, index) => (
                    <span className={step.tone} key={step.key}><b>{index + 1}</b><strong>{step.label}</strong><small>{step.hint}</small></span>
                  ))}
                </div>
                <p className="ws-sign-meta">{reportStatusCopy(reportStatus)}</p>
                <div className="ws-card-actions">
                  <button type="button" onClick={onOpenReports}>보고서 열기</button>
                  {(reportStatus === 'DRAFT' || reportStatus === 'REVIEWING' || reportStatus === 'NONE') && <button className="primary" disabled={!detail?.workflow.canSignoff || Boolean(busyAction)} onClick={() => setConfirm('signoff')} type="button">최종 승인</button>}
                  {reportStatus === 'SIGNED' && <button className="primary" disabled={!detail?.workflow.canRelease || Boolean(busyAction)} onClick={() => setConfirm('release')} type="button">환자 공개</button>}
                  {reportStatus === 'RELEASED' && <button disabled type="button">환자 공개 완료</button>}
                </div>
              </section>
            </div>
          </div>
        )}

        {view === 'imaging' && <div className="ws-viewer">{selectedStudy ? <StudyDicomViewer key={`${patientId}-${selectedStudy.id}`} study={selectedStudy} /> : <p className="ws-empty">{studiesError ? HUB_COPY.imageError : HUB_COPY.noImage}</p>}</div>}
        {view === 'ai' && <ClinicalAIAnalysisPanel patient={patient} patientDetail={patientDetail} examinationId={examinationId} />}
        {view === 'report' && (
          <section className="ws-card">
            <header><h3>결과보고서</h3><span className={`ws-badge ${reportBadgeClass(reportStatus)}`}>{reportStatus === 'NONE' ? '없음' : reportStatusLabels[reportStatus]}</span></header>
            {reportStatus === 'NONE' ? <p className="ws-empty">{HUB_COPY.noReport}</p> : <p>{reportStatusCopy(reportStatus)}</p>}
            <div className="ws-card-actions"><button className="primary" type="button" onClick={onOpenReports}>보고서 열기</button></div>
          </section>
        )}
      </div>

      {confirm && (
        <div className="ws-confirm-backdrop" onClick={() => setConfirm(null)}>
          <div className="ws-confirm" onClick={(event) => event.stopPropagation()} role="dialog">
            {confirm === 'signoff' && <><h3>결과보고서를 최종 승인하시겠습니까?</h3><p>현재 보고서 내용이 최종본으로 확정됩니다.</p><div className="ws-confirm-actions"><button type="button" onClick={() => setConfirm(null)}>취소</button><button className="primary" disabled={!detail || Boolean(busyAction)} onClick={() => detail && void runReportAction('signoff', () => signoffMedicalResult(detail.medicalResultId))} type="button">최종 승인</button></div></>}
            {confirm === 'release' && <><h3>환자에게 결과보고서를 공개하시겠습니까?</h3><p>공개 후 환자는 승인된 최종 결과보고서를 확인할 수 있습니다.</p><div className="ws-confirm-actions"><button type="button" onClick={() => setConfirm(null)}>취소</button><button className="primary" disabled={!detail || Boolean(busyAction)} onClick={() => detail && void runReportAction('release', () => releaseMedicalResult(detail.medicalResultId))} type="button">환자에게 공개</button></div></>}
          </div>
        </div>
      )}
    </div>
  )
}
