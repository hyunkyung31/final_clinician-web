import { useEffect, useState } from 'react'
import {
  CalendarClock,
  LoaderCircle,
  Pencil,
  Save,
  Search,
  Trash2,
} from 'lucide-react'
import {
  createExaminationOrder,
  createPatientMemo,
  createPatientMedicalResult,
  createPrescriptionDraft,
  createPrescriptionItem,
  deletePatientMemo,
  deletePrescriptionItem,
  getExaminationTypes,
  getMedicalResultDetail,
  getMedications,
  getPatientReports,
  getPrescriptionDetail,
  getPrescriptions,
  releaseMedicalResult,
  runPrescriptionDurCheck,
  signoffMedicalResult,
  updatePatientMemo,
} from '../api/client'
import { ClinicalAIAnalysisPanel } from './ClinicalAIAnalysisPanel'
import { StudyDicomViewer } from './StudyDicomViewer'
import type {
  DashboardAIStatus,
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
  MedicationSummary,
} from '../types'
import {
  HUB_COPY,
  activityLabel,
  aiStatusCopy,
  cctaAssistBullets,
  clinicalAssistCopy,
  clinicianErrorMessage,
  durToneFromResults,
  formatHubDate,
  formatHubDateTime,
  impressionBullets,
  latestReportStatus,
  matchRecommendedOrderTypes,
  nextStepRecommendations,
  orderCategoryTab,
  reportApprovalSteps,
  reportBadgeClass,
  reportStatusCopy,
  reportStatusLabels,
  studyFilterKey,
  studyKindLabel,
  studyStatusLabel,
  synthesisHeadline,
  xcaAssistBullets,
  type DurTone,
  type HubView,
} from '../workstationHub'
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
  onOpenReports: () => void
  onOpenExamImaging: () => void
  onOpenXcaDetail: () => void
  onOpenCcta3d: () => void
}

type ExamFilter = 'ALL' | 'CT' | 'XCA' | 'US'
type OrderTab = 'exam' | 'procedure' | 'other'
type ActionTab = 'order' | 'rx' | 'dur'
type ConfirmKind = 'signoff' | 'release' | 'memo-delete' | null

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
  timelineItems,
  timelineLoading,
  memos,
  memosLoading,
  memoError,
  onReloadMemos,
  encounterId,
  examinationId,
  aiStatus,
  staffIdentity,
  staffDoctor,
  onOpenReports,
  onOpenExamImaging,
  onOpenXcaDetail,
  onOpenCcta3d,
}: WorkstationHubProps) {
  const [view, setView] = useState<HubView>('summary')
  const [examFilter, setExamFilter] = useState<ExamFilter>('ALL')
  const [reports, setReports] = useState<PatientReportSummary[]>([])
  const [detail, setDetail] = useState<MedicalResultDetail | null>(null)
  const [hubError, setHubError] = useState('')
  const [busyAction, setBusyAction] = useState('')
  const [orderTypes, setOrderTypes] = useState<ExaminationTypeSummary[]>([])
  const [orderTab, setOrderTab] = useState<OrderTab>('exam')
  const [actionTab, setActionTab] = useState<ActionTab>('order')
  const [medQuery, setMedQuery] = useState('')
  const [medResults, setMedResults] = useState<MedicationSummary[]>([])
  const [orderQuery, setOrderQuery] = useState('')
  const [selectedTypeIds, setSelectedTypeIds] = useState<number[]>([])
  const [prescription, setPrescription] = useState<PrescriptionDetail | null>(null)
  const [durResults, setDurResults] = useState<Array<{ severity?: string; warning_message?: string }>>([])
  const [durTone, setDurTone] = useState<DurTone>('muted')
  const [memoDraft, setMemoDraft] = useState('')
  const [editingMemoId, setEditingMemoId] = useState<number | null>(null)
  const [editingMemoContent, setEditingMemoContent] = useState('')
  const [memoSaving, setMemoSaving] = useState(false)
  const [localMemoError, setLocalMemoError] = useState('')
  const [confirm, setConfirm] = useState<ConfirmKind>(null)
  const [pendingMemoId, setPendingMemoId] = useState<number | null>(null)

  const patientId = patient.backendId
  const latestReport = reports[0] ?? null
  const reportStatus = latestReportStatus(detail?.workflow.status || latestReport?.status)
  const hasCompletedAi = Boolean(detail?.aiSummaries.clinical || detail?.aiSummaries.xca || detail?.aiSummaries.ccta)
  const aiLabel = aiStatusCopy(aiStatus, hasCompletedAi)

  useEffect(() => {
    setView('summary')
    setSelectedTypeIds([])
    setConfirm(null)
    setDetail(null)
    setReports([])
    setPrescription(null)
    setDurResults([])
    setDurTone('muted')
  }, [patientId])

  useEffect(() => {
    if (!patientId) return
    let active = true
    void getPatientReports(patientId)
      .then(async (items) => {
        if (!active) return
        setReports(items)
        const first = items[0]
        if (!first) {
          setDetail(null)
          return
        }
        const next = await getMedicalResultDetail(first.medicalResultId)
        if (active) setDetail(next)
      })
      .catch((error) => {
        if (active) {
          setReports([])
          setDetail(null)
          setHubError(clinicianErrorMessage(error))
        }
      })
    return () => { active = false }
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
    void getPrescriptions(patientId)
      .then(async (items) => {
        const draft = items.find((item) => item.status === 'DRAFT') ?? items[0]
        if (!draft || !active) {
          if (active) setPrescription(null)
          return
        }
        const next = await getPrescriptionDetail(draft.id)
        if (active) setPrescription(next)
      })
      .catch(() => { if (active) setPrescription(null) })
    return () => { active = false }
  }, [patientId])

  const filteredStudies = imagingStudies.filter((study) => examFilter === 'ALL' || studyFilterKey(study) === examFilter)
  const visibleTypes = orderTypes.filter((type) => {
    if (orderCategoryTab(type.category, type.name, type.code) !== orderTab) return false
    if (!orderQuery.trim()) return true
    return `${type.name} ${type.code}`.toLowerCase().includes(orderQuery.trim().toLowerCase())
  })
  const clinical = clinicalAssistCopy(detail?.aiSummaries.clinical ?? null)
  const doctorName = detail?.workflow.signedBy || detail?.encounter.doctorName || latestReport?.doctorName || staffDoctor?.name || staffIdentity?.name || '-'
  const departmentName = detail?.workflow.signedDepartment || staffDoctor?.departmentName || staffIdentity?.departmentName || '-'
  const sexAge = `${patientDetail?.sex ?? patient.sex} / ${patientDetail?.age ?? patient.age}`
  const headerReportLabel = '보고서'
  const latestMemo = memos[0] ?? null
  const visibleStudies = filteredStudies.slice(0, 5)
  const visibleActivity = timelineItems.slice(0, 4)
  const synthesisLines = impressionBullets(detail).slice(0, 3)
  const xcaLines = xcaAssistBullets(detail?.aiSummaries.xca ?? null).slice(0, 3)
  const cctaLines = cctaAssistBullets(detail?.aiSummaries.ccta ?? null).slice(0, 2)
  const recommendLines = nextStepRecommendations(detail).slice(0, 3)

  const runReportAction = async (name: string, action: () => Promise<MedicalResultDetail>) => {
    setBusyAction(name)
    setHubError('')
    try {
      setDetail(await action())
      if (patientId) setReports(await getPatientReports(patientId))
    } catch (error) {
      setHubError(clinicianErrorMessage(error, '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.'))
    } finally {
      setBusyAction('')
      setConfirm(null)
    }
  }

  const handleCreateReport = async () => {
    if (!patientId) return
    setBusyAction('create')
    setHubError('')
    try {
      const created = await createPatientMedicalResult(patientId)
      setDetail(created)
      setReports(await getPatientReports(patientId))
      setView('report')
    } catch (error) {
      setHubError(clinicianErrorMessage(error, HUB_COPY.noReport))
    } finally {
      setBusyAction('')
    }
  }

  const handleSubmitOrders = async () => {
    if (!encounterId || selectedTypeIds.length === 0) return
    setBusyAction('order')
    setHubError('')
    try {
      for (const typeId of selectedTypeIds) {
        await createExaminationOrder(encounterId, typeId, '워크스테이션 선택 오더')
      }
      setSelectedTypeIds([])
    } catch (error) {
      setHubError(clinicianErrorMessage(error, '오더를 입력하지 못했습니다. 잠시 후 다시 시도해 주세요.'))
    } finally {
      setBusyAction('')
    }
  }

  const fillRecommendedOrders = () => {
    setSelectedTypeIds(matchRecommendedOrderTypes(orderTypes).map((item) => item.id))
    setOrderTab('exam')
    setActionTab('order')
    setView('summary')
  }

  const reloadPrescription = async () => {
    if (!patientId) return
    const items = await getPrescriptions(patientId)
    const draft = items.find((item) => item.status === 'DRAFT') ?? items[0]
    if (!draft) {
      setPrescription(null)
      return
    }
    setPrescription(await getPrescriptionDetail(draft.id))
  }

  const handleCreateDraftRx = async () => {
    if (!patientId || !encounterId) return
    setBusyAction('rx')
    setHubError('')
    try {
      const created = await createPrescriptionDraft(encounterId, patientId)
      setPrescription(await getPrescriptionDetail(created.id))
      setActionTab('rx')
    } catch (error) {
      setHubError(clinicianErrorMessage(error, '처방 초안을 만들지 못했습니다.'))
    } finally {
      setBusyAction('')
    }
  }

  const handleSearchMeds = async (value: string) => {
    setMedQuery(value)
    if (!value.trim()) {
      setMedResults([])
      return
    }
    try {
      setMedResults((await getMedications(value.trim())).slice(0, 5))
    } catch {
      setMedResults([])
    }
  }

  const handleAddMed = async (medication: MedicationSummary) => {
    if (!prescription?.prescription.id) return
    setBusyAction('rx')
    setHubError('')
    try {
      await createPrescriptionItem(prescription.prescription.id, {
        medicationId: medication.id,
        doseValue: undefined,
        doseUnit: medication.defaultUnit || '',
        frequencyPerDay: undefined,
        durationDays: undefined,
        route: 'PO',
        instructions: '',
        note: '',
        startDate: '',
        endDate: '',
      })
      setMedQuery('')
      setMedResults([])
      await reloadPrescription()
    } catch (error) {
      setHubError(clinicianErrorMessage(error, '약품을 추가하지 못했습니다.'))
    } finally {
      setBusyAction('')
    }
  }

  const handleDeleteMed = async (itemId: number) => {
    setBusyAction('rx')
    setHubError('')
    try {
      await deletePrescriptionItem(itemId)
      await reloadPrescription()
    } catch (error) {
      setHubError(clinicianErrorMessage(error, '약품을 삭제하지 못했습니다.'))
    } finally {
      setBusyAction('')
    }
  }

  const handleDurCheck = async () => {
    if (!prescription?.prescription.id) return
    setBusyAction('dur')
    setHubError('')
    try {
      const payload = await runPrescriptionDurCheck(prescription.prescription.id)
      const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {}
      const results = Array.isArray(record.results)
        ? record.results.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
        : []
      const mapped = results.map((item) => ({
        severity: String(item.severity || ''),
        warning_message: String(item.warning_message || item.action || ''),
      }))
      setDurResults(mapped)
      setDurTone(durToneFromResults(mapped))
    } catch (error) {
      setHubError(clinicianErrorMessage(error, 'DUR 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'))
    } finally {
      setBusyAction('')
    }
  }

  const saveMemo = async () => {
    if (!patientId || !memoDraft.trim()) return
    setMemoSaving(true)
    setLocalMemoError('')
    try {
      await createPatientMemo(patientId, memoDraft.trim())
      setMemoDraft('')
      await onReloadMemos()
    } catch (error) {
      setLocalMemoError(clinicianErrorMessage(error, '메모를 저장하지 못했습니다.'))
    } finally {
      setMemoSaving(false)
    }
  }

  const updateMemo = async () => {
    if (!editingMemoId || !editingMemoContent.trim()) return
    setMemoSaving(true)
    setLocalMemoError('')
    try {
      await updatePatientMemo(editingMemoId, editingMemoContent.trim())
      setEditingMemoId(null)
      setEditingMemoContent('')
      await onReloadMemos()
    } catch (error) {
      setLocalMemoError(clinicianErrorMessage(error, '메모를 수정하지 못했습니다.'))
    } finally {
      setMemoSaving(false)
    }
  }

  const deleteMemo = async () => {
    if (!pendingMemoId) return
    setMemoSaving(true)
    setLocalMemoError('')
    try {
      await deletePatientMemo(pendingMemoId)
      setPendingMemoId(null)
      setConfirm(null)
      await onReloadMemos()
    } catch (error) {
      setLocalMemoError(clinicianErrorMessage(error, '메모를 삭제하지 못했습니다.'))
    } finally {
      setMemoSaving(false)
    }
  }

  return (
    <div className="ws-hub">
      <header className="ws-hub-header">
        <div className="ws-hub-identity">
          <strong>{patientDetail?.name ?? patient.name}</strong>
          <span>{sexAge}</span>
          <span>환자번호 <b>{patientDetail?.medicalRecordNo ?? patient.id}</b></span>
          <span>생년월일 <b>{patientDetail?.birthDate || '-'}</b></span>
          <span>진료과 <b>{departmentName}</b></span>
          <span>담당의 <b>{doctorName}</b></span>
          <span>최근 검사 <b>{imagingStudies.length}건</b></span>
          {patientDetailLoading && <small>불러오는 중…</small>}
          <span className={`ws-badge ${aiLabel.includes('완료') ? 'ok' : aiLabel.includes('실패') ? 'alert' : 'info'}`}>{aiLabel}</span>
          <span className={`ws-badge ${reportBadgeClass(reportStatus)}`}>{reportStatus === 'NONE' ? '보고서 없음' : reportStatusLabels[reportStatus]}</span>
        </div>
        <div className="ws-hub-actions">
          <button type="button" onClick={() => setView('imaging')}>영상 보기</button>
          <button type="button" onClick={() => setView('ai')}>AI 결과</button>
          <button className="primary" type="button" onClick={() => {
            if (reportStatus === 'NONE') void handleCreateReport()
            else onOpenReports()
          }}>{headerReportLabel}</button>
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
          <div className="ws-hub-grid">
            <div className="ws-col ws-col-left">
              <section className="ws-card ws-card-exams">
                <header><h3>최근 검사 목록</h3><small>{filteredStudies.length}</small></header>
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
                        <span><strong>{kind}</strong><small>{(study.studyDate || '').slice(0, 10) || formatHubDate(study.studyDate)}</small></span>
                        <span className={`ws-badge ${status.tone}`}>{status.label}</span>
                      </button>
                    )
                  })}
                  {!studiesLoading && !studiesError && filteredStudies.length === 0 && <p className="ws-empty">{HUB_COPY.noExam}</p>}
                </div>
              </section>

              <section className="ws-card ws-card-memo">
                <header>
                  <h3>환자 메모</h3>
                  {latestMemo && <small>{latestMemo.authorName} · {formatHubDateTime(latestMemo.updatedAt)}</small>}
                </header>
                {(localMemoError || memoError) && <p className="ws-empty" role="alert">{localMemoError || memoError}</p>}
                {memosLoading && <p className="ws-empty">메모를 불러오는 중…</p>}
                {!memosLoading && latestMemo && (
                  <article className="ws-memo-latest">
                    {editingMemoId === latestMemo.id ? (
                      <>
                        <textarea className="ws-memo" value={editingMemoContent} onChange={(event) => setEditingMemoContent(event.target.value)} maxLength={2000} />
                        <div className="ws-memo-actions">
                          <button type="button" onClick={() => setEditingMemoId(null)}>취소</button>
                          <button className="primary" disabled={memoSaving} onClick={() => void updateMemo()} type="button">저장</button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p>{latestMemo.content}</p>
                        <div className="ws-memo-actions">
                          <button type="button" onClick={() => { setEditingMemoId(latestMemo.id); setEditingMemoContent(latestMemo.content) }}><Pencil size={12} /> 수정</button>
                          <button className="danger" type="button" onClick={() => { setPendingMemoId(latestMemo.id); setConfirm('memo-delete') }}><Trash2 size={12} /> 삭제</button>
                        </div>
                      </>
                    )}
                  </article>
                )}
                {!memosLoading && !latestMemo && <p className="ws-empty">{HUB_COPY.noMemo}</p>}
                <div className="ws-memo">
                  <textarea value={memoDraft} onChange={(event) => setMemoDraft(event.target.value)} maxLength={2000} placeholder="진료 시 확인할 내용을 입력하세요." />
                  <div className="ws-memo-actions">
                    <button className="primary" disabled={memoSaving || !memoDraft.trim()} onClick={() => void saveMemo()} type="button"><Save size={13} /> 저장</button>
                  </div>
                </div>
              </section>

              <section className="ws-card ws-card-activity">
                <header><h3>최근 활동 기록</h3><button type="button" onClick={onOpenExamImaging}>전체보기</button></header>
                <div className="ws-activity-list">
                  {timelineLoading && <p className="ws-empty">활동 기록을 불러오는 중…</p>}
                  {!timelineLoading && visibleActivity.map((item, index) => (
                    <div className="ws-activity-row" key={`${item.date}-${item.title}-${index}`}>
                      <CalendarClock size={14} />
                      <span><strong>{activityLabel(item)}</strong><small>{item.date}</small></span>
                    </div>
                  ))}
                  {!timelineLoading && timelineItems.length === 0 && <p className="ws-empty">표시할 검사/처리 이력이 없습니다.</p>}
                </div>
              </section>
            </div>

            <div className="ws-col ws-col-center">
              <div className="ws-hub-banner">
                <span className="ws-hub-banner-mark" aria-hidden="true">D</span>
                <div>
                  <strong>{HUB_COPY.bannerTitle}</strong>
                  <p>{HUB_COPY.bannerLead}</p>
                </div>
              </div>

              <section className="ws-card ws-synthesis">
                <header>
                  <h3>종합 판독 요약</h3>
                  <span className={`ws-badge ${reportBadgeClass(reportStatus)}`}>{reportStatus === 'NONE' ? '작성중' : reportStatusLabels[reportStatus]}</span>
                </header>
                {synthesisHeadline(detail) ? <p className="lead">{synthesisHeadline(detail)}</p> : <p className="ws-empty">{HUB_COPY.noAi}</p>}
                {synthesisLines.length > 0 && <ul className="ws-list">{synthesisLines.map((line) => <li key={line}>{line}</li>)}</ul>}
                <small className="ws-meta">담당의 {doctorName} · 수정 {formatHubDateTime(detail?.workflow.signedAt || latestReport?.updatedAt)}</small>
                <div className="ws-card-actions">
                  <button className="primary" type="button" onClick={onOpenReports}>보고서 열기</button>
                </div>
              </section>

              <div className="ws-ai-grid">
                <section className="ws-card ws-ai-card">
                  <header>
                    <strong>Clinical AI 분석</strong>
                    <span className={`ws-badge ${detail?.aiSummaries.clinical ? 'ok' : 'muted'}`}>{detail?.aiSummaries.clinical ? 'AI 완료' : '결과 없음'}</span>
                  </header>
                  {clinical.headline ? <p className="metric">{clinical.headline}</p> : <p className="ws-empty">{HUB_COPY.noAi}</p>}
                  {clinical.bullets.map((line) => <p className="metric" key={line}>{line}</p>)}
                  <div className="ws-card-actions"><button type="button" onClick={() => setView('ai')}>상세 결과 보기</button></div>
                </section>
                <section className="ws-card ws-ai-card">
                  <header>
                    <strong>2D XCA 분석</strong>
                    <span className={`ws-badge ${detail?.aiSummaries.xca ? 'ok' : 'muted'}`}>{detail?.aiSummaries.xca ? 'AI 완료' : '결과 없음'}</span>
                  </header>
                  {xcaLines.length
                    ? xcaLines.map((line) => <p className="metric" key={line}>{line}</p>)
                    : <p className="ws-empty">{HUB_COPY.noAi}</p>}
                  <div className="ws-card-actions"><button type="button" onClick={onOpenXcaDetail}>상세 보기</button></div>
                </section>
                <section className="ws-card ws-ai-card">
                  <header>
                    <strong>3D CCTA 석회화</strong>
                    <span className={`ws-badge ${detail?.aiSummaries.ccta ? 'ok' : 'muted'}`}>{detail?.aiSummaries.ccta ? 'AI 완료' : '결과 없음'}</span>
                  </header>
                  {detail?.aiSummaries.ccta && cctaLines.length
                    ? cctaLines.map((line) => <p className="metric" key={line}>{line}</p>)
                    : <p className="ws-empty">완료된 CCTA 분석 결과가 없습니다.</p>}
                  <div className="ws-card-actions">
                    <button disabled={!detail?.aiSummaries.ccta} type="button" onClick={onOpenCcta3d}>3D 결과 보기</button>
                  </div>
                </section>
              </div>

              <section className="ws-card ws-card-recommend">
                <header><h3>권고 사항 및 다음 단계</h3></header>
                {recommendLines.length
                  ? <ol className="ws-list">{recommendLines.map((line) => <li key={line}>{line}</li>)}</ol>
                  : <p className="ws-empty">연결된 분석 결과가 없어 권고안을 구성하지 않았습니다.</p>}
                <div className="ws-card-actions">
                  <button disabled={!matchRecommendedOrderTypes(orderTypes).length} onClick={fillRecommendedOrders} type="button">권고안으로 오더 생성</button>
                </div>
              </section>
            </div>

            <div className="ws-col ws-col-right">
              <section className="ws-card ws-action-card">
                <div className="ws-action-tabs" role="tablist" aria-label="실행 패널">
                  <button className={actionTab === 'order' ? 'active' : ''} onClick={() => setActionTab('order')} type="button">오더</button>
                  <button className={actionTab === 'rx' ? 'active' : ''} onClick={() => setActionTab('rx')} type="button">처방</button>
                  <button className={actionTab === 'dur' ? 'active' : ''} onClick={() => setActionTab('dur')} type="button">DUR</button>
                </div>

                {actionTab === 'order' && (
                  <>
                    <header><h3>오더 입력</h3><small>{selectedTypeIds.length}개 선택</small></header>
                    <div className="ws-filters">
                      <button className={orderTab === 'exam' ? 'active' : ''} onClick={() => setOrderTab('exam')} type="button">검사</button>
                      <button className={orderTab === 'procedure' ? 'active' : ''} onClick={() => setOrderTab('procedure')} type="button">시술</button>
                      <button className={orderTab === 'other' ? 'active' : ''} onClick={() => setOrderTab('other')} type="button">기타</button>
                    </div>
                    <label className="ws-order-item"><Search size={13} /><input type="text" value={orderQuery} onChange={(event) => setOrderQuery(event.target.value)} placeholder="검사명 또는 코드 검색" /></label>
                    <div className="ws-order-list">
                      {visibleTypes.slice(0, 6).map((type) => (
                        <label className="ws-order-item" key={type.id}>
                          <input
                            checked={selectedTypeIds.includes(type.id)}
                            onChange={() => setSelectedTypeIds((current) => current.includes(type.id) ? current.filter((id) => id !== type.id) : [...current, type.id])}
                            type="checkbox"
                          />
                          <span>{type.name}</span>
                        </label>
                      ))}
                      {visibleTypes.length === 0 && <p className="ws-empty">{HUB_COPY.noOrder}</p>}
                    </div>
                    {!encounterId && <p className="ws-note">연결된 진료가 없어 오더를 입력할 수 없습니다.</p>}
                    <div className="ws-card-actions">
                      <button className="primary" disabled={!encounterId || selectedTypeIds.length === 0 || busyAction === 'order'} onClick={() => void handleSubmitOrders()} type="button">
                        {selectedTypeIds.length ? `선택 항목으로 오더 입력 (${selectedTypeIds.length})` : '선택 항목으로 오더 입력'}
                      </button>
                    </div>
                  </>
                )}

                {actionTab === 'rx' && (
                  <>
                    <header><h3>{prescription?.prescription.status === 'DRAFT' ? '처방 초안' : '현재 처방'}</h3></header>
                    {prescription?.items.length ? prescription.items.slice(0, 4).map((item) => (
                      <div className="ws-rx-row" key={item.id}>
                        <span>{item.medication?.name || `약품 ${item.medicationId}`}</span>
                        <small>{[item.doseValue, item.doseUnit].filter(Boolean).join(' ')}</small>
                        <button className="danger" disabled={busyAction === 'rx'} onClick={() => void handleDeleteMed(item.id)} type="button">삭제</button>
                      </div>
                    )) : <p className="ws-empty">{HUB_COPY.noPrescription}</p>}
                    {prescription ? (
                      <>
                        <label className="ws-order-item"><Search size={13} /><input type="text" value={medQuery} onChange={(event) => void handleSearchMeds(event.target.value)} placeholder="약품 검색 후 추가" /></label>
                        {medResults.map((med) => (
                          <button className="ws-exam-row" key={med.id} onClick={() => void handleAddMed(med)} type="button">
                            <span><strong>{med.name}</strong><small>{med.ingredient || med.code}</small></span>
                          </button>
                        ))}
                      </>
                    ) : (
                      <div className="ws-card-actions">
                        <button className="primary" disabled={!encounterId || busyAction === 'rx'} onClick={() => void handleCreateDraftRx()} type="button">초안 만들기</button>
                      </div>
                    )}
                  </>
                )}

                {actionTab === 'dur' && (
                  <div className={`ws-dur ${durTone}`}>
                    <header>
                      <h3>DUR</h3>
                      <span className={`ws-badge ${durTone === 'alert' ? 'alert' : durTone === 'warn' ? 'warn' : durTone === 'ok' ? 'ok' : 'muted'}`}>
                        {durTone === 'alert' ? '경고' : durTone === 'warn' ? '주의' : durTone === 'ok' ? '확인 완료' : '미확인'}
                      </span>
                    </header>
                    {durResults.length === 0 ? <p className="ws-empty">{HUB_COPY.noDur}</p> : (
                      <ul className="ws-list">{durResults.slice(0, 3).map((item, index) => <li key={`${item.warning_message}-${index}`}>{item.warning_message || item.severity}</li>)}</ul>
                    )}
                    <div className="ws-card-actions">
                      <button className="primary" disabled={!prescription || busyAction === 'dur'} onClick={() => void handleDurCheck()} type="button">상세 확인하기</button>
                    </div>
                  </div>
                )}
              </section>

              <section className="ws-card ws-card-sign">
                <header><h3>최종 승인 / 환자 공개</h3></header>
                <div className="ws-steps">
                  {reportApprovalSteps(reportStatus).map((step, index) => (
                    <span className={step.tone} key={step.key}>
                      <b>{index + 1}</b>
                      <strong>{step.label}</strong>
                      <small>{step.hint}</small>
                    </span>
                  ))}
                </div>
                <p className="ws-sign-meta">{reportStatusCopy(reportStatus)} · 서명 미등록</p>
                <div className="ws-card-actions">
                  <button type="button" onClick={onOpenReports}>보고서 열기</button>
                  {(reportStatus === 'DRAFT' || reportStatus === 'REVIEWING' || reportStatus === 'NONE') && (
                    <button className="primary" disabled={!detail?.workflow.canSignoff || Boolean(busyAction)} onClick={() => setConfirm('signoff')} type="button">최종 승인</button>
                  )}
                  {reportStatus === 'SIGNED' && (
                    <button className="primary" disabled={!detail?.workflow.canRelease || Boolean(busyAction)} onClick={() => setConfirm('release')} type="button">환자 공개</button>
                  )}
                  {reportStatus === 'RELEASED' && <button disabled type="button">환자 공개 완료</button>}
                </div>
              </section>
            </div>
          </div>
        )}

        {view === 'imaging' && (
          <div className="ws-viewer">
            {selectedStudy ? (
              <StudyDicomViewer key={`${patientId}-${selectedStudy.id}`} study={selectedStudy} />
            ) : (
              <p className="ws-empty">{studiesError ? HUB_COPY.imageError : HUB_COPY.noImage}</p>
            )}
          </div>
        )}

        {view === 'ai' && (
          <ClinicalAIAnalysisPanel patient={patient} patientDetail={patientDetail} examinationId={examinationId} />
        )}

        {view === 'report' && (
          <section className="ws-card">
            <header>
              <h3>결과보고서</h3>
              <span className={`ws-badge ${reportBadgeClass(reportStatus)}`}>{reportStatus === 'NONE' ? '없음' : reportStatusLabels[reportStatus]}</span>
            </header>
            {reportStatus === 'NONE' ? <p className="ws-empty">{HUB_COPY.noReport}</p> : <p>{reportStatusCopy(reportStatus)}</p>}
            <div className="ws-card-actions">
              <button className="primary" type="button" onClick={onOpenReports}>보고서 열기</button>
              {reportStatus === 'NONE' && <button disabled={Boolean(busyAction)} onClick={() => void handleCreateReport()} type="button">초안 작성</button>}
            </div>
          </section>
        )}
      </div>

      {confirm && (
        <div className="ws-confirm-backdrop" onClick={() => setConfirm(null)}>
          <div className="ws-confirm" onClick={(event) => event.stopPropagation()} role="dialog">
            {confirm === 'signoff' && (
              <>
                <h3>결과보고서를 최종 승인하시겠습니까?</h3>
                <p>현재 보고서 내용이 최종본으로 확정됩니다. 승인 후 수정이 필요한 경우 새 버전을 작성해야 합니다.</p>
                <div className="ws-confirm-actions">
                  <button type="button" onClick={() => setConfirm(null)}>취소</button>
                  <button className="primary" disabled={!detail || Boolean(busyAction)} onClick={() => detail && void runReportAction('signoff', () => signoffMedicalResult(detail.medicalResultId))} type="button">최종 승인</button>
                </div>
              </>
            )}
            {confirm === 'release' && (
              <>
                <h3>환자에게 결과보고서를 공개하시겠습니까?</h3>
                <p>공개 후 환자는 승인된 최종 결과보고서를 환자 앱에서 확인할 수 있습니다.</p>
                <div className="ws-confirm-actions">
                  <button type="button" onClick={() => setConfirm(null)}>취소</button>
                  <button className="primary" disabled={!detail || Boolean(busyAction)} onClick={() => detail && void runReportAction('release', () => releaseMedicalResult(detail.medicalResultId))} type="button">환자에게 공개</button>
                </div>
              </>
            )}
            {confirm === 'memo-delete' && (
              <>
                <h3>이 메모를 삭제하시겠습니까?</h3>
                <p>삭제된 메모는 목록에서 더 이상 표시되지 않습니다.</p>
                <div className="ws-confirm-actions">
                  <button type="button" onClick={() => { setConfirm(null); setPendingMemoId(null) }}>취소</button>
                  <button className="danger" disabled={memoSaving} onClick={() => void deleteMemo()} type="button">삭제</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
