/** GPU-PC demo only. Never automatically replay a POST. */
const BRIDGE = 'https://xca.34-50-57-207.sslip.io'
export interface XCABridgeHealth { bridgeReady: boolean; modelReady: boolean; busy: boolean }
export interface XCAScore { aiScore: number; prediction: 0 | 1 }
export interface XCASideResult {
  side: 'LEFT' | 'RIGHT'; seriesCount: number; frameCount: number
  anyStenosis: XCAScore; significantStenosis: XCAScore; threshold: number
}
export interface XCAAnalysisResult {
  patientId: number; examinationId: number; originalPatientId: string
  analysisId: number; jobId: number; resultId: number; fold: number
  seriesCount: number; frameCount: number; processingSeconds: number
  sides: XCASideResult[]; warnings: string[]; excludedUnknownCount: number; reused: boolean
}
function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('XCA 응답 형식이 올바르지 않습니다.')
  return value as Record<string, unknown>
}
function integer(value: unknown, minimum = 1): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) throw new Error('XCA 응답의 ID·수량이 올바르지 않습니다.')
  return value
}
function score(value: unknown): XCAScore {
  const item = record(value)
  if (typeof item.ai_score !== 'number' || !Number.isFinite(item.ai_score) || item.ai_score < 0 || item.ai_score > 1
    || (item.prediction !== 0 && item.prediction !== 1) || item.prediction !== Number(item.ai_score >= 0.5)) throw new Error('XCA AI score·분류가 올바르지 않습니다.')
  return { aiScore: item.ai_score, prediction: item.prediction }
}
export function parseXCAAnalysis(payload: unknown, patientId: number, examinationId: number): XCAAnalysisResult {
  const response = record(payload), analysis = record(response.analysis), job = record(response.job), result = record(response.result)
  const data = record(result.result_json), context = record(data.backend_context)
  const analysisId = integer(analysis.id), jobId = integer(job.id), resultId = integer(result.id)
  if (response.verified !== true || response.backend_patient_id !== patientId || response.examination_id !== examinationId
    || analysis.analysis_type !== 'ANGIO_2D' || analysis.examination !== examinationId || analysis.status !== 'SUCCEEDED'
    || job.ai_analysis !== analysisId || job.status !== 'SUCCEEDED' || result.ai_analysis_job !== jobId
    || result.status !== 'REVIEW_REQUIRED' || result.confidence !== null
    || context.backend_patient_id !== patientId || context.examination_id !== examinationId
    || context.scope !== 'all_classified_series_in_examination' || data.status !== 'COMPLETED'
    || data.serving_scope !== 'VALIDATED_ANGIOCAD_DEMO_INTEGRATION' || data.analysis_unit !== 'patient_side'
    || data.api_version !== '1.0.0-demo' || typeof context.source_subject_id !== 'string'
    || String(data.patient_id) !== context.source_subject_id) throw new Error('요청한 환자·검사의 검증된 XCA 저장 결과가 아닙니다. 재실행 전에 작업 상태를 확인하세요.')
  const seriesCount = integer(data.n_series), frameCount = integer(data.n_frames)
  if (!Array.isArray(context.sequences) || context.sequences.length !== seriesCount) throw new Error('XCA 입력 시리즈 수가 다릅니다.')
  const groups = new Map<string, { series: number; frames: number }>()
  const ids = new Set<number>(), numbers = new Set<string>()
  for (const value of context.sequences) {
    const item = record(value), id = integer(item.sequence_id), frames = integer(item.frame_count)
    if ((item.side !== 'LEFT' && item.side !== 'RIGHT') || typeof item.sequence_no !== 'string'
      || !/^\d+$/.test(item.sequence_no) || ids.has(id) || numbers.has(item.sequence_no)) throw new Error('XCA 입력 시리즈·좌우 정보가 올바르지 않습니다.')
    ids.add(id); numbers.add(item.sequence_no)
    const group = groups.get(item.side) ?? { series: 0, frames: 0 }
    groups.set(item.side, { series: group.series + 1, frames: group.frames + frames })
  }
  if (!Array.isArray(data.sides) || data.sides.length !== groups.size) throw new Error('XCA 좌우 그룹 수가 다릅니다.')
  const seen = new Set<string>()
  const sides: XCASideResult[] = data.sides.map((value) => {
    const item = record(value), features = record(item.features)
    if ((item.side !== 'LEFT' && item.side !== 'RIGHT') || seen.has(item.side) || item.threshold !== 0.5) throw new Error('XCA 좌우·기준값이 올바르지 않습니다.')
    seen.add(item.side)
    const group = groups.get(item.side), count = integer(features.n_series), frames = integer(features.n_frames)
    if (!group || group.series !== count || group.frames !== frames) throw new Error('XCA 좌우별 시리즈·프레임 수가 다릅니다.')
    return { side: item.side, seriesCount: count, frameCount: frames, threshold: 0.5,
      anyStenosis: score(item.any_stenosis), significantStenosis: score(item.significant_stenosis) }
  })
  if (sides.reduce((total, side) => total + side.frameCount, 0) !== frameCount) throw new Error('XCA 전체 프레임 수가 다릅니다.')
  if (typeof data.processing_seconds !== 'number' || !Number.isFinite(data.processing_seconds) || data.processing_seconds < 0) throw new Error('XCA 처리 시간이 올바르지 않습니다.')
  if (!Array.isArray(context.excluded_unknown_sequence_ids)) throw new Error('XCA 미분류 제외 내역이 없습니다.')
  context.excluded_unknown_sequence_ids.forEach((id) => integer(id))
  return { patientId, examinationId, originalPatientId: context.source_subject_id, analysisId, jobId, resultId,
    fold: integer(data.fold, 0), seriesCount, frameCount, processingSeconds: data.processing_seconds,
    sides: sides.sort((a, b) => a.side.localeCompare(b.side)), reused: response.reused === true,
    warnings: Array.isArray(data.warnings) ? data.warnings.filter((value): value is string => typeof value === 'string') : [],
    excludedUnknownCount: context.excluded_unknown_sequence_ids.length }
}
export function xcaContextKey(patientId?: number, examinationId?: number): string { return `${patientId ?? ''}:${examinationId ?? ''}` }
export async function fetchXCABridgeHealth(): Promise<XCABridgeHealth> {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 6000)
  try {
    const response = await fetch(`${BRIDGE}/health`, { signal: controller.signal, credentials: 'omit', cache: 'no-store', redirect: 'error' })
    if (!response.ok) throw new Error('로컬 연결 서버 상태를 조회하지 못했습니다.')
    const value = record(await response.json())
    return { bridgeReady: value.bridge_ready === true, modelReady: value.model_ready === true, busy: value.busy === true }
  } finally { clearTimeout(timer) }
}
export async function requestXCAAnalysis(patientId: number, examinationId: number, token: string | null): Promise<XCAAnalysisResult> {
  integer(patientId); integer(examinationId)
  if (!token) throw new Error('의료진 로그인이 필요합니다.')
  let response: Response
  try {
    // No generic request() wrapper: token refresh must NOT replay GPU inference.
    response = await fetch(`${BRIDGE}/xca/analyze`, { method: 'POST', credentials: 'omit', redirect: 'error',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ patient_id: patientId, examination_id: examinationId }) })
  } catch { throw new Error('로컬 연결 서버(8003)에 연결하지 못했거나 응답이 끊겼습니다. 분석이 계속 실행 중일 수 있으니 상태를 확인하고 다시 요청하세요.') }
  let payload: unknown
  try { payload = await response.json() } catch { throw new Error('연결 서버 응답을 읽지 못했습니다. 재실행 전에 작업 상태를 확인하세요.') }
  if (!response.ok) {
    const detail = record(payload).detail
    const message = typeof detail === 'string' ? detail : typeof detail === 'object' && detail !== null && !Array.isArray(detail)
      ? (detail as Record<string, unknown>).message : undefined
    throw new Error(typeof message === 'string' ? message : `XCA 분석 요청 실패 (${response.status}). 자동 재시도하지 않습니다.`)
  }
  return parseXCAAnalysis(payload, patientId, examinationId)
}
