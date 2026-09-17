import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Bell,
  BrainCircuit,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FileSignature,
  FlaskConical,
  LoaderCircle,
  Megaphone,
  RefreshCw,
  ShieldAlert,
  Stethoscope,
  UserRoundSearch,
  UsersRound,
} from 'lucide-react'
import {
  getDashboardConsultations,
  getDashboardExaminationStats,
  getDashboardRecentPatients,
  getDashboardWorkItems,
  getStaffNotifications,
  getStaffReservations,
  getStaffSchedules,
  getStaffTodos,
  updateStaffTodo,
} from '../api/client'
import type {
  DashboardAIStatus,
  DashboardConsultationItem,
  DashboardExaminationStats,
  DashboardRecentPatient,
  DashboardSummary,
  DashboardWorkItem,
  PatientSummary,
  StaffNotification,
  StaffReservation,
  StaffSchedule,
  StaffTodo,
} from '../types'

type HomeDestination = '워크스테이션' | '일정' | '검사·영상' | 'AI 분석' | '협진' | '채팅' | '결과보고서'

interface HomeDashboardProps {
  summary: DashboardSummary | null
  aiStatus: DashboardAIStatus | null
  patients: PatientSummary[]
  doctorId?: number
  roles: string[]
  clinicianName?: string
  onNavigate: (destination: HomeDestination) => void
  onOpenPatient: (patientId: number) => void
}

const emptyExaminationStats: DashboardExaminationStats = {
  scheduled: 0,
  inProgress: 0,
  completed: 0,
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function dayRange() {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setHours(23, 59, 59, 999)
  return { start: start.toISOString(), end: end.toISOString() }
}

function buildMonthDays(anchor = new Date()) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const start = new Date(first)
  start.setDate(first.getDate() - first.getDay())
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start)
    day.setDate(start.getDate() + index)
    return day
  })
}

function isTodoDone(todo: StaffTodo) {
  return ['DONE', 'COMPLETED'].includes(todo.status.toUpperCase())
}

function formatTime(value: string) {
  if (!value) return '--:--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function formatShortDate(value: string) {
  if (!value) return '기한 없음'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function EmptyRow({ text }: { text: string }) {
  return <div className="home-empty-row">{text}</div>
}

function PanelHeader({
  icon: Icon,
  title,
  count,
  onClick,
}: {
  icon: typeof CalendarClock
  title: string
  count?: number
  onClick?: () => void
}) {
  return (
    <header className="home-panel-header">
      <span><Icon size={16} strokeWidth={1.8} /><strong>{title}</strong></span>
      <button type="button" onClick={onClick} disabled={!onClick}>
        {count !== undefined && <b>{count}</b>}
        {onClick && <ChevronRight size={15} strokeWidth={1.8} />}
      </button>
    </header>
  )
}

export function HomeDashboard({
  summary,
  aiStatus,
  patients,
  doctorId,
  roles,
  clinicianName,
  onNavigate,
  onOpenPatient,
}: HomeDashboardProps) {
  const [reservations, setReservations] = useState<StaffReservation[]>([])
  const [schedules, setSchedules] = useState<StaffSchedule[]>([])
  const [examinationStats, setExaminationStats] = useState(emptyExaminationStats)
  const [workItems, setWorkItems] = useState<DashboardWorkItem[]>([])
  const [consultations, setConsultations] = useState<DashboardConsultationItem[]>([])
  const [todos, setTodos] = useState<StaffTodo[]>([])
  const [recentPatients, setRecentPatients] = useState<DashboardRecentPatient[]>([])
  const [notifications, setNotifications] = useState<StaffNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [errorCount, setErrorCount] = useState(0)
  const roleKey = roles.map((role) => role.toUpperCase()).sort().join(',')

  const loadDashboard = useCallback(async () => {
    setLoading(true)
    const range = dayRange()
    const normalizedRoles = roleKey.split(',').filter(Boolean)
    const isNurse = normalizedRoles.includes('NURSE')
    const isAdmin = normalizedRoles.some((role) => role === 'ADMIN' || role === 'SYSTEM_ADMIN')
    const canViewConsultations = Boolean(doctorId) || isAdmin
    const canViewReservations = Boolean(doctorId) || isNurse || isAdmin
    const results = await Promise.allSettled([
      canViewReservations
        ? getStaffReservations(localDateKey(), doctorId)
        : Promise.resolve([] as StaffReservation[]),
      getStaffSchedules(range.start, range.end),
      getDashboardExaminationStats(),
      getDashboardWorkItems(),
      canViewConsultations
        ? getDashboardConsultations()
        : Promise.resolve([] as DashboardConsultationItem[]),
      getStaffTodos(),
      getDashboardRecentPatients(),
      getStaffNotifications(),
    ])

    const value = <T,>(index: number, fallback: T): T =>
      results[index].status === 'fulfilled'
        ? (results[index] as PromiseFulfilledResult<T>).value
        : fallback

    setReservations(value(0, [] as StaffReservation[]))
    setSchedules(value(1, [] as StaffSchedule[]))
    setExaminationStats(value(2, emptyExaminationStats))
    setWorkItems(value(3, [] as DashboardWorkItem[]))
    setConsultations(value(4, [] as DashboardConsultationItem[]))
    setTodos(value(5, [] as StaffTodo[]))
    setRecentPatients(value(6, [] as DashboardRecentPatient[]))
    setNotifications(value(7, [] as StaffNotification[]))
    setErrorCount(results.filter((result) => result.status === 'rejected').length)
    setLoading(false)
  }, [doctorId, roleKey])

  useEffect(() => {
    void loadDashboard()
  }, [loadDashboard])

  useEffect(() => {
    const reloadTodos = () => void getStaffTodos().then(setTodos).catch(() => undefined)
    window.addEventListener('angiocad:todos-changed', reloadTodos)
    return () => window.removeEventListener('angiocad:todos-changed', reloadTodos)
  }, [])

  const highRiskPatients = useMemo(
    () => patients.filter((patient) => patient.risk === 'high' || patient.status === 'urgent'),
    [patients],
  )
  const todayKey = localDateKey()
  const today = new Date()
  const homeCalendarDays = buildMonthDays(today)
  const todayTodos = todos
    .filter((todo) => todo.dueAt
      ? localDateKey(new Date(todo.dueAt)) === todayKey
      : !isTodoDone(todo) || localDateKey(new Date(todo.completedAt)) === todayKey)
    .sort((a, b) => Number(isTodoDone(a)) - Number(isTodoDone(b)))
  const pendingTodayTodos = todayTodos.filter((todo) => !isTodoDone(todo))
  const pendingWorkItems = workItems.filter((item) => !['DONE', 'COMPLETED'].includes(item.status.toUpperCase()))
  const aiReviewItems = pendingWorkItems.filter((item) => item.workType.toUpperCase().includes('AI'))
  const cdssReviewItems = pendingWorkItems.filter((item) => item.workType.toUpperCase().includes('CDSS'))
  const receivedConsultations = consultations.filter((item) => item.assignedDoctorId === doctorId)
  const actionableConsultations = consultations.filter((item) =>
    !item.hasResponse || ['REQUESTED', 'ACCEPTED'].includes(item.status.toUpperCase()),
  )
  const importantNotifications = notifications.filter((item) =>
    !item.isRead || ['HIGH', 'URGENT', 'CRITICAL'].includes(item.priority.toUpperCase()),
  )
  const noticeItems = notifications.filter((item) => {
    const key = `${item.type} ${item.referenceType}`.toUpperCase()
    return ['NOTICE', 'ANNOUNCEMENT', 'BULLETIN'].some((value) => key.includes(value))
  })
  const examinationTotal = examinationStats.scheduled + examinationStats.inProgress + examinationStats.completed
  const aiTotal = aiStatus?.total ?? 0
  const greetingName = (clinicianName || '의료진').trim().split(/\s+/)[0]
  const toggleTodo = async (todo: StaffTodo) => {
    try {
      const updated = await updateStaffTodo(todo.id, {
        status: isTodoDone(todo) ? 'TODO' : 'DONE',
      })
      setTodos((current) => current.map((item) => item.id === updated.id ? updated : item))
      window.dispatchEvent(new CustomEvent('angiocad:todos-changed'))
    } catch {
      // 전역 To-do 창에서 오류와 재시도를 제공한다.
    }
  }

  return (
    <section className="feature-page home-dashboard-page">
      <header className="feature-header home-dashboard-header">
        <div>
          <small>CLINICAL OPERATIONS</small>
          <div className="home-title-line"><h1>오늘의 업무</h1><span>{greetingName}님, 오늘 확인할 업무를 정리했습니다.</span></div>
          <p>{new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date())}</p>
        </div>
        <div className="home-header-actions">
          {errorCount > 0 && <span className="home-partial-error"><AlertTriangle size={13} /> 일부 API {errorCount}건 연결 대기</span>}
          <button type="button" onClick={() => void loadDashboard()} disabled={loading}>
            {loading ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />}
            새로고침
          </button>
        </div>
      </header>

      <div className="home-dashboard-content">
        <section className="home-metric-grid">
          <button type="button" onClick={() => onNavigate('일정')}><CalendarClock /><span>오늘 예약</span><strong>{reservations.length}</strong><small>당일 예약 환자</small></button>
          <button type="button" onClick={() => onNavigate('검사·영상')}><FlaskConical /><span>검사 진행</span><strong>{summary?.examinationPendingCount ?? examinationStats.inProgress}</strong><small>예정·진행 검사</small></button>
          <button type="button" onClick={() => onNavigate('AI 분석')}><BrainCircuit /><span>AI 대기·진행</span><strong>{(aiStatus?.queued ?? 0) + (aiStatus?.running ?? 0)}</strong><small>검토 전 분석</small></button>
          <button type="button" onClick={() => onNavigate('협진')}><Stethoscope /><span>처리 대기 협진</span><strong>{actionableConsultations.length}</strong><small>수락·의견 필요</small></button>
          <button type="button" onClick={() => onNavigate('결과보고서')}><FileSignature /><span>승인 대기</span><strong>{summary?.signoffPendingCount ?? 0}</strong><small>검토·서명 보고서</small></button>
          <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('angiocad:open-notifications'))}><Bell /><span>주요 알림</span><strong>{importantNotifications.length}</strong><small>확인이 필요한 업무 알림</small></button>
        </section>

        <div className="home-primary-grid">
        <section className="feature-card home-panel home-today-hub-card">
          <PanelHeader icon={CalendarClock} title="오늘 일정" count={reservations.length + schedules.length} onClick={() => onNavigate('일정')} />
          <div className="home-today-hub">
            <div className="home-mini-calendar" onClick={() => onNavigate('일정')} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter') onNavigate('일정') }}>
              <div className="home-mini-calendar-header"><strong>{today.getFullYear()}년 {today.getMonth() + 1}월</strong><span>오늘</span></div>
              <div className="home-mini-weekdays">{['일', '월', '화', '수', '목', '금', '토'].map((day) => <span key={day}>{day}</span>)}</div>
              <div className="home-mini-days">
                {homeCalendarDays.map((day) => {
                  const key = localDateKey(day)
                  return <span className={`${day.getMonth() !== today.getMonth() ? 'outside' : ''} ${key === todayKey ? 'today' : ''}`} key={key}>{day.getDate()}</span>
                })}
              </div>
            </div>

            <section className="home-hub-section">
              <header><span><i className="hub-dot schedule" />개인·업무 일정</span><b>{schedules.length}</b></header>
              <div className="home-hub-list">
                {schedules.slice(0, 4).map((schedule) => (
                  <button key={schedule.id} onClick={() => onNavigate('일정')} type="button">
                    <time>{schedule.isAllDay ? '종일' : formatTime(schedule.startsAt)}</time>
                    <span><strong>{schedule.title}</strong><small>{schedule.isAllDay ? schedule.type : `${formatTime(schedule.startsAt)}–${formatTime(schedule.endsAt)} · ${schedule.type}`}</small></span>
                    <ChevronRight size={14} />
                  </button>
                ))}
                {!schedules.length && <div className="home-hub-empty"><CalendarClock size={20} /><span>오늘 등록된 일정이 없습니다.</span></div>}
              </div>
            </section>

            <section className="home-hub-section reservation-section">
              <header><span><i className="hub-dot reservation" />예약 환자</span><b>{reservations.length}</b></header>
              <div className="home-hub-list">
                {reservations.slice(0, 4).map((reservation) => (
                  <button key={reservation.id} onClick={() => reservation.patientId && onOpenPatient(reservation.patientId)} type="button">
                    <time>{formatTime(reservation.reservedAt)}</time>
                    <span><strong>{reservation.applicantName}</strong><small>{reservation.status}</small></span>
                    <ChevronRight size={14} />
                  </button>
                ))}
                {!reservations.length && <div className="home-hub-empty"><CalendarClock size={20} /><span>오늘 예약 환자가 없습니다.</span></div>}
              </div>
            </section>
          </div>
        </section>

        <section className="feature-card home-panel home-primary-todo">
          <PanelHeader icon={CheckCircle2} title="오늘 To-do" count={pendingTodayTodos.length} onClick={() => window.dispatchEvent(new CustomEvent('angiocad:open-todos'))} />
          <div className="home-todo-checklist">
            {todayTodos.slice(0, 7).map((todo) => (
              <article className={isTodoDone(todo) ? 'completed' : ''} key={todo.id}>
                <button className="home-todo-check" onClick={() => void toggleTodo(todo)} aria-label={isTodoDone(todo) ? '완료 취소' : '완료 처리'} type="button"><i /></button>
                <span><strong>{todo.title}</strong><small>{todo.dueAt ? formatShortDate(todo.dueAt) : '오늘'}</small></span>
                <em className={`todo-priority ${todo.priority.toLowerCase()}`} title={`우선순위 ${todo.priority}`} />
              </article>
            ))}
            {!todayTodos.length && <EmptyRow text="오늘 To-do가 없습니다." />}
          </div>
        </section>
        </div>

        <div className="home-dashboard-grid">
          <div className="home-dashboard-column">
            <section className="feature-card home-panel">
              <PanelHeader icon={FlaskConical} title="검사 진행 현황" onClick={() => onNavigate('검사·영상')} />
              <div className="home-status-bars">
                {([
                  ['예정', examinationStats.scheduled, 'scheduled'],
                  ['진행', examinationStats.inProgress, 'running'],
                  ['완료', examinationStats.completed, 'complete'],
                ] as const).map(([label, count, status]) => (
                  <div key={label}><span>{label}</span><i><b className={status} style={{ width: `${examinationTotal ? Math.max(5, count / examinationTotal * 100) : 0}%` }} /></i><strong>{count}</strong></div>
                ))}
              </div>
            </section>

            <section className="feature-card home-panel">
              <PanelHeader icon={BrainCircuit} title="AI 분석 현황" count={aiTotal} onClick={() => onNavigate('AI 분석')} />
              <div className="home-ai-grid">
                <span><i className="queued" /><small>대기</small><strong>{aiStatus?.queued ?? 0}</strong></span>
                <span><i className="running" /><small>진행</small><strong>{aiStatus?.running ?? 0}</strong></span>
                <span><i className="complete" /><small>완료</small><strong>{aiStatus?.completed ?? 0}</strong></span>
                <span className={(aiStatus?.failed ?? 0) > 0 ? 'danger' : ''}><i className="failed" /><small>실패</small><strong>{aiStatus?.failed ?? 0}</strong></span>
              </div>
            </section>
          </div>

          <div className="home-dashboard-column">
            <section className="feature-card home-panel home-review-panel">
              <PanelHeader icon={ClipboardCheck} title="검토 대기" count={aiReviewItems.length + cdssReviewItems.length + highRiskPatients.length} />
              <div className="home-review-summary">
                <button type="button" onClick={() => onNavigate('AI 분석')}><BrainCircuit size={16} /><span>AI 결과 검토</span><strong>{aiReviewItems.length}</strong></button>
                <button type="button" onClick={() => onNavigate('워크스테이션')}><ShieldAlert size={16} /><span>CDSS 검토</span><strong>{cdssReviewItems.length}</strong></button>
                <button type="button" onClick={() => onNavigate('워크스테이션')}><AlertTriangle size={16} /><span>고위험 환자</span><strong>{highRiskPatients.length}</strong></button>
              </div>
              <div className="home-list compact">
                {highRiskPatients.slice(0, 3).map((patient) => (
                  <button key={patient.id} type="button" onClick={() => patient.backendId && onOpenPatient(patient.backendId)}>
                    <i className="risk-dot high" /><span><strong>{patient.name}</strong><small>{patient.id} · {patient.exam}</small></span><b className="danger-label">고위험</b>
                  </button>
                ))}
                {!highRiskPatients.length && !aiReviewItems.length && !cdssReviewItems.length && <EmptyRow text="현재 검토 대기 항목이 없습니다." />}
              </div>
            </section>

            <section className="feature-card home-panel">
              <PanelHeader icon={Stethoscope} title="받은 협진" count={receivedConsultations.length} onClick={() => onNavigate('협진')} />
              <div className="home-list compact">
                {receivedConsultations.slice(0, 4).map((item) => (
                  <button key={item.id} type="button" onClick={() => onNavigate('협진')}>
                    <i className={item.priority === 'URGENT' ? 'risk-dot high' : 'risk-dot normal'} /><span><strong>{item.subject}</strong><small>{item.patientName} · 의견 {item.opinionCount}건</small></span><b>{item.hasResponse ? item.status : '의견 필요'}</b>
                  </button>
                ))}
                {!receivedConsultations.length && <EmptyRow text="받은 협진 요청이 없습니다." />}
              </div>
            </section>
          </div>

          <div className="home-dashboard-column">
            <section className="feature-card home-panel">
              <PanelHeader icon={Megaphone} title="공지사항" count={noticeItems.length} />
              <div className="home-list compact home-notice-list">
                {noticeItems.slice(0, 4).map((notice) => (
                  <div key={notice.recipientId}><Megaphone size={14} /><span><strong>{notice.title}</strong><small>{notice.body || formatShortDate(notice.createdAt)}</small></span><b>{notice.isRead ? '' : 'NEW'}</b></div>
                ))}
                {!noticeItems.length && <EmptyRow text="등록된 공지사항이 없습니다." />}
              </div>
            </section>

            <section className="feature-card home-panel">
              <PanelHeader icon={UserRoundSearch} title="최근 본 환자" count={recentPatients.length} />
              <div className="home-list compact">
                {recentPatients.slice(0, 5).map((patient) => (
                  <button key={patient.patientId} type="button" onClick={() => onOpenPatient(patient.patientId)}>
                    <span className="recent-patient-avatar">{patient.name.slice(0, 1)}</span><span><strong>{patient.name}</strong><small>{patient.medicalRecordNo} · {formatShortDate(patient.lastViewedAt)}</small></span><ChevronRight size={14} />
                  </button>
                ))}
                {!recentPatients.length && <EmptyRow text="최근 조회한 환자가 없습니다." />}
              </div>
            </section>

            {(aiStatus?.failed ?? 0) > 0 && (
              <button className="home-ai-failure" type="button" onClick={() => onNavigate('AI 분석')}>
                <AlertTriangle size={17} /><span><strong>AI 분석 실패 {aiStatus?.failed}건</strong><small>실패 목록과 재실행 대상을 확인하세요.</small></span><ChevronRight size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
