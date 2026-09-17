import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { correctExaminationResult, finalizeExaminationResult, getClinicalVariables, getExaminationResultDetail, saveClinicalMeasurements, updateClinicalMeasurement } from '../api/client'

type Row = Record<string, unknown>
const record = (value: unknown): value is Row => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

export function LabResultEditor({ resultId, onClose, onSaved }: { resultId: number; onClose: () => void; onSaved: () => void }) {
  const [activeId, setActiveId] = useState(resultId)
  const [detail, setDetail] = useState<Row | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [originals, setOriginals] = useState<Row[]>([])
  const [variables, setVariables] = useState<Row[]>([])
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const result = detail && record(detail.result) ? detail.result : detail
  const status = String(result?.status ?? '')
  const load = async (id: number) => {
    const response = await getExaminationResultDetail(id)
    const items = Array.isArray(response.measurements) ? response.measurements.filter(record) : []
    setDetail(response); setRows(items); setOriginals(items)
  }
  useEffect(() => {
    let active = true
    setBusy(true)
    Promise.all([getExaminationResultDetail(activeId), getClinicalVariables()]).then(([response, vars]) => {
      if (!active) return
      const items = Array.isArray(response.measurements) ? response.measurements.filter(record) : []
      setDetail(response); setRows(items); setOriginals(items); setVariables(vars)
    }).catch((e) => { if (active) setError(e instanceof Error ? e.message : '검사 결과 조회 실패') }).finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [activeId])
  const action = async (operation: () => Promise<void>) => {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try { await operation() } catch (e) { setError(e instanceof Error ? e.message : '저장 실패') } finally { setBusy(false) }
  }
  const save = () => action(async () => {
    if (status !== 'DRAFT') throw new Error('초안 상태에서만 검사값을 수정할 수 있습니다.')
    for (const row of rows) {
      if (row.value_numeric != null && (!String(row.value_numeric).trim() || !Number.isFinite(Number(row.value_numeric)))) throw new Error(`${String(row.display_name ?? row.name ?? '검사 항목')}: 숫자를 입력해 주세요.`)
    }
    for (const row of rows.filter((item) => item.id)) {
      const before = originals.find((item) => item.id === row.id)
      if (before?.value_numeric === row.value_numeric && before?.value_text === row.value_text && before?.value_boolean === row.value_boolean && before?.unit === row.unit) continue
      const payload = row.value_numeric != null ? { value_numeric: row.value_numeric, unit: row.unit } : row.value_boolean != null ? { value_boolean: row.value_boolean, unit: row.unit } : { value_text: row.value_text, unit: row.unit }
      await updateClinicalMeasurement(Number(row.id), payload)
      setOriginals((items) => items.map((item) => item.id === row.id ? row : item))
    }
    const added = rows.filter((row) => !row.id).map((row) => ({ clinical_variable_id: Number(row.clinical_variable_id), value_numeric: row.value_numeric, unit: row.unit }))
    if (added.length) await saveClinicalMeasurements(activeId, added)
    await load(activeId); onSaved(); setNotice('검사값을 초안으로 저장했습니다.')
  })
  return <div className="feature-modal-backdrop"><section className="feature-modal lab-edit-modal">
    <header><div><h2>검사 결과 편집</h2><small>결과 #{activeId} · {status || '조회 중'}</small></div><button type="button" disabled={busy} onClick={onClose} aria-label="닫기"><X size={18} /></button></header>
    <p>이 화면은 실제 검사 결과를 변경합니다. AI 분석 입력 수정은 별도로 사용할 수 있습니다.</p>
    {error && <p className="api-inline-error">{error}</p>}{notice && <p role="status">{notice}</p>}
    {status === 'FINAL' && <div className="api-state-panel"><p>확정 결과는 직접 수정할 수 없습니다. 정정 사유를 입력하면 기존 기록을 보존한 새 초안을 생성합니다.</p><label>정정 사유<input value={reason} onChange={(e) => setReason(e.target.value)} /></label><button type="button" disabled={busy || !reason.trim()} onClick={() => action(async () => { const response = await correctExaminationResult(activeId, reason.trim()); const next = record(response.new_result) ? Number(response.new_result.id) : NaN; if (!Number.isInteger(next)) throw new Error('정정 결과 ID를 확인하지 못했습니다.'); setActiveId(next); onSaved() })}>정정 초안 생성</button></div>}
    <div className="lab-edit-rows">{rows.map((row, index) => <label key={String(row.id ?? `new-${index}`)}><span>{String(row.display_name ?? row.name ?? variables.find((v) => Number(v.id) === Number(row.clinical_variable_id))?.name ?? '추가 항목')}</span>{row.value_boolean != null ? <select disabled={status !== 'DRAFT' || busy} value={String(row.value_boolean)} onChange={(e) => setRows((items) => items.map((item, i) => i === index ? { ...item, value_boolean: e.target.value === 'true' } : item))}><option value="true">예</option><option value="false">아니오</option></select> : <input type={row.value_numeric != null ? 'number' : 'text'} step="any" disabled={status !== 'DRAFT' || busy} value={String(row.value_numeric ?? row.value_text ?? '')} onChange={(e) => setRows((items) => items.map((item, i) => i === index ? { ...item, [row.value_numeric != null ? 'value_numeric' : 'value_text']: e.target.value } : item))} />}<small>{String(row.unit ?? '')}</small></label>)}</div>
    {status === 'DRAFT' && <label>검사 항목 추가<select value="" disabled={busy} onChange={(e) => { const variable = variables.find((item) => Number(item.id) === Number(e.target.value)); if (variable) setRows((items) => [...items, { clinical_variable_id: variable.id, name: variable.name, value_numeric: '', unit: variable.default_unit ?? '' }]) }}><option value="">항목 선택</option>{variables.filter((v) => v.value_type === 'NUMERIC' && !rows.some((row) => Number(row.clinical_variable_id ?? row.clinical_variable) === Number(v.id))).map((v) => <option key={Number(v.id)} value={Number(v.id)}>{String(v.name)}</option>)}</select></label>}
    <footer><button type="button" disabled={busy} onClick={onClose}>닫기</button>{status === 'DRAFT' && <><button type="button" disabled={busy} onClick={save}>초안 저장</button><button type="button" disabled={busy || JSON.stringify(rows) !== JSON.stringify(originals)} title="수정한 값을 먼저 저장해 주세요" onClick={() => action(async () => { await finalizeExaminationResult(activeId); await load(activeId); onSaved(); setNotice('검사 결과를 확정했습니다.') })}>최종 확정</button></>}</footer>
  </section></div>
}
