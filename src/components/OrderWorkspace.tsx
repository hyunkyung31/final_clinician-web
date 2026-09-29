import { useEffect, useMemo, useState } from 'react'
import {
  ClipboardList,
  LoaderCircle,
  Pill,
  Search,
  Stethoscope,
  X,
} from 'lucide-react'

import {
  cancelExaminationOrder,
  createExaminationOrder,
  getExaminationOrders,
  getExaminationTypes,
} from '../api/client'
import type {
  ExaminationOrderSummary,
  ExaminationTypeSummary,
  PatientSummary,
} from '../types'
import { clinicianErrorMessage, orderCategoryTab } from '../workstationHub'
import { PrescriptionPanel } from './PrescriptionPanel'

interface OrderWorkspaceProps {
  patients: PatientSummary[]
  selectedPatient: PatientSummary | null
  encounterId: number | null
  onSelectPatient: (patient: PatientSummary) => void
}

type WorkspaceTab = 'orders' | 'prescriptions'
type OrderCategory = 'all' | 'exam' | 'procedure' | 'other'

const orderStatusLabel: Record<ExaminationOrderSummary['status'], string> = {
  ORDERED: '오더됨',
  SCHEDULED: '예약됨',
  COMPLETED: '완료',
  CANCELED: '취소',
}

function formatDateTime(value: string) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function OrderPanel({
  patientId,
  encounterId,
}: {
  patientId?: number
  encounterId: number | null
}) {
  const [types, setTypes] = useState<ExaminationTypeSummary[]>([])
  const [orders, setOrders] = useState<ExaminationOrderSummary[]>([])
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<OrderCategory>('all')
  const [selectedTypeIds, setSelectedTypeIds] = useState<number[]>([])
  const [priority, setPriority] = useState<'NORMAL' | 'URGENT'>('NORMAL')
  const [clinicalNote, setClinicalNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [cancelTarget, setCancelTarget] = useState<ExaminationOrderSummary | null>(null)
  const [cancelReason, setCancelReason] = useState('')

  const reload = async () => {
    if (!patientId) return
    setLoading(true)
    setError('')
    try {
      const [nextTypes, nextOrders] = await Promise.all([
        getExaminationTypes(),
        getExaminationOrders(patientId),
      ])
      setTypes(nextTypes)
      setOrders([...nextOrders].sort((left, right) => (
        (Date.parse(right.orderedAt) || right.id) - (Date.parse(left.orderedAt) || left.id)
      )))
    } catch (requestError) {
      setError(clinicianErrorMessage(requestError, '검사·시술 오더를 불러오지 못했습니다.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setSelectedTypeIds([])
    setMessage('')
    setCancelTarget(null)
    if (patientId) void reload()
  }, [patientId])

  const typeMap = useMemo(
    () => new Map(types.map((item) => [item.id, item])),
    [types],
  )
  const activeTypeIds = useMemo(
    () => new Set(
      orders
        .filter((item) => ['ORDERED', 'SCHEDULED'].includes(item.status))
        .map((item) => item.examinationTypeId),
    ),
    [orders],
  )
  const completedTypeIds = useMemo(
    () => new Set(
      orders
        .filter((item) => item.status === 'COMPLETED')
        .map((item) => item.examinationTypeId),
    ),
    [orders],
  )
  const visibleTypes = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return types.filter((item) => {
      const itemCategory = orderCategoryTab(item.category, item.name, item.code)
      if (category !== 'all' && itemCategory !== category) return false
      if (!keyword) return true
      return `${item.code} ${item.name}`.toLowerCase().includes(keyword)
    }).slice(0, 40)
  }, [category, query, types])

  const toggleType = (typeId: number) => {
    if (activeTypeIds.has(typeId)) return
    setSelectedTypeIds((current) => (
      current.includes(typeId)
        ? current.filter((id) => id !== typeId)
        : [...current, typeId]
    ))
    setMessage('')
  }

  const submitOrders = async () => {
    if (!encounterId || selectedTypeIds.length === 0) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      for (const typeId of selectedTypeIds) {
        await createExaminationOrder(encounterId, typeId, clinicalNote, priority)
      }
      setMessage(`${selectedTypeIds.length}건의 오더를 입력했습니다.`)
      setSelectedTypeIds([])
      setClinicalNote('')
      setPriority('NORMAL')
      await reload()
    } catch (requestError) {
      setError(clinicianErrorMessage(requestError, '오더 입력에 실패했습니다.'))
    } finally {
      setSaving(false)
    }
  }

  const cancelOrder = async () => {
    if (!cancelTarget || !cancelReason.trim()) return
    setSaving(true)
    setError('')
    try {
      await cancelExaminationOrder(cancelTarget.id, cancelReason)
      setMessage('오더를 취소했습니다.')
      setCancelTarget(null)
      setCancelReason('')
      await reload()
    } catch (requestError) {
      setError(clinicianErrorMessage(requestError, '오더 취소에 실패했습니다.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="exam-order-panel">
      <section className="exam-order-history">
        <header>
          <div>
            <span>ORDER HISTORY</span>
            <h3>검사·시술 오더 현황</h3>
            <p>현재 환자의 전체 진료 오더를 최신순으로 확인합니다.</p>
          </div>
          <strong>{orders.length}건</strong>
        </header>

        {loading && <p className="exam-order-state"><LoaderCircle className="spin" size={15} /> 오더를 불러오는 중…</p>}
        {!loading && orders.length === 0 && <p className="exam-order-state">등록된 검사·시술 오더가 없습니다.</p>}
        {!loading && orders.length > 0 && (
          <div className="exam-order-table" role="table" aria-label="검사·시술 오더 목록">
            <div className="exam-order-table-head" role="row">
              <span>오더</span><span>진료</span><span>우선순위</span><span>상태</span><span>일시</span><span>관리</span>
            </div>
            {orders.map((order) => {
              const type = typeMap.get(order.examinationTypeId)
              const canCancel = ['ORDERED', 'SCHEDULED'].includes(order.status)
              return (
                <div className="exam-order-table-row" role="row" key={order.id}>
                  <span><strong>{type?.name ?? `검사 #${order.examinationTypeId}`}</strong><small>{type?.code ?? `Order #${order.id}`}</small></span>
                  <span>{order.encounterId === encounterId ? '현재 진료' : `#${order.encounterId}`}</span>
                  <span className={order.priority === 'URGENT' ? 'urgent' : ''}>{order.priority === 'URGENT' ? '긴급' : '일반'}</span>
                  <span><b className={`order-status ${order.status.toLowerCase()}`}>{orderStatusLabel[order.status]}</b></span>
                  <span>{formatDateTime(order.orderedAt)}</span>
                  <span>{canCancel ? <button type="button" onClick={() => { setCancelTarget(order); setCancelReason('') }}>취소</button> : '-'}</span>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="exam-order-create">
        <header>
          <div>
            <span>NEW ORDER</span>
            <h3>새 오더 입력</h3>
            <p>의료진이 항목과 근거를 확인한 후 저장합니다.</p>
          </div>
          <span>{selectedTypeIds.length}개 선택</span>
        </header>

        {!encounterId && <p className="exam-order-warning">현재 진료가 연결되지 않아 새 오더를 입력할 수 없습니다.</p>}
        <label className="exam-order-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="검사명 또는 검사 코드 검색" /></label>
        <div className="exam-order-category-tabs">
          {([
            ['all', '전체'],
            ['exam', '검사'],
            ['procedure', '시술'],
            ['other', '기타'],
          ] as const).map(([value, label]) => (
            <button className={category === value ? 'active' : ''} key={value} onClick={() => setCategory(value)} type="button">{label}</button>
          ))}
        </div>

        <div className="exam-order-type-list">
          {visibleTypes.map((type) => {
            const activeDuplicate = activeTypeIds.has(type.id)
            const completedBefore = completedTypeIds.has(type.id)
            return (
              <label className={activeDuplicate ? 'disabled' : ''} key={type.id}>
                <input disabled={activeDuplicate} checked={selectedTypeIds.includes(type.id)} onChange={() => toggleType(type.id)} type="checkbox" />
                <span><strong>{type.name}</strong><small>{type.code} · {type.modality || type.category}</small></span>
                {activeDuplicate && <b>진행 중 오더</b>}
                {!activeDuplicate && completedBefore && <b className="history">기시행 이력</b>}
              </label>
            )
          })}
          {visibleTypes.length === 0 && <p>검색된 오더 항목이 없습니다.</p>}
        </div>

        <div className="exam-order-fields">
          <label><span>우선순위</span><select value={priority} onChange={(event) => setPriority(event.target.value as 'NORMAL' | 'URGENT')}><option value="NORMAL">일반</option><option value="URGENT">긴급</option></select></label>
          <label className="wide"><span>오더 사유 및 임상 메모</span><textarea rows={3} value={clinicalNote} onChange={(event) => setClinicalNote(event.target.value)} placeholder="검사 목적이나 확인할 임상 정보를 입력하세요." /></label>
        </div>

        {(error || message) && <p className={error ? 'exam-order-error' : 'exam-order-success'}>{error || message}</p>}
        <div className="exam-order-actions">
          <small>모델 권고는 참고 정보이며, 선택한 항목만 의료진 확인 후 저장됩니다.</small>
          <button className="primary" disabled={!encounterId || selectedTypeIds.length === 0 || saving} onClick={() => void submitOrders()} type="button">
            {saving ? '저장 중…' : `선택 오더 입력${selectedTypeIds.length ? ` (${selectedTypeIds.length})` : ''}`}
          </button>
        </div>
      </section>

      {cancelTarget && (
        <div className="exam-order-cancel" role="dialog" aria-modal="true">
          <div>
            <header><h3>오더 취소</h3><button type="button" onClick={() => setCancelTarget(null)} aria-label="닫기"><X size={16} /></button></header>
            <p>{typeMap.get(cancelTarget.examinationTypeId)?.name ?? '선택 오더'}를 취소합니다.</p>
            <label><span>취소 사유</span><textarea autoFocus rows={3} value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} /></label>
            <footer><button type="button" onClick={() => setCancelTarget(null)}>돌아가기</button><button className="danger" disabled={!cancelReason.trim() || saving} type="button" onClick={() => void cancelOrder()}>오더 취소</button></footer>
          </div>
        </div>
      )}
    </div>
  )
}

export function OrderWorkspace({
  patients,
  selectedPatient,
  encounterId,
  onSelectPatient,
}: OrderWorkspaceProps) {
  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('orders')
  const visiblePatients = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return patients.slice(0, 20)
    return patients
      .filter((patient) => `${patient.name} ${patient.id}`.toLowerCase().includes(keyword))
      .slice(0, 20)
  }, [patients, query])

  return (
    <section className="prescription-order-workspace">
      <aside className="prescription-order-patients">
        <header>
          <span><Stethoscope size={17} /><strong>환자별 오더·처방</strong></span>
          <small>환자를 선택해 오더와 처방 이력을 관리합니다.</small>
        </header>
        <label><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="환자명 또는 환자번호 검색" /></label>
        <div>
          {visiblePatients.map((patient) => (
            <button className={patient.backendId === selectedPatient?.backendId ? 'active' : ''} key={patient.backendId} onClick={() => onSelectPatient(patient)} type="button">
              <strong>{patient.name}</strong><span>{patient.id}</span><small>{patient.sex} · {patient.age}세</small>
            </button>
          ))}
          {visiblePatients.length === 0 && <p>검색된 환자가 없습니다.</p>}
        </div>
      </aside>

      <main className="prescription-order-content">
        {selectedPatient ? (
          <>
            <header className="prescription-order-patient-banner">
              <div><span>선택 환자</span><strong>{selectedPatient.name}</strong><small>{selectedPatient.id} · {selectedPatient.sex} · {selectedPatient.age}세</small></div>
              <div><span>연결 진료</span><strong>{encounterId ? `Encounter #${encounterId}` : '진료 연결 확인 필요'}</strong><small>{encounterId ? '현재 진료에 새 오더와 처방이 저장됩니다.' : '새 기록을 만들려면 진료 연결이 필요합니다.'}</small></div>
            </header>

            <nav className="order-workspace-tabs" aria-label="오더·처방 구분">
              <button className={activeTab === 'orders' ? 'active' : ''} onClick={() => setActiveTab('orders')} type="button"><ClipboardList size={16} />검사·시술 오더</button>
              <button className={activeTab === 'prescriptions' ? 'active' : ''} onClick={() => setActiveTab('prescriptions')} type="button"><Pill size={16} />약물 처방</button>
            </nav>

            {activeTab === 'orders' ? (
              <OrderPanel patientId={selectedPatient.backendId} encounterId={encounterId} />
            ) : (
              <PrescriptionPanel patientId={selectedPatient.backendId} encounterId={encounterId} />
            )}
          </>
        ) : (
          <div className="prescription-order-empty"><Stethoscope size={30} /><strong>오더·처방을 확인할 환자를 선택해주세요.</strong><span>왼쪽 환자 목록에서 환자를 선택하면 전체 이력을 불러옵니다.</span></div>
        )}
      </main>
    </section>
  )
}
