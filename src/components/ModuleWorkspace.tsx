import { useEffect, useMemo, useState } from 'react'
import {
  BrainCircuit,
  CheckCircle2,
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
  PatientSummary,
  StaffDoctor,
  StaffIdentity,
} from '../types'
import { getPatientsPage } from '../api/client'
import { ExaminationImagingWorkspace } from './ExaminationImagingWorkspace'
import { ReferenceRangeManager } from './ReferenceRangeManager'
import { ReportWorkspace } from './ReportWorkspace'

export type ModuleSection =
  | '환자 관리'
  | '검사·영상'
  | 'AI 분석'
  | '결과보고서'
  | '설정'

interface ModuleWorkspaceProps {
  staffRoles: string[]
  staffIdentity?: StaffIdentity | null
  staffDoctor?: StaffDoctor | null
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
  imagingLaunchFocus?: 'xca' | 'ccta3d' | 'imaging' | null
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
  staffIdentity,
  staffDoctor,
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
  imagingLaunchFocus,
}: ModuleWorkspaceProps) {
  const [patientScope, setPatientScope] = useState<PatientListScope>('mine')
  const [patientSearch, setPatientSearch] = useState('')
  const [patientSearchResults, setPatientSearchResults] = useState<PatientSummary[] | null>(null)
  const [patientSearchLoading, setPatientSearchLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [count, setCount] = useState(0)
  const [hasNext, setHasNext] = useState(false)
  const [listError, setListError] = useState('')

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
          launchFocus={imagingLaunchFocus}
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
    return <ReportWorkspace selectedPatient={selectedPatient} staffDoctor={staffDoctor} staffIdentity={staffIdentity} />
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
