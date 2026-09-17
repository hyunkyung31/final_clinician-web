import type { ImagingAnnotationRecord } from '../types'
interface Point { x: number; y: number }
export type ViewerAnnotation = ({ serverId?: number; cameraState?: Record<string, unknown> | null; coordinateSpace?: string } & (
  | { id: string; type: 'FREEHAND'; points: Point[]; color: string }
  | { id: string; type: 'RECTANGLE'; start: Point; end: Point; color: string }
  | { id: string; type: 'TEXT'; point: Point; text: string; color: string }))

export function annotationRecordKey(record: ImagingAnnotationRecord, studyId: number) {
  if (record.viewer_type === '3D_RENDERED') return `rendering-${record.rendering_3d}-rendered`
  if (record.viewer_type === '3D_ORIGINAL') return `study-${studyId}-series-${record.imaging_series}-instance-${record.imaging_instance}-original-dicom`
  return `study-${studyId}-frame-${record.imaging_instance}`
}

export function fromServerAnnotation(record: ImagingAnnotationRecord): ViewerAnnotation | null {
  const geometry = record.geometry_json
  if (!geometry || !['viewport_normalized', 'image_normalized'].includes(String(geometry.coordinate_space))) return null
  const point = (value: unknown): Point | null => {
    if (!value || typeof value !== 'object') return null
    const p = value as Point
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) return null
    return { x: p.x * 1000, y: p.y * 600 }
  }
  const base = { id: `server-${record.id}`, serverId: record.id, color: record.color || '#ff5a64', cameraState: record.camera_state_json, coordinateSpace: String(geometry.coordinate_space) }
  if (record.tool_type === 'TEXT') { const p = point(geometry.point); return p ? { ...base, type: 'TEXT', point: p, text: record.text_content ?? '' } : null }
  if (record.tool_type === 'RECTANGLE') { const start = point(geometry.start); const end = point(geometry.end); return start && end ? { ...base, type: 'RECTANGLE', start, end } : null }
  if (record.tool_type === 'FREEHAND' && Array.isArray(geometry.points)) {
    const points = geometry.points.map(point)
    return points.every((p): p is Point => Boolean(p)) ? { ...base, type: 'FREEHAND', points } : null
  }
  return null
}

export function annotationGeometry(annotation: ViewerAnnotation) {
  const normalize = (point: Point) => {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.x > 1000 || point.y < 0 || point.y > 600) throw new Error('주석 좌표가 영상 범위를 벗어났습니다.')
    return { x: point.x / 1000, y: point.y / 600 }
  }
  return { coordinate_space: annotation.coordinateSpace ?? 'viewport_normalized', ...(annotation.type === 'FREEHAND' ? { points: annotation.points.map(normalize) } : annotation.type === 'RECTANGLE' ? { start: normalize(annotation.start), end: normalize(annotation.end) } : { point: normalize(annotation.point) }) }
}

