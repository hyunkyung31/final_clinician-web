import { useEffect, useState } from 'react'
import { LoaderCircle, Search, X } from 'lucide-react'
import { getPatients } from '../api/client'
import type { PatientSummary } from '../types'

export function ExaminationPatientSearch({ patients, onSelect }: {
  patients: PatientSummary[]
  onSelect: (patient: PatientSummary) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PatientSummary[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const keyword = query.trim()

  useEffect(() => {
    setResults(null)
    setError('')
    setLoading(Boolean(keyword))
    if (!keyword) return
    let active = true
    const timer = window.setTimeout(() => {
      void getPatients(keyword)
        .then((items) => { if (active) setResults(items) })
        .catch((requestError) => { if (active) setError(requestError instanceof Error ? requestError.message : '환자 검색에 실패했습니다.') })
        .finally(() => { if (active) setLoading(false) })
    }, 250)
    return () => { active = false; window.clearTimeout(timer) }
  }, [keyword])

  const shown = (results ?? patients.filter((patient) =>
    `${patient.name} ${patient.id}`.toLowerCase().includes(keyword.toLowerCase()),
  )).slice(0, 20)

  return (
    <section className="exam-patient-search">
      <label><Search size={17} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') setQuery('') }} placeholder="환자 이름 또는 환자번호 검색" aria-label="환자 이름 또는 환자번호 검색" />{loading && <LoaderCircle size={16} className="spin" />}{query && <button type="button" aria-label="환자 검색 지우기" onClick={() => setQuery('')}><X size={15} /></button>}</label>
      {keyword && <div className="exam-patient-search-results" aria-live="polite">
        {shown.map((patient) => <button key={patient.backendId ?? patient.id} type="button" onClick={() => { onSelect(patient); setQuery('') }}><strong>{patient.name}</strong><span>{patient.id} · {patient.sex === 'F' ? '여자' : '남자'} · {patient.age}세</span></button>)}
        {error && <p className="error">{error}</p>}
        {!loading && !error && shown.length === 0 && <p>검색 결과가 없습니다.</p>}
        {loading && shown.length === 0 && <p>환자를 검색하는 중…</p>}
      </div>}
    </section>
  )
}
