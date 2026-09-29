import { useMemo, useState } from 'react'
import { Pill, Search } from 'lucide-react'

import type { PatientSummary } from '../types'
import { PrescriptionPanel } from './PrescriptionPanel'

interface OrderWorkspaceProps {
  patients: PatientSummary[]
  selectedPatient: PatientSummary | null
  encounterId: number | null
  onSelectPatient: (patient: PatientSummary) => void
}

export function OrderWorkspace({
  patients,
  selectedPatient,
  encounterId,
  onSelectPatient,
}: OrderWorkspaceProps) {
  const [query, setQuery] = useState('')
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
          <span><Pill size={17} /><strong>환자별 처방</strong></span>
          <small>환자를 선택하면 해당 환자의 처방만 조회합니다.</small>
        </header>

        <label>
          <Search size={14} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="환자명 또는 환자번호 검색"
          />
        </label>

        <div>
          {visiblePatients.map((patient) => (
            <button
              className={patient.backendId === selectedPatient?.backendId ? 'active' : ''}
              key={patient.backendId}
              onClick={() => onSelectPatient(patient)}
              type="button"
            >
              <strong>{patient.name}</strong>
              <span>{patient.id}</span>
              <small>{patient.sex} · {patient.age}세</small>
            </button>
          ))}
          {visiblePatients.length === 0 && <p>검색된 환자가 없습니다.</p>}
        </div>
      </aside>

      <main className="prescription-order-content">
        {selectedPatient ? (
          <>
            <header className="prescription-order-patient-banner">
              <div>
                <span>선택 환자</span>
                <strong>{selectedPatient.name}</strong>
                <small>{selectedPatient.id} · {selectedPatient.sex} · {selectedPatient.age}세</small>
              </div>
              <div>
                <span>연결 진료</span>
                <strong>{encounterId ? `Encounter #${encounterId}` : '진료 연결 확인 필요'}</strong>
                <small>{encounterId ? '현재 환자의 진료에 처방이 저장됩니다.' : '새 처방을 만들려면 진료 기록이 필요합니다.'}</small>
              </div>
            </header>

            <PrescriptionPanel
              patientId={selectedPatient.backendId}
              encounterId={encounterId}
            />
          </>
        ) : (
          <div className="prescription-order-empty">
            <Pill size={30} />
            <strong>처방을 조회할 환자를 선택해주세요.</strong>
            <span>왼쪽 환자 목록에서 환자를 선택하면 처방 이력을 불러옵니다.</span>
          </div>
        )}
      </main>
    </section>
  )
}
