import type { ClinicalShapFeature } from './api/client'

export interface ClinicalShapValidation {
  valid: boolean
  issues: string[]
  featureCount: number
  sumAbsoluteContribution: number
  additivityStatus: 'NOT_VERIFIABLE'
  additivityReason: string
}

export function validateClinicalShapPayload(features: ClinicalShapFeature[]): ClinicalShapValidation {
  const issues: string[] = []
  const seen = new Set<string>()
  let sumAbsoluteContribution = 0

  if (!Array.isArray(features) || features.length === 0) issues.push('SHAP 기여 변수 없음')

  features.forEach((feature, index) => {
    const name = String(feature.feature ?? '').trim()
    const value = Number(feature.shap_value)
    if (!name) issues.push(`${index + 1}번째 변수명 누락`)
    if (name && seen.has(name)) issues.push(`중복 변수: ${name}`)
    if (name) seen.add(name)
    if (!Number.isFinite(value)) {
      issues.push(`${name || index + 1}: 유효하지 않은 SHAP 값`)
      return
    }
    sumAbsoluteContribution += Math.abs(value)
    const expectedDirection = value < 0 ? 'decrease' : 'increase'
    if (value !== 0 && feature.direction !== expectedDirection) {
      issues.push(`${name || index + 1}: SHAP 부호와 direction 불일치`)
    }
  })

  return {
    valid: issues.length === 0,
    issues,
    featureCount: seen.size,
    sumAbsoluteContribution,
    additivityStatus: 'NOT_VERIFIABLE',
    additivityReason: '현재 API는 상위 변수만 제공하고 expected/base value와 전체 SHAP 벡터를 제공하지 않아 예측값 재구성 검증을 수행할 수 없습니다.',
  }
}
