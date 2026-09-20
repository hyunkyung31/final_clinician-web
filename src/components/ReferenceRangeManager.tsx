import { useEffect, useState, type FormEvent } from 'react'
import { ApiError, createClinicalReferenceRange, getBackendCapabilities, getClinicalReferenceRanges, getClinicalVariables, getReferenceRangeAuditLogs, getReferenceRangeFormFields, versionClinicalReferenceRange, type ApiFormField } from '../api/client'

type Row = Record<string, unknown>
const labels: Record<string, string> = {
  lower_bound: '정상 하한', upper_bound: '정상 상한', lower_inclusive: '하한 포함', upper_inclusive: '상한 포함',
  unit: '단위', gender: '성별', min_age_years: '최소 연령', max_age_years: '최대 연령', reference_type: '기준 유형', source: '출처',
  specimen_type: '검체 종류', method: '검사 방법', test_method: '검사 방법', analyzer: '분석 장비', is_fasting: '공복 필요 여부', fasting_required: '공복 필요 여부',
  critical_lower_bound: '위험 하한', critical_upper_bound: '위험 상한', effective_from: '적용 시작일', effective_to: '적용 종료일',
  approved_by: '승인자', approved_at: '승인 시각', version: '버전', is_active: '활성 상태', reason: '변경 사유', description: '설명',
}
const text = (value: unknown) => value == null ? '미제공' : typeof value === 'boolean' ? value ? '예' : '아니오' : String(value)

export function ReferenceRangeManager({ staffRoles }: { staffRoles: string[] }) {
  const admin = staffRoles.some((role) => ['ADMIN', 'SYSTEM_ADMIN', 'SUPERUSER'].includes(role.toUpperCase()))
  const [variables, setVariables] = useState<Row[]>([])
  const [variableId, setVariableId] = useState('')
  const [ranges, setRanges] = useState<Row[]>([])
  const [fields, setFields] = useState<ApiFormField[]>([])
  const [values, setValues] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState<number | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [audit, setAudit] = useState<Row[] | null>(null)
  const [available, setAvailable] = useState(false)
  const [createAvailable, setCreateAvailable] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!admin) return
    let active = true
    Promise.all([getClinicalVariables(), getBackendCapabilities()]).then(([items, capability]) => { if (active) { setVariables(items); setAvailable(capability.referenceAdministration); setCreateAvailable(capability.referenceRangeCreate) } }).catch((e) => { if (active) setError(e instanceof Error ? e.message : '정상범위 정보 조회 실패') })
    return () => { active = false }
  }, [admin])
  useEffect(() => {
    setRanges([]); setAudit(null); setFormOpen(false)
    if (!admin || !variableId) return
    let active = true
    setBusy(true); setError('')
    void getClinicalReferenceRanges(Number(variableId)).then((items) => { if (active) setRanges(items) }).catch((e) => { if (active) setError(e instanceof Error ? e.message : '정상범위 조회 실패') }).finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [admin, variableId, revision])
  if (!admin) return null
  const edit = async (row?: Row) => {
    setBusy(true); setError(''); setAudit(null)
    try {
      const contract = await getReferenceRangeFormFields(Boolean(row))
      if (!contract.length) throw new Error('정상범위 등록·변경 기능이 아직 준비되지 않았습니다.')
      setFields(contract); setEditing(row ? Number(row.id) : null)
      setValues(Object.fromEntries(contract.map((field) => [field.name, row?.[field.name] == null ? '' : String(row[field.name])])))
      setFormOpen(true)
    } catch (e) { setError(e instanceof Error ? e.message : '정상범위 편집 준비 실패') } finally { setBusy(false) }
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const payload: Row = {}
      for (const field of fields) {
        const value = values[field.name] ?? ''
        if (!value && !field.required) continue
        if (field.type === 'boolean') payload[field.name] = value === 'true'
        else if (field.type === 'number' || field.type === 'integer') {
          const number = Number(value)
          if (!Number.isFinite(number) || (field.type === 'integer' && !Number.isInteger(number))) throw new Error(`${labels[field.name] ?? field.label}: 올바른 숫자를 입력해 주세요.`)
          payload[field.name] = number
        } else payload[field.name] = field.format === 'date-time' && value ? new Date(value).toISOString() : value
      }
      if (editing) await versionClinicalReferenceRange(editing, payload)
      else await createClinicalReferenceRange(Number(variableId), payload)
      setFormOpen(false); setRevision((value) => value + 1)
    } catch (e) {
      setError(e instanceof ApiError && e.payload ? Object.entries(e.payload).map(([key, value]) => `${labels[key] ?? key}: ${Array.isArray(value) ? value.join(', ') : String(value)}`).join(' · ') : e instanceof Error ? e.message : '정상범위 저장 실패')
    } finally { setBusy(false) }
  }
  return <section className="feature-card reference-manager">
    <header><div><h2>정상범위 관리</h2><p>시스템 관리자 · 변경 시 새 버전 생성</p></div></header>
    {!available && <p className="api-state-panel">현재 서버에서는 정상범위 조회를 사용할 수 있습니다. 버전 변경·감사 이력 기능은 배포 후 활성화됩니다.</p>}
    {available && !createAvailable && <p className="api-state-panel">신규 등록 API는 아직 배포되지 않았습니다. 기존 항목의 "새 버전으로 변경"과 감사 이력 조회는 사용할 수 있습니다.</p>}
    <label>검사 항목<select value={variableId} disabled={busy} onChange={(e) => setVariableId(e.target.value)}><option value="">검사 항목 선택</option>{variables.map((variable) => <option key={Number(variable.id)} value={Number(variable.id)}>{String(variable.name)} · {String(variable.code)}</option>)}</select></label>
    {error && <p className="api-inline-error" role="alert">{error}</p>}
    <button type="button" disabled={!createAvailable || !variableId || busy} onClick={() => edit()}>정상범위 등록</button>
    <div className="reference-range-list">{ranges.map((row) => <article key={Number(row.id)}><strong>{text(row.lower_bound)} ~ {text(row.upper_bound)} {text(row.unit)}</strong><small>{text(row.effective_from)} ~ {text(row.effective_to)} · 버전 {text(row.version)} · {row.is_active === false ? '비활성' : '활성'}</small><dl>{Object.entries(row).filter(([key]) => labels[key]).map(([key, value]) => <div key={key}><dt>{labels[key]}</dt><dd>{text(value)}</dd></div>)}</dl><button type="button" disabled={!available || busy} onClick={() => edit(row)}>새 버전으로 변경</button><button type="button" disabled={!available || busy} onClick={async () => { setBusy(true); setError(''); try { setAudit(await getReferenceRangeAuditLogs(Number(row.id))) } catch (e) { setError(e instanceof Error ? e.message : '이력 조회 실패') } finally { setBusy(false) } }}>변경 이력</button></article>)}</div>
    {formOpen && <form className="reference-edit-form" onSubmit={submit}><h3>{editing ? '정상범위 새 버전' : '정상범위 등록'}</h3><div className="form-columns">{fields.map((field) => <label key={field.name}>{labels[field.name] ?? field.label}{field.enum || field.type === 'boolean' ? <select required={field.required} value={values[field.name] ?? ''} onChange={(e) => setValues((items) => ({ ...items, [field.name]: e.target.value }))}><option value="">선택</option>{(field.enum ?? ['true', 'false']).map((value) => <option key={value} value={value}>{value === 'true' ? '예' : value === 'false' ? '아니오' : value}</option>)}</select> : <input required={field.required} type={field.format === 'date' ? 'date' : field.format === 'date-time' ? 'datetime-local' : ['number', 'integer'].includes(field.type) ? 'number' : 'text'} step={field.type === 'integer' ? '1' : 'any'} value={values[field.name] ?? ''} onChange={(e) => setValues((items) => ({ ...items, [field.name]: e.target.value }))} />}</label>)}</div><button disabled={busy} type="submit">{editing ? '새 버전 저장' : '등록'}</button><button disabled={busy} type="button" onClick={() => setFormOpen(false)}>취소</button></form>}
    {audit && <section className="reference-audit"><h3>정상범위 변경 이력</h3>{!audit.length && <p>변경 이력이 없습니다.</p>}{audit.map((entry, index) => <article key={String(entry.id ?? index)}><strong>{text(entry.action ?? entry.operation)}</strong><small>{text(entry.created_at ?? entry.timestamp)} · {text(entry.actor_name ?? entry.user_name ?? entry.actor)}</small>{['before', 'after'].map((side) => { const data = entry[side] ?? entry[`${side}_json`]; return data && typeof data === 'object' ? <div key={side}><b>{side === 'before' ? '변경 전' : '변경 후'}</b><dl>{Object.entries(data).map(([key, value]) => <div key={key}><dt>{labels[key] ?? key}</dt><dd>{text(value)}</dd></div>)}</dl></div> : null })}</article>)}</section>}
  </section>
}
