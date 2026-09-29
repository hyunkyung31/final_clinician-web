export type ClinicalExamGuidanceTone =
  | 'urgent-review'
  | 'invasive-review'
  | 'noninvasive-review'
  | 'clinical-review'

export interface ClinicalExamGuidance {
  tone: ClinicalExamGuidanceTone
  route: string
  summary: string
  checks: string[]
  sourceNote: string
}

interface ClinicalExamGuidanceInput {
  values: Record<string, string>
  prediction: 0 | 1
  criticalLabCount: number
  modelWarningCount: number
}

const SOURCE_NOTE = '근거 경로: 2024 ESC Chronic Coronary Syndromes · 2021 AHA/ACC Chest Pain'

function selected(values: Record<string, string>, name: string) {
  return Number(values[name]) === 1
}

function numeric(values: Record<string, string>, name: string) {
  const value = Number(values[name])
  return Number.isFinite(value) ? value : null
}

function modelRangeCheck(modelWarningCount: number) {
  return modelWarningCount > 0
    ? [`모델 개발범위 밖 입력 ${modelWarningCount}개: 모델 점수를 검사 선택 근거로 사용하지 않음`]
    : []
}

export function buildClinicalExamGuidance({
  values,
  prediction,
  criticalLabCount,
  modelWarningCount,
}: ClinicalExamGuidanceInput): ClinicalExamGuidance {
  const highRiskFindings: string[] = []
  const systolicBloodPressure = numeric(values, 'BP')
  const ejectionFraction = numeric(values, 'EF-TTE')

  if (selected(values, 'St Elevation')) highRiskFindings.push('ST 상승')
  if (selected(values, 'St Depression')) highRiskFindings.push('ST 하강')
  if (selected(values, 'LowTH Ang')) highRiskFindings.push('저역치 협심증')
  if (systolicBloodPressure !== null && systolicBloodPressure < 90) {
    highRiskFindings.push(`수축기 혈압 ${systolicBloodPressure} mmHg`)
  }
  if (ejectionFraction !== null && ejectionFraction > 0 && ejectionFraction <= 40) {
    highRiskFindings.push(`EF ${ejectionFraction}%`)
  }

  const hasSymptoms = [
    'Typical Chest Pain',
    'Atypical',
    'Dyspnea',
    'LowTH Ang',
  ].some((name) => selected(values, name))

  if (criticalLabCount > 0) {
    return {
      tone: 'urgent-review',
      route: '검사 선택 전 원자료와 환자 상태 우선 확인',
      summary:
        '중대한 검사값 표시가 있어 2D XCA/CAG 또는 3D CCTA를 자동 제안하지 않습니다. 검체 오류와 임상적 응급성을 먼저 확인하세요.',
      checks: [
        `원자료 우선 확인 항목 ${criticalLabCount}개: 재검 필요성과 즉시 처치 필요성 판단`,
        '신기능·전해질·혈역학 상태를 확인한 뒤 조영제 검사 및 침습적 검사 적합성 재평가',
        ...modelRangeCheck(modelWarningCount),
      ],
      sourceNote: SOURCE_NOTE,
    }
  }

  if (highRiskFindings.length > 0) {
    return {
      tone: 'invasive-review',
      route: '침습적 관상동맥조영술(2D XCA/CAG) 적응증 우선 확인',
      summary:
        '고위험 가능 소견이 입력되어 있습니다. 급성 여부와 소견의 신규 발생 여부를 표준 진료경로로 재확인하고, 고위험 상태가 확인되면 침습적 관상동맥조영술을 검토합니다.',
      checks: [
        `확인된 입력: ${highRiskFindings.join(', ')}`,
        '12유도 ECG, 연속 고감도 troponin, 혈역학 상태와 증상 지속 여부 확인',
        '안정형 환자에서는 증상 강도, 약물치료 반응 및 전체 사건 위험도를 함께 평가',
        ...modelRangeCheck(modelWarningCount),
      ],
      sourceNote: SOURCE_NOTE,
    }
  }

  if (hasSymptoms || prediction === 1) {
    const checks = [
      '급성 관상동맥증후군과 기타 응급 원인이 배제된 안정 환자인지 확인',
      '알려진 CAD, 이전 검사, 관상동맥 석회화, 영상 품질과 기관 전문성을 함께 고려',
      'CCTA가 부적합하거나 허혈 평가가 필요한 경우 스트레스 영상 등 기능검사 검토',
      ...modelRangeCheck(modelWarningCount),
    ]

    if (selected(values, 'CRF')) {
      checks.splice(1, 0, '만성 신부전 입력됨: CCTA 전 eGFR과 조영제 적합성 우선 확인')
    }

    return {
      tone: 'noninvasive-review',
      route: '3D CCTA 또는 기능검사 우선 검토',
      summary:
        '급성 고위험 상태가 배제된 안정 환자에서 알려진 CAD가 없고 검사 적합성이 확보되면 CCTA로 폐쇄성 CAD를 평가할 수 있습니다. 모델 점수만으로 검사를 결정하지 않습니다.',
      checks,
      sourceNote: SOURCE_NOTE,
    }
  }

  return {
    tone: 'clinical-review',
    route: '즉시 2D·3D 검사를 자동 권고하지 않음',
    summary:
      '현재 모델 신호만으로 추가 영상검사를 결정하지 않습니다. 연령·성별·증상에 기반한 표준 사전확률 또는 임상 의사결정 경로로 검사 필요성을 다시 평가하세요.',
    checks: [
      '증상이 없거나 폐쇄성 CAD 가능성이 낮으면 추가 검사를 보류할 수 있음',
      '증상이 새로 발생하거나 변하면 급성 흉통 진료경로로 재평가',
      ...modelRangeCheck(modelWarningCount),
    ],
    sourceNote: SOURCE_NOTE,
  }
}
