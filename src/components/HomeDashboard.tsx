import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
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
  Plus,
  RefreshCw,
  Stethoscope,
  UserRoundSearch,
  X,
} from 'lucide-react'
import {
  createStaffTodo,
  getDashboardConsultations,
  getDashboardExaminationStats,
  getDashboardRecentPatients,
  getDashboardWorkItems,
  getStaffAnnouncements,
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
  StaffAnnouncement,
  StaffNotification,
  StaffReservation,
  StaffSchedule,
  StaffTodo,
} from '../types'
import {
  HOME_CONSULT_LIMIT,
  HOME_NOTICE_LIMIT,
  HOME_RECENT_LIMIT,
  HOME_TODO_LIMIT,
} from '../appShell'

type HomeDestination = '워크스테이션' | '일정' | '검사·영상' | 'AI 분석' | '협진' | '채팅' | '결과보고서'

interface HomeDashboardProps {
  summary: DashboardSummary | null
  aiStatus: DashboardAIStatus | null
  patients: PatientSummary[]
  doctorId?: number
  roles: string[]
  clinicianName?: string
  loadEnabled?: boolean
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

function formatRecentStamp(value: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${month}.${day} ${hour}:${minute}`
}

function formatNoticeDate(value: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`
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

function StatusPips({ tones }: { tones: Array<{ key: string; on: boolean; tone: string }> }) {
  return (
    <span className="home-status-pips" aria-hidden="true">
      {tones.map((item) => (
        <i className={`${item.tone}${item.on ? ' on' : ''}`} key={item.key} />
      ))}
    </span>
  )
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
  loadEnabled = true,
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
  const [announcements, setAnnouncements] = useState<StaffAnnouncement[]>([])
  const [noticeError, setNoticeError] = useState(false)
  const [noticeView, setNoticeView] = useState<'list' | StaffAnnouncement | null>(null)
  const [todoComposerOpen, setTodoComposerOpen] = useState(false)
  const [todoTitle, setTodoTitle] = useState('')
  const [todoDueDate, setTodoDueDate] = useState(() => localDateKey())
  const [todoSaving, setTodoSaving] = useState(false)
  const [todoFormError, setTodoFormError] = useState('')
  const [loading, setLoading] = useState(true)
  const [errorCount, setErrorCount] = useState(0)
  const roleKey = roles.map((role) => role.toUpperCase()).sort().join(',')

  const dashboardLoadId = useRef(0)
  const loadDashboard = useCallback(async () => {
    const loadId = ++dashboardLoadId.current
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
      getStaffAnnouncements(),
    ])

    if (dashboardLoadId.current !== loadId) return

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
    setAnnouncements(value(8, [] as StaffAnnouncement[]))
    setNoticeError(results[8].status === 'rejected')
    setErrorCount(results.filter((result, index) => result.status === 'rejected' && index !== 8).length)
    setLoading(false)
  }, [doctorId, roleKey])

  useEffect(() => {
    if (!loadEnabled) return
    void loadDashboard()
    return () => { dashboardLoadId.current += 1 }
  }, [loadDashboard, loadEnabled])

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
  const noticeItems = announcements.slice(0, HOME_NOTICE_LIMIT)
  const visibleTodos = todayTodos.slice(0, HOME_TODO_LIMIT)
  const visibleRecent = recentPatients.slice(0, HOME_RECENT_LIMIT)
  const visibleConsults = receivedConsultations.slice(0, HOME_CONSULT_LIMIT)
  const toggleTodo = async (todo: StaffTodo) => {
    try {
      const updated = await updateStaffTodo(todo.id, {
        status: isTodoDone(todo) ? 'TODO' : 'DONE',
      })
      setTodos((current) => current.map((item) => item.id === updated.id ? updated : item))
      window.dispatchEvent(new CustomEvent('angiocad:todos-changed'))
    } catch {
      setTodoFormError('To-do 상태를 변경하지 못했습니다.')
    }
  }
  const submitTodo = async (event: FormEvent) => {
    event.preventDefault()
    if (!todoTitle.trim() || todoSaving) return
    setTodoSaving(true)
    setTodoFormError('')
    try {
      const created = await createStaffTodo({
        title: todoTitle.trim(),
        dueAt: todoDueDate ? new Date(`${todoDueDate}T18:00:00`).toISOString() : null,
      })
      setTodos((current) => [created, ...current])
      setTodoTitle('')
      setTodoComposerOpen(false)
      window.dispatchEvent(new CustomEvent('angiocad:todos-changed'))
    } catch {
      setTodoFormError('To-do를 등록하지 못했습니다.')
    } finally {
      setTodoSaving(false)
    }
  }

  return (
    <section className="feature-page home-dashboard-page">
      <div className="home-dashboard-content">
        {errorCount > 0 && (
          <div className="home-partial-error"><AlertTriangle size={13} /> 일부 정보를 불러오지 못했습니다.
            <button type="button" onClick={() => void loadDashboard()} disabled={loading}>
              {loading ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />}
              새로고침
            </button>
          </div>
        )}

        <section className="home-metric-grid">
          <button type="button" onClick={() => onNavigate('일정')}><CalendarClock /><span>오늘 예약</span><strong>{reservations.length}</strong></button>
          <button type="button" onClick={() => onNavigate('검사·영상')}><FlaskConical /><span>검사 진행</span><strong>{summary?.examinationPendingCount ?? examinationStats.inProgress}</strong></button>
          <button type="button" onClick={() => onNavigate('워크스테이션')}><BrainCircuit /><span>AI 대기·진행</span><strong>{(aiStatus?.queued ?? 0) + (aiStatus?.running ?? 0)}</strong></button>
          <button type="button" onClick={() => onNavigate('협진')}><Stethoscope /><span>처리 대기 협진</span><strong>{actionableConsultations.length}</strong></button>
          <button type="button" onClick={() => onNavigate('결과보고서')}><FileSignature /><span>승인 대기</span><strong>{summary?.signoffPendingCount ?? 0}</strong></button>
          <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('angiocad:open-notifications'))}><Bell /><span>주요 알림</span><strong>{importantNotifications.length}</strong></button>
        </section>

        <div className="home-ops-grid">
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
                  {schedules.slice(0, 3).map((schedule) => (
                    <button key={schedule.id} onClick={() => onNavigate('일정')} type="button">
                      <time>{schedule.isAllDay ? '종일' : formatTime(schedule.startsAt)}</time>
                      <span><strong>{schedule.title}</strong><small>{schedule.isAllDay ? schedule.type : `${formatTime(schedule.startsAt)}–${formatTime(schedule.endsAt)} · ${schedule.type}`}</small></span>
                    </button>
                  ))}
                  {!schedules.length && <div className="home-hub-empty"><span>오늘 등록된 일정이 없습니다.</span></div>}
                </div>
              </section>
              <section className="home-hub-section reservation-section">
                <header><span><i className="hub-dot reservation" />예약 환자</span><b>{reservations.length}</b></header>
                <div className="home-hub-list">
                  {reservations.slice(0, 3).map((reservation) => (
                    <button key={reservation.id} onClick={() => reservation.patientId && onOpenPatient(reservation.patientId)} type="button">
                      <time>{formatTime(reservation.reservedAt)}</time>
                      <span><strong>{reservation.applicantName}</strong><small>{reservation.status}</small></span>
                    </button>
                  ))}
                  {!reservations.length && <div className="home-hub-empty"><span>오늘 예약 환자가 없습니다.</span></div>}
                </div>
              </section>
            </div>
          </section>

          <section className="feature-card home-panel home-recent-card">
            <header className="home-panel-header">
              <span><UserRoundSearch size={16} strokeWidth={1.8} /><strong>최근 본 환자</strong></span>
              <button type="button" onClick={() => onNavigate('워크스테이션')}>전체보기 <ChevronRight size={15} /></button>
            </header>
            <div className="home-list compact home-recent-list">
              {visibleRecent.map((patient) => (
                <button key={patient.patientId} type="button" onClick={() => onOpenPatient(patient.patientId)}>
                  <span><strong>{patient.name}</strong><small>{patient.medicalRecordNo}</small></span>
                  <time>{formatRecentStamp(patient.lastViewedAt)}</time>
                  <ChevronRight size={14} />
                </button>
              ))}
              {!visibleRecent.length && <EmptyRow text="최근 조회한 환자가 없습니다." />}
            </div>
          </section>

          <section className="feature-card home-panel home-primary-todo">
            <header className="home-panel-header">
              <span><CheckCircle2 size={16} strokeWidth={1.8} /><strong>오늘 To-do</strong></span>
              <div className="home-panel-header-actions">
                {pendingTodayTodos.length > 0 && <b>{pendingTodayTodos.length}</b>}
                <button className="home-todo-add" type="button" onClick={() => { setTodoComposerOpen((open) => !open); setTodoFormError('') }} aria-expanded={todoComposerOpen} aria-label="To-do 추가">
                  <Plus size={14} strokeWidth={2} /> 추가
                </button>
              </div>
            </header>
            {todoComposerOpen && (
              <form className="home-todo-form" onSubmit={(event) => void submitTodo(event)}>
                <input value={todoTitle} onChange={(event) => setTodoTitle(event.target.value)} maxLength={150} placeholder="할 일을 입력하세요" aria-label="새 To-do 제목" />
                <input type="date" value={todoDueDate} onChange={(event) => setTodoDueDate(event.target.value)} aria-label="마감일" />
                <button disabled={!todoTitle.trim() || todoSaving} type="submit">{todoSaving ? <LoaderCircle className="spin" size={14} /> : '생성'}</button>
                <button type="button" onClick={() => { setTodoComposerOpen(false); setTodoFormError('') }}>취소</button>
              </form>
            )}
            {todoFormError && <div className="home-todo-form-error">{todoFormError}</div>}
            <div className="home-todo-checklist">
              {visibleTodos.map((todo) => (
                <article className={isTodoDone(todo) ? 'completed' : ''} key={todo.id}>
                  <button className="home-todo-check" onClick={() => void toggleTodo(todo)} aria-label={isTodoDone(todo) ? '완료 취소' : '완료 처리'} type="button"><i /></button>
                  <span><strong>{todo.title}</strong><small>{todo.dueAt ? formatShortDate(todo.dueAt) : '오늘'}</small></span>
                </article>
              ))}
              {!todayTodos.length && <EmptyRow text="오늘 To-do가 없습니다." />}
            </div>
          </section>
        </div>

        <div className="home-info-grid">
          <section className="feature-card home-panel">
            <header className="home-panel-header">
              <span><Megaphone size={16} strokeWidth={1.8} /><strong>공지사항</strong></span>
              <button type="button" onClick={() => setNoticeView('list')} disabled={!announcements.length}>
                {announcements.length > 0 && <b>{announcements.length}</b>}
                {announcements.length > 0 && <span>전체보기</span>}
                {announcements.length > 0 && <ChevronRight size={15} strokeWidth={1.8} />}
              </button>
            </header>
            <div className="home-list compact home-notice-list">
              {noticeError && <EmptyRow text="공지사항을 불러오지 못했습니다." />}
              {!noticeError && noticeItems.map((notice) => (
                <button key={notice.id} type="button" onClick={() => setNoticeView(notice)}>
                  {notice.priority.toUpperCase() === 'IMPORTANT' && <b>중요</b>}
                  <span>
                    <strong>{notice.title}</strong>
                  </span>
                  <time>{formatNoticeDate(notice.publishedAt)}</time>
                </button>
              ))}
              {!noticeError && !noticeItems.length && <EmptyRow text="등록된 공지사항이 없습니다." />}
            </div>
          </section>

          <section className="feature-card home-panel">
            <PanelHeader icon={Stethoscope} title="받은 협진" count={receivedConsultations.length} onClick={() => onNavigate('협진')} />
            <div className="home-list compact">
              {visibleConsults.map((item) => (
                <button key={item.id} type="button" onClick={() => onNavigate('협진')}>
                  <i className={item.priority === 'URGENT' ? 'risk-dot high' : 'risk-dot normal'} />
                  <span>
                    <strong>{item.subject}</strong>
                    <small>{item.patientName}</small>
                  </span>
                  <b>{item.hasResponse ? item.status : '의견 필요'}</b>
                </button>
              ))}
              {!visibleConsults.length && <EmptyRow text="받은 협진 요청이 없습니다." />}
            </div>
          </section>
        </div>

        <section className="feature-card home-panel home-status-card">
          <header className="home-panel-header"><span><ClipboardCheck size={16} strokeWidth={1.8} /><strong>업무 현황</strong></span></header>
          <div className="home-status-compact">
            <button className="home-status-segment" type="button" onClick={() => onNavigate('검사·영상')}>
              <strong>검사 진행</strong>
              <dl>
                <div><dt>예정</dt><dd className="is-queued">{examinationStats.scheduled}</dd></div>
                <div><dt>진행</dt><dd className="is-running">{examinationStats.inProgress}</dd></div>
                <div><dt>완료</dt><dd className="is-done">{examinationStats.completed}</dd></div>
              </dl>
              <StatusPips tones={[
                { key: 'exam-queued', on: examinationStats.scheduled > 0, tone: 'queued' },
                { key: 'exam-running', on: examinationStats.inProgress > 0, tone: 'running' },
                { key: 'exam-done', on: examinationStats.completed > 0, tone: 'done' },
              ]} />
            </button>
            <button className="home-status-segment" type="button" onClick={() => onNavigate('워크스테이션')}>
              <strong>AI 분석</strong>
              <dl>
                <div><dt>대기</dt><dd className="is-queued">{aiStatus?.queued ?? 0}</dd></div>
                <div><dt>진행</dt><dd className="is-running">{aiStatus?.running ?? 0}</dd></div>
                <div><dt>완료</dt><dd className="is-done">{aiStatus?.completed ?? 0}</dd></div>
                <div><dt>실패</dt><dd className={(aiStatus?.failed ?? 0) > 0 ? 'is-fail' : 'is-muted'}>{aiStatus?.failed ?? 0}</dd></div>
              </dl>
              <StatusPips tones={[
                { key: 'ai-queued', on: (aiStatus?.queued ?? 0) > 0, tone: 'queued' },
                { key: 'ai-running', on: (aiStatus?.running ?? 0) > 0, tone: 'running' },
                { key: 'ai-done', on: (aiStatus?.completed ?? 0) > 0, tone: 'done' },
                { key: 'ai-fail', on: (aiStatus?.failed ?? 0) > 0, tone: 'fail' },
              ]} />
            </button>
            <button className="home-status-segment" type="button" onClick={() => onNavigate('결과보고서')}>
              <strong>검토 대기</strong>
              {aiReviewItems.length + cdssReviewItems.length + highRiskPatients.length === 0 ? (
                <p className="home-status-empty">현재 검토 대기 없음</p>
              ) : (
                <dl>
                  <div><dt>AI 결과</dt><dd className="is-queued">{aiReviewItems.length}</dd></div>
                  <div><dt>CDSS</dt><dd className="is-queued">{cdssReviewItems.length}</dd></div>
                  <div><dt>고위험</dt><dd className={highRiskPatients.length > 0 ? 'is-fail' : 'is-muted'}>{highRiskPatients.length}</dd></div>
                </dl>
              )}
              <StatusPips tones={[
                { key: 'review-ai', on: aiReviewItems.length > 0, tone: 'queued' },
                { key: 'review-cdss', on: cdssReviewItems.length > 0, tone: 'queued' },
                { key: 'review-risk', on: highRiskPatients.length > 0, tone: 'fail' },
              ]} />
            </button>
          </div>
        </section>
      </div>

      {noticeView && (
        <div className="home-notice-modal" role="dialog" aria-modal="true" aria-label={noticeView === 'list' ? '공지사항 목록' : noticeView.title}>
          <div className="home-notice-dialog">
            <header>
              <strong>{noticeView === 'list' ? '공지사항' : noticeView.title}</strong>
              <button type="button" onClick={() => setNoticeView(noticeView === 'list' ? null : 'list')} aria-label="닫기"><X size={16} /></button>
            </header>
            {noticeView === 'list' ? (
              <div className="home-notice-modal-list">
                {announcements.map((notice) => (
                  <button key={notice.id} type="button" onClick={() => setNoticeView(notice)}>
                    <span>
                      <strong>{notice.title}</strong>
                      <small>{formatShortDate(notice.publishedAt)}{notice.author ? ` · ${notice.author}` : ''}</small>
                    </span>
                    {notice.priority.toUpperCase() === 'IMPORTANT' && <b>중요</b>}
                  </button>
                ))}
                {!announcements.length && <EmptyRow text="등록된 공지사항이 없습니다." />}
              </div>
            ) : (
              <div className="home-notice-modal-body">
                <small>{formatShortDate(noticeView.publishedAt)}{noticeView.author ? ` · ${noticeView.author}` : ''}{noticeView.categoryLabel ? ` · ${noticeView.categoryLabel}` : ''}</small>
                {noticeView.priority.toUpperCase() === 'IMPORTANT' && <b>중요</b>}
                <p>{noticeView.body || '본문이 없습니다.'}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
