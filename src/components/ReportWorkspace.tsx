import { useEffect, useId, useState } from 'react'
import { FileText, LoaderCircle, Search } from 'lucide-react'
import type { MedicalReportType, MedicalResultDetail, PatientReportSummary, PatientSummary, ReportAiSummary, ReportXcaAttachment, StaffDoctor, StaffIdentity } from '../types'
import {
  createPatientMedicalResult,
  getClinicalAIAnalysis,
  getCTAIAnalysis,
  getFileContentObjectUrl,
  getMedicalResultDetail,
  getPatientClinicalAnalyses,
  getPatientCCTAAnalyses,
  getPatientReports,
  getPatientsPage,
  getReportDownload,
  getStoredClinicalShap,
  releaseMedicalResult,
  saveMedicalResultConclusion,
  signoffMedicalResult,
} from '../api/client'
import type { CCTAAnalysisListItem, CTAIAnalysis, ClinicalAIAnalysis, ClinicalAIAnalysisListItem, ClinicalShapExplanation } from '../api/client'
import { getDoctorSignature } from '../doctorSignatures'
import './report-workspace.css'
import { CLINICAL_MODEL_DISCLOSURE } from '../clinicalModelDisclosure'
import { ClinicalAiReportDetail } from './ClinicalAiReportDetail'
import { CCTAReportDraft } from './CCTAReportDraft'

interface ReportWorkspaceProps {
  selectedPatient: PatientSummary | null
  staffIdentity?: StaffIdentity | null
  staffDoctor?: StaffDoctor | null
}

export const reportStatusLabels: Record<string, string> = {
  DRAFT: '초안',
  REVIEWING: '검토 중',
  SIGNED: '최종 승인',
  RELEASED: '환자 공개',
}

const reportTypeLabels: Record<MedicalReportType, string> = {
  XCA_2D: '2D XCA',
  CCTA_3D: '3D CCTA',
  INTEGRATED: '통합',
}

function formatDate(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function formatPercent(value?: number | null) {
  if (value == null || Number.isNaN(value)) return '-'
  const ratio = value > 1 ? value / 100 : value
  return `${Math.round(ratio * 1000) / 10}%`
}
function clinicalSignalLabel(
  prediction: string | number | null | undefined,
): string {
  const normalized = String(prediction ?? '')
    .trim()
    .toUpperCase()

  if (!normalized) {
    return '-'
  }

  const high =
    normalized.includes('HIGH') ||
    normalized.includes('SIGNIFICANT') ||
    normalized === '1'

  return high
    ? CLINICAL_MODEL_DISCLOSURE.highSignal
    : CLINICAL_MODEL_DISCLOSURE.lowSignal
}
async function getAllPatientReports(patientId: number) {
  const responses = await Promise.allSettled([
    getPatientReports(patientId),
    getPatientReports(patientId, 'XCA_2D'),
    getPatientReports(patientId, 'CCTA_3D'),
  ])
  const successful = responses.filter((item): item is PromiseFulfilledResult<PatientReportSummary[]> => item.status === 'fulfilled')
  if (!successful.length) {
    const failure = responses.find((item): item is PromiseRejectedResult => item.status === 'rejected')
    throw failure?.reason ?? new Error('보고서 목록을 불러오지 못했습니다.')
  }
  const reports = new Map<number, PatientReportSummary>()
  successful.forEach(({ value }) => value.forEach((report) => reports.set(report.medicalResultId, report)))
  return [...reports.values()].sort((a, b) => {
    const left = Date.parse(a.performedAt || a.visitDate || a.createdAt || '') || 0
    const right = Date.parse(b.performedAt || b.visitDate || b.createdAt || '') || 0
    return right - left
  })
}

function ReportFilePreview({ fileId, label }: { fileId: number | null; label: string }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (!fileId) {
      setUrl('')
      return
    }
    let active = true
    let objectUrl = ''
    void getFileContentObjectUrl(fileId)
      .then((next) => {
        if (!active) {
          URL.revokeObjectURL(next)
          return
        }
        objectUrl = next
        setUrl(next)
      })
      .catch(() => {
        if (active) setUrl('')
      })
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [fileId])
  if (!fileId) return <p className="report-empty-inline">{label} 이미지가 없습니다.</p>
  if (!url) return <p className="report-empty-inline">{label} 불러오는 중…</p>
  return <img alt={label} className="report-preview-image" src={url} />
}

function ReportXcaImages({ sourceId, maskId }: { sourceId: number | null; maskId: number | null }) {
  const svgId = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const [images, setImages] = useState<{ source: string; mask: string } | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let active = true
    const urls: string[] = []
    setImages(null)
    setFailed(false)
    const load = async (id: number) => {
      const url = await getFileContentObjectUrl(id)
      if (active) urls.push(url)
      else URL.revokeObjectURL(url)
      return url
    }
    if (sourceId) void Promise.all([load(sourceId), maskId ? load(maskId) : Promise.resolve('')])
      .then(([source, mask]) => { if (active) setImages({ source, mask }) })
      .catch(() => { if (active) setFailed(true) })
    return () => { active = false; urls.forEach(url => URL.revokeObjectURL(url)) }
  }, [sourceId, maskId])
  if (!sourceId) return <p className="report-empty-inline">저장된 원본 이미지가 없습니다.</p>
  if (failed) return <p role="alert">첨부 이미지를 불러오지 못했습니다.</p>
  if (!images) return <p className="report-empty-inline">첨부 이미지 불러오는 중…</p>
  return <div className="report-preview-row">
    <figure><figcaption>원본</figcaption><img className="report-preview-image" src={images.source} alt="XCA 원본" onError={() => setFailed(true)} /></figure>
    {images.mask ? <figure><figcaption>협착 의심 영역</figcaption>
      <svg className="report-preview-image" viewBox="0 0 1 1" role="img" aria-label="협착 의심 영역 합성 이미지">
        <image href={images.source} width="1" height="1" onError={() => setFailed(true)} />
        <defs><mask id={svgId} maskUnits="userSpaceOnUse" x="0" y="0" width="1" height="1" style={{ maskType: 'luminance' }}>
          <image href={images.mask} width="1" height="1" onError={() => setFailed(true)} />
        </mask></defs>
        <rect width="1" height="1" fill="red" opacity="0.45" mask={`url(#${svgId})`} />
      </svg>
    </figure> : <p className="report-empty-inline">이 프레임에는 저장된 협착 의심 영역이 없습니다.</p>}
  </div>
}

function ReportSignature({ fileId, doctorName, fallbackUrl }: { fileId: number | null; doctorName?: string | null; fallbackUrl?: string }) {
  const [url, setUrl] = useState('')
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    setFailed(false)
    setUrl('')
    if (!fileId) {
      setUrl('')
      return
    }
    let active = true
    let objectUrl = ''
    void getFileContentObjectUrl(fileId)
      .then((next) => {
        if (!active) {
          URL.revokeObjectURL(next)
          return
        }
        objectUrl = next
        setUrl(next)
      })
      .catch(() => {
        if (active) { setUrl(''); setFailed(true) }
      })
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [fileId])
  const source = url || (!fileId ? fallbackUrl : undefined)
  if (source) return <img alt={`${doctorName || '의료진'} 서명`} className="report-signature-image" src={source} />
  if (fileId && !failed) return <span>서명 불러오는 중…</span>
  if (failed) return <span>등록된 서명을 불러오지 못했습니다.</span>
  return <span>등록된 서명이 없습니다.</span>
}

function AiBlock({ title, summary, kind, attachments = [] }: { title: string; summary: ReportAiSummary | null; kind: 'clinical' | 'xca' | 'ccta'; attachments?: ReportXcaAttachment[] }) {
  if (!summary && !attachments.length) {
    return (
      <article className="report-section">
        <h3>{title}</h3>
        <p className="report-empty-inline">연결된 성공 분석이 없습니다.</p>
      </article>
    )
  }
  return (
    <article className="report-section">
      <h3>{title}</h3>
      {summary && <><dl className="report-meta-grid">
        <div><dt>검사</dt><dd>{summary.examName ?? '-'}</dd></div>
        <div><dt>검사일</dt><dd>{formatDate(summary.performedAt)}</dd></div>
        {kind === 'clinical' && (
          <>
            <div>
              <dt>{CLINICAL_MODEL_DISCLOSURE.signalLabel}</dt>
              <dd>{clinicalSignalLabel(summary.prediction)}</dd>
            </div>

            <div>
              <dt>{CLINICAL_MODEL_DISCLOSURE.scoreLabel}</dt>
              <dd>{formatPercent(summary.probability)}</dd>
            </div>

            <div>
              <dt>검증 상태</dt>
              <dd>{CLINICAL_MODEL_DISCLOSURE.validationLabel}</dd>
            </div>

            <div>
              <dt>모델</dt>
              <dd>
                {[summary.modelName, summary.modelVersion]
                  .filter(Boolean)
                  .join(' · ') || '-'}
              </dd>
            </div>
          </>
        )}
      </dl>
      {kind === 'xca' && summary.sides.length > 0 && (
        <ul className="report-side-list">
          {summary.sides.map((item) => (
            <li key={`${item.side}-${item.anyStenosis}`}>
              {item.side ?? '미지정'} · 협착 {item.anyStenosis ?? '-'} · 유의 협착 {item.significantStenosis ?? '-'}
            </li>
          ))}
        </ul>
      )}
      </>}
      {kind === 'xca' && (attachments.length ? attachments.map((attachment, index) => (
        <section key={index}>
          <h4>XCA 선택 첨부 {index + 1}</h4>
          {attachment.frames.map(frame => (
            <div key={frame.id}>
              <p>촬영 {frame.sequenceNo} · frame_index {frame.frameIndex}</p>
              <ReportXcaImages sourceId={frame.sourceFileAssetId} maskId={frame.maskFileAssetId} />
            </div>
          ))}
        </section>
      )) : summary?.previewFileAssetId ? (
        <div className="report-preview-row">
          <ReportFilePreview fileId={summary.sourceFileAssetId} label="원본 대표 프레임" />
          <ReportFilePreview fileId={summary.previewFileAssetId} label="협착 의심 영역 합성본" />
        </div>
      ) : (
        <ReportXcaImages sourceId={summary?.sourceFileAssetId ?? null} maskId={summary?.overlayFileAssetId ?? null} />
      ))}
      {kind === 'ccta' && summary && (
        <div className="report-preview-row">
          <ReportFilePreview fileId={summary.previewFileAssetId} label="석회화 preview" />
          <ReportFilePreview fileId={summary.overlayFileAssetId} label="석회화 overlay" />
        </div>
      )}
    </article>
  )
}

export function ReportWorkspace({ selectedPatient, staffIdentity, staffDoctor }: ReportWorkspaceProps) {
  const [reportPatient, setReportPatient] = useState<PatientSummary | null>(null)
  const [reportSearchKeyword, setReportSearchKeyword] = useState('')
  const [reportSearchResults, setReportSearchResults] = useState<PatientSummary[]>([])
  const [reportSearchLoading, setReportSearchLoading] = useState(false)
  const [reportSearchError, setReportSearchError] = useState('')
  const [patientReports, setPatientReports] = useState<PatientReportSummary[]>([])
  const [clinicalReports, setClinicalReports] = useState<ClinicalAIAnalysisListItem[]>([])
  const [cctaAnalyses, setCctaAnalyses] = useState<CCTAAnalysisListItem[]>([])
  const [reportTypeFilter, setReportTypeFilter] = useState<'ALL' | MedicalReportType | 'CLINICAL_AI'>('ALL')
  const [reportsLoading, setReportsLoading] = useState(false)
  const [reportsError, setReportsError] = useState('')
  const [selectedResultId, setSelectedResultId] = useState<number | null>(null)
  const [selectedClinicalAnalysisId, setSelectedClinicalAnalysisId] = useState<number | null>(null)
  const [selectedCctaAnalysisId, setSelectedCctaAnalysisId] = useState<number | null>(null)
  const [detail, setDetail] = useState<MedicalResultDetail | null>(null)
  const [clinicalDetail, setClinicalDetail] = useState<ClinicalAIAnalysis | null>(null)
  const [cctaDetail, setCctaDetail] = useState<CTAIAnalysis | null>(null)
  const [cctaReportBusy, setCctaReportBusy] = useState(false)
  const [clinicalShap, setClinicalShap] = useState<ClinicalShapExplanation | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [conclusion, setConclusion] = useState('')
  const [busyAction, setBusyAction] = useState('')
  const [integratedXcaId, setIntegratedXcaId] = useState('')
  const [integratedCctaId, setIntegratedCctaId] = useState('')
  const [reportDownloadingId, setReportDownloadingId] = useState<number | null>(null)
  const [confirmSignoff, setConfirmSignoff] = useState(false)
  const currentDoctorSignature = getDoctorSignature(staffIdentity?.username)

  useEffect(() => {
    if (!selectedPatient) return
    setReportPatient(selectedPatient)
    setSelectedResultId(null)
    setSelectedClinicalAnalysisId(null)
    setSelectedCctaAnalysisId(null)
    setDetail(null)
    setClinicalDetail(null)
    setCctaDetail(null)
    setClinicalShap(null)
    setConclusion('')
    setIntegratedXcaId('')
    setIntegratedCctaId('')
    setReportsError('')
  }, [selectedPatient?.backendId])

  useEffect(() => {
    setIntegratedXcaId('')
    setIntegratedCctaId('')
  }, [reportPatient?.backendId])

  useEffect(() => {
    const keyword = reportSearchKeyword.trim()
    if (!keyword) {
      setReportSearchResults([])
      setReportSearchLoading(false)
      setReportSearchError('')
      return
    }
    let active = true
    setReportSearchLoading(true)
    setReportSearchError('')
    const timer = window.setTimeout(() => {
      void getPatientsPage(keyword, false, { patientScope: 'ALL_ACCESSIBLE', page: 1, size: 20 })
        .then((data) => { if (active) setReportSearchResults(data.results) })
        .catch((error) => { if (active) { setReportSearchResults([]); setReportSearchError(error instanceof Error ? error.message : '환자 검색 실패') } })
        .finally(() => { if (active) setReportSearchLoading(false) })
    }, 250)
    return () => { active = false; window.clearTimeout(timer) }
  }, [reportSearchKeyword])

  const reloadList = (patientId: number) => getAllPatientReports(patientId)
    .then((items) => setPatientReports(items))
    .catch((error) => { setPatientReports([]); setReportsError(error instanceof Error ? error.message : '보고서 목록을 불러오지 못했습니다.') })

  useEffect(() => {
    if (!reportPatient?.backendId) {
      setPatientReports([])
      setClinicalReports([])
      setCctaAnalyses([])
      setReportsError('')
      setSelectedResultId(null)
      setSelectedClinicalAnalysisId(null)
      setSelectedCctaAnalysisId(null)
      setDetail(null)
      setClinicalDetail(null)
      setCctaDetail(null)
      setClinicalShap(null)
      return
    }
    let active = true
    setReportsLoading(true)
    setReportsError('')
    void Promise.allSettled([
      getAllPatientReports(reportPatient.backendId),
      getPatientClinicalAnalyses(reportPatient.backendId),
      getPatientCCTAAnalyses(reportPatient.backendId),
    ])
      .then(([medical, clinical, ccta]) => {
        if (!active) return
        setPatientReports(medical.status === 'fulfilled' ? medical.value : [])
        setClinicalReports(clinical.status === 'fulfilled' ? clinical.value : [])
        setCctaAnalyses(ccta.status === 'fulfilled' ? ccta.value : [])
        if (medical.status === 'rejected' && clinical.status === 'rejected' && ccta.status === 'rejected') {
          const reason = medical.reason instanceof Error ? medical.reason.message : '보고서 목록을 불러오지 못했습니다.'
          setReportsError(reason)
        } else if (clinical.status === 'rejected') {
          setReportsError('Clinical AI 결과 목록을 불러오지 못했습니다.')
        } else if (ccta.status === 'rejected') {
          setReportsError('3D CCTA 분석 결과 목록을 불러오지 못했습니다.')
        }
      })
      .finally(() => { if (active) setReportsLoading(false) })
    return () => { active = false }
  }, [reportPatient?.backendId])

  useEffect(() => {
    if (!selectedClinicalAnalysisId) {
      setClinicalDetail(null)
      setClinicalShap(null)
      return
    }
    let active = true
    setDetailLoading(true)
    setReportsError('')
    void getClinicalAIAnalysis(selectedClinicalAnalysisId)
      .then(async (payload) => {
        if (!active) return
        setClinicalDetail(payload)
        const result = [...(payload.results ?? [])].sort((left, right) => right.id - left.id)[0]
        if (!result) {
          setClinicalShap(null)
          return
        }
        const inline = result.result_json.explanation
        if (inline?.top_features?.length) {
          setClinicalShap(inline)
          return
        }
        const stored = await getStoredClinicalShap(result.id)
        if (active) setClinicalShap(stored)
      })
      .catch((error) => {
        if (active) {
          setClinicalDetail(null)
          setClinicalShap(null)
          setReportsError(error instanceof Error ? error.message : 'Clinical AI 보고서를 불러오지 못했습니다.')
        }
      })
      .finally(() => { if (active) setDetailLoading(false) })
    return () => { active = false }
  }, [selectedClinicalAnalysisId])

  useEffect(() => {
    if (!selectedCctaAnalysisId) {
      setCctaDetail(null)
      return
    }
    let active = true
    setDetailLoading(true)
    setReportsError('')
    void getCTAIAnalysis(selectedCctaAnalysisId)
      .then((payload) => { if (active) setCctaDetail(payload) })
      .catch((error) => {
        if (active) {
          setCctaDetail(null)
          setReportsError(error instanceof Error ? error.message : '3D CCTA 분석 결과를 불러오지 못했습니다.')
        }
      })
      .finally(() => { if (active) setDetailLoading(false) })
    return () => { active = false }
  }, [selectedCctaAnalysisId])

  useEffect(() => {
    if (!selectedResultId) {
      setDetail(null)
      setConclusion('')
      return
    }
    let active = true
    setDetailLoading(true)
    void getMedicalResultDetail(selectedResultId)
      .then((payload) => {
        if (!active) return
        setDetail(payload)
        setConclusion(payload.conclusion)
      })
      .catch((error) => { if (active) setReportsError(error instanceof Error ? error.message : '보고서 상세를 불러오지 못했습니다.') })
      .finally(() => { if (active) setDetailLoading(false) })
    return () => { active = false }
  }, [selectedResultId])

  const applyDetail = async (next: MedicalResultDetail) => {
    setDetail(next)
    setConclusion(next.conclusion)
    if (reportPatient?.backendId) await reloadList(reportPatient.backendId)
  }

  const runAction = async (name: string, action: () => Promise<MedicalResultDetail>) => {
    setBusyAction(name)
    setReportsError('')
    try {
      await applyDetail(await action())
    } catch (error) {
      setReportsError(error instanceof Error ? error.message : '요청을 처리하지 못했습니다.')
    } finally {
      setBusyAction('')
    }
  }

  const openReport = async (reportId: number) => {
    setReportsError('')
    const tab = window.open('about:blank', '_blank')
    if (!tab) {
      setReportsError('브라우저에서 팝업을 허용한 뒤 보고서 보기를 다시 눌러주세요.')
      return
    }
    tab.opener = null
    setReportDownloadingId(reportId)
    try {
      const info = await getReportDownload(reportId)
      if (info.downloadIntegrationStatus !== 'CONFIGURED' || !info.downloadUrl) {
        throw new Error(`보고서 다운로드 주소를 받지 못했습니다. 저장소 연결 상태: ${info.downloadIntegrationStatus}`)
      }
      if ((info.downloadExpiresAt && Date.parse(info.downloadExpiresAt) <= Date.now()) || (info.downloadExpiresIn !== null && info.downloadExpiresIn <= 0)) {
        throw new Error('다운로드 주소가 만료되었습니다. 보고서 보기를 다시 눌러주세요.')
      }
      const url = new URL(info.downloadUrl)
      if (!['https:', 'http:'].includes(url.protocol)) throw new Error('보고서 다운로드 주소 형식이 올바르지 않습니다.')
      // Navigate without forwarding the staff JWT to the storage service.
      if (!tab.closed) tab.location.replace(info.downloadUrl)
    } catch (error) {
      tab.close()
      setReportsError(error instanceof Error ? error.message : '보고서 다운로드에 실패했습니다.')
    } finally {
      setReportDownloadingId(null)
    }
  }

  const workflow = detail?.workflow
  const canSave = Boolean(workflow?.canEdit && workflow.status !== 'SIGNED' && workflow.status !== 'RELEASED')
  const canEditConclusion = Boolean(
    workflow
    && workflow.status !== 'SIGNED'
    && workflow.status !== 'RELEASED'
    && (workflow.canEdit || workflow.canSignoff),
  )
  const visibleReports = reportTypeFilter === 'ALL'
    ? patientReports
    : reportTypeFilter === 'CLINICAL_AI'
      ? []
      : patientReports.filter((item) => item.reportType === reportTypeFilter)
  const visibleClinicalReports = reportTypeFilter === 'ALL' || reportTypeFilter === 'CLINICAL_AI'
    ? clinicalReports
    : []
  const cctaReportExaminations = new Set(
    patientReports
      .filter((item) => item.reportType === 'CCTA_3D' && item.examinationId)
      .map((item) => item.examinationId as number),
  )
  const pendingCctaReports = cctaAnalyses.filter((item) => !cctaReportExaminations.has(item.examination))
  const visibleCctaReports = reportTypeFilter === 'ALL' || reportTypeFilter === 'CCTA_3D'
    ? pendingCctaReports
    : []
  const selectedCctaAnalysis = cctaAnalyses.find((item) => item.id === selectedCctaAnalysisId) ?? null
  const selectedCctaResult = cctaDetail?.results?.find((item) => item.status !== 'INVALID') ?? null
  const signedXcaReports = patientReports.filter((item) => item.reportType === 'XCA_2D' && ['SIGNED', 'RELEASED'].includes(item.status))
  const signedCctaReports = patientReports.filter((item) => item.reportType === 'CCTA_3D' && ['SIGNED', 'RELEASED'].includes(item.status))
  const totalReportCount = patientReports.length + clinicalReports.length + pendingCctaReports.length
  const visibleReportCount = visibleReports.length + visibleClinicalReports.length + visibleCctaReports.length

  return (
    <section className="feature-page module-page report-workspace">
      <header className="feature-header module-header">
        <div>
          <small>CLINICAL REPORT</small>
          <h1>결과보고서</h1>
          <p>영상 판독 보고서와 Clinical AI 의료진용 결과를 환자별로 조회합니다.</p>
        </div>
        <span className="feature-live"><i /> LIVE API</span>
      </header>
      <div className="module-content module-split">
        <section className="feature-card module-context-card">
          <span className="module-icon"><FileText size={22} /></span>
          <small>환자 검색</small>
          <label className="patient-management-search">
            <Search size={15} />
            <input value={reportSearchKeyword} onChange={(event) => setReportSearchKeyword(event.target.value)} placeholder="이름 또는 환자번호 검색" />
            {reportSearchLoading && <LoaderCircle className="spin" size={15} />}
          </label>
          {reportSearchError && <p className="api-inline-error">{reportSearchError}</p>}
          {reportSearchKeyword.trim() && (
            <div className="module-report-search-results">
              {reportSearchResults.map((patient) => (
                <button className={reportPatient?.backendId === patient.backendId ? 'active' : ''} key={patient.id} onClick={() => { setReportPatient(patient); setReportSearchKeyword(''); setReportSearchResults([]); setSelectedResultId(null); setSelectedClinicalAnalysisId(null); setSelectedCctaAnalysisId(null) }} type="button">
                  <strong>{patient.name}</strong><span>{patient.id}</span>
                </button>
              ))}
              {!reportSearchLoading && reportSearchResults.length === 0 && <p className="feature-empty-inline">검색 결과가 없습니다.</p>}
            </div>
          )}
          <hr />
          <small>선택된 환자</small>
          <h2>{reportPatient?.name ?? '선택된 환자 없음'}</h2>
          <p>{reportPatient?.id ?? '환자를 검색해 선택해주세요.'}</p>
          {reportPatient?.backendId && (
            <div className="integrated-report-source-picker">
              <strong>2D·3D 통합 결과보고서</strong>
              <p>최종 승인된 2D와 3D 결과를 선택해 하나의 검토용 초안으로 묶습니다.</p>
              <label>2D XCA 보고서
                <select value={integratedXcaId} onChange={(event) => setIntegratedXcaId(event.target.value)}>
                  <option value="">선택하세요</option>
                  {signedXcaReports.map((item) => <option key={item.medicalResultId} value={item.medicalResultId}>#{item.medicalResultId} · {item.latestSignoff?.doctorName ?? item.doctorName ?? '의료진'} · {formatDate(item.performedAt || item.visitDate)}</option>)}
                </select>
              </label>
              <label>3D CCTA 보고서
                <select value={integratedCctaId} onChange={(event) => setIntegratedCctaId(event.target.value)}>
                  <option value="">선택하세요</option>
                  {signedCctaReports.map((item) => <option key={item.medicalResultId} value={item.medicalResultId}>#{item.medicalResultId} · {item.latestSignoff?.doctorName ?? item.doctorName ?? '의료진'} · {formatDate(item.performedAt || item.visitDate)}</option>)}
                </select>
              </label>
              <button
                className="report-primary-btn"
                disabled={busyAction === 'create-integrated' || !integratedXcaId || !integratedCctaId}
                onClick={() => void runAction('create-integrated', async () => {
                  const created = await createPatientMedicalResult(reportPatient.backendId as number, Number(integratedXcaId), Number(integratedCctaId))
                  setSelectedResultId(created.medicalResultId)
                  setSelectedClinicalAnalysisId(null)
                  setSelectedCctaAnalysisId(null)
                  setReportTypeFilter('INTEGRATED')
                  return created
                })}
                type="button"
              >
                {busyAction === 'create-integrated' ? '통합 중…' : '선택한 2D·3D 통합 초안 생성'}
              </button>
              {(!signedXcaReports.length || !signedCctaReports.length) && <small>최종 승인된 2D XCA와 3D CCTA 보고서가 각각 필요합니다.</small>}
            </div>
          )}
        </section>
        <section className="feature-card module-table-card">
          <header><h2>보고서 목록</h2><span>총 {totalReportCount}건</span></header>
          <div className="report-type-tabs" role="tablist" aria-label="보고서 종류">
            {([['ALL', '전체'], ['CLINICAL_AI', 'Clinical AI'], ['XCA_2D', '2D XCA'], ['CCTA_3D', '3D CCTA'], ['INTEGRATED', '통합']] as const).map(([value, label]) => (
              <button aria-selected={reportTypeFilter === value} className={reportTypeFilter === value ? 'active' : ''} key={value} onClick={() => { setReportTypeFilter(value); setSelectedResultId(null); setSelectedClinicalAnalysisId(null); setSelectedCctaAnalysisId(null) }} role="tab" type="button">{label}</button>
            ))}
          </div>
          {reportsError && <p className="api-inline-error">{reportsError}</p>}
          {!reportPatient && <div className="feature-empty"><FileText size={28} /><strong>환자를 먼저 검색해 선택해주세요.</strong></div>}
          {reportPatient && (
            <div className="module-table module-report-table">
              <div className="module-table-head"><span>검사일</span><span>보고서 종류</span><span>상태</span><span>작성/서명 의료진</span><span /></div>
              {visibleReports.map((item) => (
                <div className={`module-table-row ${selectedResultId === item.medicalResultId ? 'is-selected' : ''}`} key={`medical-${item.medicalResultId}`}>
                  <button className="report-row-select" onClick={() => { setSelectedResultId(item.medicalResultId); setSelectedClinicalAnalysisId(null); setSelectedCctaAnalysisId(null) }} type="button">
                    <span>{(item.performedAt || item.visitDate) ? new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium' }).format(new Date(item.performedAt || item.visitDate!)) : '-'}</span>
                    <span><strong>{reportTypeLabels[item.reportType]}</strong>{item.examName ? ` · ${item.examName}` : ''}</span>
                    <b className={`status-pill status-report-${item.status.toLowerCase()}`}>{reportStatusLabels[item.status] ?? item.status}</b>
                    <span>{item.latestSignoff?.doctorName ?? item.doctorName ?? '-'}</span>
                  </button>
                  <button
                    disabled={!item.latestReport || reportDownloadingId === item.latestReport?.reportId}
                    onClick={() => item.latestReport && void openReport(item.latestReport.reportId)}
                    title={item.latestReport ? '보고서 PDF 열기' : '아직 생성된 보고서 파일이 없습니다'}
                    type="button"
                  >
                    {reportDownloadingId === item.latestReport?.reportId ? '여는 중…' : 'PDF'}
                  </button>
                </div>
              ))}
              {visibleClinicalReports.map((item) => (
                <div className={`module-table-row ${selectedClinicalAnalysisId === item.id ? 'is-selected' : ''}`} key={`clinical-${item.id}`}>
                  <button className="report-row-select" onClick={() => { setSelectedClinicalAnalysisId(item.id); setSelectedResultId(null); setSelectedCctaAnalysisId(null) }} type="button">
                    <span>{formatDate(item.completed_at || item.requested_at)}</span>
                    <span><strong>Clinical AI</strong>{` · 검사 #${item.examination}`}</span>
                    <b className="status-pill status-report-clinical">분석 완료</b>
                    <span>의료진 검토용</span>
                  </button>
                  <button onClick={() => { setSelectedClinicalAnalysisId(item.id); setSelectedResultId(null); setSelectedCctaAnalysisId(null) }} title="Clinical AI 결과 상세에서 PDF 저장" type="button">보기</button>
                </div>
              ))}
              {visibleCctaReports.map((item) => (
                <div className={`module-table-row ${selectedCctaAnalysisId === item.id ? 'is-selected' : ''}`} key={`ccta-analysis-${item.id}`}>
                  <button className="report-row-select" onClick={() => { setSelectedCctaAnalysisId(item.id); setSelectedResultId(null); setSelectedClinicalAnalysisId(null) }} type="button">
                    <span>{formatDate(item.completed_at || item.requested_at)}</span>
                    <span><strong>3D CCTA</strong>{` · 검사 #${item.examination}`}</span>
                    <b className="status-pill status-report-clinical">분석 완료</b>
                    <span>보고서 작성 전</span>
                  </button>
                  <button onClick={() => { setSelectedCctaAnalysisId(item.id); setSelectedResultId(null); setSelectedClinicalAnalysisId(null) }} title="3D CCTA 분석 결과 확인 및 보고서 작성" type="button">보기</button>
                </div>
              ))}
              {reportsLoading && <p className="report-empty-inline">목록을 불러오는 중…</p>}
              {!reportsLoading && totalReportCount === 0 && <div className="feature-empty"><FileText size={28} /><strong>등록된 보고서가 없습니다.</strong></div>}
              {!reportsLoading && totalReportCount > 0 && visibleReportCount === 0 && <div className="feature-empty"><FileText size={28} /><strong>선택한 종류의 보고서가 없습니다.</strong></div>}
            </div>
          )}
        </section>
      </div>

      {selectedResultId && (
        <section className="feature-card report-detail-card">
          {detailLoading && <p className="report-empty-inline">상세를 불러오는 중…</p>}
          {detail && (
            <>
              <header className="report-detail-header">
                <div>
                  <small>{reportTypeLabels[detail.reportType]} 결과보고서 #{detail.medicalResultId}</small>
                  <h2>{detail.patient.name} · {detail.patient.medicalRecordNo}</h2>
                </div>
                <b className={`status-pill status-report-${detail.workflow.status.toLowerCase()}`}>
                  {reportStatusLabels[detail.workflow.status] ?? detail.workflow.status}
                </b>
              </header>

              <article className="report-section">
                <h3>1. 환자/검사 정보</h3>
                <dl className="report-meta-grid">
                  <div><dt>환자</dt><dd>{detail.patient.name}</dd></div>
                  <div><dt>환자번호</dt><dd>{detail.patient.medicalRecordNo}</dd></div>
                  <div><dt>검사/진료</dt><dd>{detail.workflow.examName ?? detail.encounter.encounterType ?? '-'}</dd></div>
                  <div><dt>검사일</dt><dd>{formatDate(detail.encounter.visitDate)}</dd></div>
                  <div><dt>담당 의료진</dt><dd>{detail.workflow.signedBy ?? detail.encounter.doctorName ?? '-'}</dd></div>
                </dl>
              </article>

              {detail.reportType === 'INTEGRATED' && <AiBlock kind="clinical" summary={detail.aiSummaries.clinical} title="2. Clinical AI 분석 결과" />}
              {(detail.reportType === 'XCA_2D' || detail.reportType === 'INTEGRATED') && <AiBlock kind="xca" summary={detail.aiSummaries.xca} attachments={detail.xcaAttachments} title={detail.reportType === 'XCA_2D' ? '2. 2D XCA 분석 결과' : '3. 2D XCA 분석 결과'} />}
              {(detail.reportType === 'CCTA_3D' || detail.reportType === 'INTEGRATED') && <AiBlock kind="ccta" summary={detail.aiSummaries.ccta} title={detail.reportType === 'CCTA_3D' ? '2. 3D CCTA 석회화 결과' : '4. 3D CCTA 석회화 결과'} />}

              <article className="report-section">
                <h3>{detail.reportType === 'INTEGRATED' ? '5' : '3'}. 의료진 최종 소견</h3>
                <textarea
                  disabled={!canEditConclusion || Boolean(busyAction)}
                  onChange={(event) => setConclusion(event.target.value)}
                  placeholder="최종 소견을 작성하세요."
                  rows={6}
                  value={conclusion}
                />
              </article>

              <article className="report-section">
                <h3>{detail.reportType === 'INTEGRATED' ? '6' : '4'}. 최종 확인 및 승인</h3>
                {detail.workflow.status === 'SIGNED' || detail.workflow.status === 'RELEASED' ? (
                  <>
                    <p><strong>최종 승인 완료</strong></p>
                    <div className="report-approval-summary">
                      <dl className="report-approval-meta">
                        <div><dt>진료과</dt><dd>{detail.workflow.signedDepartment ?? '-'}</dd></div>
                        <div><dt>승인 일시</dt><dd>{formatDate(detail.workflow.signedAt)}</dd></div>
                        <div><dt>승인 버전</dt><dd>{detail.workflow.signedVersionNo ? `v${detail.workflow.signedVersionNo}` : '-'}</dd></div>
                        <div><dt>승인 의료진</dt><dd>{detail.workflow.signedBy ?? '-'}</dd></div>
                      </dl>
                      <div className="report-signature-box report-approval-signature">
                        <small>서명</small>
                        <ReportSignature fileId={detail.workflow.signatureFileAssetId} doctorName={detail.workflow.signedBy} fallbackUrl={detail.workflow.signedBy && detail.workflow.signedBy === (staffDoctor?.name || staffIdentity?.name) ? currentDoctorSignature : undefined} />
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <dl className="report-meta-grid">
                      <div><dt>승인 예정 의료진</dt><dd>{staffDoctor?.name || staffIdentity?.name || '-'}</dd></div>
                      <div><dt>진료과</dt><dd>{staffDoctor?.departmentName || staffIdentity?.departmentName || '-'}</dd></div>
                      <div><dt>대상 버전</dt><dd>{detail.workflow.signedVersionNo ? `v${detail.workflow.signedVersionNo}` : '현재 초안'}</dd></div>
                    </dl>
                    <div className="report-signature-box">
                      <small>서명</small>
                      <ReportSignature fileId={detail.workflow.signatureFileAssetId} doctorName={staffDoctor?.name || staffIdentity?.name} fallbackUrl={currentDoctorSignature} />
                    </div>
                  </>
                )}
                {detail.workflow.patientVisible ? (
                  <p className="report-release-status">환자 공개 완료 · 공개 일시: {formatDate(detail.workflow.releasedAt)}</p>
                ) : (
                  <p className="report-release-status">환자 미공개</p>
                )}
              </article>

              <div className="report-actions report-actions-end">
                {canSave && (
                  <button disabled={busyAction === 'save'} onClick={() => void runAction('save', () => saveMedicalResultConclusion(detail.medicalResultId, conclusion))} type="button">
                    {busyAction === 'save' ? '저장 중…' : '초안 저장'}
                  </button>
                )}
                {detail.workflow.canSignoff && (
                  <button className="report-primary-btn" disabled={Boolean(busyAction)} onClick={() => setConfirmSignoff(true)} type="button">
                    최종 승인
                  </button>
                )}
                {detail.workflow.canRelease && (
                  <button className="report-primary-btn report-release-btn" disabled={Boolean(busyAction)} onClick={() => void runAction('release', () => releaseMedicalResult(detail.medicalResultId))} type="button">
                    {busyAction === 'release' ? '공개 중…' : '환자에게 공개'}
                  </button>
                )}
                {detail.workflow.latestReportId && (
                  <button disabled={reportDownloadingId === detail.workflow.latestReportId} onClick={() => void openReport(detail.workflow.latestReportId as number)} type="button">
                    PDF 열기
                  </button>
                )}
              </div>
            </>
          )}
        </section>
      )}
      {selectedClinicalAnalysisId && detailLoading && !clinicalDetail && (
        <section className="feature-card report-detail-card"><p className="report-empty-inline">Clinical AI 보고서를 불러오는 중…</p></section>
      )}
      {selectedClinicalAnalysisId && clinicalDetail && reportPatient && (
        <ClinicalAiReportDetail
          analysis={clinicalDetail}
          patient={reportPatient}
          shap={clinicalShap}
          staffDoctor={staffDoctor}
          staffIdentity={staffIdentity}
        />
      )}
      {selectedCctaAnalysisId && detailLoading && !cctaDetail && (
        <section className="feature-card report-detail-card"><p className="report-empty-inline">3D CCTA 분석 결과를 불러오는 중…</p></section>
      )}
      {selectedCctaAnalysis && cctaDetail && reportPatient?.backendId && (
        <section className="feature-card report-detail-card">
          <header className="report-detail-header">
            <div>
              <small>3D CCTA AI 분석 #{selectedCctaAnalysis.id}</small>
              <h2>{reportPatient.name} · 검사 #{selectedCctaAnalysis.examination}</h2>
            </div>
            <b className="status-pill status-report-clinical">분석 완료</b>
          </header>
          <article className="report-section">
            <h3>1. AI 분석 결과</h3>
            <dl className="report-meta-grid">
              <div><dt>분석 완료</dt><dd>{formatDate(selectedCctaAnalysis.completed_at || selectedCctaAnalysis.requested_at)}</dd></div>
              <div><dt>분석 ID</dt><dd>#{selectedCctaAnalysis.id}</dd></div>
              <div><dt>검사 ID</dt><dd>#{selectedCctaAnalysis.examination}</dd></div>
              <div><dt>결과 상태</dt><dd>{selectedCctaResult?.status ?? '결과 확인 필요'}</dd></div>
            </dl>
            <p>{selectedCctaResult?.summary_text || '저장된 CCTA 석회화 분석 결과를 의료진이 확인해주세요.'}</p>
          </article>
          {selectedCctaResult ? (
            <CCTAReportDraft
              analysisResultId={selectedCctaResult.id}
              disabled={cctaReportBusy}
              examinationId={selectedCctaAnalysis.examination}
              onBusyChange={setCctaReportBusy}
              onReportChange={() => { void reloadList(reportPatient.backendId!) }}
              patientId={reportPatient.backendId!}
            />
          ) : (
            <p className="api-inline-error" role="alert">보고서에 연결할 수 있는 유효한 CCTA 결과가 없습니다.</p>
          )}
        </section>
      )}
      {confirmSignoff && detail && (
        <div className="report-modal-backdrop" role="presentation" onClick={() => setConfirmSignoff(false)}>
          <div className="report-modal" role="dialog" aria-labelledby="report-signoff-title" onClick={(event) => event.stopPropagation()}>
            <h3 id="report-signoff-title">최종 승인하시겠습니까?</h3>
            <p>승인 후 현재 보고서 버전이 최종본으로 확정되고, 로그인한 의료진의 등록 서명이 PDF에 반영됩니다.</p>
            <dl className="report-meta-grid">
              <div><dt>의료진</dt><dd>{staffDoctor?.name || staffIdentity?.name || '-'}</dd></div>
              <div><dt>진료과</dt><dd>{staffDoctor?.departmentName || staffIdentity?.departmentName || '-'}</dd></div>
              <div><dt>승인 대상 버전</dt><dd>현재 초안</dd></div>
            </dl>
            <div className="report-signature-box">
              <small>서명</small>
              <ReportSignature fileId={null} doctorName={staffDoctor?.name || staffIdentity?.name} fallbackUrl={currentDoctorSignature} />
            </div>
            <div className="report-actions">
              <button disabled={Boolean(busyAction)} onClick={() => setConfirmSignoff(false)} type="button">취소</button>
              <button
                className="report-primary-btn"
                disabled={Boolean(busyAction)}
                onClick={() => {
                  setConfirmSignoff(false)
                  void runAction('signoff', () => signoffMedicalResult(detail.medicalResultId, conclusion))
                }}
                type="button"
              >
                {busyAction === 'signoff' ? '승인 중…' : '최종 승인'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
