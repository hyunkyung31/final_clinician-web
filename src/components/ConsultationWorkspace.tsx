import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { AlertTriangle, ArrowUpRight, Inbox, Plus, RefreshCw, Save, Search, Send, Stethoscope, X } from 'lucide-react'
import { addConsultationOpinion, changeConsultationStatus, createConsultation, getConsultationDetail, getConsultations, getStaffDoctors, withdrawConsultation } from '../api/client'
import type { ConsultationDetail, ConsultationSummary, PatientSummary, StaffDoctor } from '../types'
import { ConsultationReplyError, emptyReply, isOpenConsultation, isOverdue, matchesScope, publishConsultationReply, serializeReply, sortConsultations, type ConsultationPatientSection, type ConsultationScope, type ConsultationStatusFilter, type ReplyDraft } from './consultationWorkflow'

const labels: Record<ConsultationSummary['status'], string> = { REQUESTED: '접수 대기', ACCEPTED: '접수·검토 중', COMPLETED: '회신 완료', CANCELED: '철회' }
const scopes: { key: ConsultationScope; label: string }[] = [{ key: 'received', label: '받은 협진' }, { key: 'sent', label: '보낸 협진' }, { key: 'all', label: '전체 협진' }]
const links: { section: ConsultationPatientSection; label: string }[] = [
  { section: '워크스테이션', label: '진료이력·AI·CDSS' }, { section: '검사·영상', label: '혈액검사·2D·3D 영상' },
  { section: '시술기록', label: '시술기록지' }, { section: '결과보고서', label: '결과보고서' },
]
const message = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback
function dateTime(value: string) {
  const date = new Date(value)
  return !value || !Number.isFinite(date.getTime()) ? '정보 없음' : new Intl.DateTimeFormat('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date)
}
function elapsed(value: string, now: number) {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return '요청 시각 없음'
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60000))
  return minutes < 60 ? minutes + '분 경과' : minutes < 1440 ? Math.floor(minutes / 60) + '시간 경과' : Math.floor(minutes / 1440) + '일 경과'
}
function localDate(value: string) {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-') : ''
}
function Badges({ item, now }: { item: ConsultationSummary; now: number }) {
  return <div className="consult-badges"><span className={'consult-priority ' + item.priority.toLowerCase()}>{item.priority === 'URGENT' ? '긴급' : '일반'}</span><span className={'consult-status ' + item.status.toLowerCase()}>{labels[item.status]}</span>{isOverdue(item, now) && <span className="consult-overdue">기한 경과</span>}</div>
}

export function ConsultationWorkspace({ patients, initialPatientId, currentUserId, currentDoctorId, onOpenPatient }: {
  patients: PatientSummary[]; initialPatientId?: number; currentUserId?: number; currentDoctorId?: number
  onOpenPatient?: (patientId: number, section: ConsultationPatientSection) => void
}) {
  const [items, setItems] = useState<ConsultationSummary[]>([])
  const [doctors, setDoctors] = useState<StaffDoctor[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detail, setDetail] = useState<ConsultationDetail | null>(null)
  const [scope, setScope] = useState<ConsultationScope>('received')
  const [status, setStatus] = useState<ConsultationStatusFilter>('ALL')
  const [search, setSearch] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('ALL')
  const [department, setDepartment] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [tab, setTab] = useState<'request' | 'patient' | 'reply'>('request')
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [listError, setListError] = useState('')
  const [doctorError, setDoctorError] = useState('')
  const [detailError, setDetailError] = useState('')
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')
  const [revision, setRevision] = useState(0)
  const [now, setNow] = useState(Date.now())
  const [drafts, setDrafts] = useState<Record<number, ReplyDraft>>({})
  const [saving, setSaving] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [patientId, setPatientId] = useState<number | ''>(initialPatientId ?? '')
  const [doctorId, setDoctorId] = useState<number | ''>('')
  const [requestDepartment, setRequestDepartment] = useState('')
  const [subject, setSubject] = useState('')
  const [question, setQuestion] = useState('')
  const [background, setBackground] = useState('')
  const [priority, setPriority] = useState<'NORMAL' | 'URGENT'>('NORMAL')
  const [dueAt, setDueAt] = useState('')
  const [createError, setCreateError] = useState('')
  const [withdrawOpen, setWithdrawOpen] = useState(false)
  const [withdrawReason, setWithdrawReason] = useState('')

  const loadItems = useCallback(async () => {
    setLoading(true)
    const [list, staff] = await Promise.allSettled([getConsultations(), getStaffDoctors()])
    if (list.status === 'fulfilled') { setItems(list.value); setListError('') }
    else setListError(message(list.reason, '협진 목록 조회에 실패했습니다.'))
    if (staff.status === 'fulfilled') { setDoctors(staff.value.filter((doctor) => doctor.isActive)); setDoctorError('') }
    else setDoctorError(message(staff.reason, '의료진 목록 조회에 실패했습니다.'))
    setLoading(false)
  }, [])
  useEffect(() => { void loadItems() }, [loadItems])
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 60000); return () => window.clearInterval(timer) }, [])
  useEffect(() => {
    let active = true
    setDetail(null); setDetailError(''); setActionError(''); setNotice(''); setWithdrawOpen(false); setWithdrawReason('')
    setDetailLoading(selectedId !== null)
    if (selectedId !== null) {
      getConsultationDetail(selectedId).then((data) => { if (active) setDetail(data) })
        .catch((error) => { if (active) setDetailError(message(error, '협진 상세 조회에 실패했습니다.')) })
        .finally(() => { if (active) setDetailLoading(false) })
    }
    return () => { active = false }
  }, [selectedId, revision])

  const doctorMap = useMemo(() => new Map(doctors.map((doctor) => [doctor.id, doctor])), [doctors])
  const patientMap = useMemo(() => new Map(patients.filter((patient) => patient.backendId !== undefined).map((patient) => [patient.backendId!, patient])), [patients])
  const departmentOf = useCallback((item: ConsultationSummary) => item.assignedDepartmentName || (item.assignedDoctorId !== undefined ? doctorMap.get(item.assignedDoctorId)?.departmentName : '') || '', [doctorMap])
  const departments = useMemo(() => Array.from(new Set([...doctors.map((doctor) => doctor.departmentName), ...items.map(departmentOf)].filter(Boolean))).sort(), [doctors, items, departmentOf])
  const scoped = useMemo(() => items.filter((item) => matchesScope(item, scope, currentUserId, currentDoctorId)), [items, scope, currentUserId, currentDoctorId])
  const filtered = useMemo(() => sortConsultations(scoped.filter((item) => {
    const patient = item.patientId !== undefined ? patientMap.get(item.patientId) : undefined
    const keyword = search.trim().toLowerCase()
    const text = [item.patientName, patient?.name, patient?.id, item.patientNumber, item.subject, item.assignedDoctorName, item.requestedByName, departmentOf(item)].join(' ').toLowerCase()
    const date = localDate(item.createdAt)
    return (!keyword || text.includes(keyword)) && (status === 'ALL' || item.status === status)
      && (priorityFilter === 'ALL' || item.priority === priorityFilter) && (!department || departmentOf(item) === department)
      && (!from || (!!date && date >= from)) && (!to || (!!date && date <= to))
  })), [scoped, search, status, priorityFilter, department, from, to, patientMap, departmentOf])
  useEffect(() => {
    if (!loading && !listError && !saving) setSelectedId((id) => filtered.some((item) => item.id === id) ? id : filtered[0]?.id ?? null)
  }, [filtered, loading, listError, saving])

  const selected = detail?.consultation.id === selectedId ? detail.consultation : undefined
  const patient = selected?.patientId !== undefined ? patientMap.get(selected.patientId) : undefined
  const draft = selectedId !== null ? drafts[selectedId] ?? emptyReply() : emptyReply()
  const hasFinal = detail?.opinions.some((item) => item.isFinal) ?? false
  const isAssignee = !!selected && currentDoctorId !== undefined && selected.assignedDoctorId === currentDoctorId
  const isRequester = !!selected && currentUserId !== undefined && selected.requestedById === currentUserId
  const canReply = isAssignee && selected?.status === 'ACCEPTED' && !hasFinal && !saving && !detailLoading && !listError
  const text = serializeReply(draft)
  const validReply = !!draft.assessment.trim() && !!draft.recommendation.trim() && text.length <= 3000
  const scopeUnavailable = scope === 'received' ? currentDoctorId === undefined : scope === 'sent' ? currentUserId === undefined || (items.length > 0 && items.every((item) => item.requestedById === undefined)) : false
  const updateDraft = (key: keyof ReplyDraft, value: string) => {
    if (selectedId !== null) setDrafts((previous) => ({ ...previous, [selectedId]: { ...(previous[selectedId] ?? emptyReply()), [key]: value } }))
  }
  const refresh = async () => { await loadItems(); setRevision((value) => value + 1) }
  const runAction = async (action: 'accept' | 'withdraw') => {
    if (!selected || saving || listError || (action === 'accept' && !isAssignee) || (action === 'withdraw' && (!isRequester || !withdrawReason.trim()))) return
    setSaving(true); setActionError('')
    try {
      if (action === 'accept') await changeConsultationStatus(selected.id, 'accept')
      else await withdrawConsultation(selected.id, withdrawReason.trim())
      await refresh()
    } catch (error) { setActionError(message(error, '협진 상태 변경에 실패했습니다.')) }
    finally { setSaving(false) }
  }
  const submitReply = async (final: boolean) => {
    if (!selected || !isAssignee || selected.status !== 'ACCEPTED' || saving || listError || (!hasFinal && !validReply)) return
    if (final && !window.confirm('최종 회신을 등록하고 협진을 완료하시겠습니까? 등록 전 내용을 확인해주세요.')) return
    const id = selected.id
    setSaving(true); setActionError(''); setNotice('')
    try {
      await publishConsultationReply({ id, doctorId: currentDoctorId!, text, final,
        getDetail: getConsultationDetail, addOpinion: addConsultationOpinion,
        complete: (consultationId) => changeConsultationStatus(consultationId, 'complete'),
        onRegistered: () => setDrafts((previous) => { const next = { ...previous }; delete next[id]; return next }),
      })
      await refresh()
    } catch (error) {
      setActionError((error instanceof ConsultationReplyError && error.finalRegistered && final ? '최종 회신은 등록되어 있습니다. 완료 상태를 확인해주세요. ' : '') + message(error, '회신 등록에 실패했습니다.') + ' 재시도 전 새로고침으로 등록 여부를 확인해주세요.')
    } finally { setSaving(false) }
  }
  const submitConsultation = async (event: FormEvent) => {
    event.preventDefault()
    if (!patientId || !doctorId || !subject.trim() || !question.trim() || saving) return
    const note = '[임상 질문]\n' + question.trim() + (background.trim() ? '\n\n[환자 상태·의뢰 배경]\n' + background.trim() : '')
    if (note.length > 3000) { setCreateError('요청 내용은 합계 3,000자 이내로 입력해주세요.'); return }
    setSaving(true); setCreateError('')
    try {
      await createConsultation({ patientId, assignedDoctorId: doctorId, subject: subject.trim(), note, priority, dueAt: dueAt ? new Date(dueAt).toISOString() : undefined })
      setCreateOpen(false); setSubject(''); setQuestion(''); setBackground(''); setDueAt(''); setPriority('NORMAL')
      setScope(currentUserId !== undefined ? 'sent' : 'all'); setStatus('ALL'); setSearch(''); setDepartment(''); setPriorityFilter('ALL'); setFrom(''); setTo('')
      await loadItems()
    } catch (error) { setCreateError(message(error, '협진 의뢰 등록에 실패했습니다.')) }
    finally { setSaving(false) }
  }
  const renderLinks = () => <div className="consult-patient-links">{links.map((link) => <button key={link.section} disabled={!patient || !onOpenPatient || saving} onClick={() => selected?.patientId !== undefined && onOpenPatient?.(selected.patientId, link.section)} type="button">{link.label}<ArrowUpRight size={14} /></button>)}</div>

  return <section className="feature-page consult-workspace">
    <header className="feature-header consult-page-header">
      <div><small>CLINICAL COLLABORATION</small><h1>협진</h1><p>의뢰를 확인하고 환자를 검토한 뒤 공식 회신을 남깁니다.</p></div>
      <div className="feature-header-actions"><span className={'consult-connection ' + (listError ? 'failed' : '')}>{loading ? '조회 중' : listError ? '목록 연결 실패' : '목록 조회 완료'}</span><button disabled={saving || loading} onClick={() => void refresh()} title="목록·상세 새로고침" type="button"><RefreshCw size={16} /></button><button className="feature-primary" disabled={saving} onClick={() => { setPatientId(initialPatientId ?? ''); setCreateError(''); setCreateOpen(true) }} type="button"><Plus size={16} /> 협진 요청</button></div>
    </header>
    <nav className="consult-scope-tabs" aria-label="협진 구분">{scopes.map((item) => <button key={item.key} aria-pressed={scope === item.key} className={scope === item.key ? 'active' : ''} disabled={saving} onClick={() => { setScope(item.key); setTab('request') }} type="button">{item.label}<b>{items.filter((entry) => matchesScope(entry, item.key, currentUserId, currentDoctorId)).length}</b></button>)}</nav>
    {listError && <div className="consult-alert error" role="alert">{listError} {items.length > 0 && '이전 조회 결과입니다. 상태 변경은 새로고침 후 이용해주세요.'}<button disabled={loading || saving} onClick={() => void refresh()} type="button">다시 시도</button></div>}
    <div className="consult-filters">
      <label className="consult-search"><Search size={16} /><input aria-label="협진 검색" placeholder="환자명·환자번호·의뢰 주제 검색" value={search} disabled={saving} onChange={(event) => setSearch(event.target.value)} /></label>
      <label>상태<select value={status} disabled={saving} onChange={(event) => setStatus(event.target.value as ConsultationStatusFilter)}><option value="ALL">전체 상태</option>{Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>긴급도<select value={priorityFilter} disabled={saving} onChange={(event) => setPriorityFilter(event.target.value)}><option value="ALL">전체</option><option value="URGENT">긴급</option><option value="NORMAL">일반</option></select></label>
      <label>수신 진료과<select value={department} disabled={saving} onChange={(event) => setDepartment(event.target.value)}><option value="">전체 진료과</option>{departments.map((name) => <option key={name}>{name}</option>)}</select></label>
      <label>요청 시작일<input type="date" value={from} max={to || undefined} disabled={saving} onChange={(event) => setFrom(event.target.value)} /></label>
      <label>요청 종료일<input type="date" value={to} min={from || undefined} disabled={saving} onChange={(event) => setTo(event.target.value)} /></label>
      <button disabled={saving} onClick={() => { setSearch(''); setStatus('ALL'); setPriorityFilter('ALL'); setDepartment(''); setFrom(''); setTo('') }} type="button">초기화</button>
    </div>
    <div className="consult-counts"><span>접수 대기 <b>{scoped.filter((item) => item.status === 'REQUESTED').length}</b></span><span>검토 중 <b>{scoped.filter((item) => item.status === 'ACCEPTED').length}</b></span><span className="urgent">미완료 긴급 <b>{scoped.filter((item) => item.priority === 'URGENT' && isOpenConsultation(item)).length}</b></span><span>기한 경과 <b>{scoped.filter((item) => isOverdue(item, now)).length}</b></span><small>조회된 협진 기준 · 미완료·긴급 우선, 오래된 요청 순</small></div>
    <div className="consult-workbench">
      <aside className="consult-list-panel" aria-label="협진 의뢰 목록"><header><h2>{scopes.find((item) => item.key === scope)?.label}</h2><span>{filtered.length}건</span></header>
        {scopeUnavailable && <div className="consult-inline-hint">{scope === 'received' ? '로그인 의료진의 의사 계정 연결을 확인할 수 없습니다.' : '요청자 식별정보를 확인할 수 없습니다.'} 전체 협진에서 접근 가능한 목록을 확인해주세요.</div>}
        <div className="consult-list-scroll" aria-busy={loading}>{loading && <div className="consult-empty">협진 목록을 불러오는 중…</div>}
          {!loading && !filtered.length && <div className="consult-empty"><Inbox size={30} /><strong>{listError ? '목록을 확인할 수 없습니다' : '조건에 맞는 협진이 없습니다'}</strong><span>협진 구분이나 검색 조건을 변경해주세요.</span></div>}
          {filtered.map((item) => { const record = item.patientId !== undefined ? patientMap.get(item.patientId) : undefined; return <button key={item.id} disabled={saving} aria-pressed={selectedId === item.id} className={'consult-list-item ' + (selectedId === item.id ? 'active' : '')} onClick={() => { setSelectedId(item.id); setTab('request') }} type="button"><Badges item={item} now={now} /><div className="consult-row-patient"><strong>{item.patientName || record?.name || '환자 정보 없음'}</strong><small>{item.patientNumber || record?.id || (item.patientId ? '내부 ID ' + item.patientId : '환자번호 없음')}</small></div><p className="consult-row-subject">{item.subject}</p><div className="consult-row-team"><span>{item.requestedDepartmentName || item.requestedByName || '요청자 정보 없음'} → {departmentOf(item) || '수신 진료과 정보 없음'}</span><span>담당 {item.assignedDoctorName || '정보 없음'}</span></div><div className="consult-row-time"><time>{dateTime(item.createdAt)}</time><span>{isOpenConsultation(item) ? elapsed(item.createdAt, now) : labels[item.status]}</span></div></button> })}
        </div>
      </aside>
      <main className="consult-detail-panel" aria-busy={detailLoading}>
        {detailLoading ? <div className="consult-empty">협진 상세정보를 불러오는 중…</div> : detailError ? <div className="consult-empty" role="alert"><AlertTriangle size={30} /><strong>{detailError}</strong><button onClick={() => setRevision((value) => value + 1)} type="button">다시 시도</button></div> : selected && detail ? <>
          <header className="consult-detail-heading"><div><Badges item={selected} now={now} /><h2>{selected.subject}</h2><p><strong>{selected.patientName || patient?.name || '환자 정보 없음'}</strong><span>{selected.patientNumber || patient?.id || '환자번호 정보 없음'}</span>{patient && <span>{patient.sex === 'M' ? '남' : '여'} / {patient.age}세</span>}</p></div><small>의뢰 #{selected.id}</small></header>
          <div className="consult-detail-meta">{[
            ['요청자', selected.requestedByName || '정보 없음', selected.requestedDepartmentName || '진료과 정보 없음'],
            ['담당 의료진', selected.assignedDoctorName || '정보 없음', departmentOf(selected) || '진료과 정보 없음'],
            ['요청 시각', dateTime(selected.createdAt), isOpenConsultation(selected) ? elapsed(selected.createdAt, now) : labels[selected.status]],
            ['회신 희망 기한', dateTime(selected.dueAt), isOverdue(selected, now) ? '기한 경과' : '병원별 응답 기준 적용'],
          ].map(([title, value, hint]) => <div key={title} className={hint === '기한 경과' ? 'urgent' : ''}><span>{title}</span><strong>{value}</strong><small>{hint}</small></div>)}</div>
          {selected.priority === 'URGENT' && isOpenConsultation(selected) && <div className="consult-inline-hint urgent"><AlertTriangle size={16} />긴급 협진은 화면 알림만으로 전달을 보장하지 않습니다. 병원 규정에 따라 당직자 전화·호출을 병행해주세요.</div>}
          <div className="consult-detail-actions">{isAssignee && selected.status === 'REQUESTED' && <button className="feature-primary" disabled={saving || !!listError} onClick={() => void runAction('accept')} type="button">접수하고 검토 시작</button>}<button onClick={() => setTab('reply')} type="button">회신·기록 확인</button>{isRequester && isOpenConsultation(selected) && <button className="consult-danger-button" disabled={saving || !!listError} onClick={() => setWithdrawOpen((value) => !value)} type="button">의뢰 철회</button>}</div>
          {withdrawOpen && <form className="consult-withdraw-form" onSubmit={(event) => { event.preventDefault(); void runAction('withdraw') }}><label>철회 사유<textarea required value={withdrawReason} maxLength={1000} disabled={saving} onChange={(event) => setWithdrawReason(event.target.value)} /></label><button disabled={saving || !withdrawReason.trim()} className="consult-danger-button" type="submit">철회 확인</button><button disabled={saving} onClick={() => setWithdrawOpen(false)} type="button">닫기</button></form>}
          {actionError && <div className="consult-inline-hint error" role="alert">{actionError}<button disabled={saving} onClick={() => void refresh()} type="button">상태 새로고침</button></div>}
          <nav className="consult-detail-tabs" aria-label="협진 상세 구분">{([{ key: 'request', label: '의뢰 내용' }, { key: 'patient', label: '환자 정보·검사' }, { key: 'reply', label: '회신·기록' }] as const).map((item) => <button key={item.key} aria-pressed={tab === item.key} className={tab === item.key ? 'active' : ''} onClick={() => setTab(item.key)} type="button">{item.label}</button>)}</nav>
          <div className="consult-detail-body">
            {tab === 'request' && <><section className="consult-document"><h3>협진 의뢰 내용</h3><p>{selected.requestNote || '요청 내용이 등록되지 않았습니다.'}</p></section><section className="consult-document"><h3>환자 기록 검토</h3><p className="consult-muted">검사·투약·진료기록은 원본 환자 차트에서 확인해주세요. 기존 오른쪽 채팅은 유지하며, 최종 의견은 공식 회신에 남깁니다.</p>{renderLinks()}</section></>}
            {tab === 'patient' && <><section className="consult-document"><h3>환자 요약</h3><dl className="consult-patient-summary">{[
              ['환자번호', selected.patientNumber || patient?.id || '정보 없음'], ['병동·위치', selected.patientLocation || '연동 정보 없음'],
              ['검사 정보', patient?.exam || '환자 차트에서 확인'], ['위험도', patient ? ({ high: '고위험', medium: '중간', normal: '정상' } as const)[patient.risk] : '연동 정보 없음'],
            ].map(([title, value]) => <div key={title}><dt>{title}</dt><dd>{value}</dd></div>)}</dl><p className="consult-muted">목록 기반 요약입니다. 최신 임상 정보·알레르기·투약 정보는 원본 차트에서 확인해주세요.</p></section><section className="consult-document"><h3>관련 의료정보 바로가기</h3>{renderLinks()}{!patient && <p className="consult-muted">현재 조회된 환자 목록에 없는 환자입니다. 환자관리에서 접근 권한을 확인하고 조회해주세요.</p>}<p className="consult-muted">AI·CDSS 결과는 의료진 판단을 보조하는 참고 자료입니다.</p></section></>}
            {tab === 'reply' && <><section className="consult-document"><h3>공식 회신 작성</h3><p className="consult-muted">담당 의료진이 접수한 뒤 작성합니다. 중간 소견만 등록하면 협진은 완료되지 않습니다.</p>
              {!isAssignee ? <div className="consult-inline-hint">배정된 담당 의료진만 회신을 작성할 수 있습니다.</div> : selected.status === 'REQUESTED' ? <div className="consult-inline-hint">먼저 ‘접수하고 검토 시작’을 눌러주세요.</div> : !isOpenConsultation(selected) ? <div className="consult-inline-hint">종료된 협진입니다. 아래에서 등록된 회신을 확인해주세요.</div> : hasFinal ? <div className="consult-inline-hint">최종 회신이 등록되어 있습니다. 완료 처리가 남아 있다면 마무리해주세요.<button className="feature-primary" disabled={saving || !!listError} onClick={() => void submitReply(true)} type="button">협진 완료 처리</button></div> :
              <form className="consult-reply-form" onSubmit={(event) => { event.preventDefault(); void submitReply(true) }}>{([{ key: 'assessment', label: '평가·소견', required: true, placeholder: '의뢰 질문에 대한 평가와 검토 결과' }, { key: 'recommendation', label: '권고사항', required: true, placeholder: '치료·처치·관리 관련 권고사항' }, { key: 'followUp', label: '추가 검사·추적 계획', required: false, placeholder: '추가 확인 사항과 재평가 계획' }] as const).map((field) => <label key={field.key}>{field.label}<span>{field.required ? '필수' : '선택'}</span><textarea required={field.required} disabled={!canReply} value={draft[field.key]} maxLength={2000} onChange={(event) => updateDraft(field.key, event.target.value)} placeholder={field.placeholder} /></label>)}<div className="consult-draft-help"><span>임시 내용은 현재 화면에서만 유지됩니다. 새로고침·화면 종료 시 사라집니다.</span><span className={text.length > 3000 ? 'urgent' : ''}>{text.length.toLocaleString()} / 3,000자</span></div><div className="consult-reply-buttons"><button disabled={!canReply} onClick={() => setNotice('현재 화면 메모리에 보관했습니다. 서버에는 저장되지 않습니다.')} type="button"><Save size={15} /> 임시 보관</button><button disabled={!canReply || !validReply} onClick={() => void submitReply(false)} type="button">중간 소견 등록</button><button className="feature-primary" disabled={!canReply || !validReply} type="submit"><Send size={15} /> 최종 회신 및 완료</button></div>{notice && <p className="consult-muted" role="status">{notice}</p>}<p className="consult-muted">로그인 계정으로 회신을 등록합니다. 별도 전자서명·공동서명 기능은 포함되지 않습니다.</p></form>}
              </section><section className="consult-document"><header className="consult-section-heading"><h3>의뢰·회신 기록</h3><span>회신 {detail.opinions.length}건</span></header><div className="consult-history-entry"><div><b>협진 의뢰</b><time>{dateTime(selected.createdAt)}</time></div><p>{selected.requestedByName || '요청자 정보 없음'} · {selected.subject}</p></div>{[...detail.opinions].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id - b.id).map((entry) => <article className="consult-history-entry" key={entry.id}><div><b>{entry.doctorName}</b><span className={entry.isFinal ? 'consult-final-label' : 'consult-muted'}>{entry.isFinal ? '최종 회신' : '중간 소견'}</span><time>{dateTime(entry.createdAt)}</time></div><p>{entry.opinionText}</p></article>)}{!detail.opinions.length && <p className="consult-muted">등록된 회신이 없습니다.</p>}<p className="consult-muted">API에 기록된 의뢰·소견만 표시합니다. 접수·배정 변경 등의 전체 감사이력은 별도 연동이 필요합니다.</p></section></>}
          </div>
        </> : <div className="consult-empty"><Stethoscope size={34} /><strong>확인할 협진을 선택하세요</strong><span>왼쪽 목록에서 의뢰 내용과 환자 기록을 확인할 수 있습니다.</span></div>}
      </main>
    </div>
    {createOpen && <div className="feature-modal-backdrop"><form className="feature-modal consult-request-modal" role="dialog" aria-modal="true" aria-labelledby="consult-request-title" onSubmit={submitConsultation}>
      <header><div><small>CONSULTATION REQUEST</small><h2 id="consult-request-title">새 협진 의뢰</h2></div><button aria-label="요청 닫기" disabled={saving} onClick={() => setCreateOpen(false)} type="button"><X size={18} /></button></header>
      {createError && <div className="consult-inline-hint error" role="alert">{createError}</div>}{doctorError && <div className="consult-inline-hint error">{doctorError}<button disabled={loading || saving} onClick={() => void loadItems()} type="button">의료진 다시 조회</button></div>}
      <label>환자<select required value={patientId} disabled={saving} onChange={(event) => setPatientId(Number(event.target.value) || '')}><option value="">환자를 선택하세요</option>{patients.filter((item) => item.backendId !== undefined).map((item) => <option key={item.id} value={item.backendId}>{item.name} · {item.id}</option>)}</select></label>
      <div className="form-columns"><label>수신 진료과<select value={requestDepartment} disabled={saving} onChange={(event) => { setRequestDepartment(event.target.value); setDoctorId('') }}><option value="">전체 진료과</option>{Array.from(new Set(doctors.map((item) => item.departmentName).filter(Boolean))).sort().map((name) => <option key={name}>{name}</option>)}</select></label><label>담당 의료진<select required value={doctorId} disabled={saving} onChange={(event) => setDoctorId(Number(event.target.value) || '')}><option value="">의료진을 선택하세요</option>{doctors.filter((item) => !requestDepartment || item.departmentName === requestDepartment).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.departmentName || '진료과 정보 없음'}</option>)}</select></label></div>
      <label>의뢰 주제<input required value={subject} disabled={saving} maxLength={200} placeholder="협진 목적을 한 줄로 입력하세요" onChange={(event) => setSubject(event.target.value)} /></label>
      <label>임상 질문<textarea required value={question} disabled={saving} maxLength={2000} placeholder="담당 진료과에 확인하고 싶은 구체적인 질문" onChange={(event) => setQuestion(event.target.value)} /></label>
      <label>환자 상태·의뢰 배경 <span className="consult-muted">선택</span><textarea value={background} disabled={saving} maxLength={2000} placeholder="관련 진단, 주요 검사, 투약 및 의뢰 배경" onChange={(event) => setBackground(event.target.value)} /></label>
      <div className="form-columns"><label>긴급도<select value={priority} disabled={saving} onChange={(event) => setPriority(event.target.value as 'NORMAL' | 'URGENT')}><option value="NORMAL">일반</option><option value="URGENT">긴급</option></select></label><label>회신 희망 기한 <span className="consult-muted">선택</span><input type="datetime-local" value={dueAt} disabled={saving} onChange={(event) => setDueAt(event.target.value)} /></label></div>
      {priority === 'URGENT' && <div className="consult-inline-hint urgent"><AlertTriangle size={16} />긴급 의뢰는 병원 규정에 따라 전화·호출도 병행해주세요.</div>}
      <p className="consult-muted">진료과 선택은 담당자 검색용입니다. 현재 API는 개별 의료진에게 배정하며, 요청 후 재배정은 지원하지 않습니다.</p>
      <footer><button disabled={saving} onClick={() => setCreateOpen(false)} type="button">취소</button><button className="feature-primary" disabled={saving || !patientId || !doctorId || !subject.trim() || !question.trim()} type="submit">{saving ? '등록 중…' : '협진 의뢰 등록'}</button></footer>
    </form></div>}
  </section>
}
