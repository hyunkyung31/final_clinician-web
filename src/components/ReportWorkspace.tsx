import { useEffect, useId, useState } from 'react'
import { FileText, LoaderCircle, Search } from 'lucide-react'
import type { MedicalResultDetail, PatientReportSummary, PatientSummary, ReportAiSummary, ReportXcaAttachment, StaffDoctor, StaffIdentity } from '../types'
import {
  createPatientMedicalResult,
  getFileContentObjectUrl,
  getMedicalResultDetail,
  getPatientReports,
  getPatientsPage,
  getReportDownload,
  releaseMedicalResult,
  saveMedicalResultConclusion,
  signoffMedicalResult,
} from '../api/client'
import { getDoctorSignature } from '../doctorSignatures'
import './report-workspace.css'

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
            <div><dt>위험도</dt><dd>{summary.prediction ?? '-'}</dd></div>
            <div><dt>확률</dt><dd>{formatPercent(summary.probability)}</dd></div>
            <div><dt>모델</dt><dd>{[summary.modelName, summary.modelVersion].filter(Boolean).join(' ') || '-'}</dd></div>
          </>
        )}
        {kind !== 'clinical' && (
          <div><dt>요약</dt><dd>{summary.summary ?? '-'}</dd></div>
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
      {kind === 'xca' && (attachments.length ? attachments.map((attachment, index) => <section key={index}>
        <h4>XCA 선택 첨부 {index + 1}</h4>
        {attachment.note && <p>의료진 의견: {attachment.note}</p>}
        {attachment.frames.map(frame => <div key={frame.id}>
          <p>촬영 {frame.sequenceNo} · frame_index {frame.frameIndex}</p>
          <ReportXcaImages sourceId={frame.sourceFileAssetId} maskId={frame.maskFileAssetId} />
        </div>)}
      </section>) : <ReportXcaImages sourceId={summary?.sourceFileAssetId ?? null} maskId={summary?.overlayFileAssetId ?? null} />)}
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
  const [reportsLoading, setReportsLoading] = useState(false)
  const [reportsError, setReportsError] = useState('')
  const [selectedResultId, setSelectedResultId] = useState<number | null>(null)
  const [detail, setDetail] = useState<MedicalResultDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [conclusion, setConclusion] = useState('')
  const [busyAction, setBusyAction] = useState('')
  const [reportDownloadingId, setReportDownloadingId] = useState<number | null>(null)
  const [confirmSignoff, setConfirmSignoff] = useState(false)
  const currentDoctorSignature = getDoctorSignature(staffIdentity?.username)

  useEffect(() => {
    if (!reportPatient && selectedPatient) setReportPatient(selectedPatient)
  }, [selectedPatient, reportPatient])

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

  const reloadList = (patientId: number) => getPatientReports(patientId)
    .then((items) => setPatientReports(items))
    .catch((error) => { setPatientReports([]); setReportsError(error instanceof Error ? error.message : '보고서 목록을 불러오지 못했습니다.') })

  useEffect(() => {
    if (!reportPatient?.backendId) {
      setPatientReports([])
      setReportsError('')
      setSelectedResultId(null)
      setDetail(null)
      return
    }
    let active = true
    setReportsLoading(true)
    setReportsError('')
    void getPatientReports(reportPatient.backendId)
      .then((items) => { if (active) setPatientReports(items) })
      .catch((error) => { if (active) { setPatientReports([]); setReportsError(error instanceof Error ? error.message : '보고서 목록을 불러오지 못했습니다.') } })
      .finally(() => { if (active) setReportsLoading(false) })
    return () => { active = false }
  }, [reportPatient?.backendId])

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

  return (
    <section className="feature-page module-page report-workspace">
      <header className="feature-header module-header">
        <div>
          <small>CLINICAL REPORT</small>
          <h1>결과보고서</h1>
          <p>Clinical AI, 2D XCA, 3D CCTA 결과를 하나의 보고서로 모은 뒤 최종 승인과 환자 공개를 분리합니다.</p>
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
                <button className={reportPatient?.backendId === patient.backendId ? 'active' : ''} key={patient.id} onClick={() => { setReportPatient(patient); setReportSearchKeyword(''); setReportSearchResults([]); setSelectedResultId(null) }} type="button">
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
            <button
              className="report-primary-btn"
              disabled={busyAction === 'create'}
              onClick={() => void runAction('create', async () => {
                const created = await createPatientMedicalResult(reportPatient.backendId as number)
                setSelectedResultId(created.medicalResultId)
                return created
              })}
              type="button"
            >
              {busyAction === 'create' ? '초안 생성 중…' : '새 결과보고서 초안'}
            </button>
          )}
        </section>
        <section className="feature-card module-table-card">
          <header><h2>보고서 목록</h2><span>총 {patientReports.length}건</span></header>
          {reportsError && <p className="api-inline-error">{reportsError}</p>}
          {!reportPatient && <div className="feature-empty"><FileText size={28} /><strong>환자를 먼저 검색해 선택해주세요.</strong></div>}
          {reportPatient && (
            <div className="module-table module-report-table">
              <div className="module-table-head"><span>검사일</span><span>진료 유형</span><span>상태</span><span>작성/서명 의료진</span><span /></div>
              {patientReports.map((item) => (
                <div className={`module-table-row ${selectedResultId === item.medicalResultId ? 'is-selected' : ''}`} key={item.medicalResultId}>
                  <button className="report-row-select" onClick={() => setSelectedResultId(item.medicalResultId)} type="button">
                    <span>{item.visitDate ? new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium' }).format(new Date(item.visitDate)) : '-'}</span>
                    <span>{item.encounterType ?? '-'}</span>
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
              {reportsLoading && <p className="report-empty-inline">목록을 불러오는 중…</p>}
              {!reportsLoading && patientReports.length === 0 && <div className="feature-empty"><FileText size={28} /><strong>등록된 보고서가 없습니다.</strong></div>}
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
                  <small>통합 결과보고서 #{detail.medicalResultId}</small>
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
                  <div><dt>담당 의료진</dt><dd>{detail.encounter.doctorName ?? '-'}</dd></div>
                </dl>
              </article>

              <AiBlock kind="clinical" summary={detail.aiSummaries.clinical} title="2. Clinical AI 분석 결과" />
              <AiBlock kind="xca" summary={detail.aiSummaries.xca} attachments={detail.xcaAttachments} title="3. 2D XCA 분석 결과" />
              <AiBlock kind="ccta" summary={detail.aiSummaries.ccta} title="4. 3D CCTA 석회화 결과" />

              <article className="report-section">
                <h3>5. 의료진 최종 소견</h3>
                <textarea
                  disabled={!canSave || Boolean(busyAction)}
                  onChange={(event) => setConclusion(event.target.value)}
                  placeholder="최종 소견을 작성하세요."
                  rows={6}
                  value={conclusion}
                />
              </article>

              <article className="report-section">
                <h3>6. 최종 확인 및 승인</h3>
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
