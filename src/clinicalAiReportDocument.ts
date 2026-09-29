import type { ClinicalAIAnalysis, ClinicalAIResult, ClinicalShapExplanation } from './api/client'
import type { PatientSummary } from './types'
import { CLINICAL_MODEL_DISCLOSURE } from './clinicalModelDisclosure'
import { formatClinicalShapValue, rankClinicalShapFeatures } from './clinicalShapPresentation'

export interface ClinicalAiReportDocumentInput {
  patient: PatientSummary
  analysis: ClinicalAIAnalysis
  result: ClinicalAIResult
  shap: ClinicalShapExplanation | null
  clinicianName?: string | null
  departmentName?: string | null
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function formatDate(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return escapeHtml(value)
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'long', timeStyle: 'short' }).format(date)
}

function formatPercent(value: number) {
  const ratio = value > 1 ? value / 100 : value
  return `${Math.round(ratio * 1000) / 10}%`
}

export function getClinicalAiReportResult(analysis: ClinicalAIAnalysis) {
  return [...(analysis.results ?? [])]
    .filter((item) => item.result_type === 'RISK_PREDICTION')
    .sort((left, right) => right.id - left.id)[0] ?? null
}

export function buildClinicalAiReportHtml({
  patient,
  analysis,
  result,
  shap,
  clinicianName,
  departmentName,
}: ClinicalAiReportDocumentInput) {
  const predictionLabel = result.result_json.prediction === 1
    ? CLINICAL_MODEL_DISCLOSURE.highSignal
    : CLINICAL_MODEL_DISCLOSURE.lowSignal
  const job = [...analysis.jobs].sort((left, right) => right.id - left.id)[0]
  const ranked = rankClinicalShapFeatures(shap?.top_features ?? result.result_json.explanation?.top_features ?? [], 8)
  const warnings = Array.isArray(result.result_json.warnings) ? result.result_json.warnings : []

  const shapRows = ranked.length
    ? ranked.map((feature) => `
      <tr>
        <td>${feature.rank}</td>
        <td>${escapeHtml(feature.feature)}</td>
        <td>${escapeHtml(feature.value)}</td>
        <td class="${feature.signedDirection}">${feature.signedDirection === 'increase' ? '위험 신호 증가' : '위험 신호 감소'}</td>
        <td>${escapeHtml(formatClinicalShapValue(feature.shap_value))}</td>
      </tr>`).join('')
    : '<tr><td colspan="5">저장된 SHAP 설명이 없습니다.</td></tr>'

  const warningItems = warnings.length
    ? warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')
    : '<li>모델 경고 없음</li>'

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Clinical AI 결과보고서 - ${escapeHtml(patient.id)}</title>
  <style>
    @page { size: A4; margin: 16mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #152238; font: 12px/1.55 Arial, "Noto Sans KR", sans-serif; }
    header { display: flex; justify-content: space-between; gap: 20px; padding-bottom: 16px; border-bottom: 2px solid #245db4; }
    h1 { margin: 3px 0 0; font-size: 24px; }
    h2 { margin: 0 0 10px; font-size: 15px; }
    small, .muted { color: #64748b; }
    .badge { align-self: flex-start; padding: 6px 9px; border-radius: 999px; color: #245db4; background: #eaf2ff; font-weight: 700; }
    section { margin-top: 18px; page-break-inside: avoid; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .cell, .metric { padding: 10px 12px; border: 1px solid #dce4ef; border-radius: 7px; }
    .cell span, .metric span { display: block; color: #64748b; font-size: 10px; }
    .cell strong, .metric strong { display: block; margin-top: 2px; font-size: 13px; }
    .metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 9px; }
    .metric strong { font-size: 18px; }
    .notice { padding: 12px 14px; border: 1px solid #cbd9ee; border-radius: 8px; background: #f7faff; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 7px 8px; border-bottom: 1px solid #e1e7ef; text-align: left; }
    th { color: #53657c; background: #f5f7fa; font-size: 10px; }
    .increase { color: #a13c36; font-weight: 700; }
    .decrease { color: #246c50; font-weight: 700; }
    ul { margin: 8px 0 0; padding-left: 18px; }
    footer { margin-top: 22px; padding-top: 12px; border-top: 1px solid #dce4ef; color: #64748b; font-size: 10px; }
    .screen-only { position: fixed; top: 12px; right: 12px; padding: 9px 14px; border: 0; border-radius: 7px; color: white; background: #2563eb; font-weight: 700; cursor: pointer; }
    @media print { .screen-only { display: none; } }
  </style>
</head>
<body>
  <button class="screen-only" onclick="window.print()">PDF 저장 / 인쇄</button>
  <header>
    <div><small>CLINICAL AI REPORT</small><h1>Clinical AI 결과보고서</h1><p class="muted">관상동맥질환 관련 연구용 모델 신호 및 설명</p></div>
    <span class="badge">의료진 전용 · 읽기 전용</span>
  </header>
  <section>
    <h2>1. 환자 및 분석 정보</h2>
    <div class="grid">
      <div class="cell"><span>환자</span><strong>${escapeHtml(patient.name)}</strong></div>
      <div class="cell"><span>환자번호</span><strong>${escapeHtml(patient.id)}</strong></div>
      <div class="cell"><span>검사 ID</span><strong>#${analysis.analysis.examination}</strong></div>
      <div class="cell"><span>분석 완료</span><strong>${formatDate(analysis.analysis.completed_at || result.generated_at)}</strong></div>
      <div class="cell"><span>분석/결과 ID</span><strong>#${analysis.analysis.id} / #${result.id}</strong></div>
      <div class="cell"><span>모델 버전</span><strong>${job ? `#${job.ai_model_version}` : '-'}</strong></div>
      <div class="cell"><span>확인 의료진</span><strong>${escapeHtml(clinicianName || '-')}</strong></div>
      <div class="cell"><span>진료과</span><strong>${escapeHtml(departmentName || '-')}</strong></div>
      <div class="cell"><span>결과 상태</span><strong>${escapeHtml(result.status)}</strong></div>
    </div>
  </section>
  <section>
    <h2>2. 모델 결과</h2>
    <div class="metrics">
      <div class="metric"><span>${CLINICAL_MODEL_DISCLOSURE.scoreLabel}</span><strong>${formatPercent(result.result_json.probability)}</strong></div>
      <div class="metric"><span>${CLINICAL_MODEL_DISCLOSURE.thresholdLabel}</span><strong>${formatPercent(result.result_json.threshold)}</strong></div>
      <div class="metric"><span>${CLINICAL_MODEL_DISCLOSURE.signalLabel}</span><strong>${escapeHtml(predictionLabel)}</strong></div>
    </div>
    <p>${escapeHtml(result.summary_text || '-')}</p>
    <div class="notice"><strong>${CLINICAL_MODEL_DISCLOSURE.validationLabel}</strong><br />${escapeHtml(CLINICAL_MODEL_DISCLOSURE.limitation)}</div>
  </section>
  <section>
    <h2>3. 주요 기여 변수 (SHAP)</h2>
    <p class="muted">각 변수의 모델 출력 기여 방향과 상대적 크기를 표시합니다. 인과관계나 개별 임상 중요도를 의미하지 않습니다.</p>
    <table><thead><tr><th>순위</th><th>변수</th><th>입력값</th><th>방향</th><th>SHAP 값</th></tr></thead><tbody>${shapRows}</tbody></table>
  </section>
  <section>
    <h2>4. 모델 경고 및 확인사항</h2>
    <ul>${warningItems}</ul>
  </section>
  <footer>
    본 문서는 Clinical AI 분석 결과의 의료진 검토용 출력물입니다. 자동 진단·자동 오더·환자 공개 문서가 아니며, 최종 판단은 원자료와 임상 소견을 확인한 의료진이 수행해야 합니다.
  </footer>
</body>
</html>`
}
