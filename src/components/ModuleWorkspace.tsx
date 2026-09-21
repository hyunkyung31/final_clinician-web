import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BrainCircuit,
  CheckCircle2,
  FileText,
  LoaderCircle,
  MonitorPlay,
  Search,
  Settings,
  ShieldCheck,
  Type,
  UserRound,
  Users,
} from 'lucide-react'
import type {
  DashboardAIStatus,
  DashboardSummary,
  ImagingStudySummary,
  PatientReportSummary,
  PatientSummary,
} from '../types'
import { getPatientReports, getPatientsPage, getReportDownload, releasePatientReport } from '../api/client'
import { ExaminationImagingWorkspace } from './ExaminationImagingWorkspace'
import { ReferenceRangeManager } from './ReferenceRangeManager'

export type ModuleSection =
  | '환자 관리'
  | '검사·영상'
  | 'AI 분석'
  | '결과보고서'
  | '설정'

interface ModuleWorkspaceProps {
  staffRoles: string[]
  section: ModuleSection
  patients: PatientSummary[]
  assignedPatients: PatientSummary[]
  consultationPatients: PatientSummary[]
  recentPatients: PatientSummary[]
  selectedPatient: PatientSummary | null
  imagingStudies: ImagingStudySummary[]
  dashboardSummary: DashboardSummary | null
  aiStatus: DashboardAIStatus | null
  fontSize: 'small' | 'normal' | 'large' | 'xlarge'
  onFontSizeChange: (size: 'small' | 'normal' | 'large' | 'xlarge') => void
  onOpenPatient: (patientId: string) => void
  onSelectPatient: (patient: PatientSummary) => void
}

type PatientListScope = 'mine' | 'consultation' | 'recent' | 'all'

const statusLabels = {
  waiting: '대기',
  running: '진행',
  complete: '완료',
  urgent: '긴급',
}

function ModuleHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string
  title: string
  description: string
}) {
  return (
    <header className="feature-header module-header">
      <div>
        <small>{eyebrow}</small>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <span className="feature-live"><i /> LIVE API</span>
    </header>
  )
}

export function ModuleWorkspace({
  staffRoles,
  section,
  patients,
  assignedPatients,
  consultationPatients,
  recentPatients,
  selectedPatient,
  imagingStudies,
  dashboardSummary,
  aiStatus,
  fontSize,
  onFontSizeChange,
  onOpenPatient,
  onSelectPatient,
}: ModuleWorkspaceProps) {
  const [patientScope, setPatientScope] = useState<PatientListScope>('mine')
  const [patientSearch, setPatientSearch] = useState('')
  const [patientSearchResults, setPatientSearchResults] = useState<PatientSummary[] | null>(null)
  const [patientSearchLoading, setPatientSearchLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [count, setCount] = useState(0)
  const [hasNext, setHasNext] = useState(false)
  const [listError, setListError] = useState('')

  const [reportPatient, setReportPatient] = useState<PatientSummary | null>(null)
  const [reportSearchKeyword, setReportSearchKeyword] = useState('')
  const [reportSearchResults, setReportSearchResults] = useState<PatientSummary[]>([])
  const [reportSearchLoading, setReportSearchLoading] = useState(false)
  const [reportSearchError, setReportSearchError] = useState('')
  const [patientReports, setPatientReports] = useState<PatientReportSummary[]>([])
  const [reportsLoading, setReportsLoading] = useState(false)
  const [reportsError, setReportsError] = useState('')
  const [reportDownloadingId, setReportDownloadingId] = useState<number | null>(null)
  const [releasingResultId, setReleasingResultId] = useState<number | null>(null)
  const [reportReloadKey, setReportReloadKey] = useState(0)
  const releaseLock = useRef(false)

  // '전체 환자' 통계/탭 배지는 그동안 `patients` prop(내 담당+협진+최근 조회를 합친
  // 부분집합, App.tsx의 초기 로딩에서만 채워짐)의 길이를 썼는데, 이 값은 실제
  // 전체 synthetic 환자 수(100명)와 무관하다. 실제 전체 건수는 페이지네이션
  // 목록과 동일하게 backend count를 그대로 신뢰해야 하므로, size=1로 총
  // 건수(count)만 별도 조회한다. (page_size=100 하드코딩이 아니라 count 필드만 사용)
  const [totalPatientCount, setTotalPatientCount] = useState<number | null>(null)
  useEffect(() => {
    let active = true
    void getPatientsPage('', false, { patientScope: 'ALL_ACCESSIBLE', page: 1, size: 1 })
      .then((data) => { if (active) setTotalPatientCount(data.count) })
      .catch(() => { /* 통계용 보조 조회 실패는 patients.length로 폴백 */ })
    return () => { active = false }
  }, [])
  const displayedTotalPatientCount = totalPatientCount ?? patients.length

  const scopedPatients = useMemo(() => {
    if (patientScope === 'mine') return assignedPatients
    if (patientScope === 'consultation') return consultationPatients
    if (patientScope === 'recent') return recentPatients
    return patients
  }, [assignedPatients, consultationPatients, patientScope, patients, recentPatients])

  useEffect(() => {
    const keyword = patientSearch.trim()
    setPatientSearchResults(null)
    if (section !== '환자 관리') {
      setPatientSearchLoading(false)
      return
    }

    let active = true
    setPatientSearchLoading(true)
    setPatientSearchResults([])
    setListError('')
    const timer = window.setTimeout(() => {
      setPatientSearchLoading(true)
      const scopes = { mine: 'ASSIGNED_TO_ME', consultation: 'CONSULTATION', recent: 'RECENT', all: 'ALL_ACCESSIBLE' } as const
      void getPatientsPage(keyword, false, { patientScope: scopes[patientScope], page })
        .then((data) => { if (active) { setPatientSearchResults(data.results); setCount(data.count); setHasNext(data.hasNext) } })
        .catch((error) => { if (active) { setPatientSearchResults([]); setCount(0); setHasNext(false); setListError(error instanceof Error ? error.message : '환자 목록 조회 실패') } })
        .finally(() => { if (active) setPatientSearchLoading(false) })
    }, 250)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [patientScope, patientSearch, section, page])
  useEffect(() => { setPage(1) }, [patientScope, patientSearch])

  // '결과보고서' 화면 진입 시 현재 전역 선택 환자를 초기값으로만 사용한다.
  // 이후에는 이 화면 안에서 직접 검색해 다른 환자로 바꿀 수 있어야 하므로,
  // selectedPatient가 바뀌어도 사용자가 이미 고른 reportPatient를 덮어쓰지 않는다.
  useEffect(() => {
    if (section === '결과보고서' && !reportPatient && selectedPatient) {
      setReportPatient(selectedPatient)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section])

  useEffect(() => {
    if (section !== '결과보고서') return
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
  }, [reportSearchKeyword, section])

  useEffect(() => {
    if (!reportPatient?.backendId) {
      setPatientReports([])
      setReportsError('')
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
  }, [reportPatient?.backendId, reportReloadKey])

  const reportStatusLabels: Record<string, string> = { DRAFT: '초안', REVIEWING: '검토 중', SIGNED: '서명 완료', RELEASED: '공개됨' }

  const handleReleaseReport = async (item: PatientReportSummary) => {
    if (releaseLock.current || reportsLoading || !reportPatient || item.status !== 'SIGNED') return
    if (!window.confirm(
      `${reportPatient.name} (${reportPatient.id}) 환자에게\n` +
      `의료 결과 #${item.medicalResultId}를 공개할까요?\n\n` +
      '공개 후 환자 앱에서 결과보고서를 볼 수 있습니다.',
    )) return

    releaseLock.current = true
    setReleasingResultId(item.medicalResultId)
    setReportsError('')
    try {
      await releasePatientReport(item.medicalResultId)
    } catch (error) {
      window.alert(
        (error instanceof Error ? error.message : '공개 요청 실패') +
        '\n목록을 다시 조회합니다. 상태 확인 후 진행하세요.',
      )
    } finally {
      // Re-fetch even after a lost response: the server may have committed the release.
      setReportsLoading(true)
      setReportReloadKey(value => value + 1)
      setReleasingResultId(null)
      releaseLock.current = false
    }
  }

  const openReport = async (reportId: number) => {
    setReportsError('')
    // Open during the click event so the awaited API request does not trigger popup blocking.
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
        throw new Error('다운로드 주소가 만료되었습니다. 보고서 보기를 다시 눌러 새 주소를 받아주세요.')
      }
      const downloadUrl = new URL(info.downloadUrl)
      if (!['https:', 'http:'].includes(downloadUrl.protocol)) throw new Error('보고서 다운로드 주소 형식이 올바르지 않습니다.')
      // Navigate directly: do not forward the staff JWT to the storage service.
      if (!tab.closed) tab.location.replace(info.downloadUrl)
    } catch (error) {
      tab.close()
      setReportsError(error instanceof Error ? error.message : '보고서 다운로드에 실패했습니다.')
    } finally {
      setReportDownloadingId(null)
    }
  }

  const displayedPatients = useMemo(() => {
    const keyword = patientSearch.trim().toLowerCase()
    if (patientSearchResults) return patientSearchResults
    if (!keyword) return scopedPatients
    const candidates = patientSearchResults ?? scopedPatients
    const allowedIds = new Set(scopedPatients.map((patient) => patient.backendId))
    return candidates.filter((patient) =>
      (patientScope === 'all' || patientScope === 'mine' || allowedIds.has(patient.backendId)) &&
      `${patient.name} ${patient.id} ${patient.exam}`.toLowerCase().includes(keyword),
    )
  }, [patientScope, patientSearch, patientSearchResults, scopedPatients])

  if (section === '환자 관리') {
    return (
      <section className="feature-page module-page">
        <ModuleHeader
          eyebrow="PATIENT MANAGEMENT"
          title="환자 관리"
          description="접근 가능한 환자를 조회하고 워크스테이션으로 연결합니다."
        />
        <div className="module-content">
          <section className="module-stat-grid">
            <article><Users size={20} /><span>전체 환자</span><strong>{displayedTotalPatientCount}</strong></article>
            <article><UserRound size={20} /><span>내 담당 환자</span><strong>{assignedPatients.length}</strong></article>
            <article><ShieldCheck size={20} /><span>협진 환자</span><strong>{consultationPatients.length}</strong></article>
          </section>
          <section className="feature-card patient-management-toolbar">
            <div className="patient-management-tabs" role="tablist" aria-label="환자 목록 범위">
              <button aria-selected={patientScope === 'mine'} className={patientScope === 'mine' ? 'active' : ''} onClick={() => setPatientScope('mine')} role="tab" type="button">내 담당 <b>{assignedPatients.length}</b></button>
              <button aria-selected={patientScope === 'consultation'} className={patientScope === 'consultation' ? 'active' : ''} onClick={() => setPatientScope('consultation')} role="tab" type="button">협진 <b>{consultationPatients.length}</b></button>
              <button aria-selected={patientScope === 'recent'} className={patientScope === 'recent' ? 'active' : ''} onClick={() => setPatientScope('recent')} role="tab" type="button">최근 조회 <b>{recentPatients.length}</b></button>
              <button aria-selected={patientScope === 'all'} className={patientScope === 'all' ? 'active' : ''} onClick={() => setPatientScope('all')} role="tab" type="button">전체 <b>{displayedTotalPatientCount}</b></button>
            </div>
            <label className="patient-management-search"><Search size={15} /><input value={patientSearch} onChange={(event) => setPatientSearch(event.target.value)} placeholder="환자 이름 또는 환자번호 검색" />{patientSearchLoading && <LoaderCircle className="spin" size={15} />}</label>
          </section>
          <section className="feature-card module-table-card">
            <header><h2>{patientScope === 'mine' ? '내 담당 환자' : patientScope === 'consultation' ? '협진 환자' : patientScope === 'recent' ? '최근 조회 환자' : '전체 환자'}</h2><span>총 {count}명 · {page}페이지</span></header>
            {listError && <p className="api-inline-error">{listError}</p>}
            <div className="module-table module-patient-table">
              <div className="module-table-head"><span>환자</span><span>환자번호</span><span>성별/나이</span><span>최근 진료</span><span>상태</span><span /></div>
              {displayedPatients.map((patient) => (
                <div key={patient.id} className="module-table-row">
                  <strong><i className={`risk-dot ${patient.risk}`} />{patient.name}</strong>
                  <span>{patient.id}</span>
                  <span>{patient.sex === 'F' ? '여자' : '남자'} / {patient.age}</span>
                  <span>{patient.exam}</span>
                  <b className={`status-pill status-${patient.status}`}>{statusLabels[patient.status]}</b>
                  <button onClick={() => { onSelectPatient(patient); onOpenPatient(patient.id) }} type="button">워크스테이션에서 열기</button>
                </div>
              ))}
              {!patientSearchLoading && displayedPatients.length === 0 && <div className="feature-empty"><Users size={28} /><strong>{patientSearch ? '검색 결과가 없습니다' : patientScope === 'mine' ? '배정된 담당 환자가 없습니다' : patientScope === 'consultation' ? '참여 중인 협진 환자가 없습니다' : patientScope === 'recent' ? '최근 조회한 환자가 없습니다' : '조회 가능한 환자가 없습니다'}</strong></div>}
            </div>
            <div className="api-pagination"><button type="button" disabled={page === 1 || patientSearchLoading} onClick={() => setPage((value) => value - 1)}>이전</button><span>{page}페이지</span><button type="button" disabled={!hasNext || patientSearchLoading} onClick={() => setPage((value) => value + 1)}>다음</button></div>
          </section>
        </div>
      </section>
    )
  }

  if (section === '검사·영상') {
    return (
      <section className="feature-page module-page">
        <ModuleHeader
          eyebrow="EXAMINATION & IMAGING"
          title="검사·영상"
          description="영상검사 판독과 혈액검사 변화 추세를 함께 확인합니다."
        />
        <ExaminationImagingWorkspace
          key={selectedPatient?.backendId ?? selectedPatient?.id ?? 'none'}
          patient={selectedPatient}
          patients={patients}
          imagingStudies={imagingStudies}
          onOpenPatient={onOpenPatient}
          onSelectPatient={onSelectPatient}
        />
      </section>
    )
  }

  if (section === 'AI 분석') {
    const total = aiStatus?.total ?? 0
    return (
      <section className="feature-page module-page">
        <ModuleHeader
          eyebrow="ANGIOCAD AI"
          title="AI 분석"
          description="분석 작업 상태와 완료 결과를 통합 관리합니다."
        />
        <div className="module-content">
          <section className="module-stat-grid module-ai-stats">
            <article><BrainCircuit size={20} /><span>전체 분석</span><strong>{total}</strong></article>
            <article><span className="module-status-dot queued" /><span>대기</span><strong>{aiStatus?.queued ?? 0}</strong></article>
            <article><span className="module-status-dot running" /><span>진행</span><strong>{aiStatus?.running ?? 0}</strong></article>
            <article><CheckCircle2 size={20} /><span>완료</span><strong>{aiStatus?.completed ?? 0}</strong></article>
            <article className="danger"><span className="module-status-dot failed" /><span>실패</span><strong>{aiStatus?.failed ?? 0}</strong></article>
          </section>
          <section className="feature-card module-placeholder-card">
            <span className="module-icon"><BrainCircuit size={26} /></span>
            <h2>AI 분석 작업 목록</h2>
            <p>AI 모델 결과 데이터와 분석 요청 API가 연결되면 환자별 작업 진행률, 병변 결과, 모델 버전을 표시합니다.</p>
            <div className="module-progress"><span style={{ width: total ? `${Math.round(((aiStatus?.completed ?? 0) / total) * 100)}%` : '0%' }} /></div>
            <small>API 기준일 {aiStatus?.date ?? dashboardSummary?.date ?? '-'}</small>
          </section>
        </div>
      </section>
    )
  }

  if (section === '결과보고서') {
    return (
      <section className="feature-page module-page">
        <ModuleHeader
          eyebrow="CLINICAL REPORT"
          title="결과보고서"
          description="환자를 검색해 판독 초안부터 최종 서명·공개까지의 보고서 상태를 확인합니다."
        />
        <div className="module-content module-split">
          <section className="feature-card module-context-card">
            <span className="module-icon"><FileText size={22} /></span>
            <small>환자 검색</small>
            <label className="patient-management-search"><Search size={15} /><input value={reportSearchKeyword} onChange={(event) => setReportSearchKeyword(event.target.value)} placeholder="이름 또는 환자번호 검색" />{reportSearchLoading && <LoaderCircle className="spin" size={15} />}</label>
            {reportSearchError && <p className="api-inline-error">{reportSearchError}</p>}
            {reportSearchKeyword.trim() && (
              <div className="module-report-search-results">
                {reportSearchResults.map((patient) => (
                  <button className={reportPatient?.backendId === patient.backendId ? 'active' : ''} key={patient.id} onClick={() => { setReportPatient(patient); setReportSearchKeyword(''); setReportSearchResults([]) }} type="button">
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
          </section>
          <section className="feature-card module-table-card">
            <header><h2>보고서 목록</h2><span>총 {patientReports.length}건</span></header>
            {reportsError && <p className="api-inline-error">{reportsError}</p>}
            {!reportPatient && <div className="feature-empty"><FileText size={28} /><strong>환자를 먼저 검색해 선택해주세요.</strong></div>}
            {reportPatient && (
              <div className="module-table module-report-table">
                <div className="module-table-head"><span>검사일</span><span>진료 유형</span><span>상태</span><span>작성/서명 의료진</span><span /></div>
                {patientReports.map((item) => (
                  <div key={item.medicalResultId} className="module-table-row">
                    <span>{item.visitDate ? new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium' }).format(new Date(item.visitDate)) : '-'}</span>
                    <span>{item.encounterType ?? '-'}</span>
                    <b className={`status-pill status-report-${item.status.toLowerCase()}`}>{reportStatusLabels[item.status] ?? item.status}</b>
                    <span>{item.latestSignoff?.doctorName ?? item.doctorName ?? '-'}</span>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      disabled={!item.latestReport || reportDownloadingId === item.latestReport?.reportId}
                      onClick={() => item.latestReport && void openReport(item.latestReport.reportId)}
                      title={item.latestReport ? '보고서 PDF 열기' : '아직 생성된 보고서 파일이 없습니다'}
                      type="button"
                    >
                      {reportDownloadingId === item.latestReport?.reportId ? '여는 중…' : '보고서 보기'}
                    </button>
                    {item.status === 'SIGNED' && <button
                      type="button"
                      className="primary"
                      disabled={releasingResultId !== null || reportsLoading}
                      onClick={() => void handleReleaseReport(item)}
                    >
                      {releasingResultId === item.medicalResultId ? '공개 중…' : '환자에게 공개'}
                    </button>}
                    {item.status === 'RELEASED' && <span>환자 공개 완료</span>}
                    </div>
                  </div>
                ))}
                {!reportsLoading && patientReports.length === 0 && <div className="feature-empty"><FileText size={28} /><strong>등록된 보고서가 없습니다.</strong></div>}
              </div>
            )}
          </section>
        </div>
      </section>
    )
  }

  return (
    <section className="feature-page module-page">
      <ModuleHeader
        eyebrow="WORKSPACE SETTINGS"
        title="설정"
        description="의료진 워크스테이션의 표시 및 연결 상태를 확인합니다."
      />
      <div className="module-content settings-grid">
        <ReferenceRangeManager staffRoles={staffRoles} />
        <section className="feature-card settings-card settings-font-card">
          <Type size={21} />
          <div><h2>글자 크기</h2><p>워크스테이션과 채팅을 포함한 전체 화면의 글자 크기를 설정합니다.</p></div>
          <div className="settings-font-options" role="radiogroup" aria-label="글자 크기">
            {([
              ['small', '작게'],
              ['normal', '보통'],
              ['large', '크게'],
              ['xlarge', '매우 크게'],
            ] as const).map(([value, label]) => (
              <button aria-checked={fontSize === value} className={fontSize === value ? 'active' : ''} key={value} onClick={() => onFontSizeChange(value)} role="radio" type="button">{label}</button>
            ))}
          </div>
        </section>
        <section className="feature-card settings-card"><Settings size={21} /><div><h2>워크스테이션</h2><p>고밀도 데스크톱 레이아웃 · 한국어</p></div><b>사용 중</b></section>
        <section className="feature-card settings-card"><ShieldCheck size={21} /><div><h2>보안 세션</h2><p>Staff JWT 인증 · 세션 스토리지</p></div><b>연결됨</b></section>
        <section className="feature-card settings-card"><MonitorPlay size={21} /><div><h2>DICOM Viewer</h2><p>영상 데이터 및 Viewer token 연결 필요</p></div><b className="waiting">대기</b></section>
        <section className="feature-card settings-card"><BrainCircuit size={21} /><div><h2>AI 서버</h2><p>작업 현황 API 기준 상태</p></div><b>{aiStatus?.failed ? '확인 필요' : '정상'}</b></section>
      </div>
    </section>
  )
}
