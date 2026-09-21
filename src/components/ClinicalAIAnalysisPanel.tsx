import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { BrainCircuit, CheckCircle2, LoaderCircle, TriangleAlert } from 'lucide-react'
import {
  createClinicalAIAnalysis,
  getClinicalAIAnalysis,
  type ClinicalAIAnalysis,
  type ClinicalInputPayload,
} from '../api/client'
import type { PatientDetail, PatientSummary } from '../types'
import { patientExaminationMismatch, type ExaminationPatientIdentity } from '../api/patientSelection'

type FieldKind = 'number' | 'binary' | 'select'

interface ClinicalField {
  name: string
  label: string
  kind: FieldKind
  step?: string
  options?: Array<{ value: string; label: string }>
}

interface ClinicalGroup {
  title: string
  description: string
  fields: ClinicalField[]
}

const binaryOptions = [
  { value: '0', label: '아니오' },
  { value: '1', label: '예' },
]

const binary = (name: string, label = name): ClinicalField => ({ name, label, kind: 'binary', options: binaryOptions })
const numeric = (name: string, label = name, step = '1'): ClinicalField => ({ name, label, kind: 'number', step })

const groups: ClinicalGroup[] = [
  {
    title: '기본 정보',
    description: '신체 계측과 기본 인구학 정보',
    fields: [
      numeric('Age', '나이'), numeric('Weight', '체중 (kg)'), numeric('Length', '신장 (cm)'),
      { name: 'Sex', label: '성별', kind: 'binary', options: [
        { value: '0', label: '여자' }, { value: '1', label: '남자' },
      ] }, numeric('BMI', 'BMI', '0.01'),
    ],
  },
  {
    title: '병력 및 위험인자',
    description: '진단 여부는 예/아니오로 선택',
    fields: [
      binary('DM', '당뇨'), binary('HTN', '고혈압'), binary('Current Smoker', '현재 흡연'),
      binary('EX-Smoker', '과거 흡연'), binary('FH', '심혈관 가족력'), binary('Obesity', '비만'),
      binary('CRF', '만성 신부전'), binary('CVA', '뇌혈관질환'), binary('Airway disease', '기도 질환'),
      binary('Thyroid Disease', '갑상선 질환'), binary('CHF', '심부전'), binary('DLP', '이상지질혈증'),
    ],
  },
  {
    title: '진찰 및 증상',
    description: '활력징후, 신체진찰, 흉통 관련 정보',
    fields: [
      numeric('BP', '수축기 혈압'), numeric('PR', '맥박'), binary('Edema', '부종'),
      binary('Weak Peripheral Pulse', '말초 맥박 약화'), binary('Lung rales', '폐 수포음'),
      binary('Systolic Murmur', '수축기 심잡음'), binary('Diastolic Murmur', '이완기 심잡음'),
      binary('Typical Chest Pain', '전형적 흉통'), binary('Dyspnea', '호흡곤란'),
      numeric('Function Class', '기능 등급'), binary('Atypical', '비전형적 흉통'),
      binary('Nonanginal', '비협심증성 흉통'), binary('LowTH Ang', '저역치 협심증'),
    ],
  },
  {
    title: '심전도 및 심초음파',
    description: 'ECG 소견과 심초음파 결과',
    fields: [
      binary('Q Wave', 'Q파'), binary('St Elevation', 'ST 상승'), binary('St Depression', 'ST 하강'),
      binary('Tinversion', 'T파 역전'), binary('LVH', '좌심실 비대'),
      binary('Poor R Progression', 'R파 진행 불량'),
      { name: 'BBB', label: '각차단 (BBB)', kind: 'select', options: [
        { value: 'N', label: '없음' }, { value: 'LBBB', label: 'LBBB' }, { value: 'RBBB', label: 'RBBB' },
      ] },
      numeric('EF-TTE', '박출률 EF (%)'), numeric('Region RWMA', '국소벽운동 이상'),
      { name: 'VHD', label: '판막질환 (VHD)', kind: 'select', options: [
        { value: 'N', label: '없음' }, { value: 'mild', label: '경도' },
        { value: 'Moderate', label: '중등도' }, { value: 'Severe', label: '중증' },
      ] },
    ],
  },
  {
    title: '혈액검사',
    description: '선택한 차수의 확정 검사 수치 · 분석 전 수정 가능',
    fields: [
      numeric('FBS', '공복혈당'), numeric('CR', 'Creatinine', '0.01'), numeric('TG', '중성지방'),
      numeric('LDL'), numeric('HDL', 'HDL', '0.01'), numeric('BUN'), numeric('ESR'),
      numeric('HB', 'Hemoglobin', '0.01'), numeric('K', 'Potassium', '0.01'), numeric('Na', 'Sodium'),
      numeric('WBC'), numeric('Lymph'), numeric('Neut'), numeric('PLT'),
    ],
  },
]

const allFields = groups.flatMap((group) => group.fields)

function normalizeSex(value: string | undefined) {
  if (value === '0' || value === '1') return value
  const text = (value ?? '').trim().toLowerCase()
  if (['male', 'm', 'man', '남', '남자'].includes(text)) return '1'
  if (['female', 'f', 'woman', '여', '여자'].includes(text)) return '0'
  return value
}

function initialValues(
  patient: PatientSummary | null,
  detail: PatientDetail | null,
  initialInput: Record<string, number | string>,
) {
  const values: Record<string, string> = Object.fromEntries(
    Object.entries(initialInput).map(([name, value]) => [name, String(value)]),
  )
  const mappedSex = normalizeSex(values.Sex)
  if (mappedSex !== undefined) values.Sex = mappedSex
  if (patient) {
    values.Age ??= String(detail?.age ?? patient.age)
    const sex = detail?.sex ?? patient.sex
    if (sex === 'M') values.Sex ??= '1'
    else if (sex === 'F') values.Sex ??= '0'
  }
  return values
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

export function ClinicalAIAnalysisPanel({
  patient,
  patientDetail,
  examinationId,
  examinationPatient,
  initialInput = {},
  sourceLabel = '',
}: {
  patient: PatientSummary | null
  patientDetail: PatientDetail | null
  examinationId?: number
  examinationPatient?: ExaminationPatientIdentity | null
  initialInput?: Record<string, number | string>
  sourceLabel?: string
}) {
  const initialInputKey = JSON.stringify(initialInput)
  const [values, setValues] = useState<Record<string, string>>(() => initialValues(patient, patientDetail, initialInput))
  const [analysis, setAnalysis] = useState<ClinicalAIAnalysis | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setValues(initialValues(patient, patientDetail, initialInput))
    setAnalysis(null)
    setError('')
  }, [patient?.backendId, patientDetail?.backendId, examinationId, initialInputKey])

  const completedCount = useMemo(
    () => allFields.filter((field) => values[field.name] !== undefined && values[field.name] !== '').length,
    [values],
  )

  const updateValue = (name: string, value: string) => {
    setValues((current) => {
      const next = { ...current, [name]: value }
      if ((name === 'Weight' || name === 'Length') && Number(next.Weight) > 0 && Number(next.Length) > 0) {
        next.BMI = (Number(next.Weight) / ((Number(next.Length) / 100) ** 2)).toFixed(2)
      }
      return next
    })
  }

  const mismatch = patientExaminationMismatch(patient, examinationPatient)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (mismatch) {
      console.error('Selected patient and examination patient mismatch')
      setError('선택한 환자의 검사정보를 다시 불러와 주세요.')
      return
    }
    if (!examinationId) {
      setError('AI 분석을 연결할 검사(Examination)가 없습니다. 먼저 검사 기록을 선택해주세요.')
      return
    }
    const missing = allFields.filter((field) => values[field.name] === undefined || values[field.name] === '')
    if (missing.length > 0) {
      setError(`필수 입력 ${missing.length}개가 남았습니다: ${missing.slice(0, 5).map((field) => field.label).join(', ')}${missing.length > 5 ? ' 외' : ''}`)
      return
    }
    const payload: ClinicalInputPayload = {}
    allFields.forEach((field) => {
      payload[field.name] = field.kind === 'select' ? values[field.name] : Number(values[field.name])
    })

    setSubmitting(true)
    setError('')
    setAnalysis(null)
    try {
      let current = await createClinicalAIAnalysis(examinationId, payload)
      setAnalysis(current)
      for (let attempt = 0; attempt < 60 && !['SUCCEEDED', 'FAILED'].includes(current.analysis.status); attempt += 1) {
        await sleep(1000)
        current = await getClinicalAIAnalysis(current.analysis.id)
        setAnalysis(current)
      }
      if (current.analysis.status === 'FAILED') {
        setError(current.jobs.find((job) => job.error_message)?.error_message ?? 'Clinical AI 분석에 실패했습니다.')
      } else if (current.analysis.status !== 'SUCCEEDED') {
        setError('분석이 계속 진행 중입니다. 잠시 후 다시 확인해주세요.')
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Clinical AI 분석을 요청하지 못했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  const result = analysis?.results?.find((item) => item.result_type === 'RISK_PREDICTION')
  const probability = result?.result_json.probability

  return (
    <form className="clinical-ai-panel" onSubmit={submit}>
      <header className="clinical-ai-hero">
        <span className="clinical-ai-icon"><BrainCircuit size={24} /></span>
        <div>
          <small>CLINICAL RISK MODEL · RANDOM FOREST</small>
          <h2>{sourceLabel ? `${sourceLabel} · Clinical AI 분석` : 'Clinical AI 분석'}</h2>
          {patient && <p><strong>{patient.name}</strong> · {patient.id} · {patient.sex === 'F' ? '여자' : '남자'}</p>}
          <p>임상 변수 54개를 검증한 뒤 배포된 모델로 관상동맥질환 위험도를 계산합니다.</p>
        </div>
        <div className="clinical-ai-progress"><strong>{completedCount}/54</strong><span>입력 완료</span></div>
      </header>

      {mismatch && <div className="clinical-ai-warning"><TriangleAlert size={16} />선택한 환자의 검사정보를 다시 불러와 주세요.</div>}
      {!examinationId && <div className="clinical-ai-warning"><TriangleAlert size={16} />선택된 검사 ID가 없어 실행 버튼이 비활성화됩니다.</div>}
      {sourceLabel && <div className="clinical-ai-prefill"><CheckCircle2 size={16} /><span><strong>{sourceLabel}</strong>에 연결된 임상정보와 검사값을 자동 입력했습니다. 분석 전에 값을 확인할 수 있습니다.</span></div>}
      {completedCount < 54 && <div className="clinical-ai-warning"><TriangleAlert size={16} />현재 저장된 임상정보를 자동으로 불러왔습니다. 누락된 항목은 확인 후 직접 입력해 주세요.</div>}
      {error && <div className="feature-error"><span>{error}</span></div>}

      <div className="clinical-ai-groups">
        {groups.map((group, index) => (
          <details className="clinical-ai-group" key={group.title} open={index === 0}>
            <summary><span><strong>{group.title}</strong><small>{group.description}</small></span><b>{(() => {
              const filled = group.fields.filter((field) => values[field.name] !== undefined && values[field.name] !== '').length
              const needed = group.fields.length - filled
              return needed > 0 ? `${filled}/${group.fields.length} · 직접 입력 필요` : `${filled}/${group.fields.length} · 자동 입력됨`
            })()}</b></summary>
            <div className="clinical-ai-fields">
              {group.fields.map((field) => (
                <label key={field.name}>
                  <span>{field.label}<small>{field.name}</small></span>
                  {field.kind === 'number' ? (
                    <input type="number" step={field.step} value={values[field.name] ?? ''} onChange={(event) => updateValue(field.name, event.target.value)} required />
                  ) : (
                    <select value={values[field.name] ?? ''} onChange={(event) => updateValue(field.name, event.target.value)} required>
                      <option value="">선택</option>
                      {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  )}
                </label>
              ))}
            </div>
          </details>
        ))}
      </div>

      {analysis && (
        <section className={`clinical-ai-result ${result?.result_json.prediction === 1 ? 'high' : 'normal'}`}>
          <header><CheckCircle2 size={20} /><div><strong>{analysis.analysis.status === 'SUCCEEDED' ? '분석 완료' : '분석 진행 중'}</strong><small>Analysis #{analysis.analysis.id}</small></div></header>
          {result && <div className="clinical-ai-result-grid"><article><span>위험 확률</span><strong>{(Number(probability) * 100).toFixed(1)}%</strong></article><article><span>판정 기준</span><strong>{(result.result_json.threshold * 100).toFixed(1)}%</strong></article><article><span>최종 판정</span><strong>{result.result_json.prediction === 1 ? 'Significant' : 'Normal'}</strong></article></div>}
          {result?.result_json.warnings?.length ? <ul>{result.result_json.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}
        </section>
      )}

      <footer className="clinical-ai-actions">
        <span>Examination #{examinationId ?? '-'}</span>
        <button className="primary" disabled={submitting || mismatch || !examinationId || completedCount !== 54} type="submit">
          {submitting ? <LoaderCircle className="spin" size={16} /> : <BrainCircuit size={16} />}
          {submitting ? 'AI 분석 중…' : 'Clinical AI 분석 실행'}
        </button>
      </footer>
    </form>
  )
}
