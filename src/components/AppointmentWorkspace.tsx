import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CalendarCheck2, CheckCircle2, Clock3, RefreshCw, UserRound } from 'lucide-react'
import { acceptStaffReservation, getAllStaffReservations, getStaffDoctors } from '../api/client'
import type { StaffDoctor, StaffReservation } from '../types'

type ReservationFilter = 'ALL' | 'REQUESTED' | 'ACCEPTED' | 'CANCELED'

const statusLabels: Record<string, string> = {
  REQUESTED: '승인 대기',
  ACCEPTED: '예약 승인',
  CANCELED: '예약 취소',
}

function localDateKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return typeof value === 'string' ? value.slice(0, 10) : ''
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (!value || Number.isNaN(date.getTime())) return value || '-'
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function genderLabel(value: string) {
  if (value === 'MALE') return '남'
  if (value === 'FEMALE') return '여'
  return '-'
}

export function AppointmentWorkspace({ roles, doctorId }: { roles: string[]; doctorId?: number }) {
  const isNurse = roles.some((role) => role.trim().toUpperCase() === 'NURSE')
  const [reservations, setReservations] = useState<StaffReservation[]>([])
  const [doctors, setDoctors] = useState<StaffDoctor[]>([])
  const [selectedDate, setSelectedDate] = useState(() => localDateKey(new Date()))
  const [filter, setFilter] = useState<ReservationFilter>('ALL')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [approving, setApproving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [pendingApproval, setPendingApproval] = useState<StaffReservation | null>(null)
  const initialDateResolved = useRef(false)

  const loadReservations = useCallback(async () => {
    if (!isNurse && !doctorId) return
    setLoading(true)
    setError('')
    try {
      const [items, doctorItems] = await Promise.all([
        getAllStaffReservations(isNurse ? undefined : doctorId),
        isNurse ? getStaffDoctors() : Promise.resolve([] as StaffDoctor[]),
      ])
      items.sort((a, b) => Date.parse(a.reservedAt) - Date.parse(b.reservedAt))
      setReservations(items)
      setDoctors(doctorItems)
      const dates = [...new Set(items.map((item) => localDateKey(item.reservedAt)))].sort()
      if (!initialDateResolved.current) {
        initialDateResolved.current = true
        setSelectedDate((current) => dates.length && !dates.includes(current)
          ? dates.find((date) => date >= current) ?? dates.at(-1)!
          : current)
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '예약 목록을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [doctorId, isNurse])

  useEffect(() => { void loadReservations() }, [loadReservations])

  const dateReservations = useMemo(() => reservations.filter((item) => localDateKey(item.reservedAt) === selectedDate), [reservations, selectedDate])
  const filtered = useMemo(() => dateReservations.filter((item) => filter === 'ALL' || item.status === filter), [dateReservations, filter])
  const selected = filtered.find((item) => item.id === selectedId) ?? (filtered.length === 1 ? filtered[0] : null)
  const doctorMap = useMemo(() => new Map(doctors.map((doctor) => [doctor.id, doctor])), [doctors])

  useEffect(() => {
    if (selectedId !== null && !filtered.some((item) => item.id === selectedId)) setSelectedId(null)
  }, [filtered, selectedId])

  const approve = async (reservation: StaffReservation) => {
    if (!isNurse) return
    if (!reservation.doctorId) {
      setError('담당 의사 정보가 없어 예약을 승인할 수 없습니다.')
      return
    }
    setApproving(true)
    setError('')
    setSuccess('')
    try {
      await acceptStaffReservation(reservation.id, reservation.doctorId)
      setPendingApproval(null)
      setSuccess('예약이 승인되었습니다.')
      await loadReservations()
    } catch (approvalError) {
      setError(approvalError instanceof Error ? approvalError.message : '예약 승인에 실패했습니다.')
    } finally {
      setApproving(false)
    }
  }

  return <section className="feature-page appointment-page">
    <header className="feature-header">
      <div><small>APPOINTMENT</small><h1>예약</h1><p>{isNurse ? '전체 예약을 확인하고 승인 대기 예약을 처리합니다.' : '담당 예약 현황을 확인합니다.'}</p></div>
      <span className="feature-live"><i /> 예약 API 연결됨</span>
    </header>

    {error && <div className="feature-error"><span>{error}</span><button onClick={() => setError('')} type="button">닫기</button></div>}
    {success && <p className="reservation-approval-success"><CheckCircle2 size={16} />{success}</p>}

    <div className="appointment-layout">
      <aside className="feature-card appointment-calendar-panel">
        <header><CalendarCheck2 size={20} /><div><strong>{isNurse ? '전체 예약 현황' : '내 예약 현황'}</strong><small>날짜를 선택하세요.</small></div></header>
        <input aria-label="예약 날짜" type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
        <dl>
          <div><dt>전체</dt><dd>{dateReservations.length}</dd></div>
          <div><dt>승인 대기</dt><dd>{dateReservations.filter((item) => item.status === 'REQUESTED').length}</dd></div>
          <div><dt>승인</dt><dd>{dateReservations.filter((item) => item.status === 'ACCEPTED').length}</dd></div>
          <div><dt>취소</dt><dd>{dateReservations.filter((item) => item.status === 'CANCELED').length}</dd></div>
        </dl>
        <button disabled={loading} onClick={() => void loadReservations()} type="button"><RefreshCw size={15} /> 새로고침</button>
      </aside>

      <section className="feature-card appointment-list-panel">
        <nav>{(['ALL', 'REQUESTED', 'ACCEPTED', 'CANCELED'] as ReservationFilter[]).map((status) => <button className={filter === status ? 'active' : ''} key={status} onClick={() => setFilter(status)} type="button">{status === 'ALL' ? '전체' : statusLabels[status]} <b>{status === 'ALL' ? dateReservations.length : dateReservations.filter((item) => item.status === status).length}</b></button>)}</nav>
        <div>
          {filtered.map((reservation) => <button className={selected?.id === reservation.id ? 'active' : ''} key={reservation.id} onClick={() => setSelectedId(reservation.id)} type="button">
            <time><Clock3 size={14} />{formatDateTime(reservation.reservedAt)}</time>
            <span><strong>{reservation.applicantName}</strong><small>{doctorMap.get(reservation.doctorId ?? 0)?.name ?? (reservation.doctorId ? `의료진 #${reservation.doctorId}` : '담당 의사 없음')}</small></span>
            <em className={`appointment-status status-${reservation.status.toLowerCase()}`}>{statusLabels[reservation.status] ?? reservation.status}</em>
          </button>)}
          {loading && <div className="feature-empty">예약 목록을 불러오는 중…</div>}
          {!loading && !filtered.length && <div className="feature-empty"><CalendarCheck2 size={26} /><strong>해당 날짜의 예약이 없습니다.</strong></div>}
        </div>
      </section>

      <aside className="feature-card appointment-detail-panel">
        {selected ? <>
          <header><UserRound size={20} /><div><small>예약 #{selected.id}</small><h2>{selected.applicantName}</h2></div></header>
          <dl>
            <div><dt>생년월일</dt><dd>{selected.applicantBirthDate || '-'}</dd></div>
            <div><dt>성별</dt><dd>{genderLabel(selected.applicantGender)}</dd></div>
            <div><dt>연락처</dt><dd>{selected.applicantContact || '-'}</dd></div>
            <div><dt>예약 일시</dt><dd>{formatDateTime(selected.reservedAt)}</dd></div>
            <div><dt>상태</dt><dd>{statusLabels[selected.status] ?? selected.status}</dd></div>
            <div><dt>담당 의료진</dt><dd>{doctorMap.get(selected.doctorId ?? 0)?.name ?? (selected.doctorId ? `#${selected.doctorId}` : '-')}</dd></div>
            <div><dt>환자 연결</dt><dd>{selected.patientId ? `연결됨 · #${selected.patientId}` : '승인 시 생성·연결'}</dd></div>
            {selected.acceptedAt && <div><dt>승인 일시</dt><dd>{formatDateTime(selected.acceptedAt)}</dd></div>}
          </dl>
          {selected.status === 'REQUESTED' && isNurse && <button className="reservation-approve-button" disabled={approving || !selected.doctorId} onClick={() => setPendingApproval(selected)} type="button"><CheckCircle2 size={16} />{selected.doctorId ? '예약 승인' : '담당 의사 정보 없음'}</button>}
        </> : <div className="feature-empty"><UserRound size={28} /><strong>예약을 선택해주세요.</strong><span>예약 상세와 승인 여부를 확인할 수 있습니다.</span></div>}
      </aside>
    </div>
    {pendingApproval && <div className="appointment-confirm-backdrop" role="presentation" onClick={() => !approving && setPendingApproval(null)}>
      <section className="appointment-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="appointment-confirm-title" onClick={(event) => event.stopPropagation()}>
        <span><CheckCircle2 size={22} /></span>
        <h2 id="appointment-confirm-title">예약을 승인하시겠습니까?</h2>
        <p><strong>{pendingApproval.applicantName}</strong>님의 예약을 <strong>{doctorMap.get(pendingApproval.doctorId ?? 0)?.name ?? `의료진 #${pendingApproval.doctorId}`}</strong> 담당으로 승인합니다.</p>
        <dl>
          <div><dt>예약 일시</dt><dd>{formatDateTime(pendingApproval.reservedAt)}</dd></div>
          <div><dt>승인 후 처리</dt><dd>{pendingApproval.patientId ? '기존 환자 연결 유지' : '환자 생성 및 계정 연결'}</dd></div>
        </dl>
        <div>
          <button disabled={approving} onClick={() => setPendingApproval(null)} type="button">취소</button>
          <button className="reservation-approve-button" disabled={approving} onClick={() => void approve(pendingApproval)} type="button">{approving ? '승인 중…' : '예약 승인'}</button>
        </div>
      </section>
    </div>}
  </section>
}
