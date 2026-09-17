import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type WheelEvent } from 'react'
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import {
  ApiError,
  approveScheduleChangeRequest,
  cancelScheduleChangeRequest,
  createScheduleChangeRequest,
  createStaffSchedule,
  deleteStaffSchedule,
  getAdminOnCallSchedules,
  getAdminPendingScheduleRequests,
  getScheduleChangeRequests,
  getStaffSchedules,
  rejectScheduleChangeRequest,
  updateStaffSchedule,
} from '../api/client'
import type {
  ScheduleChangeRequest,
  StaffSchedule,
  StaffScheduleInput,
  StaffScheduleType,
} from '../types'

type ScheduleTab = '내 스케줄' | '근무상황부' | '당직 현황' | '승인 관리'
type CalendarView = '일' | '주' | '월'
type LeaveType = 'ANNUAL' | 'HALF_DAY' | 'HOURLY' | 'SICK' | 'OFFICIAL' | 'BUSINESS_TRIP' | 'TRAINING'
type HalfDayPeriod = 'AM' | 'PM'

const leaveOptions: Array<{ type: LeaveType; label: string }> = [
  { type: 'ANNUAL', label: '연차' },
  { type: 'HALF_DAY', label: '반차' },
  { type: 'HOURLY', label: '시간차' },
  { type: 'SICK', label: '병가' },
  { type: 'OFFICIAL', label: '공가' },
  { type: 'BUSINESS_TRIP', label: '출장' },
  { type: 'TRAINING', label: '교육' },
]

const scheduleLabels: Record<StaffScheduleType, string> = {
  PERSONAL: '개인 일정',
  CLINICAL: '진료',
  CONSULTATION: '협진',
  ON_CALL: '당직',
  OFF: '휴무',
}

const weekdayLabels = ['일', '월', '화', '수', '목', '금', '토']

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function dateTimeInputValue(value: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(0, 16)
  return `${dateKey(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatTime(value: string) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit' }).format(date)
}

function formatDateTime(value: string) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(date)
}

function formatDate(value: string) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(0, 10)
  return new Intl.DateTimeFormat('ko-KR', { month: '2-digit', day: '2-digit' }).format(date)
}

function inputTime(value: string, fallback: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? fallback : `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function localDateTimeIso(day: string, time: string) {
  return new Date(`${day}T${time}:00`).toISOString()
}

function addHours(time: string, hours: number) {
  const [hour, minute] = time.split(':').map(Number)
  const date = new Date(2000, 0, 1, hour, minute)
  date.setHours(date.getHours() + hours)
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function leaveTypeFromReason(reason: string) {
  return leaveOptions.find((option) => reason.trim().startsWith(option.label))?.label ?? '일정 변경'
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    PENDING: '승인 대기',
    APPROVED: '승인 완료',
    REJECTED: '반려',
    CANCELED: '철회',
  }
  return labels[status.toUpperCase()] ?? status
}

function monthRange(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0)
  return { from: dateKey(first), to: dateKey(last) }
}

function calendarRange(anchor: Date, view: CalendarView) {
  if (view === '월') return monthRange(anchor)

  const from = new Date(anchor)
  const to = new Date(anchor)
  if (view === '주') {
    from.setDate(anchor.getDate() - anchor.getDay())
    to.setDate(from.getDate() + 6)
  }
  return { from: dateKey(from), to: dateKey(to) }
}

function buildWeekDays(anchor: Date) {
  const start = new Date(anchor)
  start.setDate(anchor.getDate() - anchor.getDay())
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start)
    day.setDate(start.getDate() + index)
    return day
  })
}

function buildCalendarDays(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const start = new Date(first)
  start.setDate(first.getDate() - first.getDay())
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start)
    day.setDate(start.getDate() + index)
    return day
  })
}

function createInitialForm(date: Date): StaffScheduleInput {
  const day = dateKey(date)
  return {
    title: '',
    type: 'PERSONAL',
    startsAt: `${day}T09:00`,
    endsAt: `${day}T10:00`,
    description: '',
    isAllDay: false,
    color: '#7c6ee6',
  }
}

export function ScheduleWorkspace() {
  const [tab, setTab] = useState<ScheduleTab>('내 스케줄')
  const [calendarView, setCalendarView] = useState<CalendarView>('월')
  const [scheduleSearch, setScheduleSearch] = useState('')
  const [month, setMonth] = useState(() => new Date())
  const [selectedDate, setSelectedDate] = useState(() => new Date())
  const [schedules, setSchedules] = useState<StaffSchedule[]>([])
  const [requests, setRequests] = useState<ScheduleChangeRequest[]>([])
  const [adminRequests, setAdminRequests] = useState<ScheduleChangeRequest[]>([])
  const [onCallSchedules, setOnCallSchedules] = useState<StaffSchedule[]>([])
  const [hasAdminAccess, setHasAdminAccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<StaffSchedule | null>(null)
  const [scheduleForm, setScheduleForm] = useState<StaffScheduleInput>(() => createInitialForm(new Date()))
  const [requestTargetId, setRequestTargetId] = useState<number | null>(null)
  const [leaveType, setLeaveType] = useState<LeaveType>('ANNUAL')
  const [leaveDate, setLeaveDate] = useState(() => dateKey(new Date()))
  const [leaveEndDate, setLeaveEndDate] = useState(() => dateKey(new Date()))
  const [halfDayPeriod, setHalfDayPeriod] = useState<HalfDayPeriod>('AM')
  const [hourStart, setHourStart] = useState('14:00')
  const [hourEnd, setHourEnd] = useState('16:00')
  const [officialType, setOfficialType] = useState('예비군·민방위')
  const [leaveMemo, setLeaveMemo] = useState('')
  const [requestSuccess, setRequestSuccess] = useState('')
  const [saving, setSaving] = useState(false)
  const lastWheelNavigationAt = useRef(0)

  const range = useMemo(() => calendarRange(month, calendarView), [month, calendarView])
  const onCallRange = useMemo(() => monthRange(month), [month])
  const calendarDays = useMemo(() => buildCalendarDays(month), [month])
  const weekDays = useMemo(() => buildWeekDays(selectedDate), [selectedDate])

  const loadSchedules = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await getStaffSchedules(range.from, range.to)
      setSchedules(result)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '일정을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [range.from, range.to])

  useEffect(() => { void loadSchedules() }, [loadSchedules])

  useEffect(() => {
    let active = true
    void getAdminPendingScheduleRequests()
      .then((items) => {
        if (!active) return
        setAdminRequests(items)
        setHasAdminAccess(true)
      })
      .catch(() => {
        if (active) setHasAdminAccess(false)
      })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (tab === '근무상황부' || tab === '승인 관리') {
      void Promise.all([
        getScheduleChangeRequests().then(setRequests),
        getAdminPendingScheduleRequests()
          .then((items) => { setAdminRequests(items); setHasAdminAccess(true) })
          .catch((loadError) => {
            if (!(loadError instanceof ApiError && loadError.status === 403)) {
              setError(loadError instanceof Error ? loadError.message : '승인 대기 목록을 불러오지 못했습니다.')
            }
            setHasAdminAccess(false)
          }),
      ]).catch((loadError) => setError(loadError instanceof Error ? loadError.message : '신청 내역을 불러오지 못했습니다.'))
    }
    if (tab === '당직 현황') {
      void getAdminOnCallSchedules(onCallRange.from, onCallRange.to)
        .then((items) => { setOnCallSchedules(items); setHasAdminAccess(true) })
        .catch((loadError) => {
          setOnCallSchedules([])
          if (!(loadError instanceof ApiError && loadError.status === 403)) {
            setError(loadError instanceof Error ? loadError.message : '당직표를 불러오지 못했습니다.')
          }
        })
    }
  }, [tab, range.from, range.to, onCallRange.from, onCallRange.to])

  const schedulesByDate = useMemo(() => {
    const map = new Map<string, StaffSchedule[]>()
    schedules.forEach((schedule) => {
      const key = dateKey(new Date(schedule.startsAt))
      map.set(key, [...(map.get(key) ?? []), schedule])
    })
    return map
  }, [schedules])

  const normalizedSearch = scheduleSearch.trim().toLowerCase()
  const matchesSearch = useCallback((schedule: StaffSchedule) => (
    !normalizedSearch ||
    `${schedule.title} ${schedule.description} ${scheduleLabels[schedule.type]}`
      .toLowerCase()
      .includes(normalizedSearch)
  ), [normalizedSearch])
  const selectedSchedules = (schedulesByDate.get(dateKey(selectedDate)) ?? []).filter(matchesSearch)

  const leaveDateSchedules = useMemo(() => (
    schedules.filter((schedule) => (
      schedule.type === 'CLINICAL' &&
      schedule.status !== 'CANCELED' &&
      dateKey(new Date(schedule.startsAt)) === leaveDate
    ))
  ), [leaveDate, schedules])

  const selectedLeaveSchedule = leaveDateSchedules.find((schedule) => schedule.id === requestTargetId)
    ?? leaveDateSchedules[0]

  useEffect(() => {
    if (!leaveDateSchedules.length) {
      setRequestTargetId(null)
      return
    }
    if (!leaveDateSchedules.some((schedule) => schedule.id === requestTargetId)) {
      setRequestTargetId(leaveDateSchedules[0].id)
    }
  }, [leaveDateSchedules, requestTargetId])

  const onCallSchedulesByDate = useMemo(() => {
    const map = new Map<string, StaffSchedule[]>()
    onCallSchedules.forEach((schedule) => {
      const key = dateKey(new Date(schedule.startsAt))
      map.set(key, [...(map.get(key) ?? []), schedule])
    })
    return map
  }, [onCallSchedules])

  const selectedOnCallSchedules =
    onCallSchedulesByDate.get(dateKey(selectedDate)) ?? []

  const moveOnCallMonth = (offset: number) => {
    const nextMonth = new Date(
      month.getFullYear(),
      month.getMonth() + offset,
      1,
    )
    setMonth(nextMonth)
    setSelectedDate(nextMonth)
  }

  const moveCalendarPeriod = useCallback((offset: number) => {
    const next = new Date(selectedDate)
    if (calendarView === '월') next.setMonth(next.getMonth() + offset, 1)
    else next.setDate(next.getDate() + offset * (calendarView === '주' ? 7 : 1))
    setMonth(next)
    setSelectedDate(next)
  }, [calendarView, selectedDate])

  const moveMiniCalendarMonth = (offset: number) => {
    const next = new Date(month.getFullYear(), month.getMonth() + offset, 1)
    setMonth(next)
    if (calendarView === '월') setSelectedDate(next)
  }

  const handleCalendarWheel = (event: WheelEvent<HTMLElement>) => {
    if (Math.abs(event.deltaY) < 24) return
    const now = Date.now()
    if (now - lastWheelNavigationAt.current < 450) return
    lastWheelNavigationAt.current = now
    moveCalendarPeriod(event.deltaY > 0 ? 1 : -1)
  }

  const selectCalendarDate = (day: Date) => {
    setSelectedDate(day)
    setMonth(day)
  }

  const calendarTitle = calendarView === '월'
    ? `${month.getFullYear()}년 ${month.getMonth() + 1}월`
    : calendarView === '주'
      ? `${weekDays[0].getMonth() + 1}월 ${weekDays[0].getDate()}일 – ${weekDays[6].getMonth() + 1}월 ${weekDays[6].getDate()}일`
      : `${selectedDate.getFullYear()}년 ${selectedDate.getMonth() + 1}월 ${selectedDate.getDate()}일`

  const openNewSchedule = () => {
    setEditingSchedule(null)
    setScheduleForm(createInitialForm(selectedDate))
    setFormOpen(true)
  }

  const openEditSchedule = (schedule: StaffSchedule) => {
    setEditingSchedule(schedule)
    setScheduleForm({
      title: schedule.title,
      type: schedule.type,
      startsAt: dateTimeInputValue(schedule.startsAt),
      endsAt: dateTimeInputValue(schedule.endsAt),
      description: schedule.description,
      isAllDay: schedule.isAllDay,
      color: schedule.color,
    })
    setFormOpen(true)
  }

  const submitSchedule = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const payload = {
        ...scheduleForm,
        startsAt: new Date(scheduleForm.startsAt).toISOString(),
        endsAt: new Date(scheduleForm.endsAt).toISOString(),
      }
      if (editingSchedule) await updateStaffSchedule(editingSchedule.id, payload)
      else await createStaffSchedule(payload)
      setFormOpen(false)
      await loadSchedules()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '일정을 저장하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const removeSchedule = async (schedule: StaffSchedule) => {
    if (!window.confirm(`“${schedule.title}” 일정을 삭제할까요?`)) return
    try {
      await deleteStaffSchedule(schedule.id)
      await loadSchedules()
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : '일정을 삭제하지 못했습니다.')
    }
  }

  const submitOffRequest = async (event: FormEvent) => {
    event.preventDefault()
    if (!selectedLeaveSchedule) return

    const scheduleStart = inputTime(selectedLeaveSchedule.startsAt, '09:00')
    const scheduleEnd = inputTime(selectedLeaveSchedule.endsAt, '18:00')
    let requestedStartsAt = localDateTimeIso(leaveDate, scheduleStart)
    let requestedEndsAt = localDateTimeIso(leaveDate, scheduleEnd)
    let requestDetail = leaveOptions.find((option) => option.type === leaveType)?.label ?? '휴무'

    if (leaveType === 'HALF_DAY') {
      const isMorning = halfDayPeriod === 'AM'
      requestedStartsAt = localDateTimeIso(leaveDate, isMorning ? '09:00' : '14:00')
      requestedEndsAt = localDateTimeIso(leaveDate, isMorning ? '13:00' : '18:00')
      requestDetail += ` · ${isMorning ? '오전' : '오후'}`
    }
    if (leaveType === 'HOURLY') {
      requestedStartsAt = localDateTimeIso(leaveDate, hourStart)
      requestedEndsAt = localDateTimeIso(leaveDate, hourEnd)
      requestDetail += ` · ${hourStart}~${hourEnd}`
    }
    if (leaveType === 'SICK') {
      requestedEndsAt = localDateTimeIso(leaveEndDate, scheduleEnd)
      requestDetail += ` · ${leaveDate}~${leaveEndDate}`
    }
    if (leaveType === 'BUSINESS_TRIP' || leaveType === 'TRAINING') {
      requestedEndsAt = localDateTimeIso(leaveEndDate, scheduleEnd)
      requestDetail += ` · ${leaveDate}~${leaveEndDate}`
    }
    if (leaveType === 'OFFICIAL') requestDetail += ` · ${officialType}`
    if (leaveMemo.trim()) requestDetail += ` · ${leaveMemo.trim()}`

    setSaving(true)
    setError('')
    setRequestSuccess('')
    try {
      await createScheduleChangeRequest(selectedLeaveSchedule.id, {
        requestType: 'UPDATE',
        requestedScheduleType: 'OFF',
        requestedStartsAt,
        requestedEndsAt,
        reason: requestDetail,
      })
      setLeaveMemo('')
      setRequestSuccess(`${requestDetail.split(' · ')[0]} 신청이 접수되었습니다.`)
      setRequests(await getScheduleChangeRequests())
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '휴무 신청을 등록하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const cancelRequest = async (item: ScheduleChangeRequest) => {
    try {
      await cancelScheduleChangeRequest(item.id)
      setRequests(await getScheduleChangeRequests())
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '신청을 철회하지 못했습니다.')
    }
  }

  const reviewRequest = async (item: ScheduleChangeRequest, approve: boolean) => {
    const reason = approve ? '' : window.prompt('반려 사유를 입력하세요.')
    if (!approve && !reason?.trim()) return
    try {
      if (approve) await approveScheduleChangeRequest(item.id)
      else await rejectScheduleChangeRequest(item.id, reason!.trim())
      setAdminRequests(await getAdminPendingScheduleRequests())
      await loadSchedules()
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : '신청 상태를 변경하지 못했습니다.')
    }
  }

  const today = new Date()
  const currentMonthRequestCount = requests.filter((item) => {
    const requestedAt = new Date(item.requestedStartsAt || item.createdAt)
    return requestedAt.getFullYear() === today.getFullYear() && requestedAt.getMonth() === today.getMonth()
  }).length
  const pendingRequestCount = requests.filter((item) => item.status.toUpperCase() === 'PENDING').length
  const hourlyDuration = Math.max(0, (
    new Date(`2000-01-01T${hourEnd}:00`).getTime() - new Date(`2000-01-01T${hourStart}:00`).getTime()
  ) / 3_600_000)
  const leaveFormValid = Boolean(
    selectedLeaveSchedule &&
    (!['BUSINESS_TRIP', 'TRAINING'].includes(leaveType) || leaveMemo.trim()) &&
    (!['SICK', 'BUSINESS_TRIP', 'TRAINING'].includes(leaveType) || leaveEndDate >= leaveDate) &&
    (leaveType !== 'HOURLY' || hourlyDuration > 0),
  )

  const changeLeaveDate = (value: string) => {
    setLeaveDate(value)
    if (leaveEndDate < value) setLeaveEndDate(value)
    const nextDate = new Date(`${value}T12:00:00`)
    if (!Number.isNaN(nextDate.getTime())) {
      setMonth(nextDate)
      setSelectedDate(nextDate)
    }
  }

  return (
    <section className="feature-page schedule-page">
      <header className="feature-header">
        <div><small>CLINICIAN SCHEDULE</small><h1>일정</h1></div>
        <span className="feature-live"><i /> 일정 API 연결됨</span>
      </header>

      <nav className="feature-tabs">
        {([
          '내 스케줄',
          '근무상황부',
          '당직 현황',
          ...(hasAdminAccess ? ['승인 관리' as ScheduleTab] : []),
        ] as ScheduleTab[]).map((item) => (
          <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)} type="button">{item}</button>
        ))}
      </nav>

      {error && <div className="feature-error"><span>{error}</span><button onClick={() => setError('')} type="button"><X size={15} /></button></div>}

      {tab === '내 스케줄' && (
        <div className="schedule-layout schedule-layout-advanced">
          <aside className="feature-card schedule-sidebar-card">
            <button className="schedule-create-button" onClick={openNewSchedule} type="button"><Plus size={17} /> 일정 만들기</button>

            <div className="mini-calendar-toolbar">
              <strong>{month.getFullYear()}년 {month.getMonth() + 1}월</strong>
              <span>
                <button onClick={() => moveMiniCalendarMonth(-1)} type="button" aria-label="이전 달"><ChevronLeft size={15} /></button>
                <button onClick={() => moveMiniCalendarMonth(1)} type="button" aria-label="다음 달"><ChevronRight size={15} /></button>
              </span>
            </div>
            <div className="mini-calendar-weekdays">{weekdayLabels.map((day) => <span key={day}>{day}</span>)}</div>
            <div className="mini-calendar-days">
              {calendarDays.map((day) => {
                const key = dateKey(day)
                return (
                  <button
                    key={key}
                    className={`${day.getMonth() !== month.getMonth() ? 'outside' : ''} ${key === dateKey(selectedDate) ? 'selected' : ''} ${key === dateKey(new Date()) ? 'today' : ''}`}
                    onClick={() => selectCalendarDate(day)}
                    type="button"
                  >{day.getDate()}</button>
                )
              })}
            </div>

            <label className="schedule-search-box">
              <Search size={14} strokeWidth={1.8} />
              <input value={scheduleSearch} onChange={(event) => setScheduleSearch(event.target.value)} placeholder="일정 검색" />
              {scheduleSearch && <button onClick={() => setScheduleSearch('')} type="button" aria-label="검색어 지우기"><X size={13} /></button>}
            </label>

            <div className="schedule-sidebar-legend">
              <strong>내 캘린더</strong>
              {(['CLINICAL', 'CONSULTATION', 'ON_CALL', 'OFF', 'PERSONAL'] as StaffScheduleType[]).map((type) => (
                <span key={type} className={`schedule-type-${type.toLowerCase()}`}><i />{scheduleLabels[type]}</span>
              ))}
            </div>
            <small className="schedule-wheel-help">달력 위에서 휠을 돌려 이전·다음 기간으로 이동</small>
          </aside>

          <section className="feature-card schedule-calendar-card" onWheel={handleCalendarWheel}>
            <header className="calendar-toolbar advanced">
              <div className="calendar-title-navigation">
                <button onClick={() => { const today = new Date(); setMonth(today); setSelectedDate(today) }} type="button">오늘</button>
                <button onClick={() => moveCalendarPeriod(-1)} type="button" aria-label="이전 기간"><ChevronLeft size={17} /></button>
                <button onClick={() => moveCalendarPeriod(1)} type="button" aria-label="다음 기간"><ChevronRight size={17} /></button>
                <h2>{calendarTitle}</h2>
              </div>
              <div className="calendar-view-switch" aria-label="달력 보기 방식">
                {(['일', '주', '월'] as CalendarView[]).map((view) => <button key={view} className={calendarView === view ? 'active' : ''} onClick={() => setCalendarView(view)} type="button">{view}</button>)}
              </div>
            </header>

            {calendarView === '월' && (
              <>
                <div className="calendar-grid calendar-weekdays">{weekdayLabels.map((day) => <span key={day}>{day}</span>)}</div>
                <div className="calendar-grid calendar-days">
                  {calendarDays.map((day) => {
                    const key = dateKey(day)
                    const items = (schedulesByDate.get(key) ?? []).filter(matchesSearch)
                    const isSelected = key === dateKey(selectedDate)
                    const isToday = key === dateKey(new Date())
                    return (
                      <button key={key} className={`calendar-day ${day.getMonth() !== month.getMonth() ? 'outside' : ''} ${isSelected ? 'selected' : ''}`} onClick={() => selectCalendarDate(day)} type="button">
                        <b className={isToday ? 'today' : ''}>{day.getDate()}</b>
                        {items.slice(0, 3).map((schedule) => <span key={schedule.id} className={`schedule-chip schedule-type-${schedule.type.toLowerCase()}`}><i />{schedule.title}</span>)}
                        {items.length > 3 && <small>+{items.length - 3}</small>}
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            {calendarView === '주' && (
              <div className="schedule-week-view">
                {weekDays.map((day) => {
                  const key = dateKey(day)
                  const items = (schedulesByDate.get(key) ?? []).filter(matchesSearch)
                  return (
                    <section key={key} className={key === dateKey(selectedDate) ? 'selected' : ''}>
                      <button onClick={() => selectCalendarDate(day)} type="button"><small>{weekdayLabels[day.getDay()]}</small><b className={key === dateKey(new Date()) ? 'today' : ''}>{day.getDate()}</b></button>
                      <div>{items.map((schedule) => <button key={schedule.id} className={`schedule-week-item schedule-type-${schedule.type.toLowerCase()}`} onClick={() => selectCalendarDate(day)} type="button"><time>{schedule.isAllDay ? '종일' : formatTime(schedule.startsAt)}</time><strong>{schedule.title}</strong></button>)}{!items.length && <span className="week-empty">일정 없음</span>}</div>
                    </section>
                  )
                })}
              </div>
            )}

            {calendarView === '일' && (
              <div className="schedule-day-view">
                <header><span>{weekdayLabels[selectedDate.getDay()]}요일</span><strong>{selectedDate.getDate()}</strong><small>{selectedSchedules.length}개의 일정</small></header>
                <div>
                  {selectedSchedules.map((schedule) => <article key={schedule.id} className={`schedule-day-item schedule-type-${schedule.type.toLowerCase()}`}><time>{schedule.isAllDay ? '종일' : `${formatTime(schedule.startsAt)}–${formatTime(schedule.endsAt)}`}</time><span><strong>{schedule.title}</strong><small>{scheduleLabels[schedule.type]}{schedule.description ? ` · ${schedule.description}` : ''}</small></span>{schedule.type === 'PERSONAL' && <button onClick={() => openEditSchedule(schedule)} type="button" aria-label={`${schedule.title} 수정`}><Pencil size={14} /></button>}</article>)}
                  {!loading && !selectedSchedules.length && <div className="feature-empty"><CalendarDays size={28} /><strong>등록된 일정이 없습니다</strong><span>왼쪽의 일정 만들기 버튼으로 추가할 수 있습니다.</span></div>}
                </div>
              </div>
            )}
          </section>

          <aside className="feature-card schedule-detail-card">
            <header><h2>{selectedDate.getFullYear()}년 {selectedDate.getMonth() + 1}월 {selectedDate.getDate()}일 {weekdayLabels[selectedDate.getDay()]}요일</h2><span>{selectedSchedules.length}개의 일정</span></header>
            <div className="schedule-detail-list">
              {selectedSchedules.map((schedule) => (
                <article key={schedule.id} className={`schedule-detail-item schedule-type-${schedule.type.toLowerCase()}`}>
                  <div><small>{scheduleLabels[schedule.type]}</small><strong>{schedule.title}</strong><span><Clock3 size={13} /> {schedule.isAllDay ? '종일' : `${formatTime(schedule.startsAt)} - ${formatTime(schedule.endsAt)}`}</span>{schedule.description && <p>{schedule.description}</p>}</div>
                  {schedule.type === 'PERSONAL' && <div className="item-actions"><button onClick={() => openEditSchedule(schedule)} title="수정" type="button"><Pencil size={15} /></button><button onClick={() => void removeSchedule(schedule)} title="삭제" type="button"><Trash2 size={15} /></button></div>}
                </article>
              ))}
              {!loading && selectedSchedules.length === 0 && <div className="feature-empty"><CalendarDays size={28} /><strong>{scheduleSearch ? '검색 결과가 없습니다' : '등록된 일정이 없습니다'}</strong><span>{scheduleSearch ? '다른 검색어를 입력해주세요.' : '선택한 날짜에 개인 일정을 추가할 수 있습니다.'}</span></div>}
              {loading && <div className="feature-empty">일정을 불러오는 중…</div>}
            </div>
          </aside>
        </div>
      )}

      {tab === '근무상황부' && (
        <div className="leave-page">
          <header className="leave-page-heading">
            <div><h2>근무상황부</h2><p>연차 및 근무시간 변경을 신청하고 승인 상태를 확인합니다.</p></div>
            <span>잔여 연차는 인사 기준 연동 후 표시됩니다.</span>
          </header>

          <section className="feature-card leave-summary-strip">
            <div><span>잔여 연차</span><strong>연동 대기</strong><small>인사·근태 API 필요</small></div>
            <div><span>이번 달 신청</span><strong>{currentMonthRequestCount}<em>건</em></strong><small>전체 휴가 유형</small></div>
            <div><span>승인 대기</span><strong>{pendingRequestCount}<em>건</em></strong><small>철회 가능한 신청</small></div>
          </section>

          <section className="feature-card leave-workspace-card">
            <form className="leave-quick-pane" onSubmit={submitOffRequest}>
              <header><div><small>QUICK REQUEST</small><h3>빠른 휴가 신청</h3></div><span>필수 항목만 입력</span></header>

              <fieldset className="leave-type-fieldset">
                <legend>휴가 유형</legend>
                <div className="leave-type-grid">
                  {leaveOptions.map((option) => (
                    <button key={option.type} className={leaveType === option.type ? 'active' : ''} onClick={() => { setLeaveType(option.type); setLeaveMemo(''); setRequestSuccess('') }} type="button">{option.label}</button>
                  ))}
                </div>
              </fieldset>

              <div className="leave-fields">
                <label>날짜<input type="date" value={leaveDate} onChange={(event) => changeLeaveDate(event.target.value)} required /></label>

                {leaveType === 'HALF_DAY' && (
                  <fieldset className="leave-choice-field">
                    <legend>반차 구분</legend>
                    <div className="half-day-options">
                      <button className={halfDayPeriod === 'AM' ? 'active' : ''} onClick={() => setHalfDayPeriod('AM')} type="button"><strong>오전 반차</strong><span>09:00–13:00</span></button>
                      <button className={halfDayPeriod === 'PM' ? 'active' : ''} onClick={() => setHalfDayPeriod('PM')} type="button"><strong>오후 반차</strong><span>14:00–18:00</span></button>
                    </div>
                    <small>반차 시간은 병원 근무 기준에 따라 고정됩니다.</small>
                  </fieldset>
                )}

                {leaveType === 'HOURLY' && (
                  <fieldset className="leave-choice-field">
                    <legend>사용 시간</legend>
                    <div className="leave-time-inputs"><label>시작<input type="time" value={hourStart} onChange={(event) => setHourStart(event.target.value)} /></label><span>→</span><label>종료<input type="time" value={hourEnd} onChange={(event) => setHourEnd(event.target.value)} /></label></div>
                    <div className="leave-duration-row"><strong>사용 시간 {hourlyDuration || 0}시간</strong><div>{[1, 2, 3].map((hours) => <button key={hours} onClick={() => setHourEnd(addHours(hourStart, hours))} type="button">{hours}시간</button>)}</div></div>
                  </fieldset>
                )}

                {leaveType === 'SICK' && (
                  <><label>종료 날짜<input type="date" min={leaveDate} value={leaveEndDate} onChange={(event) => setLeaveEndDate(event.target.value)} required /></label><label>메모 <small>(선택)</small><textarea value={leaveMemo} onChange={(event) => setLeaveMemo(event.target.value)} maxLength={500} placeholder="필요한 경우 관리자에게 전달할 내용을 입력하세요." /></label></>
                )}

                {leaveType === 'OFFICIAL' && (
                  <label>공가 유형<select value={officialType} onChange={(event) => setOfficialType(event.target.value)}><option>예비군·민방위</option><option>법정 건강검진</option><option>공적 업무</option><option>기타 공가</option></select></label>
                )}

                {(leaveType === 'BUSINESS_TRIP' || leaveType === 'TRAINING') && (
                  <>
                    <label>종료 날짜<input type="date" min={leaveDate} value={leaveEndDate} onChange={(event) => setLeaveEndDate(event.target.value)} required /></label>
                    <label>{leaveType === 'BUSINESS_TRIP' ? '출장지·업무 내용' : '교육명·교육 내용'}<textarea value={leaveMemo} onChange={(event) => setLeaveMemo(event.target.value)} maxLength={500} placeholder={leaveType === 'BUSINESS_TRIP' ? '출장지와 수행 업무를 입력하세요.' : '교육명 또는 교육 내용을 입력하세요.'} required /></label>
                  </>
                )}
              </div>

              <div className={`leave-selected-schedule ${selectedLeaveSchedule ? '' : 'empty'}`}>
                <span>선택한 일정</span>
                {leaveDateSchedules.length > 1 ? (
                  <select value={requestTargetId ?? ''} onChange={(event) => setRequestTargetId(Number(event.target.value) || null)}>
                    {leaveDateSchedules.map((schedule) => <option key={schedule.id} value={schedule.id}>{formatTime(schedule.startsAt)}–{formatTime(schedule.endsAt)} · {schedule.title}</option>)}
                  </select>
                ) : selectedLeaveSchedule ? (
                  <><strong>{formatTime(selectedLeaveSchedule.startsAt)}–{formatTime(selectedLeaveSchedule.endsAt)} {selectedLeaveSchedule.title}</strong><small>{scheduleLabels[selectedLeaveSchedule.type]} 일정에 휴무 변경을 요청합니다.</small></>
                ) : (
                  <><strong>신청 가능한 일정이 없습니다.</strong><small>선택한 날짜에 등록된 근무 일정을 먼저 확인해주세요.</small></>
                )}
              </div>

              {requestSuccess && <div className="leave-success"><CheckCircle2 size={15} />{requestSuccess}</div>}
              <button className="feature-primary leave-submit" disabled={saving || !leaveFormValid} type="submit">{saving ? '신청 중…' : `${leaveOptions.find((option) => option.type === leaveType)?.label} 신청`}</button>
            </form>

            <div className="leave-history-pane">
              <header><div><small>MY REQUESTS</small><h3>최근 신청 내역</h3></div><span>{requests.length}건</span></header>
              <div className="leave-history-table" role="table" aria-label="근무상황 신청 내역">
                <div className="leave-history-head" role="row"><span>날짜</span><span>유형</span><span>시간</span><span>상태</span><span>관리</span></div>
                {requests.map((item) => (
                  <div className="leave-history-row" role="row" key={item.id}>
                    <span>{formatDate(item.requestedStartsAt || item.createdAt)}</span>
                    <span><strong>{leaveTypeFromReason(item.reason)}</strong><small>{item.reason || '상세 내용 없음'}</small></span>
                    <span>{item.requestedStartsAt && item.requestedEndsAt ? (dateKey(new Date(item.requestedStartsAt)) === dateKey(new Date(item.requestedEndsAt)) ? `${formatTime(item.requestedStartsAt)}–${formatTime(item.requestedEndsAt)}` : `${formatDate(item.requestedStartsAt)}–${formatDate(item.requestedEndsAt)}`) : '-'}</span>
                    <span><b className={`request-status status-${item.status.toLowerCase()}`}>{statusLabel(item.status)}</b></span>
                    <span>{item.status.toUpperCase() === 'PENDING' ? <button onClick={() => void cancelRequest(item)} type="button">신청 취소</button> : '-'}</span>
                  </div>
                ))}
                {!requests.length && <div className="feature-empty"><CalendarDays size={26} /><strong>신청 내역이 없습니다</strong><span>왼쪽에서 휴가 유형과 날짜를 선택해 바로 신청할 수 있습니다.</span></div>}
              </div>
            </div>
          </section>
        </div>
      )}

      {tab === '승인 관리' && hasAdminAccess && (
        <div className="leave-approval-page">
          <section className="feature-card leave-approval-card">
            <header><div><small>MANAGER APPROVAL</small><h2>근무상황 승인 관리</h2><p>담당 진료과 의료진의 휴가·일정 변경 신청을 검토합니다.</p></div><span>{adminRequests.length}건 대기</span></header>
            <div className="leave-approval-list">
              {adminRequests.map((item) => <article key={item.id}><div><strong>{item.requesterName || '의료진'}</strong><span>{leaveTypeFromReason(item.reason)} · {formatDate(item.requestedStartsAt || item.createdAt)}</span><p>{item.reason}</p></div><b className="request-status status-pending">승인 대기</b><div className="review-actions"><button onClick={() => void reviewRequest(item, false)} type="button">반려</button><button className="feature-primary" onClick={() => void reviewRequest(item, true)} type="button">승인</button></div></article>)}
              {!adminRequests.length && <div className="feature-empty"><CheckCircle2 size={28} /><strong>승인 대기 신청이 없습니다</strong><span>현재 처리해야 할 근무상황 신청이 없습니다.</span></div>}
            </div>
          </section>
        </div>
      )}

      {tab === '당직 현황' && (
        <div className="oncall-layout">
          <section className="feature-card oncall-calendar-card">
            <header className="calendar-toolbar">
              <div>
                <h2>{month.getFullYear()}년 {month.getMonth() + 1}월 당직표</h2>
                <div className="schedule-legend">
                  <span className="schedule-type-on_call"><i />당직</span>
                  <span>월 전체 {onCallSchedules.length}건</span>
                </div>
              </div>
              <div className="calendar-actions">
                <button onClick={() => moveOnCallMonth(-1)} type="button"><ChevronLeft size={17} /></button>
                <button onClick={() => { const today = new Date(); setMonth(today); setSelectedDate(today) }} type="button">오늘</button>
                <button onClick={() => moveOnCallMonth(1)} type="button"><ChevronRight size={17} /></button>
              </div>
            </header>

            <div className="calendar-grid calendar-weekdays">
              {weekdayLabels.map((day) => <span key={day}>{day}</span>)}
            </div>

            <div className="calendar-grid calendar-days oncall-calendar-days">
              {calendarDays.map((day) => {
                const key = dateKey(day)
                const items = onCallSchedulesByDate.get(key) ?? []
                const isSelected = key === dateKey(selectedDate)
                const isToday = key === dateKey(new Date())

                return (
                  <button
                    key={key}
                    className={`calendar-day oncall-calendar-day ${day.getMonth() !== month.getMonth() ? 'outside' : ''} ${isSelected ? 'selected' : ''}`}
                    onClick={() => setSelectedDate(day)}
                    type="button"
                  >
                    <b className={isToday ? 'today' : ''}>{day.getDate()}</b>
                    {items.slice(0, 3).map((schedule) => (
                      <span key={schedule.id} className="schedule-chip schedule-type-on_call">
                        <i />{schedule.ownerName || schedule.title}
                      </span>
                    ))}
                    {items.length > 3 && <small>+{items.length - 3}명</small>}
                  </button>
                )
              })}
            </div>
          </section>

          <aside className="feature-card oncall-detail-card">
            <header>
              <div>
                <small>SELECTED DATE</small>
                <h2>
                  {selectedDate.getFullYear()}년 {selectedDate.getMonth() + 1}월{' '}
                  {selectedDate.getDate()}일 {weekdayLabels[selectedDate.getDay()]}요일
                </h2>
              </div>
              <span>{selectedOnCallSchedules.length}명</span>
            </header>

            <div className="oncall-detail-list">
              {selectedOnCallSchedules.map((schedule) => (
                <article key={schedule.id}>
                  <span className="oncall-avatar">
                    {(schedule.ownerName || schedule.title).slice(0, 1)}
                  </span>
                  <div>
                    <strong>{schedule.ownerName || schedule.title}</strong>
                    <span>{schedule.title}</span>
                    <small><Clock3 size={12} />{formatTime(schedule.startsAt)} - {formatTime(schedule.endsAt)}</small>
                  </div>
                  <b>당직</b>
                </article>
              ))}

              {selectedOnCallSchedules.length === 0 && (
                <div className="feature-empty">
                  <CalendarDays size={28} />
                  <strong>당직 일정이 없습니다</strong>
                  <span>달력에서 당직자가 등록된 날짜를 선택해주세요.</span>
                </div>
              )}
            </div>

            <footer>
              과장 권한으로 담당 진료과의 전체 당직표를 조회합니다.
            </footer>
          </aside>
        </div>
      )}

      {formOpen && (
        <div className="feature-modal-backdrop" role="presentation">
          <form className="feature-modal" onSubmit={submitSchedule}>
            <header><div><small>PERSONAL SCHEDULE</small><h2>{editingSchedule ? '개인 일정 수정' : '내 일정 추가'}</h2></div><button onClick={() => setFormOpen(false)} type="button"><X size={18} /></button></header>
            <label>일정명<input value={scheduleForm.title} onChange={(event) => setScheduleForm({ ...scheduleForm, title: event.target.value })} maxLength={150} required autoFocus /></label>
            <div className="form-columns"><label>시작<input type="datetime-local" value={scheduleForm.startsAt} onChange={(event) => setScheduleForm({ ...scheduleForm, startsAt: event.target.value })} required /></label><label>종료<input type="datetime-local" value={scheduleForm.endsAt} onChange={(event) => setScheduleForm({ ...scheduleForm, endsAt: event.target.value })} required /></label></div>
            <label className="feature-check"><input type="checkbox" checked={scheduleForm.isAllDay} onChange={(event) => setScheduleForm({ ...scheduleForm, isAllDay: event.target.checked })} /> 종일 일정</label>
            <label>메모<textarea value={scheduleForm.description} onChange={(event) => setScheduleForm({ ...scheduleForm, description: event.target.value })} maxLength={500} /></label>
            <footer><button onClick={() => setFormOpen(false)} type="button">취소</button><button className="feature-primary" disabled={saving} type="submit">{saving ? '저장 중…' : '저장'}</button></footer>
          </form>
        </div>
      )}
    </section>
  )
}
