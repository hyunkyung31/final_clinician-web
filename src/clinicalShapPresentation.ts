import type { ClinicalShapFeature } from './api/client'

export interface RankedClinicalShapFeature extends ClinicalShapFeature {
  rank: number
  signedDirection: 'increase' | 'decrease'
  scalePercent: number
  relativePercent: number
}

export function rankClinicalShapFeatures(
  features: ClinicalShapFeature[],
  limit = 8,
): RankedClinicalShapFeature[] {
  const selected = features
    .filter((feature) => Number.isFinite(Number(feature.shap_value)))
    .sort((left, right) => Math.abs(right.shap_value) - Math.abs(left.shap_value))
    .slice(0, limit)

  const maximum = Math.max(0, ...selected.map((feature) => Math.abs(feature.shap_value)))
  const total = selected.reduce((sum, feature) => sum + Math.abs(feature.shap_value), 0)

  return selected.map((feature, index) => ({
    ...feature,
    rank: index + 1,
    signedDirection: feature.shap_value < 0 ? 'decrease' : 'increase',
    scalePercent: maximum > 0 ? (Math.abs(feature.shap_value) / maximum) * 100 : 0,
    relativePercent: total > 0 ? (Math.abs(feature.shap_value) / total) * 100 : 0,
  }))
}

export function formatClinicalShapValue(value: number): string {
  if (!Number.isFinite(value)) return '-'
  if (value === 0) return '0'

  const absolute = Math.abs(value)
  const formatted = absolute < 0.001
    ? value.toExponential(2)
    : String(Number(value.toFixed(4)))

  return value > 0 ? `+${formatted}` : formatted
}
