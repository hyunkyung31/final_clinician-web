/** Immutable VM detail reads. Does not require the GPU bridge. */
import { parseXCAAnalysis, type XCAAnalysisResult, type XCAScore } from './xcaAnalysis'
const BUNDLE = '18ffc48b71309379598a3dc6d1b1ac4a858e567f4d6ee917532e2a08e01a3569'
export interface XCASeriesDetail { sequenceId: number; number: string; side: 'LEFT' | 'RIGHT'; frameCount: number; suspected: number[]; representative: number | null; any: XCAScore; significant: XCAScore }
export interface XCADetailResult { id: number; createdAt: string; summary: XCAAnalysisResult; series: XCASeriesDetail[] }
export interface XCAArchivedFrame { id: number; detailId: number; sequenceId: number; number: string; index: number; width: number; height: number; sourceUrl: string; maskUrl: string | null; previewUrl: string | null }
function object(v: unknown): Record<string, unknown> { if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('XCA 상세 응답 형식 오류'); return v as Record<string, unknown> }
function integer(v: unknown, min = 1): number { if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < min) throw new Error('XCA 상세 ID·수량 오류'); return v }
function score(v: unknown): XCAScore { const s = object(v); if (typeof s.ai_score !== 'number' || !Number.isFinite(s.ai_score) || s.ai_score < 0 || s.ai_score > 1 || s.prediction !== Number(s.ai_score >= .5)) throw new Error('XCA 상세 점수 오류'); return { aiScore: s.ai_score, prediction: s.prediction as 0 | 1 } }
export function parseXCADetail(value: unknown, patientId: number, examinationId: number): XCADetailResult {
  const v = object(value), id = integer(v.id), raw = object(v.summary), context = object(v.input_snapshot)
  if (v.backend_patient_id !== patientId || v.examination_id !== examinationId || v.status !== 'REVIEW_REQUIRED' || v.detail_version !== '0.1.0-demo' || v.source_bundle_sha256 !== BUNDLE || JSON.stringify(raw.backend_context) !== JSON.stringify(context)) throw new Error('다른 환자·검사 또는 지원하지 않는 XCA 상세 결과입니다.')
  const summary = parseXCAAnalysis({ verified: true, backend_patient_id: patientId, examination_id: examinationId, reused: false,
    analysis: { id: v.analysis_id, examination: examinationId, analysis_type: 'ANGIO_2D', status: 'SUCCEEDED' },
    job: { id: v.job_id, ai_analysis: v.analysis_id, status: 'SUCCEEDED' },
    result: { id: v.result_id, ai_analysis_job: v.job_id, status: 'REVIEW_REQUIRED', confidence: null, result_json: raw } }, patientId, examinationId)
  if (!Array.isArray(v.series) || !Array.isArray(context.sequences) || v.series.length !== summary.seriesCount || v.n_frames !== summary.frameCount) throw new Error('XCA 상세 시리즈·프레임 수 오류')
  const sequences = context.sequences.map(object), seen = new Set<string>()
  const series = v.series.map((entry): XCASeriesDetail => {
    const item = object(entry), classification = object(item.classification), sequence = sequences.find(s => s.sequence_no === item.series_id)
    if (!sequence || typeof item.series_id !== 'string' || seen.has(item.series_id) || item.side !== sequence.side || item.n_frames !== sequence.frame_count || item.score_scope !== 'single_series_exploratory' || item.classification_validation !== 'NOT_VALIDATED_FOR_SERIES_CLASSIFICATION' || classification.side !== item.side || classification.threshold !== .5) throw new Error('XCA 상세 시리즈 계약 오류')
    seen.add(item.series_id)
    const frameCount = integer(item.n_frames)
    if (!Array.isArray(item.suspected_frame_indices)) throw new Error('의심 프레임 목록 오류')
    const suspected = item.suspected_frame_indices.map(index => integer(index, 0))
    if (new Set(suspected).size !== suspected.length || suspected.some(index => index >= frameCount) || (item.representative_frame_index !== null && (!suspected.includes(integer(item.representative_frame_index, 0)) || item.representative_frame_index !== suspected[0]))) throw new Error('대표·의심 프레임 범위 오류')
    if (suspected.length && item.representative_frame_index === null) throw new Error('대표 프레임 누락')
    return { sequenceId: integer(sequence.sequence_id), number: item.series_id, side: item.side as 'LEFT' | 'RIGHT', frameCount, suspected, representative: item.representative_frame_index as number | null, any: score(classification.any_stenosis), significant: score(classification.significant_stenosis) }
  }).sort((a, b) => Number(a.number) - Number(b.number))
  summary.warnings = ['시리즈 점수는 검증 전 탐색용입니다. 의심 영역은 약한 위치 추정이며 임상적 좌표 정확도는 아직 검증 전입니다.']
  return { id, createdAt: typeof v.created_at === 'string' ? v.created_at : '', summary, series }
}
function assetUrl(value: unknown): string { const asset = object(value); integer(asset.file_asset_id); if (typeof asset.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(asset.sha256) || typeof asset.url !== 'string') throw new Error('보존 영상 참조 오류'); const u = new URL(asset.url, window.location.origin); if (u.username || u.password || !(u.protocol === 'https:' || u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname))) throw new Error('보존 영상 URL 오류'); return u.href }
export function parseXCAFrame(value: unknown, detail: XCADetailResult): XCAArchivedFrame {
  const v = object(value), series = detail.series.find(s => s.sequenceId === v.sequence_id)
  const index = integer(v.frame_index, 0), width = integer(v.width), height = integer(v.height), localization = object(v.localization), transform = object(localization.transform)
  if (!series || v.detail_id !== detail.id || String(v.sequence_no) !== series.number || index >= series.frameCount || width * height > 4194304 || localization.validation !== 'weak_localization' || transform.coordinate_space !== 'source_png_pixels' || JSON.stringify(transform.source_hw) !== JSON.stringify([height, width])) throw new Error('보존 프레임 환자·시리즈·좌표 오류')
  return { id: integer(v.id), detailId: detail.id, sequenceId: series.sequenceId, number: series.number, index, width, height, sourceUrl: assetUrl(v.source), maskUrl: v.mask === null ? null : assetUrl(v.mask), previewUrl: v.preview === null ? null : assetUrl(v.preview) }
}
export async function xcaRead(base: string, path: string, token: string | null): Promise<unknown> {
  if (!token) throw new Error('의료진 로그인이 필요합니다.')
  const response = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', redirect: 'error' })
  if (!response.ok) throw new Error(`XCA 저장 결과 조회 실패 (${response.status}). 로그인·조회 권한을 확인하세요.`)
  return response.json()
}
export async function listXCADetails(base: string, token: string | null, patientId: number, examinationId: number): Promise<XCADetailResult[]> {
  const v = object(await xcaRead(base, `/api/examinations/${integer(examinationId)}/xca-details/?patient_id=${integer(patientId)}`, token))
  if (!Array.isArray(v.results)) throw new Error('XCA 저장 이력 응답 오류')
  return v.results.map(item => parseXCADetail(item, patientId, examinationId))
}
export async function listXCAFrames(base: string, token: string | null, detail: XCADetailResult, sequenceId: number): Promise<XCAArchivedFrame[]> {
  const series = detail.series.find(s => s.sequenceId === sequenceId)
  if (!series) throw new Error('다른 검사 시리즈입니다.')
  const frames: XCAArchivedFrame[] = [], seen = new Set<number>()
  for (let page = 1; page <= 10; page++) {
    const v = object(await xcaRead(base, `/api/xca-details/${detail.id}/frames/?patient_id=${detail.summary.patientId}&sequence_id=${sequenceId}&page=${page}&page_size=100`, token))
    if (v.count !== series.frameCount || v.page !== page || !Array.isArray(v.frames) || !v.frames.length || v.frames.length > 100) throw new Error('보존 프레임 페이지·수량 오류')
    for (const raw of v.frames) { const frame = parseXCAFrame(raw, detail); if (frame.sequenceId !== sequenceId || seen.has(frame.index)) throw new Error('보존 프레임 중복·시리즈 오류'); seen.add(frame.index); frames.push(frame) }
    if (v.next_page === null) { if (frames.length !== series.frameCount || frames.some(f => f.index >= frames.length)) throw new Error('보존 프레임 누락'); return frames.sort((a, b) => a.index - b.index) }
    if (v.next_page !== page + 1 || frames.length >= series.frameCount) throw new Error('보존 프레임 페이지 오류')
  }
  throw new Error('보존 프레임 조회 한도 초과')
}
export async function readXCAFrame(base: string, token: string | null, detail: XCADetailResult, frameId: number): Promise<XCAArchivedFrame> {
  const value = await xcaRead(base, `/api/xca-details/${detail.id}/frames/${integer(frameId)}/?patient_id=${detail.summary.patientId}`, token)
  const frame = parseXCAFrame(value, detail)
  if (frame.id !== frameId) throw new Error('다른 보존 프레임의 응답입니다.')
  return frame
}
