import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Images } from 'lucide-react'
import { getImagingStudySeries, getImagingSeriesViewerManifest } from '../api/client'
import { withDicomTimeout } from '../api/dicomLoading'
import type { ImagingDicomManifestInstance, ImagingSeriesSummary, ImagingStudySummary } from '../types'
import './study-dicom-viewer.css'

const CornerstoneDicomViewer = lazy(() => import('./CornerstoneDicomViewer').then((module) => ({ default: module.CornerstoneDicomViewer })))

export function StudyDicomViewer({ study }: { study: ImagingStudySummary }) {
  const [series, setSeries] = useState<ImagingSeriesSummary[]>([])
  const [seriesId, setSeriesId] = useState<number | null>(null)
  const [instances, setInstances] = useState<ImagingDicomManifestInstance[]>([])
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [revision, setRevision] = useState(0)
  // Sorting is reported separately: changing the source array would reload the entire Stack.
  const handleOrder = useCallback((_ordered: ImagingDicomManifestInstance[]) => {}, [])
  const handleIndex = useCallback((value: number) => setIndex(value), [])
  const handleStatus = useCallback((value: string) => { setStatus(value); setError('') }, [])
  const handleError = useCallback((value: string) => setError(value), [])

  useEffect(() => {
    let live = true
    setLoading(true); setError(''); setSeries([]); setSeriesId(null); setInstances([]); setIndex(0); setStatus('')
    withDicomTimeout(getImagingStudySeries(study.id), 20000, '영상 Series 조회가 지연되고 있습니다. 다시 시도해주세요.')
      .then((items) => {
        if (!live) return
        setSeries(items)
        setSeriesId(items[0]?.id ?? null)
        if (!items.length) { setError('이 검사에 등록된 DICOM Series가 없습니다.'); setLoading(false) }
      })
      .catch((caught) => { if (live) { setError(caught instanceof Error ? caught.message : '영상 Series 조회 실패'); setLoading(false) } })
    return () => { live = false }
  }, [study.id, revision])

  useEffect(() => {
    if (!seriesId) return
    let live = true
    setLoading(true); setInstances([]); setIndex(0); setError(''); setStatus('')
    withDicomTimeout(getImagingSeriesViewerManifest(seriesId), 20000, 'DICOM 목록 조회가 지연되고 있습니다. 다시 시도해주세요.')
      .then((manifest) => {
        if (!live) return
        setInstances(manifest.instances)
        if (!manifest.instances.length) setError('이 Series에 표시할 DICOM 원본이 없습니다.')
      })
      .catch((caught) => { if (live) setError(caught instanceof Error ? caught.message : 'DICOM 목록 조회 실패') })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [seriesId])

  return <div className="viewer-card workstation-dicom-card">
    <div className="viewer-toolbar"><span><strong>{study.modality}</strong>{study.description}</span><span>{instances.length} images</span></div>
    <div className="workstation-dicom-series"><label>Series <select aria-label="워크스테이션 DICOM Series" value={seriesId ?? ''} disabled={!series.length} onChange={(event) => setSeriesId(Number(event.target.value))}>
      {!series.length && <option value="">Series 없음</option>}
      {series.map((item) => <option key={item.id} value={item.id}>{item.seriesNumber ?? item.id} · {item.description} ({item.instanceCount})</option>)}
    </select></label><button type="button" onClick={() => setRevision((value) => value + 1)}>다시 불러오기</button></div>
    <div className="viewer-stage workstation-dicom-stage">
      {instances.length ? <Suspense fallback={<div className="workstation-dicom-message" role="status">DICOM Viewer 준비 중…</div>}><CornerstoneDicomViewer key={`${study.id}-${seriesId}`} instances={instances} currentIndex={index} onCurrentIndexChange={handleIndex} onOrderedInstances={handleOrder} onStatus={handleStatus} onError={handleError} /></Suspense> : <div className="workstation-dicom-message" role={error ? 'alert' : 'status'}><Images size={30} /><strong>{loading ? 'DICOM 원본 연결 중…' : 'DICOM 원본을 표시할 수 없습니다'}</strong><p>{error || '선택한 검사의 영상 목록을 조회합니다.'}</p></div>}
    </div>
    <div className="workstation-dicom-controls"><button type="button" aria-label="이전 DICOM 슬라이스" disabled={!instances.length || index === 0} onClick={() => setIndex((value) => Math.max(0, value - 1))}><ChevronLeft size={18} /></button><input aria-label="워크스테이션 DICOM 슬라이스" type="range" min={0} max={Math.max(0, instances.length - 1)} value={index} disabled={instances.length < 2} onChange={(event) => setIndex(Number(event.target.value))} /><span>{instances.length ? `${index + 1}/${instances.length}` : '0/0'}</span><button type="button" aria-label="다음 DICOM 슬라이스" disabled={!instances.length || index >= instances.length - 1} onClick={() => setIndex((value) => Math.min(instances.length - 1, value + 1))}><ChevronRight size={18} /></button></div>
    <div className="viewer-footer"><span>Study #{study.id}</span><span role="status">{error || status || study.status}</span></div>
  </div>
}
