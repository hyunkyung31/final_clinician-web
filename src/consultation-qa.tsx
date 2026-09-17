// Development-only fixture. Every API request is intercepted; no real medical record is modified.
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ConsultationWorkspace } from './components/ConsultationWorkspace'
import './styles.css'
import './consultation.css'
import type { PatientSummary } from './types'

const patients: PatientSummary[] = [
  { backendId: 101, id: 'QA-0101', name: '테스트 환자 A', sex: 'M', age: 67, exam: 'CT · CAG', risk: 'high', status: 'waiting', note: '' },
  { backendId: 102, id: 'QA-0102', name: '테스트 환자 B', sex: 'F', age: 48, exam: '혈액검사', risk: 'normal', status: 'complete', note: '' },
]
const consultations = [
  { id: 1, patient_id: 101, patient_name: '테스트 환자 A', subject: '시술 전 평가 의견 요청', request_note: '검사 결과를 검토하고 시술 전 평가 의견을 회신해주세요.', requested_by: 20, requested_by_name: '의뢰 의료진', requested_department_name: '흉부외과', assigned_doctor_id: 7, assigned_doctor_name: '담당 의료진', assigned_department_name: '순환기내과', priority: 'URGENT', status: 'REQUESTED', created_at: '2026-09-17T00:00:00Z', due_at: '2026-09-17T02:00:00Z', opinions: [] as Record<string, unknown>[] },
  { id: 2, patient_id: 102, patient_name: '테스트 환자 B', subject: '검사 결과 검토 요청', request_note: '관련 검사결과에 대한 의견을 요청드립니다.', requested_by: 20, requested_by_name: '의뢰 의료진', assigned_doctor_id: 7, assigned_doctor_name: '담당 의료진', assigned_department_name: '순환기내과', priority: 'NORMAL', status: 'ACCEPTED', created_at: '2026-09-16T00:00:00Z', due_at: '', opinions: [] as Record<string, unknown>[] },
  { id: 3, patient_id: 101, patient_name: '테스트 환자 A', subject: '추가 검사 필요 여부', request_note: '추가 검사 필요 여부에 대한 의견을 부탁드립니다.', requested_by: 10, requested_by_name: '현재 사용자', assigned_doctor_id: 8, assigned_doctor_name: '다른 의료진', assigned_department_name: '신장내과', priority: 'NORMAL', status: 'COMPLETED', created_at: '2026-09-15T00:00:00Z', due_at: '', opinions: [{ id: 1, doctor_name: '다른 의료진', opinion_text: 'QA 테스트용 최종 소견입니다.', is_final: true, created_at: '2026-09-15T01:00:00Z' }] },
]
let failCompleteOnce = false
let nextOpinionId = 10
window.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, window.location.origin)
  if (url.pathname === '/api/doctors/') return Response.json([{ id: 7, user_id: 10, name: '담당 의료진', department_name: '순환기내과', is_active: true }, { id: 8, user_id: 20, name: '다른 의료진', department_name: '신장내과', is_active: true }])
  if (url.pathname === '/api/consultations/') {
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body))
      consultations.push({ ...consultations[0], ...body, id: consultations.length + 1, patient_name: patients.find((patient) => patient.backendId === body.patient_id)?.name || '', request_note: body.note, requested_by: 10, requested_by_name: '현재 사용자', status: 'REQUESTED', created_at: new Date().toISOString(), opinions: [] })
      return Response.json({}, { status: 201 })
    }
    return Response.json(consultations)
  }
  const match = url.pathname.match(/^\/api\/consultations\/(\d+)\/(accept\/|complete\/|withdraw\/|opinions\/)?$/)
  const item = match && consultations.find((entry) => entry.id === Number(match[1]))
  if (!item) return Response.json({ detail: 'QA fixture: API blocked' }, { status: 404 })
  if (match![2] === 'accept/') item.status = 'ACCEPTED'
  if (match![2] === 'complete/') {
    if (failCompleteOnce) { failCompleteOnce = false; return Response.json({ detail: 'QA: 완료 처리 일시 실패' }, { status: 503 }) }
    item.status = 'COMPLETED'
  }
  if (match![2] === 'withdraw/') item.status = 'CANCELED'
  if (match![2] === 'opinions/') {
    const body = JSON.parse(String(init?.body))
    item.opinions.push({ id: nextOpinionId++, doctor_name: '담당 의료진', ...body, created_at: new Date().toISOString() })
  }
  return Response.json({ consultation: item, opinions: item.opinions })
}
function QA() {
  const [theme, setTheme] = useState('light')
  const [result, setResult] = useState('가상 데이터 · 실제 서버 호출 없음')
  return <><div style={{ position: 'fixed', zIndex: 90, right: 20, top: 8, display: 'flex', gap: 8 }}><button onClick={() => { const next = theme === 'light' ? 'dark' : 'light'; setTheme(next); document.documentElement.dataset.theme = next }}>테마 전환</button><button onClick={() => { failCompleteOnce = true }}>완료 실패 1회</button></div><div style={{ position: 'fixed', zIndex: 90, bottom: 0, right: 20, color: 'var(--color-text-subtle)', fontSize: 11 }}>{result}</div><ConsultationWorkspace patients={patients} initialPatientId={101} currentUserId={10} currentDoctorId={7} onOpenPatient={(id, section) => setResult('바로가기 확인: ' + id + ' / ' + section)} /></>
}
createRoot(document.getElementById('root')!).render(<QA />)
