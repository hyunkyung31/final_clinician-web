import { Download, ShieldAlert } from 'lucide-react'
import type { ClinicalAIAnalysis, ClinicalShapExplanation } from '../api/client'
import type { PatientSummary, StaffDoctor, StaffIdentity } from '../types'
import { CLINICAL_MODEL_DISCLOSURE } from '../clinicalModelDisclosure'
import { buildClinicalAiReportHtml, getClinicalAiReportResult } from '../clinicalAiReportDocument'
import { formatClinicalShapValue, rankClinicalShapFeatures } from '../clinicalShapPresentation'

interface ClinicalAiReportDetailProps {
  analysis: ClinicalAIAnalysis
  patient: PatientSummary
  shap: ClinicalShapExplanation | null
  staffIdentity?: StaffIdentity | null
  staffDoctor?: StaffDoctor | null
}

function formatDate(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function formatPercent(value: number) {
  const ratio = value > 1 ? value / 100 : value
  return `${Math.round(ratio * 1000) / 10}%`
}

export function ClinicalAiReportDetail({ analysis, patient, shap, staffIdentity, staffDoctor }: ClinicalAiReportDetailProps) {
  const result = getClinicalAiReportResult(analysis)
  if (!result) return <p className="report-empty-inline">저장된 Clinical AI 결과가 없습니다.</p>

  const explanation = shap ?? result.result_json.explanation ?? null
  const rankedFeatures = rankClinicalShapFeatures(explanation?.top_features ?? [], 8)
  const job = [...analysis.jobs].sort((left, right) => right.id - left.id)[0]
  const highSignal = result.result_json.prediction === 1
  const signalLabel = highSignal ? CLINICAL_MODEL_DISCLOSURE.highSignal : CLINICAL_MODEL_DISCLOSURE.lowSignal
  const clinicianName = staffDoctor?.name || staffIdentity?.name || '-'
  const departmentName = staffDoctor?.departmentName || staffIdentity?.departmentName || '-'

  const savePdf = () => {
    const popup = window.open('about:blank', '_blank')
    if (!popup) return
    popup.opener = null
    popup.document.open()
    popup.document.write(buildClinicalAiReportHtml({
      patient,
      analysis,
      result,
      shap: explanation,
      clinicianName,
      departmentName,
    }))
    popup.document.close()
    popup.focus()
    window.setTimeout(() => popup.print(), 250)
  }

  return (
    <section className="feature-card report-detail-card clinical-report-detail">
      <header className="report-detail-header">
        <div>
          <small>CLINICAL AI 결과보고서 · 분석 #{analysis.analysis.id}</small>
          <h2>{patient.name} · {patient.id}</h2>
        </div>
        <span className="clinical-report-readonly">의료진 전용 · 읽기 전용</span>
      </header>

      <article className="report-section">
        <h3>1. 환자/분석 정보</h3>
        <dl className="report-meta-grid">
          <div><dt>환자</dt><dd>{patient.name}</dd></div>
          <div><dt>환자번호</dt><dd>{patient.id}</dd></div>
          <div><dt>검사 ID</dt><dd>#{analysis.analysis.examination}</dd></div>
          <div><dt>분석 완료</dt><dd>{formatDate(analysis.analysis.completed_at || result.generated_at)}</dd></div>
          <div><dt>결과 ID</dt><dd>#{result.id}</dd></div>
          <div><dt>모델 버전</dt><dd>{job ? `#${job.ai_model_version}` : '-'}</dd></div>
        </dl>
      </article>

      <article className="report-section">
        <h3>2. 모델 결과</h3>
        <div className={`clinical-report-metrics ${highSignal ? 'high' : ''}`}>
          <div><span>{CLINICAL_MODEL_DISCLOSURE.scoreLabel}</span><strong>{formatPercent(result.result_json.probability)}</strong></div>
          <div><span>{CLINICAL_MODEL_DISCLOSURE.thresholdLabel}</span><strong>{formatPercent(result.result_json.threshold)}</strong></div>
          <div><span>{CLINICAL_MODEL_DISCLOSURE.signalLabel}</span><strong>{signalLabel}</strong></div>
        </div>
        {result.summary_text && <p className="clinical-report-summary">{result.summary_text}</p>}
        <div className="clinical-report-limitation">
          <ShieldAlert size={18} />
          <div><strong>{CLINICAL_MODEL_DISCLOSURE.validationLabel}</strong><p>{CLINICAL_MODEL_DISCLOSURE.limitation}</p></div>
        </div>
      </article>

      <article className="report-section">
        <h3>3. 주요 기여 변수 (SHAP)</h3>
        <p className="report-empty-inline">모델 출력에 기여한 방향과 상대적 크기입니다. 인과관계나 개별 임상 중요도를 의미하지 않습니다.</p>
        <div className="clinical-report-shap-table">
          <div className="clinical-report-shap-head"><span>순위</span><span>변수</span><span>입력값</span><span>방향</span><span>SHAP 값</span></div>
          {rankedFeatures.map((feature) => (
            <div className="clinical-report-shap-row" key={`${feature.feature}-${feature.rank}`}>
              <span>{feature.rank}</span>
              <strong>{feature.feature}</strong>
              <span>{String(feature.value)}</span>
              <b className={feature.signedDirection}>{feature.signedDirection === 'increase' ? '위험 신호 증가' : '위험 신호 감소'}</b>
              <span>{formatClinicalShapValue(feature.shap_value)}</span>
            </div>
          ))}
          {!rankedFeatures.length && <p className="report-empty-inline">저장된 SHAP 설명이 없습니다.</p>}
        </div>
      </article>

      <article className="report-section">
        <h3>4. 모델 경고 및 확인사항</h3>
        {result.result_json.warnings.length ? (
          <ul className="clinical-report-warnings">{result.result_json.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
        ) : <p className="report-empty-inline">모델 경고가 없습니다.</p>}
      </article>

      <footer className="clinical-report-footer">
        <p>Clinical AI 결과는 자동 진단·자동 오더·환자 공개 문서가 아닙니다. 원자료와 임상 소견을 확인한 의료진이 최종 판단합니다.</p>
        <button className="report-primary-btn" onClick={savePdf} type="button"><Download size={15} /> PDF 저장 / 인쇄</button>
      </footer>
    </section>
  )
}
