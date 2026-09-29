import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  ArrowDown,
  ArrowUp,
  BrainCircuit,
  CheckCircle2,
  Info,
  LoaderCircle,
  TriangleAlert,
} from 'lucide-react'

import {
  createClinicalAIAnalysis,
  getClinicalAIAnalysis,
  getStoredClinicalShap,
  loadLatestClinicalAnalysis,
  type ClinicalAIAnalysis,
  type ClinicalInputPayload,
  type ClinicalShapExplanation,
  type ClinicalShapFeature,
} from '../api/client'

import {
  clinicalFeatureNameForMeasurement,
  clinicalValueFromMeasurement,
  loadClinicalAiPrefill,
} from '../api/clinicalAiInput'

import {
  countLabReferenceStatuses,
  formatLabReferenceDisplay,
  isCriticalLabFlag,
  labReferenceStatus,
  labReferenceStatusClass,
} from '../labReferenceStatus'

import { CLINICAL_MODEL_DISCLOSURE } from '../clinicalModelDisclosure'
import { buildClinicalExamGuidance } from '../clinicalExamGuidance'
import {
  formatClinicalShapValue,
  rankClinicalShapFeatures,
  type RankedClinicalShapFeature,
} from '../clinicalShapPresentation'

import type {
  FollowUpMeasurement,
  PatientDetail,
  PatientSummary,
} from '../types'

import {
  patientExaminationMismatch,
  type ExaminationPatientIdentity,
} from '../api/patientSelection'

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
const fieldLabels = new Map(allFields.map((field) => [field.name, field.label]))
const fieldDefinitions = new Map(allFields.map((field) => [field.name, field]))
const laboratoryGroupIndex = groups.findIndex((group) => group.title === '혈액검사')
const laboratoryFieldNames = new Set(
  groups[laboratoryGroupIndex]?.fields.map((field) => field.name) ?? [],
)
const fieldGroups = new Map(
  groups.flatMap((group) => group.fields.map((field) => [field.name, group.title] as const)),
)

const featureUnits = new Map<string, string>([
  ['Age', '세'],
  ['Weight', 'kg'],
  ['Length', 'cm'],
  ['BMI', 'kg/m²'],
  ['BP', 'mmHg'],
  ['PR', '회/분'],
  ['EF-TTE', '%'],
])

function shapLabel(feature: string) {
  return fieldLabels.get(feature) ?? feature
}

function fieldAnchorId(fieldName: string) {
  return `clinical-ai-field-${fieldName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`
}

function formatModelNumber(value: string) {
  const number = Number(value)
  return Number.isFinite(number) ? String(Number(number.toFixed(4))) : value
}

function formatModelRangeWarning(warning: string) {
  const match = warning.match(
    /^(.+?)=(-?\d+(?:\.\d+)?) is outside the development range (-?\d+(?:\.\d+)?)[–-](-?\d+(?:\.\d+)?)$/,
  )
  if (!match) return warning
  return `${shapLabel(match[1])}: 입력 ${formatModelNumber(match[2])} · 모델 개발범위 ${formatModelNumber(match[3])}–${formatModelNumber(match[4])}`
}

function formatShapInputValue(
  item: RankedClinicalShapFeature,
  measurement?: FollowUpMeasurement,
) {
  const field = fieldDefinitions.get(item.feature)
  const rawValue = String(item.value)
  const option = field?.options?.find((candidate) => candidate.value === rawValue)

  if (option) return `${option.label} (${rawValue})`

  const numericValue = Number(item.value)
  const displayValue = Number.isFinite(numericValue)
    ? String(Number(numericValue.toFixed(4)))
    : rawValue
  const unit = measurement?.unit || featureUnits.get(item.feature)

  return unit ? `${displayValue} ${unit}` : displayValue
}

function shapWarningFeatures(warnings: string[]) {
  return new Set(
    warnings
      .map((warning) => warning.match(/^(.+?)=/)?.[1]?.trim())
      .filter((feature): feature is string => Boolean(feature)),
  )
}

function ShapExplanationPanel({
  items,
  warnings,
  measurementByField,
}: {
  items: ClinicalShapFeature[]
  warnings: string[]
  measurementByField: Map<string, FollowUpMeasurement>
}) {
  const rankedItems = rankClinicalShapFeatures(items)
  if (!rankedItems.length) return null

  const warningFeatures = shapWarningFeatures(warnings)
  const increasingCount = rankedItems.filter((item) => item.signedDirection === 'increase').length
  const decreasingCount = rankedItems.length - increasingCount

  return (
    <section className="clinical-ai-shap">
      <header>
        <div>
          <small>LOCAL EXPLANATION · SHAP</small>
          <h3>환자별 모델 기여도</h3>
          <p>현재 예측에서 모델 출력에 가장 크게 관여한 입력 변수입니다.</p>
        </div>

        <div className="clinical-ai-shap-summary" aria-label="SHAP 방향별 변수 수">
          <span className="increase">점수 높임 <strong>{increasingCount}</strong></span>
          <span className="decrease">점수 낮춤 <strong>{decreasingCount}</strong></span>
        </div>
      </header>

      <div className="clinical-ai-shap-axis" aria-hidden="true">
        <span>← 모델 점수 낮춤</span>
        <i>0</i>
        <span>모델 점수 높임 →</span>
      </div>

      <div className="clinical-ai-shap-list">
        {rankedItems.map((item) => {
          const increases = item.signedDirection === 'increase'
          const width = `${item.scalePercent / 2}%`
          const outOfModelRange = warningFeatures.has(item.feature)

          return (
            <article className={`clinical-ai-shap-row ${item.signedDirection}`} key={item.feature}>
              <div className="clinical-ai-shap-feature">
                <b>#{item.rank}</b>
                <span>
                  <strong>{shapLabel(item.feature)}</strong>
                  <small>{fieldGroups.get(item.feature) ?? '기타'} · {item.feature}</small>
                </span>
              </div>

              <div className="clinical-ai-shap-input">
                <span>입력값</span>
                <strong>{formatShapInputValue(item, measurementByField.get(item.feature))}</strong>
              </div>

              <div
                className="clinical-ai-shap-plot"
                role="img"
                aria-label={`${shapLabel(item.feature)} SHAP 기여값 ${formatClinicalShapValue(item.shap_value)}`}
              >
                <span className="clinical-ai-shap-zero" />
                <span
                  className="clinical-ai-shap-bar"
                  style={increases
                    ? { left: '50%', width }
                    : { right: '50%', width }}
                />
              </div>

              <div className="clinical-ai-shap-metric">
                <strong>{formatClinicalShapValue(item.shap_value)}</strong>
                <small>상위 변수 내 {item.relativePercent.toFixed(1)}%</small>
              </div>

              <div className="clinical-ai-shap-flags">
                {outOfModelRange && <em className="range">모델 범위 밖</em>}
                {item.imputed && <em className="imputed">자동 보정값</em>}
              </div>
            </article>
          )
        })}
      </div>

      <footer>
        <span><i className="increase" /> 양수: 모델 점수를 높이는 기여</span>
        <span><i className="decrease" /> 음수: 모델 점수를 낮추는 기여</span>
        <p>
          SHAP 값은 이 환자의 모델 출력에 대한 국소 기여도이며 인과관계, 임상적 중증도 또는 치료 효과를 의미하지 않습니다.
          상대 기여도는 화면에 표시된 상위 변수 안에서만 계산됩니다.
        </p>
      </footer>
    </section>
  )
}

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
  if (Number(values.Weight) > 0 && Number(values.Length) > 0 && !values.BMI) {
    values.BMI = (Number(values.Weight) / ((Number(values.Length) / 100) ** 2)).toFixed(2)
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
  initialMeasurements = [],
  sourceLabel = '',
  autoRun = false,
  onAutoRunConsumed,
}: {
  patient: PatientSummary | null
  patientDetail: PatientDetail | null
  examinationId?: number
  examinationPatient?: ExaminationPatientIdentity | null
  initialInput?: Record<string, number | string>
  initialMeasurements?: FollowUpMeasurement[]
  sourceLabel?: string
  autoRun?: boolean
  onAutoRunConsumed?: () => void
}) {
  const initialInputKey = JSON.stringify(initialInput)
  const initialMeasurementsKey = JSON.stringify(initialMeasurements)

  const [values, setValues] = useState<Record<string, string>>(
    () => initialValues(patient, patientDetail, initialInput),
  )

  const [resolvedMeasurements, setResolvedMeasurements] =
    useState<FollowUpMeasurement[]>(initialMeasurements)

  const [analysis, setAnalysis] = useState<ClinicalAIAnalysis | null>(null)

  const [savedExplanation, setSavedExplanation] = useState<ClinicalShapExplanation | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [resolvedExaminationId, setResolvedExaminationId] = useState(examinationId)
  const [resolvedSourceLabel, setResolvedSourceLabel] = useState(sourceLabel)
  const [resolvedExamPatient, setResolvedExamPatient] = useState(examinationPatient)
  const [activeGroupIndex, setActiveGroupIndex] = useState(0)
  const [attentionOnly, setAttentionOnly] = useState(false)
  const [analyzedValuesKey, setAnalyzedValuesKey] = useState('')
  const autoRunStarted = useRef(false)

  useEffect(() => {
    setAnalysis(null)
    setSavedExplanation(null)
    setError('')
    setResolvedExaminationId(examinationId)
    setResolvedSourceLabel(sourceLabel)
    setResolvedExamPatient(examinationPatient)
    setResolvedMeasurements(initialMeasurements)
    setActiveGroupIndex(0)
    setAttentionOnly(false)
    setAnalyzedValuesKey('')
    autoRunStarted.current = false

    if (Object.keys(initialInput).length > 0 || !patient?.backendId) {
      setValues(initialValues(patient, patientDetail, initialInput))
      return
    }

    let active = true
    void loadClinicalAiPrefill(patient.backendId, examinationId).then((loaded) => {
      if (!active) return

      setResolvedExaminationId(loaded.examinationId)
      setResolvedSourceLabel(loaded.sourceLabel)
      setResolvedExamPatient(loaded.examinationPatient)
      setResolvedMeasurements(loaded.measurements)
      setValues(initialValues(patient, patientDetail, loaded.input))
    })
    return () => {
      active = false
    }
  }, [
    patient?.backendId,
    patientDetail?.backendId,
    examinationId,
    examinationPatient?.id,
    initialInputKey,
    initialMeasurementsKey,
    sourceLabel,
  ])

  useEffect(() => {
    if (autoRun || !patient?.backendId || !resolvedExaminationId) return
    let active = true
    void loadLatestClinicalAnalysis(patient.backendId, resolvedExaminationId).then((loaded) => {
      if (active && loaded) {
        setAnalysis((current) => current ?? loaded)
        setAnalyzedValuesKey(JSON.stringify(values))
      }
    }).catch(() => {})
    return () => { active = false }
  }, [autoRun, patient?.backendId, resolvedExaminationId])

  const completedCount = useMemo(
    () => allFields.filter((field) => values[field.name] !== undefined && values[field.name] !== '').length,
    [values],
  )

  const measurementByField = useMemo(() => {
    const mapped = new Map<string, FollowUpMeasurement>()

    resolvedMeasurements.forEach((measurement) => {
      const fieldName = clinicalFeatureNameForMeasurement(measurement.code)
      if (fieldName) mapped.set(fieldName, measurement)
    })

    return mapped
  }, [resolvedMeasurements])

  const clinicalLabMeasurements = useMemo(
    () => [...laboratoryFieldNames]
      .map((fieldName) => measurementByField.get(fieldName))
      .filter((measurement): measurement is FollowUpMeasurement => Boolean(measurement)),
    [measurementByField],
  )

  const clinicalLabIssues = useMemo(
    () => [...laboratoryFieldNames].flatMap((fieldName) => {
      const measurement = measurementByField.get(fieldName)
      if (!measurement || labReferenceStatus(measurement) !== 'OUT_OF_RANGE') return []
      return [{ fieldName, measurement }]
    }),
    [measurementByField],
  )

  const clinicalLabCounts = useMemo(
    () => countLabReferenceStatuses(clinicalLabMeasurements),
    [clinicalLabMeasurements],
  )

  const criticalLabCount = useMemo(
    () => clinicalLabMeasurements.filter(isCriticalLabFlag).length,
    [clinicalLabMeasurements],
  )

  useEffect(() => {
    if (clinicalLabIssues.length > 0 && laboratoryGroupIndex >= 0) {
      setActiveGroupIndex(laboratoryGroupIndex)
    }
  }, [resolvedExaminationId, clinicalLabIssues.length])

  const updateValue = (name: string, value: string) => {
    setValues((current) => {
      const next = { ...current, [name]: value }
      if ((name === 'Weight' || name === 'Length') && Number(next.Weight) > 0 && Number(next.Length) > 0) {
        next.BMI = (Number(next.Weight) / ((Number(next.Length) / 100) ** 2)).toFixed(2)
      }
      return next
    })
  }

  const mismatch = patientExaminationMismatch(patient, resolvedExamPatient ?? examinationPatient)

  const runAnalysis = async () => {
    if (mismatch) {
      console.error('Selected patient and examination patient mismatch')
      setError('선택한 환자의 검사정보를 다시 불러와 주세요.')
      return
    }
    if (!resolvedExaminationId) {
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

    const submittedValuesKey = JSON.stringify(values)
    setSubmitting(true)
    setError('')
    setAnalysis(null)
    try {
      let current = await createClinicalAIAnalysis(resolvedExaminationId, payload)
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
      } else {
        setAnalyzedValuesKey(submittedValuesKey)
        window.setTimeout(() => {
          document.getElementById('clinical-ai-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }, 0)
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Clinical AI 분석을 요청하지 못했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void runAnalysis()
  }

  useEffect(() => {
    if (
      !autoRun ||
      autoRunStarted.current ||
      submitting ||
      mismatch ||
      !resolvedExaminationId ||
      completedCount !== allFields.length
    ) {
      return
    }

    autoRunStarted.current = true
    onAutoRunConsumed?.()
    void runAnalysis()
  }, [
    autoRun,
    completedCount,
    mismatch,
    onAutoRunConsumed,
    resolvedExaminationId,
    submitting,
  ])

  const result = analysis?.results?.find((item) => item.result_type === 'RISK_PREDICTION')
  const probability = result?.result_json.probability
  const inlineExplanation = result?.result_json.explanation
  const explanation = inlineExplanation?.type === 'SHAP' && Array.isArray(inlineExplanation.top_features) && inlineExplanation.top_features.length > 0
    ? inlineExplanation
    : savedExplanation
  const shapFeatures = explanation?.type === 'SHAP' && Array.isArray(explanation.top_features) && explanation.top_features.length > 0
    ? explanation.top_features
    : []
  const examGuidance = result
    ? buildClinicalExamGuidance({
        values,
        prediction: result.result_json.prediction,
        criticalLabCount,
        modelWarningCount: result.result_json.warnings?.length ?? 0,
      })
    : null
  const modelWarningFields = useMemo(
    () => shapWarningFeatures(result?.result_json.warnings ?? []),
    [result?.result_json.warnings],
  )
  const attentionFieldNames = useMemo(() => {
    const attention = new Set<string>()

    allFields.forEach((field) => {
      const currentValue = values[field.name]
      if (currentValue === undefined || currentValue === '') {
        attention.add(field.name)
        return
      }

      const measurement = measurementByField.get(field.name)
      if (!measurement) return

      const sourceValue = clinicalValueFromMeasurement(
        measurement.code,
        measurement.valueNumeric,
      )
      const matchesSourceValue = sourceValue !== undefined
        && Number(currentValue) === sourceValue

      if (!matchesSourceValue || labReferenceStatus(measurement) === 'OUT_OF_RANGE') {
        attention.add(field.name)
      }
    })

    modelWarningFields.forEach((fieldName) => attention.add(fieldName))
    return attention
  }, [measurementByField, modelWarningFields, values])

  const groupAttentionCounts = groups.map(
    (group) => group.fields.filter((field) => attentionFieldNames.has(field.name)).length,
  )
  const activeGroup = groups[activeGroupIndex] ?? groups[0]
  const visibleFields = attentionOnly
    ? activeGroup.fields.filter((field) => attentionFieldNames.has(field.name))
    : activeGroup.fields
  const inputsChangedAfterAnalysis = Boolean(
    result && analyzedValuesKey && analyzedValuesKey !== JSON.stringify(values),
  )

  const revealField = (fieldName: string) => {
    const groupIndex = groups.findIndex((group) =>
      group.fields.some((field) => field.name === fieldName),
    )
    if (groupIndex < 0) return

    setAttentionOnly(false)
    setActiveGroupIndex(groupIndex)
    window.setTimeout(() => {
      const field = document.getElementById(fieldAnchorId(fieldName))
      field?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      field?.querySelector<HTMLElement>('input, select')?.focus({ preventScroll: true })
    }, 0)
  }

  useEffect(() => {
    if (!result?.id || (inlineExplanation?.type === 'SHAP' && Array.isArray(inlineExplanation.top_features) && inlineExplanation.top_features.length > 0)) {
      return
    }
    let active = true
    void getStoredClinicalShap(result.id).then((saved) => {
      if (active) setSavedExplanation(saved)
    }).catch(() => { if (active) setSavedExplanation(null) })
    return () => { active = false }
  }, [result?.id, inlineExplanation])

  return (
    <form className="clinical-ai-panel" onSubmit={submit}>
      <header className="clinical-ai-hero">
        <span className="clinical-ai-icon"><BrainCircuit size={24} /></span>
        <div>
          <small>{CLINICAL_MODEL_DISCLOSURE.eyebrow}</small>
          <h2>{resolvedSourceLabel ? `${resolvedSourceLabel} · Clinical AI 분석` : 'Clinical AI 분석'}</h2>
          {patient && <p><strong>{patient.name}</strong> · {patient.id} · {patient.sex === 'F' ? '여자' : '남자'}</p>}
          <p>{CLINICAL_MODEL_DISCLOSURE.description}</p>
        </div>
        <div className="clinical-ai-progress"><strong>{completedCount}/54</strong><span>입력 완료</span></div>
      </header>

      <section className="clinical-ai-model-limit">
        <Info size={16} />

        <div>
          <strong>{CLINICAL_MODEL_DISCLOSURE.validationLabel}</strong>
          <p>{CLINICAL_MODEL_DISCLOSURE.limitation}</p>
        </div>
      </section>

      {mismatch && <div className="clinical-ai-warning"><TriangleAlert size={16} />선택한 환자의 검사정보를 다시 불러와 주세요.</div>}
      {!resolvedExaminationId && <div className="clinical-ai-warning"><TriangleAlert size={16} />선택된 검사 ID가 없어 실행 버튼이 비활성화됩니다.</div>}
      {resolvedSourceLabel && <div className="clinical-ai-prefill"><CheckCircle2 size={16} /><span><strong>{resolvedSourceLabel}</strong>에 연결된 임상정보와 검사값을 자동 입력했습니다. 분석 전에 값을 확인할 수 있습니다.</span></div>}
      {completedCount < 54 && <div className="clinical-ai-warning"><TriangleAlert size={16} />현재 저장된 임상정보를 자동으로 불러왔습니다. 누락된 항목은 확인 후 직접 입력해 주세요.</div>}
      {error && <div className="feature-error"><span>{error}</span></div>}
      {clinicalLabMeasurements.length > 0 && (
        <section className={`clinical-ai-lab-review${criticalLabCount > 0 ? ' critical' : ''}`}>
          <header>
            <div className="clinical-ai-lab-review-title">
              {clinicalLabCounts.outOfRange > 0
                ? <TriangleAlert size={16} />
                : <CheckCircle2 size={16} />}
              <span>
                <strong>
                  {clinicalLabCounts.outOfRange > 0
                    ? `검사값 ${clinicalLabCounts.outOfRange}개 확인`
                    : '검사값 참고범위 확인 완료'}
                </strong>
                <small>선택 차수의 혈액검사 {clinicalLabMeasurements.length}개 · 원검사 참고범위 기준</small>
              </span>
            </div>

            <button type="button" onClick={() => setActiveGroupIndex(laboratoryGroupIndex)}>
              혈액검사에서 확인
            </button>
          </header>

          {clinicalLabIssues.length > 0 && (
            <div className="clinical-ai-lab-issues" aria-label="참고범위 밖 검사값">
              {clinicalLabIssues.slice(0, 5).map(({ fieldName, measurement }) => {
                const flag = measurement.abnormalFlag.toUpperCase()
                const direction = flag.includes('HIGH') ? '↑' : flag.includes('LOW') ? '↓' : ''
                const critical = isCriticalLabFlag(measurement)
                return (
                  <button
                    className={critical ? 'critical' : ''}
                    key={fieldName}
                    onClick={() => revealField(fieldName)}
                    type="button"
                  >
                    <span>{shapLabel(fieldName)}</span>
                    <strong>{direction} {measurement.valueNumeric}{measurement.unit ? ` ${measurement.unit}` : ''}</strong>
                  </button>
                )
              })}
              {clinicalLabIssues.length > 5 && (
                <button type="button" onClick={() => setActiveGroupIndex(laboratoryGroupIndex)}>
                  외 {clinicalLabIssues.length - 5}개
                </button>
              )}
            </div>
          )}

          <footer>
            참고범위 내 {clinicalLabCounts.inRange} · 참고범위 없음 {clinicalLabCounts.noReference}
            {criticalLabCount > 0 && <> · <strong>원자료 우선 확인 {criticalLabCount}</strong></>}
            <span>검사실 참고범위에 따른 표시이며 질환 진단을 의미하지 않습니다.</span>
          </footer>
        </section>
      )}
      <div className="clinical-ai-groups">
        <nav className="clinical-ai-group-tabs" aria-label="Clinical AI 입력 구역" role="tablist">
          {groups.map((group, index) => {
            const filled = group.fields.filter(
              (field) => values[field.name] !== undefined && values[field.name] !== '',
            ).length
            return (
              <button
                aria-selected={activeGroupIndex === index}
                className={activeGroupIndex === index ? 'active' : ''}
                key={group.title}
                onClick={() => setActiveGroupIndex(index)}
                role="tab"
                type="button"
              >
                <span>{group.title}</span>
                <small>{filled}/{group.fields.length}</small>
                {groupAttentionCounts[index] > 0 && <b>{groupAttentionCounts[index]}</b>}
              </button>
            )
          })}
        </nav>

        <section className="clinical-ai-group" role="tabpanel">
          <header>
            <span>
              <strong>{activeGroup.title}</strong>
              <small>{activeGroup.description}</small>
            </span>
            <div>
              {groupAttentionCounts[activeGroupIndex] > 0 && (
                <button
                  className={attentionOnly ? 'active' : ''}
                  onClick={() => setAttentionOnly((current) => !current)}
                  type="button"
                >
                  확인 필요만 {groupAttentionCounts[activeGroupIndex]}
                </button>
              )}
              <b>
                {activeGroup.fields.filter((field) => values[field.name] !== undefined && values[field.name] !== '').length}
                /{activeGroup.fields.length} 입력
              </b>
            </div>
          </header>

            <div className="clinical-ai-fields">
                {visibleFields.map((field) => {
                  const measurement = measurementByField.get(field.name)
                  const referenceStatus = measurement
                    ? labReferenceStatus(measurement)
                    : null
                  const sourceValue = measurement
                    ? clinicalValueFromMeasurement(measurement.code, measurement.valueNumeric)
                    : undefined
                  const currentValue = values[field.name]
                  const matchesSourceValue = currentValue !== undefined
                    && currentValue !== ''
                    && sourceValue !== undefined
                    && Number(values[field.name]) === sourceValue
                  const abnormalFlag = measurement?.abnormalFlag.toUpperCase()
                  const critical = measurement
                    ? isCriticalLabFlag(measurement)
                    : false

                  return (
                    <label
                      className={
                        referenceStatus === 'OUT_OF_RANGE'
                          ? 'clinical-ai-field out-of-range'
                          : 'clinical-ai-field'
                      }
                      id={fieldAnchorId(field.name)}
                      key={field.name}
                    >
                      <span className="clinical-ai-field-heading">
                        <span>
                          {field.label}
                          <small>{field.name}</small>
                        </span>

                        {measurement && !matchesSourceValue && (
                          <em className="clinical-ai-field-flag modified">
                            입력 수정됨
                          </em>
                        )}

                        {measurement && matchesSourceValue && referenceStatus === 'OUT_OF_RANGE' && (
                          <em
                            className={`clinical-ai-field-flag ${labReferenceStatusClass(referenceStatus)}${
                              critical ? ' critical' : ''
                            }`}
                          >
                            {(abnormalFlag === 'HIGH' ||
                              abnormalFlag === 'CRITICAL_HIGH') && (
                              <ArrowUp aria-hidden="true" size={11} strokeWidth={3} />
                            )}

                            {(abnormalFlag === 'LOW' ||
                              abnormalFlag === 'CRITICAL_LOW') && (
                              <ArrowDown aria-hidden="true" size={11} strokeWidth={3} />
                            )}

                            {critical ? '원자료 우선 확인' : '참고범위 밖'}
                          </em>
                        )}
                      </span>

                      {field.kind === 'number' ? (
                        <input
                          type="number"
                          step={field.step}
                          value={values[field.name] ?? ''}
                          onChange={(event) => updateValue(field.name, event.target.value)}
                          required
                        />
                      ) : (
                        <select
                          value={values[field.name] ?? ''}
                          onChange={(event) => updateValue(field.name, event.target.value)}
                          required
                        >
                          <option value="">선택</option>
                          {field.options?.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      )}

                      {measurement && (
                        <small className="clinical-ai-field-reference">
                          원검사 {measurement.unit && <>단위 {measurement.unit} · </>}
                          참고범위 {formatLabReferenceDisplay(measurement)}
                          {!matchesSourceValue && ' · 수정값은 재평가 필요'}
                        </small>
                      )}
                    </label>
                  )
                })}
                {visibleFields.length === 0 && (
                  <p className="clinical-ai-fields-empty">이 구역에는 확인이 필요한 항목이 없습니다.</p>
                )}
            </div>
        </section>
      </div>

      {analysis && (
        <section id="clinical-ai-result" className={`clinical-ai-result ${result?.result_json.prediction === 1 ? 'high' : 'normal'}`}>
          <header><CheckCircle2 size={20} /><div><strong>{analysis.analysis.status === 'SUCCEEDED' ? '분석 완료' : '분석 진행 중'}</strong><small>Analysis #{analysis.analysis.id}</small></div></header>
          {result && (
            <div className="clinical-ai-result-grid">
              <article>
                <span>{CLINICAL_MODEL_DISCLOSURE.scoreLabel}</span>
                <strong>
                  {(result.result_json.probability * 100).toFixed(1)}%
                </strong>
              </article>

              <article>
                <span>{CLINICAL_MODEL_DISCLOSURE.thresholdLabel}</span>
                <strong>
                  {(result.result_json.threshold * 100).toFixed(1)}%
                </strong>
              </article>

              <article>
                <span>{CLINICAL_MODEL_DISCLOSURE.signalLabel}</span>
                <strong>
                  {result.result_json.prediction === 1
                    ? CLINICAL_MODEL_DISCLOSURE.highSignal
                    : CLINICAL_MODEL_DISCLOSURE.lowSignal}
                </strong>
              </article>
            </div>
          )}
          {examGuidance && (
            <section className={`clinical-ai-guidance ${examGuidance.tone}`}>
              <header>
                <div>
                  <small>GUIDELINE PATHWAY</small>
                  <h3>검사 경로 참고</h3>
                </div>
                <span>자동 오더 아님</span>
              </header>

              <strong>{examGuidance.route}</strong>
              <p>{examGuidance.summary}</p>

              <ul>
                {examGuidance.checks.map((check) => (
                  <li key={check}>{check}</li>
                ))}
              </ul>

              <footer>{examGuidance.sourceNote}</footer>
            </section>
          )}
          {result?.result_json.warnings?.length ? (
            <section className="clinical-ai-model-range-warning">
              <header>
                <TriangleAlert size={17} />
                <div>
                  <strong>모델 신뢰도 확인 필요</strong>
                  <small>
                    모델 적용범위를 벗어난 입력값이 {result.result_json.warnings.length}개 있습니다.
                    원자료 확인 후 결과를 해석하세요.
                  </small>
                </div>
              </header>
              <details>
                <summary>기술 상세 보기</summary>
                <ul>
                  {result.result_json.warnings.map((warning) => (
                    <li key={warning}>{formatModelRangeWarning(warning)}</li>
                  ))}
                </ul>
                <p>
                  표시된 범위는 임상 정상범위가 아니라 모델 개발 데이터의 관찰범위입니다.
                </p>
              </details>
            </section>
          ) : null}
          {shapFeatures.length > 0 && (
            <ShapExplanationPanel
              items={shapFeatures}
              warnings={result?.result_json.warnings ?? []}
              measurementByField={measurementByField}
            />
          )}
        </section>
      )}

      <footer className="clinical-ai-actions">
        <span>
          Examination #{resolvedExaminationId ?? '-'}
          {inputsChangedAfterAnalysis && <b>입력 변경됨 · 재분석 필요</b>}
        </span>
        <button className="primary" disabled={submitting || mismatch || !resolvedExaminationId || completedCount !== 54} type="submit">
          {submitting ? <LoaderCircle className="spin" size={16} /> : <BrainCircuit size={16} />}
          {submitting
            ? 'AI 분석 중…'
            : result
              ? 'Clinical AI 재분석'
              : 'Clinical AI 분석 실행'}
        </button>
      </footer>
    </form>
  )
}
