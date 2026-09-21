import { 
  annotationRecordKey,
  annotationGeometry, 
  fromServerAnnotation,
  type ViewerAnnotation 
} from '../api/imagingAnnotations'
import {
  Activity,
  CheckCircle2,
  BrainCircuit,
  ArrowDown,
  ArrowUp,
  Box as BoxIcon,
  ChevronLeft,
  ChevronRight,
  Eraser,
  FlaskConical,
  Images,
  Loader2,
  MousePointer2,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  Repeat2,
  Rotate3D,
  Save,
  Square,
  Type,
  Undo2,
  X,
  ZoomIn,
} from 'lucide-react'
import {
  useEffect,
  useCallback,
  lazy,
  useMemo,
  useRef,
  useState,
  Suspense,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  ApiError,
  createStudyRendering3D,
  regenerateRendering3D,
  getRendering3D,
  getRendering3DSources,
  getImagingAnnotations,
  createImagingAnnotation,
  deleteImagingAnnotation,
  updateImagingAnnotation,
  getAngiographyFrames,
  getImagingStudySeries,
  getImagingStudyViewerAccess,
  getImagingSeriesViewerManifest,
  getPatientAngiographySequences,
  getPatientClinicalFeatureSnapshot,
  getPatientLabObservations,
  getRendering3DViewerSource,
  getStudyRenderings3D,
  getFileDownloadUrl,
  CT_AI_VERSION_ID,
} from '../api/client'
import type {
  AngiographyFrame,
  AngiographySequenceSummary,
  ImagingDicomManifestInstance,
  ImagingSeriesSummary,
  ImagingSeriesViewerManifest,
  ImagingStudySummary,
  ImagingViewerAccess,
  LabObservation,
  PatientSummary,
  PatientFollowUpRecords,
  Rendering3DSummary,
  ImagingAnnotationRecord,
  ImagingAnnotationInput,
} from '../types'
import { LabResultEditor } from './LabResultEditor'
import {
  ANATOMY_VIEW_MODES,
  LOCAL_ANATOMY_GLB_URL,
  hasAnatomyGlbCapability,
  isAnatomyGlbFormat,
  isLocalAnatomyGlbTest,
  visibleRenderingKinds,
  preferredRendering,
  renderingLabel,
} from '../api/renderingSelection'
import type { AnatomyViewMode } from './MedicalModelViewer'
import './rendering-shortcuts.css'
import { CTAIAnalysisPanel } from './CTAIAnalysisPanel'
import { groupAngiographySequences } from '../api/angiographyGrouping'
import { splitImagingStudies } from '../api/imagingCategories'
import {
  LAB_REFERENCE_LABELS,
  countLabReferenceStatuses,
  formatLabReferenceDisplay,
  isCriticalLabFlag,
  labReferenceStatus,
  labReferenceStatusClass,
  labReferenceStatusLabel,
} from '../labReferenceStatus'
import { FollowUpTimeline } from './FollowUpTimeline'
import { ClinicalAIAnalysisPanel } from './ClinicalAIAnalysisPanel'
import { XCAAnalysisPanel } from './XCAAnalysisPanel'
import { ExaminationPatientSearch } from './ExaminationPatientSearch'
import { buildClinicalAiInput } from '../api/clinicalAiInput'
import { selectLabExaminationForPatient } from '../api/patientSelection'
import type { DicomAnnotationTransform } from './CornerstoneDicomViewer'

const MedicalModelViewer = lazy(() =>
  import('./MedicalModelViewer').then((module) => ({
    default: module.MedicalModelViewer,
  })),
)

const CornerstoneDicomViewer = lazy(() =>
  import('./CornerstoneDicomViewer').then((module) => ({
    default: module.CornerstoneDicomViewer,
  })),
)

type ExamSection = 'LAB' | 'IMAGING'
type ExamTab = 'IMAGING_2D' | 'IMAGING_3D'
type AnnotationTool = 'POINTER' | 'FREEHAND' | 'RECTANGLE' | 'TEXT'
type ThreeDPane = 'ORIGINAL' | 'RENDERED'

function userFacing3DError(error: unknown) {
  console.error('[CCTA 3D]', error)
  return '3D 결과를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'
}

interface Point {
  x: number
  y: number
}


type ImagingAsset =
  | { key: string; kind: 'STUDY'; study: ImagingStudySummary }
  | { key: string; kind: 'SEQUENCE'; sequence: AngiographySequenceSummary }


const labPriority = [
  'TROPONIN',
  'TNI',
  'TNT',
  'CKMB',
  'BNP',
  'NT-PROBNP',
  'CREATININE',
  'EGFR',
  'LDL',
  'HDL',
  'TRIGLYCERIDE',
  'INR',
  'POTASSIUM',
  'HEMOGLOBIN',
  'PLATELET',
  'GLUCOSE',
  'HBA1C',
]

function formatDate(value: string) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('ko-KR', {
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function formatAngiographyDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const parts = new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date)
  return ['year', 'month', 'day'].map((type) => parts.find((part) => part.type === type)?.value).join('-')
}

function referenceText(item: LabObservation) {
  return formatLabReferenceDisplay(item)
}

function numericReferenceUnit(item: LabObservation) {
  const hasNumericReference = item.referenceLow !== undefined || item.referenceHigh !== undefined
  return hasNumericReference && item.unit ? ` ${item.unit}` : ''
}

function hasReference(item: LabObservation) {
  return item.referenceLow !== undefined || item.referenceHigh !== undefined || Boolean(item.referenceRangeText)
}

function LabReference({ item, comparison }: { item: LabObservation; comparison?: LabObservation }) {
  const reference = hasReference(item) ? item : comparison
  return <span>{reference ? referenceText(reference) : LAB_REFERENCE_LABELS.noReference}{reference && reference !== item && <small className="lab-reference-comparison">최근검사 기준 · 비교용</small>}</span>
}

function LabFlagBadge({ item }: { item: LabObservation }) {
  const status = labReferenceStatus(item)
  const flag = item.flag
  return (
    <em className={`lab-flag ${labReferenceStatusClass(status)}${isCriticalLabFlag(item) ? ' critical' : ''}`}>
      {(flag === 'HIGH' || flag === 'CRITICAL_HIGH') && <ArrowUp aria-hidden="true" size={11} strokeWidth={3} />}
      {(flag === 'LOW' || flag === 'CRITICAL_LOW') && <ArrowDown aria-hidden="true" size={11} strokeWidth={3} />}
      {labReferenceStatusLabel(status)}
    </em>
  )
}

function TrendChart({ observations }: { observations: LabObservation[] }) {
  const values = observations.filter(
    (item): item is LabObservation & { value: number } => item.value !== undefined,
  )

  if (values.length === 0) {
    return <div className="lab-trend-empty">숫자형 검사 결과가 없습니다.</div>
  }

  const allValues = values.flatMap((item) => [
    item.value,
    ...(item.referenceLow !== undefined ? [item.referenceLow] : []),
    ...(item.referenceHigh !== undefined ? [item.referenceHigh] : []),
  ])
  const rawMin = Math.min(...allValues)
  const rawMax = Math.max(...allValues)
  const padding = Math.max((rawMax - rawMin) * 0.18, Math.abs(rawMax) * 0.08, 1)
  const min = rawMin - padding
  const max = rawMax + padding
  const width = 680
  const height = 250
  const left = 52
  const right = 18
  const top = 18
  const bottom = 58
  const plotWidth = width - left - right
  const plotHeight = height - top - bottom
  const dates = values.map((item) => Date.parse(item.measuredAt))
  const dated = dates.every(Number.isFinite) && dates.at(-1)! > dates[0]
  const pointWidth = plotWidth - 24
  const x = (index: number) => left + 12 + (values.length === 1 ? pointWidth / 2 : dated
    ? ((dates[index] - dates[0]) / (dates.at(-1)! - dates[0])) * pointWidth
    : (index / (values.length - 1)) * pointWidth)
  const y = (value: number) => top + ((max - value) / (max - min || 1)) * plotHeight
  const points = values.map((item, index) => `${x(index)},${y(item.value)}`).join(' ')
  const latest = values[values.length - 1]
  const low = latest.referenceLow
  const high = latest.referenceHigh

  return (
    <div className="lab-trend-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${latest.name} 검사 결과 추세`}>
        {[0, 1, 2, 3].map((line) => {
          const lineY = top + (plotHeight / 3) * line
          return <g key={line}><line x1={left} y1={lineY} x2={width - right} y2={lineY} className="trend-grid-line" /><text x={left - 8} y={lineY + 3} textAnchor="end" className="trend-axis-value">{Number((max - ((max - min) / 3) * line).toFixed(1))}</text></g>
        })}
        {low !== undefined && high !== undefined && (
          <rect
            x={left}
            y={Math.min(y(high), y(low))}
            width={plotWidth}
            height={Math.abs(y(low) - y(high))}
            className="trend-reference-band"
          />
        )}
        {low !== undefined && <line x1={left} x2={width - right} y1={y(low)} y2={y(low)} className="trend-reference-line" />}
        {high !== undefined && <line x1={left} x2={width - right} y1={y(high)} y2={y(high)} className="trend-reference-line" />}
        {values.length > 1 && <polyline points={points} className="trend-line" />}
        {values.map((item, index) => (
          <g key={item.id}>
            <title>{`${item.stageLabel || '검사'} · ${formatDate(item.measuredAt)} · ${item.value} ${item.unit} · ${labReferenceStatusLabel(labReferenceStatus(item))}`}</title>
            <circle cx={x(index)} cy={y(item.value)} r="5" className={`trend-point ${labReferenceStatusClass(labReferenceStatus(item))}`} />
            <text x={x(index)} y={y(item.value) - 11} textAnchor="middle" className="trend-value">{Number(item.value.toFixed(2))}</text>
            <text x={x(index)} y={height - 26} textAnchor="middle" className="trend-date">
              {item.measuredAt ? formatDate(item.measuredAt) : `${index + 1}회`}
            </text>
            {item.stageLabel && <text x={x(index)} y={height - 11} textAnchor="middle" className="trend-date">{item.stageLabel}</text>}
          </g>
        ))}
      </svg>
      <div className="lab-trend-legend"><span>검사일 기준 누적 수치 · {latest.unit || '단위 미제공'}</span>{(low !== undefined || high !== undefined || latest.referenceRangeText) && <span className="reference">최근 참고치 {referenceText(latest)}{numericReferenceUnit(latest)}</span>}</div>
      {values.length === 1 && <p>비교 가능한 결과가 2회 이상 쌓이면 변화 추세선이 표시됩니다.</p>}
    </div>
  )
}

function createAnnotationId() {
  return `annotation-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

/** Rendering3D.status(PENDING/PROCESSING/COMPLETED/FAILED) → 의료진용 한글 라벨 */
function renderingStatusLabel(status?: string) {
  switch (status) {
    case 'PENDING':
      return '분석 대기 중'
    case 'PROCESSING':
      return '분석 진행 중'
    case 'COMPLETED':
      return '분석 완료'
    case 'FAILED':
      return '분석 실패'
    default:
      return '결과 없음'
  }
}

export function ExaminationImagingWorkspace({
  patient,
  patients,
  imagingStudies,
  onOpenPatient,
  onSelectPatient,
  launchFocus,
}: {
  patient: PatientSummary | null
  patients: PatientSummary[]
  imagingStudies: ImagingStudySummary[]
  onOpenPatient: (patientId: string) => void
  onSelectPatient: (patient: PatientSummary) => void
  launchFocus?: 'xca' | 'ccta3d' | 'imaging' | null
}) {
  const [activeSection, setActiveSection] = useState<ExamSection>('LAB')
  const [activeTab, setActiveTab] = useState<ExamTab>('IMAGING_2D')
  const [followUpRecords, setFollowUpRecords] = useState<PatientFollowUpRecords | null>(null)
  const [clinicalAiOpen, setClinicalAiOpen] = useState(false)
  const [xcaAiOpen, setXcaAiOpen] = useState(false)
  const [xcaAiBusy, setXcaAiBusy] = useState(false)
  const closeXcaAi = useCallback(() => setXcaAiOpen(false), [])
  const [selectedLabExaminationId, setSelectedLabExaminationId] = useState<number | null>(null)
  const [labItems, setLabItems] = useState<LabObservation[]>([])
  const [sequences, setSequences] = useState<AngiographySequenceSummary[]>([])
  const [clinicalFeatureSnapshot, setClinicalFeatureSnapshot] = useState<Record<string, string> | null>(null)
  const [sequenceError, setSequenceError] = useState('')
  const [dataLoading, setDataLoading] = useState(false)
  const [labError, setLabError] = useState('')
  const [selectedLabCode, setSelectedLabCode] = useState('')
  const [selectedAssetKey, setSelectedAssetKey] = useState('')
  const [frames, setFrames] = useState<AngiographyFrame[]>([])
  const [frameIndex, setFrameIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackFps, setPlaybackFps] = useState(15)
  const [playbackLoop, setPlaybackLoop] = useState(true)
  const [frameLoading, setFrameLoading] = useState(false)
  const [frameError, setFrameError] = useState('')
  const [frameReloadKey, setFrameReloadKey] = useState(0)
  const [imageLoadError, setImageLoadError] = useState('')
  const [studySeries, setStudySeries] = useState<ImagingSeriesSummary[]>([])
  const [selectedSeriesId, setSelectedSeriesId] = useState<number | null>(null)
  const [dicomManifest, setDicomManifest] = useState<ImagingSeriesViewerManifest | null>(null)
  const [orderedDicomInstances, setOrderedDicomInstances] = useState<ImagingDicomManifestInstance[]>([])
  const [dicomLoading, setDicomLoading] = useState(false)
  const [dicomError, setDicomError] = useState('')
  const [dicomViewerStatus, setDicomViewerStatus] = useState('')
  const [dicomTransform, setDicomTransform] = useState<DicomAnnotationTransform | null>(null)
  const handleAnnotationTransform = useCallback((transform: DicomAnnotationTransform | null) => setDicomTransform(transform), [])
  const [viewerAccess, setViewerAccess] = useState<ImagingViewerAccess | null>(null)
  const [renderings3D, setRenderings3D] = useState<Rendering3DSummary[]>([])
  const [selectedRenderingId, setSelectedRenderingId] = useState<number | null>(null)
  const [renderingLoading, setRenderingLoading] = useState(false)
  const [renderingError, setRenderingError] = useState('')
  const [modelUrl, setModelUrl] = useState('')
  const [modelFormat, setModelFormat] = useState('GLB')
  const [modelStatus, setModelStatus] = useState('')
  const [modelWaiting, setModelWaiting] = useState(false)
  const [renderingAuxImages, setRenderingAuxImages] = useState<{ overlay?: string; preview?: string }>({})
  const [renderingAuxError, setRenderingAuxError] = useState('')
  const [resultLightbox, setResultLightbox] = useState<{ url: string; title: string; caption: string } | null>(null)
  const [renderingRevision, setRenderingRevision] = useState(0)
  const [renderingSaving, setRenderingSaving] = useState(false)
  const [createRenderingOpen, setCreateRenderingOpen] = useState(false)
  const [ctAiOpen, setCtAiOpen] = useState(false)
  const [renderingType, setRenderingType] = useState('CALCIFICATION_ONLY')
  const renderingTypeRef = useRef(renderingType)
  renderingTypeRef.current = renderingType
  const [requestedFormat, setRequestedFormat] = useState('STL')
  const [renderingSources, setRenderingSources] = useState<Awaited<ReturnType<typeof getRendering3DSources>>>([])
  const [modelCamera, setModelCamera] = useState<Record<string, unknown> | null>(null)
  const [restoreCamera, setRestoreCamera] = useState<Record<string, unknown> | null>(null)
  const handleCameraChange = useCallback((state: Record<string, unknown>) => setModelCamera(state), [])
  const localAnatomyTest = isLocalAnatomyGlbTest()
  const [anatomyViewMode, setAnatomyViewMode] = useState<AnatomyViewMode>('VESSEL_CALCIFICATION')
  const [active3DPane, setActive3DPane] = useState<ThreeDPane>('ORIGINAL')
  const [tool, setTool] = useState<AnnotationTool>('POINTER')
  const [annotationColor, setAnnotationColor] = useState('#ff5a64')
  const [annotationsByFrame, setAnnotationsByFrame] = useState<Record<string, ViewerAnnotation[]>>({})
  const [draftAnnotation, setDraftAnnotation] = useState<{
    key: string
    annotation: ViewerAnnotation
  } | null>(null)
  const [saveNotice, setSaveNotice] = useState('')
  const [annotationLoading, setAnnotationLoading] = useState(false)
  const [annotationSaving, setAnnotationSaving] = useState(false)
  const [annotationRecords, setAnnotationRecords] = useState<ImagingAnnotationRecord[]>([])
  const [annotationRevision, setAnnotationRevision] = useState(0)
  const annotationSaveLock = useRef(false)
  const annotationContext = useRef('')
  const renderingStudyContext = useRef<number | null>(null)
  const [labRevision, setLabRevision] = useState(0)
  const [labEditorOpen, setLabEditorOpen] = useState(false)
  const [labEditorResultId, setLabEditorResultId] = useState<number | null>(null)
  const viewerMode = activeTab === 'IMAGING_3D' ? '3D' : '2D'

  useEffect(() => {
    setClinicalAiOpen(false)
    setXcaAiOpen(false)
    setCtAiOpen(false)
    setCreateRenderingOpen(false)
    setSelectedLabExaminationId(null)
    setFollowUpRecords(null)
    setLabItems([])
    setSequences([])
    setClinicalFeatureSnapshot(null)
    setSelectedAssetKey('')
    setFrames([])
    setStudySeries([])
    setSelectedSeriesId(null)
    setDicomManifest(null)
    setRenderings3D([])
    setSelectedRenderingId(null)
    setModelUrl('')
    setLabEditorOpen(false)
    setLabEditorResultId(null)
    setAnnotationsByFrame({})
    setAnnotationRecords([])
    setSaveNotice('')
  }, [patient?.backendId])

  useEffect(() => {
    if (launchFocus === 'xca') {
      setActiveSection('IMAGING')
      setActiveTab('IMAGING_2D')
      setXcaAiOpen(true)
    } else if (launchFocus === 'ccta3d') {
      setActiveSection('IMAGING')
      setActiveTab('IMAGING_3D')
      setActive3DPane('RENDERED')
    } else if (launchFocus === 'imaging') {
      setActiveSection('IMAGING')
      setActiveTab('IMAGING_2D')
    } else if (localAnatomyTest) {
      setActiveSection('IMAGING')
      setActiveTab('IMAGING_3D')
      setActive3DPane('RENDERED')
    }
  }, [launchFocus, localAnatomyTest])

  useEffect(() => {
    if (!patient?.backendId) {
      setLabItems([])
      setSequences([])
      setSequenceError('')
      setLabError('')
      setClinicalFeatureSnapshot(null)
      return
    }

    let active = true
    setDataLoading(true)
    setLabItems([])
    setSequences([])
    setSequenceError('')
    setLabError('')
    setClinicalFeatureSnapshot(null)

    Promise.allSettled([
      getPatientLabObservations(patient.backendId),
      getPatientAngiographySequences(patient.backendId),
      getPatientClinicalFeatureSnapshot(patient.backendId),
    ]).then(([labResult, sequenceResult, clinicalSnapshotResult]) => {
      if (!active) return

      if (labResult.status === 'fulfilled') {
        setLabItems(labResult.value)
      } else {
        setLabItems([])
        setLabError(
          labResult.reason instanceof Error
            ? labResult.reason.message
            : '혈액검사 결과를 불러오지 못했습니다.',
        )
      }

      setSequences(sequenceResult.status === 'fulfilled' ? sequenceResult.value : [])
      setSequenceError(sequenceResult.status === 'rejected'
        ? sequenceResult.reason instanceof Error ? sequenceResult.reason.message : 'Angio 촬영 영상 목록을 불러오지 못했습니다.'
        : '')
      // 조회 실패는 조용히 무시한다: 원본 AngioCAD 연동이 없는 일반 환자에게는
      // 자연스럽게 자동 입력 항목이 없는 것이므로 별도 에러로 취급하지 않는다.
      setClinicalFeatureSnapshot(clinicalSnapshotResult.status === 'fulfilled' ? clinicalSnapshotResult.value : null)
      setDataLoading(false)
    })

    return () => {
      active = false
    }
  }, [patient?.backendId, labRevision])

  const labGroups = useMemo(() => {
    const groups = new Map<string, LabObservation[]>()
    labItems.forEach((item) => {
      const key = `${item.code.trim().toUpperCase()}|${item.unit.trim()}`
      const current = groups.get(key) ?? []
      current.push(item)
      groups.set(key, current)
    })
    return Array.from(groups.entries())
      .map(([key, observations]) => ({
        key,
        code: observations[0].code,
        observations: observations.sort((a, b) =>
          a.measuredAt.localeCompare(b.measuredAt) || a.id.localeCompare(b.id, undefined, { numeric: true }),
        ),
      }))
      .sort((a, b) => {
        const aIndex = labPriority.findIndex((code) => a.code.toUpperCase().includes(code))
        const bIndex = labPriority.findIndex((code) => b.code.toUpperCase().includes(code))
        return (aIndex < 0 ? 999 : aIndex) - (bIndex < 0 ? 999 : bIndex) || a.code.localeCompare(b.code)
      })
  }, [labItems])

  useEffect(() => {
    setSelectedLabCode((current) =>
      labGroups.some((group) => group.key === current)
        ? current
        : labGroups[0]?.key ?? '',
    )
  }, [labGroups])

  const studyCategories = useMemo(() => splitImagingStudies(imagingStudies), [imagingStudies])
  const visibleStudies = activeTab === 'IMAGING_3D' ? studyCategories.threeD : studyCategories.twoD
  const imagingAssets = useMemo<ImagingAsset[]>(
    () => [
      ...(activeTab === 'IMAGING_2D' ? sequences : []).map((sequence) => ({
        key: `sequence-${sequence.id}`,
        kind: 'SEQUENCE' as const,
        sequence,
      })),
      ...visibleStudies.map((study) => ({
        key: `study-${study.id}`,
        kind: 'STUDY' as const,
        study,
      })),
    ],
    [visibleStudies, sequences, activeTab],
  )

  const angiographyExaminations = useMemo(() => groupAngiographySequences(sequences), [sequences])

  useEffect(() => {
    setSelectedAssetKey((current) =>
      imagingAssets.some((asset) => asset.key === current)
        ? current
        : imagingAssets[0]?.key ?? '',
    )
  }, [imagingAssets])

  const selectedAsset = imagingAssets.find((asset) => asset.key === selectedAssetKey) ?? null
  const xcaExaminationId = selectedAsset?.kind === 'SEQUENCE' ? selectedAsset.sequence.examinationId : undefined
  const xcaSequences = sequences.filter((sequence) => xcaExaminationId !== undefined && sequence.examinationId === xcaExaminationId)
  useEffect(() => {
    if (launchFocus === 'xca') return
    setXcaAiOpen(false)
  }, [patient?.backendId, xcaExaminationId, activeSection, activeTab, launchFocus])
  const selectedStudy = selectedAsset?.kind === 'STUDY'
    ? selectedAsset.study
    : selectedAsset?.kind === 'SEQUENCE'
      ? imagingStudies.find(
          (study) => selectedAsset.sequence.examinationId !== undefined && study.examinationId === selectedAsset.sequence.examinationId,
        ) ?? null
      : null

  useEffect(() => {
    setFrames([])
    setFrameIndex(0)
    setFrameLoading(false)
    setFrameError('')
    setImageLoadError('')
    setSaveNotice('')
    if (!selectedAsset || selectedAsset.kind !== 'SEQUENCE') return

    let active = true
    setFrameLoading(true)
    getAngiographyFrames(selectedAsset.sequence.id)
      .then((items) => {
        if (active) setFrames(items)
      })
      .catch((error) => {
        if (active) {
          setFrameError(
            error instanceof Error ? error.message : '영상 프레임을 불러오지 못했습니다.',
          )
        }
      })
      .finally(() => {
        if (active) setFrameLoading(false)
      })

    return () => {
      active = false
    }
  }, [frameReloadKey, selectedAssetKey])

  useEffect(() => {
    setStudySeries([])
    if (!localAnatomyTest) setActive3DPane('ORIGINAL')
    setSelectedSeriesId(null)
    setDicomManifest(null)
    setOrderedDicomInstances([])
    setDicomError('')
    setDicomViewerStatus('')
    setViewerAccess(null)

    if (!selectedStudy || (selectedAsset?.kind !== 'STUDY' && viewerMode !== '3D')) return

    let active = true
    setDicomLoading(true)
    Promise.allSettled([
      getImagingStudySeries(selectedStudy.id),
      getImagingStudyViewerAccess(selectedStudy.id),
    ]).then(([seriesResult, accessResult]) => {
      if (!active) return
      if (seriesResult.status === 'fulfilled') {
        setStudySeries(seriesResult.value)
        setSelectedSeriesId(seriesResult.value[0]?.id ?? null)
        if (seriesResult.value.length === 0) setDicomLoading(false)
      } else {
        setDicomError(
          seriesResult.reason instanceof Error
            ? seriesResult.reason.message
            : '영상 Series 목록을 불러오지 못했습니다.',
        )
        setDicomLoading(false)
      }
      if (accessResult.status === 'fulfilled') setViewerAccess(accessResult.value)
    })

    return () => {
      active = false
    }
  }, [localAnatomyTest, selectedAsset?.kind, selectedStudy?.id, viewerMode])

  useEffect(() => {
    setDicomManifest(null)
    setOrderedDicomInstances([])
    setFrameIndex(0)
    setImageLoadError('')
    if (!selectedSeriesId) {
      if (selectedAsset?.kind === 'STUDY' || viewerMode === '3D') setDicomLoading(false)
      return
    }

    let active = true
    setDicomLoading(true)
    setDicomError('')
    getImagingSeriesViewerManifest(selectedSeriesId)
      .then((manifest) => {
        if (!active) return
        setDicomManifest(manifest)
        if (!manifest.instances.length) {
          setDicomError('viewer-manifest에 DICOM Instance가 없습니다.')
        }
      })
      .catch((error) => {
        if (active) {
          setDicomError(
            error instanceof Error ? error.message : 'DICOM viewer-manifest를 불러오지 못했습니다.',
          )
        }
      })
      .finally(() => {
        if (active) setDicomLoading(false)
      })

    return () => {
      active = false
    }
  }, [selectedAsset?.kind, selectedSeriesId, viewerMode])

  const currentDicomInstance = selectedAsset?.kind === 'STUDY'
    || viewerMode === '3D'
    ? orderedDicomInstances[frameIndex]
    : undefined

  useEffect(() => {
    setRenderings3D([])
    setSelectedRenderingId(null)
    setRenderingError('')
    setModelUrl('')
    setModelStatus('')
    setModelWaiting(false)
    setRestoreCamera(null)

    if (!selectedStudy) return

    let active = true
    setRenderingLoading(true)
    getStudyRenderings3D(selectedStudy.id)
      .then((items) => {
        if (!active) return
        const ordered = [...items].sort((a, b) => {
          const statusOrder = (status: string) => status === 'COMPLETED' ? 0 : status === 'PROCESSING' ? 1 : status === 'PENDING' ? 2 : 3
          return statusOrder(a.status) - statusOrder(b.status) || b.version - a.version
        })
        setRenderings3D(ordered)
        setSelectedRenderingId(preferredRendering(ordered, renderingTypeRef.current)?.id ?? null)
      })
      .catch((error) => {
        if (active) {
          setRenderingError(
            error instanceof Error ? error.message : '3D 렌더링 목록을 불러오지 못했습니다.',
          )
        }
      })
      .finally(() => {
        if (active) setRenderingLoading(false)
      })

    return () => {
      active = false
    }
  }, [selectedAssetKey, selectedStudy?.id, renderingRevision])

  const selectedRendering = renderings3D.find(
    (item) => item.id === selectedRenderingId,
  ) ?? null

  const renderingKinds = useMemo(
    () => visibleRenderingKinds({
      modality: selectedStudy?.modality,
      generationType: selectedRendering?.generationType || renderings3D[0]?.generationType,
      existingTypes: renderings3D.map((item) => item.renderingType),
    }),
    [renderings3D, selectedRendering?.generationType, selectedStudy?.modality],
  )

  useEffect(() => {
    if (renderingKinds.some((kind) => kind.value === renderingType)) return
    const fallback = renderingKinds[0]?.value ?? 'CALCIFICATION_ONLY'
    setRenderingType(fallback)
    setSelectedRenderingId(preferredRendering(renderings3D, fallback)?.id ?? null)
  }, [renderingKinds, renderingType, renderings3D])

  useEffect(() => {
    if (!selectedRendering || viewerMode !== '3D') return
    let active = true
    setRenderingSources([])
    void getRendering3DSources(selectedRendering.id).then((items) => { if (active) setRenderingSources(items) }).catch(() => { if (active) setRenderingSources([]) })
    return () => { active = false }
  }, [selectedRendering?.id, viewerMode])

  useEffect(() => {
    if (!selectedRendering || viewerMode !== '3D' || !(['PENDING', 'PROCESSING'].includes(selectedRendering.status) || modelWaiting)) return
    let active = true
    const timer = window.setInterval(() => {
      void getRendering3D(selectedRendering.id).then((item) => { if (active) setRenderings3D((items) => items.map((current) => current.id === item.id ? item : current)) })
        .catch((error) => { if (active) setRenderingError(error instanceof Error ? error.message : '생성 상태 조회 실패') })
    }, 5000)
    return () => { active = false; window.clearInterval(timer) }
  }, [selectedRendering?.id, selectedRendering?.status, viewerMode, modelWaiting])

  useEffect(() => {
    setModelUrl('')
    setModelStatus('')
    if (viewerMode !== '3D') return
    const backendGlbReady = selectedRendering?.status === 'COMPLETED' && isAnatomyGlbFormat(selectedRendering.fileFormat)
    if (localAnatomyTest && !backendGlbReady) {
      setModelUrl(LOCAL_ANATOMY_GLB_URL)
      setModelFormat('GLB')
      setRenderingLoading(false)
      setRenderingError('')
      setModelWaiting(false)
      return
    }
    if (!selectedRendering) return

    let active = true
    let objectUrl = ''
    setRenderingLoading(true)
    setRenderingError('')
    if (selectedRendering.status !== 'COMPLETED') {
      setRenderingLoading(false)
      setModelWaiting(false)
      return
    }
    const sourcePromise = getRendering3DViewerSource(selectedRendering.id)
    sourcePromise.then((source) => {
      if (!active) {
        if (source.downloadUrl.startsWith('blob:')) URL.revokeObjectURL(source.downloadUrl)
        return
      }
      objectUrl = source.downloadUrl
      setModelUrl(source.downloadUrl)
      setModelFormat(source.fileFormat)
      setModelWaiting(false)
    }).catch((error) => {
      if (active) {
        if (error instanceof ApiError && error.status === 409) { setModelWaiting(true); setRenderingError(''); return }
        setRenderingError(userFacing3DError(error))
      }
    }).finally(() => {
      if (active) setRenderingLoading(false)
    })

    return () => {
      active = false
      if (objectUrl.startsWith('blob:')) URL.revokeObjectURL(objectUrl)
    }
  }, [selectedRendering, viewerMode, localAnatomyTest])

  useEffect(() => {
    setRenderingAuxImages({})
    setRenderingAuxError('')
    setResultLightbox(null)
    if (viewerMode !== '3D' || !selectedRendering || selectedRendering.status !== 'COMPLETED') return

    // CCTA 석회화 overlay/preview PNG는 별도 API가 아니라
    // Rendering3D.rendering_config.overlay_file_asset_id / preview_file_asset_id 로만 연결된다.
    const config = selectedRendering.renderingConfig
    const overlayId = Number(config?.overlay_file_asset_id)
    const previewId = Number(config?.preview_file_asset_id)
    const targets: Array<{ role: 'overlay' | 'preview'; fileId: number }> = []
    if (Number.isSafeInteger(overlayId) && overlayId > 0) targets.push({ role: 'overlay', fileId: overlayId })
    if (Number.isSafeInteger(previewId) && previewId > 0) targets.push({ role: 'preview', fileId: previewId })
    if (!targets.length) return

    let active = true
    Promise.allSettled(targets.map((target) => getFileDownloadUrl(target.fileId))).then((results) => {
      if (!active) return
      const next: { overlay?: string; preview?: string } = {}
      let failed = 0
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') next[targets[index].role] = result.value
        else failed += 1
      })
      setRenderingAuxImages(next)
      if (failed) setRenderingAuxError('일부 보조 이미지(overlay/preview)를 불러오지 못했습니다.')
    })
    return () => {
      active = false
    }
  }, [selectedRendering, viewerMode])

  const selectRenderingKind = (kind: string) => {
    setRenderingType(kind)
    setSelectedRenderingId(preferredRendering(renderings3D, kind)?.id ?? null)
    setRenderingError('')
    setModelWaiting(false)
    setRestoreCamera(null)
    setModelCamera(null)
    setActive3DPane('RENDERED')
  }

  const requestRendering = async (retry = false, kind = renderingType, format = requestedFormat) => {
    if (!selectedStudy || renderingSaving) return
    setRenderingSaving(true)
    setRenderingError('')
    const studyId = selectedStudy.id
    try {
      const item = retry && selectedRendering
        ? await regenerateRendering3D(selectedRendering.id, selectedRendering.renderingConfig ?? {}, selectedRendering.fileFormat)
        : await createStudyRendering3D(studyId, { rendering_type: kind, source_series_ids: selectedSeriesId ? [selectedSeriesId] : [], file_format: format, generation_type: selectedStudy.modality.toUpperCase() === 'CT' ? 'CCTA' : 'ANGIO_2D_TO_3D' })
      if (renderingStudyContext.current !== studyId) return
      setRenderings3D((items) => [...items.filter((current) => current.id !== item.id), item])
      setSelectedRenderingId(item.id)
      setCreateRenderingOpen(false)
    } catch (error) {
      if (renderingStudyContext.current === studyId) setRenderingError(userFacing3DError(error))
    } finally { setRenderingSaving(false) }
  }

  const handleModelStatus = useCallback((status: string) => {
    setModelStatus(status)
  }, [])

  const handleModelError = useCallback((message: string) => {
    console.error('[CCTA 3D viewer]', message)
    setRenderingError('3D 결과를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.')
  }, [])

  const handleDicomOrderedInstances = useCallback((items: ImagingDicomManifestInstance[]) => {
    setOrderedDicomInstances(items)
    setFrameIndex((current) => Math.min(current, Math.max(items.length - 1, 0)))
  }, [])

  const handleDicomIndexChange = useCallback((index: number) => {
    setFrameIndex(index)
  }, [])

  const handleDicomStatus = useCallback((status: string) => {
    setDicomViewerStatus(status)
    setDicomError('')
  }, [])

  const handleDicomError = useCallback((message: string) => {
    setDicomError(message)
    setDicomViewerStatus('')
  }, [])

  const dicomFrame = currentDicomInstance
    ? {
        index: currentDicomInstance.id,
        filename: `DICOM Instance ${currentDicomInstance.instanceNumber ?? frameIndex + 1}`,
        url: currentDicomInstance.dicomUrl,
      }
    : undefined
  const currentFrame = selectedAsset?.kind === 'SEQUENCE'
    ? frames[frameIndex]
    : dicomFrame
  const dicomFrameCount = orderedDicomInstances.length || dicomManifest?.instances.length || 0
  const viewerFrameCount = viewerMode === '3D'
    ? dicomFrameCount
    : selectedAsset?.kind === 'SEQUENCE'
      ? frames.length
      : dicomFrameCount

  useEffect(() => {
    if (!isPlaying || viewerMode !== '2D' || viewerFrameCount < 2 || imageLoadError) return

    const timer = window.setInterval(() => {
      setFrameIndex((current) => current >= viewerFrameCount - 1
        ? playbackLoop ? 0 : current
        : current + 1)
    }, Math.max(16, Math.round(1000 / playbackFps)))

    return () => window.clearInterval(timer)
  }, [imageLoadError, isPlaying, playbackFps, playbackLoop, viewerFrameCount, viewerMode])

  useEffect(() => {
    if (isPlaying && !playbackLoop && frameIndex >= viewerFrameCount - 1) {
      setIsPlaying(false)
    }
  }, [frameIndex, isPlaying, playbackLoop, viewerFrameCount])

  useEffect(() => {
    setIsPlaying(false)
  }, [activeSection, activeTab, selectedAssetKey, selectedSeriesId, tool])

  useEffect(() => {
    if (selectedAsset?.kind !== 'SEQUENCE' || !frames.length) return
    for (let offset = 1; offset <= Math.min(12, frames.length - 1); offset += 1) {
      const nextFrame = frames[(frameIndex + offset) % frames.length]
      if (nextFrame?.url) {
        const image = new Image()
        image.src = nextFrame.url
      }
    }
  }, [frameIndex, frames, selectedAsset?.kind])
  const frameAnnotationKey = selectedAsset && currentFrame
    ? `${selectedAsset.key}-frame-${currentFrame.index}`
    : ''
  const original3DAnnotationKey = selectedStudy && currentDicomInstance
    ? `study-${selectedStudy.id}-series-${selectedSeriesId}-instance-${currentDicomInstance.id}-original-dicom`
    : ''
  const rendered3DAnnotationKey = selectedRendering
    ? `rendering-${selectedRendering.id}-rendered`
    : ''
  const activeAnnotationKey = viewerMode === '2D'
    ? frameAnnotationKey
    : active3DPane === 'ORIGINAL'
      ? original3DAnnotationKey
      : rendered3DAnnotationKey
  renderingStudyContext.current = selectedStudy?.id ?? null
  const isDicomPane = selectedAsset?.kind === 'STUDY' && viewerMode === '2D' || viewerMode === '3D' && active3DPane === 'ORIGINAL'
  const canPersistAnnotation = Boolean(selectedStudy && (selectedAsset?.kind === 'STUDY' || viewerMode === '3D' && active3DPane === 'RENDERED'))
  annotationContext.current = activeAnnotationKey
  useEffect(() => {
    setAnnotationRecords([])
    setAnnotationsByFrame({})
    setDraftAnnotation(null)
    setSaveNotice('')
    if (!selectedStudy) return
    let active = true
    setAnnotationLoading(true)
    void getImagingAnnotations(selectedStudy.id).then((records) => {
      if (!active) return
      setAnnotationRecords(records)
      const byKey: Record<string, ViewerAnnotation[]> = {}
      let unsupported = 0
      records.forEach((record) => {
        const annotation = fromServerAnnotation(record)
        if (!annotation) { unsupported += 1; return }
        const key = annotationRecordKey(record, selectedStudy.id)
        ;(byKey[key] ??= []).push(annotation)
      })
      setAnnotationsByFrame(byKey)
      if (unsupported) setSaveNotice(`${unsupported}개 주석은 다른 좌표 형식으로 저장되어 있습니다.`)
    }).catch((error) => { if (active) setSaveNotice(error instanceof Error ? error.message : '주석 조회 실패') })
      .finally(() => { if (active) setAnnotationLoading(false) })
    return () => { active = false }
  }, [selectedStudy?.id, annotationRevision])
  const annotations = activeAnnotationKey
    ? annotationsByFrame[activeAnnotationKey] ?? []
    : []
  const annotationTargetAvailable = viewerMode === '2D'
    ? Boolean(currentFrame && !imageLoadError && (selectedAsset?.kind !== 'STUDY' || dicomTransform))
    : active3DPane === 'ORIGINAL'
      ? Boolean(currentDicomInstance && !dicomError && dicomTransform)
      : Boolean(modelUrl)

  const pointFromEvent = (event: ReactPointerEvent<SVGSVGElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect()
    const point = {
      x: Math.max(0, Math.min(1000, ((event.clientX - rect.left) / rect.width) * 1000)),
      y: Math.max(0, Math.min(600, ((event.clientY - rect.top) / rect.height) * 600)),
    }
    return isDicomPane && dicomTransform ? dicomTransform.toImage(point) : point
  }

  const commitAnnotation = (annotationKey: string, annotation: ViewerAnnotation) => {
    if (!annotationKey) return
    setAnnotationsByFrame((current) => ({
      ...current,
      [annotationKey]: [...(current[annotationKey] ?? []), { ...annotation, coordinateSpace: isDicomPane ? 'image_normalized' : 'viewport_normalized', cameraState: active3DPane === 'RENDERED' && viewerMode === '3D' ? modelCamera : null }],
    }))
    setSaveNotice('저장되지 않은 변경사항')
  }

  const saveAnnotations = async () => {
    if (!canPersistAnnotation || !selectedStudy || !activeAnnotationKey || annotationSaveLock.current || annotationLoading) return
    annotationSaveLock.current = true
    setAnnotationSaving(true)
    const key = activeAnnotationKey
    const originals = annotationRecords.filter((item) => annotationRecordKey(item, selectedStudy.id) === key)
    try {
      annotations.forEach(annotationGeometry)
      const retainedIds = new Set(annotations.map((item) => item.serverId))
      // Only supported annotations explicitly removed from the active target are deleted.
      for (const record of originals) {
        if (!fromServerAnnotation(record) || retainedIds.has(record.id)) continue
        await deleteImagingAnnotation(record.id)
        setAnnotationRecords((items) => items.filter((item) => item.id !== record.id))
      }
      for (const annotation of annotations) {
        const input: ImagingAnnotationInput = {
          viewer_type: viewerMode === '2D' ? '2D' : active3DPane === 'ORIGINAL' ? '3D_ORIGINAL' : '3D_RENDERED',
          imaging_series: viewerMode === '2D' || active3DPane === 'ORIGINAL' ? selectedSeriesId : null,
          imaging_instance: viewerMode === '2D' || active3DPane === 'ORIGINAL' ? currentDicomInstance?.id : null,
          rendering_3d: viewerMode === '3D' && active3DPane === 'RENDERED' ? selectedRendering?.id : null,
          tool_type: annotation.type,
          geometry_json: annotationGeometry(annotation), color: annotation.color,
          text_content: annotation.type === 'TEXT' ? annotation.text : null,
          frame_index: viewerMode === '2D' ? 0 : null,
          slice_index: viewerMode === '3D' && active3DPane === 'ORIGINAL' ? frameIndex : null,
          camera_state_json: annotation.cameraState ?? null,
        }
        const original = originals.find((item) => item.id === annotation.serverId)
        if (original && JSON.stringify(original.geometry_json) === JSON.stringify(input.geometry_json) && (original.text_content ?? null) === input.text_content && original.color === input.color) continue
        const record = annotation.serverId
          ? await updateImagingAnnotation(annotation.serverId, input)
          : await createImagingAnnotation(selectedStudy.id, input)
        if (annotationContext.current !== key) continue
        setAnnotationsByFrame((current) => ({ ...current, [key]: (current[key] ?? []).map((item) => item.id === annotation.id ? { ...item, serverId: record.id } : item) }))
        setAnnotationRecords((items) => [...items.filter((item) => item.id !== record.id), record])
      }
      if (annotationContext.current === key) setSaveNotice('주석 서버 저장 완료')
    } catch (error) {
      if (annotationContext.current === key) setSaveNotice(error instanceof Error ? error.message : '주석 서버 저장 실패')
    } finally { annotationSaveLock.current = false; setAnnotationSaving(false) }
  }

  const handlePointerDown = (
    annotationKey: string,
    targetAvailable: boolean,
    event: ReactPointerEvent<SVGSVGElement>,
  ) => {
    if (!targetAvailable || !annotationKey || tool === 'POINTER' || annotationSaving || annotationLoading) return
    const point = pointFromEvent(event)

    if (tool === 'TEXT') {
      const text = window.prompt('영상에 표시할 내용을 입력하세요.')?.trim()
      if (text) {
        commitAnnotation(annotationKey, { id: createAnnotationId(), type: 'TEXT', point, text, color: annotationColor })
      }
      return
    }

    event.currentTarget.setPointerCapture(event.pointerId)
    if (tool === 'FREEHAND') {
      setDraftAnnotation({
        key: annotationKey,
        annotation: { id: createAnnotationId(), type: 'FREEHAND', points: [point], color: annotationColor, coordinateSpace: isDicomPane ? 'image_normalized' : 'viewport_normalized' },
      })
    } else {
      setDraftAnnotation({
        key: annotationKey,
        annotation: { id: createAnnotationId(), type: 'RECTANGLE', start: point, end: point, color: annotationColor, coordinateSpace: isDicomPane ? 'image_normalized' : 'viewport_normalized' },
      })
    }
  }

  const handlePointerMove = (annotationKey: string, event: ReactPointerEvent<SVGSVGElement>) => {
    if (!draftAnnotation || draftAnnotation.key !== annotationKey) return
    const point = pointFromEvent(event)
    setDraftAnnotation((current) => {
      if (!current) return null
      if (current.key !== annotationKey) return current
      if (current.annotation.type === 'FREEHAND') {
        return {
          ...current,
          annotation: {
            ...current.annotation,
            points: [...current.annotation.points, point],
          },
        }
      }
      if (current.annotation.type === 'RECTANGLE') {
        return { ...current, annotation: { ...current.annotation, end: point } }
      }
      return current
    })
  }

  const handlePointerUp = (annotationKey: string, event: ReactPointerEvent<SVGSVGElement>) => {
    if (!draftAnnotation || draftAnnotation.key !== annotationKey) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    const completedAnnotation = draftAnnotation.annotation
    if (
      (completedAnnotation.type === 'FREEHAND' && completedAnnotation.points.length > 1) ||
      (completedAnnotation.type === 'RECTANGLE' &&
        (Math.abs(completedAnnotation.end.x - completedAnnotation.start.x) > 2 ||
          Math.abs(completedAnnotation.end.y - completedAnnotation.start.y) > 2))
    ) {
      commitAnnotation(annotationKey, completedAnnotation)
    }
    setDraftAnnotation(null)
  }

  const renderAnnotation = (source: ViewerAnnotation) => {
    const convert = (point: Point) => source.coordinateSpace === 'image_normalized' && dicomTransform ? dicomTransform.toViewport(point) : point
    const annotation: ViewerAnnotation = source.type === 'FREEHAND' ? { ...source, points: source.points.map(convert) } : source.type === 'RECTANGLE' ? { ...source, start: convert(source.start), end: convert(source.end) } : { ...source, point: convert(source.point) }
    if (source.cameraState && JSON.stringify(source.cameraState) !== JSON.stringify(modelCamera)) return null
    if (annotation.type === 'FREEHAND') {
      return (
        <polyline
          key={annotation.id}
          points={annotation.points.map((point) => `${point.x},${point.y}`).join(' ')}
          fill="none"
          stroke={annotation.color}
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )
    }
    if (annotation.type === 'RECTANGLE') {
      return (
        <rect
          key={annotation.id}
          x={Math.min(annotation.start.x, annotation.end.x)}
          y={Math.min(annotation.start.y, annotation.end.y)}
          width={Math.abs(annotation.end.x - annotation.start.x)}
          height={Math.abs(annotation.end.y - annotation.start.y)}
          fill="transparent"
          stroke={annotation.color}
          strokeWidth="4"
        />
      )
    }
    return (
      <text
        key={annotation.id}
        x={annotation.point.x}
        y={annotation.point.y}
        fill={annotation.color}
        stroke="#0b1420"
        strokeWidth="1"
        paintOrder="stroke"
        fontSize="28"
        fontWeight="700"
      >
        {annotation.text}
      </text>
    )
  }

  const renderAnnotationLayer = (
    annotationKey: string,
    targetAvailable: boolean,
  ) => {
    if (!annotationKey || !targetAvailable) return null
    const targetAnnotations = annotationsByFrame[annotationKey] ?? []
    const targetDraft = draftAnnotation?.key === annotationKey
      ? draftAnnotation.annotation
      : null

    return (
      <svg
        className="image-annotation-layer"
        viewBox="0 0 1000 600"
        preserveAspectRatio="none"
        onPointerDown={(event) => handlePointerDown(annotationKey, targetAvailable, event)}
        onPointerMove={(event) => handlePointerMove(annotationKey, event)}
        onPointerUp={(event) => handlePointerUp(annotationKey, event)}
        onPointerCancel={() => setDraftAnnotation(null)}
      >
        {targetAnnotations.map(renderAnnotation)}
        {targetDraft && renderAnnotation(targetDraft)}
      </svg>
    )
  }

  const renderDicomViewport = () => {
    if (!dicomManifest?.instances.length) {
      return (
        <div className="image-viewer-empty">
          <Images size={34} />
          <strong>{dicomLoading ? 'DICOM 원본 연결 중…' : '표시할 DICOM 원본이 없습니다'}</strong>
          <span>{dicomError || '선택한 Series의 viewer-manifest를 확인해주세요.'}</span>
        </div>
      )
    }

    return (
      <Suspense fallback={<div className="image-viewer-empty"><Images size={34} /><strong>DICOM 뷰어 준비 중…</strong></div>}>
        <CornerstoneDicomViewer
          instances={dicomManifest.instances}
          currentIndex={frameIndex}
          onCurrentIndexChange={handleDicomIndexChange}
          onOrderedInstances={handleDicomOrderedInstances}
          onStatus={handleDicomStatus}
          onError={handleDicomError}
          onAnnotationTransform={handleAnnotationTransform}
        />
      </Suspense>
    )
  }

  const selectedLab = labGroups.find((group) => group.key === selectedLabCode)
  const latestLabItems = labGroups.map((group) => group.observations.at(-1)!)
  const latestLabCounts = countLabReferenceStatuses(latestLabItems)
  const labAiCandidates = useMemo(() => {
    if (followUpRecords?.patient.id !== patient?.backendId) return []
    return (followUpRecords?.visits ?? []).flatMap((visit) =>
      visit.examinations
        .filter((exam) => exam.examinationType.category.toUpperCase().includes('LAB') || exam.examinationType.code.toUpperCase().includes('LAB'))
        .map((exam) => ({ exam, stageLabel: visit.stageLabel, visitDate: visit.visitDate })),
    )
  }, [followUpRecords, patient?.backendId])
  const selectedLabAi = selectLabExaminationForPatient(
    labAiCandidates,
    selectedLabExaminationId,
    patient?.backendId,
    followUpRecords?.patient.id,
  )
  const displayPatient = patient && followUpRecords && followUpRecords.patient.id === patient.backendId ? {
    ...patient,
    name: followUpRecords.patient.name || patient.name,
    sex: followUpRecords.patient.sex ?? patient.sex,
    age: followUpRecords.patient.age ?? patient.age,
  } : patient
  const clinicalLabInput = useMemo(
    () => buildClinicalAiInput(clinicalFeatureSnapshot, selectedLabAi?.exam),
    [selectedLabAi, clinicalFeatureSnapshot],
  )
  const anatomyCapable = localAnatomyTest || hasAnatomyGlbCapability({ rendering: selectedRendering, fileFormat: modelFormat })
  const hasAuxImages = Boolean(renderingAuxImages.preview || renderingAuxImages.overlay)

  const openLabAi = (examinationId?: number) => {
    if (followUpRecords?.patient.id !== patient?.backendId) return
    const targetId = examinationId ?? selectedLabAi?.exam.examinationId ?? labAiCandidates.at(-1)?.exam.examinationId
    if (!targetId) return
    if (!labAiCandidates.some((candidate) => candidate.exam.examinationId === targetId)) return
    setSelectedLabExaminationId(targetId)
    setClinicalAiOpen(true)
  }

  return (
    <div className="module-content examination-imaging-content">
      <ExaminationPatientSearch patients={patients} onSelect={onSelectPatient} />
      <section className="exam-patient-strip">
        <div>
          <small>현재 선택 환자</small>
          <strong>{displayPatient?.name ?? '선택된 환자 없음'}</strong>
          <span>{displayPatient ? `${displayPatient.id} · ${displayPatient.sex === 'F' ? '여자' : '남자'}/${displayPatient.age}` : '워크스테이션에서 환자를 선택해주세요.'}</span>
        </div>
        {patient && <div className="exam-strip-actions"><button onClick={() => onOpenPatient(patient.id)} type="button">워크스테이션 열기</button></div>}
      </section>

      <nav className="exam-data-tabs exam-section-tabs" aria-label="검사 종류">
        <button className={activeSection === 'LAB' ? 'active' : ''} aria-pressed={activeSection === 'LAB'} onClick={() => setActiveSection('LAB')} type="button">
          <FlaskConical size={16} />혈액검사 <b>{labGroups.length}</b>
        </button>
        <button className={activeSection === 'IMAGING' ? 'active' : ''} aria-pressed={activeSection === 'IMAGING'} onClick={() => setActiveSection('IMAGING')} type="button">
          <Images size={16} />영상검사 <b>{sequences.length + imagingStudies.length}</b>
        </button>
      </nav>

      <div hidden={activeSection !== 'LAB'}>
        <FollowUpTimeline scope="LAB" refreshKey={labRevision} patientId={patient?.backendId} onRecords={setFollowUpRecords} labObservations={labItems} selectedExaminationId={selectedLabAi?.exam.examinationId} onSelectLab={(examinationId) => { setSelectedLabExaminationId(examinationId); setActiveSection('LAB') }} onAnalyzeLab={() => openLabAi()} />
      </div>

      {activeSection === 'IMAGING' && (
        <nav className="exam-imaging-subtabs" aria-label="영상검사 종류">
          <button className={activeTab === 'IMAGING_2D' ? 'active' : ''} aria-pressed={activeTab === 'IMAGING_2D'} onClick={() => setActiveTab('IMAGING_2D')} type="button"><Images size={15} />2D 혈관조영·영상 <b>{sequences.length + studyCategories.twoD.length}</b></button>
          <button className={activeTab === 'IMAGING_3D' ? 'active' : ''} aria-pressed={activeTab === 'IMAGING_3D'} onClick={() => { setActiveTab('IMAGING_3D'); if (localAnatomyTest) setActive3DPane('RENDERED') }} type="button"><Rotate3D size={15} />3D 원본·렌더링 <b>{studyCategories.threeD.length}</b></button>
          <span>{activeTab === 'IMAGING_2D' ? '촬영 시리즈를 선택해 연속 프레임을 확인합니다.' : 'CT·MR 원본과 3D 렌더링 결과를 확인합니다.'}</span>
        </nav>
      )}


      {activeSection === 'IMAGING' ? (
        <div className={`imaging-review-layout ${viewerMode === '3D' ? 'large-three-d-layout' : ''}`}>
          <section className="feature-card imaging-exam-list">
            <header><div><h2>{viewerMode === '3D' ? '3D 원본 검사 목록' : '2D 영상검사 목록'}</h2><span>{viewerMode === '3D' ? '원본 검사를 선택해 렌더링을 확인합니다.' : '촬영 영상을 선택하면 영상이 열립니다.'}</span></div></header>
            <div>
              {viewerMode === '2D' && sequenceError && <p className="api-inline-notice" role="alert">Angio 촬영 영상 조회 실패: {sequenceError}</p>}
              {(viewerMode === '2D' ? angiographyExaminations : []).map((examination) => (
                <section className="angio-examination-group" key={examination.key} aria-label={`관상동맥 조영술 ${examination.examinationId ?? '검사 연결 미등록'}`}>
                  <header>
                    <strong>{examination.performedAt ? formatAngiographyDate(examination.performedAt) : '촬영일 미등록'} 관상동맥 조영술</strong>
                    <small>{examination.examinationId === undefined ? '검사 연결 미등록 · ' : ''}촬영 영상 {examination.sequenceCount}개</small>
                  </header>
                  {examination.sides.map((group) => (
                    <details className={`angio-side-group side-${group.side.toLowerCase()}`} key={group.side} open>
                      <summary><strong>{group.label}</strong><span>촬영 영상 {group.sequences.length}개</span></summary>
                      {group.side === 'UNKNOWN' && <p className="angio-side-notice">좌·우 정보가 없는 촬영 영상입니다.</p>}
                      {group.sequences.map((sequence) => (
                        <button
                          key={sequence.id}
                          className={`imaging-asset-button${selectedAssetKey === `sequence-${sequence.id}` ? ' active' : ''}`}
                          aria-pressed={selectedAssetKey === `sequence-${sequence.id}`}
                          onClick={() => setSelectedAssetKey(`sequence-${sequence.id}`)}
                          type="button"
                        >
                          <span className="imaging-list-icon"><Images size={16} /></span>
                          <span>
                            <strong title={sequence.displayName}>{sequence.displayName}</strong>
                            <small>{sequence.coronarySideLabel} · 촬영 {sequence.sequenceNo}</small>
                          </span>
                          <b>{sequence.frameCount}F</b>
                        </button>
                      ))}
                    </details>
                  ))}
                </section>
              ))}
              {visibleStudies.map((study) => (
                  <button
                    key={`study-${study.id}`}
                    className={`imaging-asset-button${selectedAssetKey === `study-${study.id}` ? ' active' : ''}`}
                    aria-pressed={selectedAssetKey === `study-${study.id}`}
                    onClick={() => setSelectedAssetKey(`study-${study.id}`)}
                    type="button"
                  >
                    <span className="imaging-list-icon"><Images size={16} /></span>
                    <span>
                      <strong>{study.description}</strong>
                      <small>{study.modality} · {study.studyDate ? formatDate(study.studyDate) : '검사일 미등록'}</small>
                    </span>
                    <b>{study.status}</b>
                  </button>
              ))}
              {!dataLoading && !(viewerMode === '2D' && sequenceError) && imagingAssets.length === 0 && (
                <div className="feature-empty"><Images size={28} /><strong>{viewerMode === '3D' ? '등록된 3D 원본 검사가 없습니다' : '등록된 2D 영상검사가 없습니다'}</strong><span>{viewerMode === '3D' ? 'CT·MR 원본 검사 연동 후 표시됩니다.' : '2D DICOM 또는 CAG 프레임 연동 후 표시됩니다.'}</span></div>
              )}
              {dataLoading && <div className="feature-empty">검사 데이터를 불러오는 중…</div>}
            </div>
          </section>

          <section className="feature-card clinical-image-viewer">
            <header className="image-viewer-header">
              <div>
                <strong>{selectedAsset ? (selectedAsset.kind === 'SEQUENCE' ? selectedAsset.sequence.displayName : selectedAsset.study.description) : '영상 뷰어'}</strong>
                <small>{viewerMode === '3D' ? (active3DPane === 'ORIGINAL' ? '원본 CT · 슬라이스 조회' : selectedRendering ? `${renderingLabel(selectedRendering.renderingType)} · v${selectedRendering.version}` : '3D 렌더링 결과 조회') : (currentFrame ? `${currentFrame.filename} · ${frameIndex + 1}/${viewerFrameCount}` : selectedStudy ? `Series ${studySeries.length}개 · Instance ${viewerFrameCount}개` : '검사를 선택해주세요.')}</small>
              </div>
              <div className="image-viewer-actions">
                {viewerMode === '3D' && <button className="ct-ai-launch" type="button" disabled={!selectedStudy || selectedStudy.modality.toUpperCase() !== 'CT' || !selectedSeriesId} onClick={() => setCtAiOpen(true)}><BrainCircuit size={15} />석회화 AI 분석</button>}
                {viewerMode === '2D' && selectedAsset?.kind === 'SEQUENCE' && (
                  <>
                    <button className="xca-launch" type="button"
                      disabled={!patient?.backendId || !xcaExaminationId}
                      onClick={() => setXcaAiOpen(true)} title="같은 Angio 검사의 분류된 전체 시리즈 분석">
                      <BrainCircuit size={15} />{xcaAiBusy ? '2D AI 분석 중…' : '2D AI 분석·저장 결과'}
                    </button>
                  </>
                )}
                <div className="annotation-toolbar" aria-label="영상 주석 도구">
                    {([
                      ['POINTER', MousePointer2, '포인터'],
                      ['FREEHAND', Pencil, '자유 그리기'],
                      ['RECTANGLE', Square, '박스'],
                      ['TEXT', Type, '텍스트'],
                    ] as const).map(([value, Icon, label]) => (
                      <button key={value} className={tool === value ? 'active' : ''} onClick={() => setTool(value)} disabled={!annotationTargetAvailable} title={label} type="button"><Icon size={15} /></button>
                    ))}
                    <input aria-label="주석 색상" type="color" value={annotationColor} onChange={(event) => setAnnotationColor(event.target.value)} disabled={!annotationTargetAvailable} />
                    <span />
                    <button
                      onClick={() => {
                        if (!activeAnnotationKey) return
                        setAnnotationsByFrame((current) => ({ ...current, [activeAnnotationKey]: annotations.slice(0, -1) }))
                        setSaveNotice('저장되지 않은 변경사항')
                      }}
                      disabled={annotations.length === 0}
                      title="되돌리기"
                      type="button"
                    ><Undo2 size={15} /></button>
                    <button
                      onClick={() => {
                        if (!activeAnnotationKey) return
                        setAnnotationsByFrame((current) => ({ ...current, [activeAnnotationKey]: [] }))
                        setSaveNotice('저장되지 않은 변경사항')
                      }}
                      disabled={annotations.length === 0}
                      title="현재 프레임 주석 지우기"
                      type="button"
                    ><Eraser size={15} /></button>
                    <button
                      className="annotation-save"
                      onClick={saveAnnotations}
                      disabled={!canPersistAnnotation || annotationLoading || annotationSaving || (!annotations.length && !annotationRecords.some((record) => annotationRecordKey(record, selectedStudy?.id ?? 0) === activeAnnotationKey && fromServerAnnotation(record)))}
                      title={selectedStudy ? '주석 서버 저장' : '서버 저장에는 이 영상의 Study·Series 연결이 필요합니다'}
                      type="button"
                    ><Save size={15} /><em>저장</em></button>
                    <button type="button" title="마지막 텍스트 주석 수정" disabled={annotationSaving || !annotations.some((item) => item.type === 'TEXT')} onClick={() => { const last = annotations.filter((item) => item.type === 'TEXT').at(-1); if (last?.type !== 'TEXT') return; const text = window.prompt('주석 텍스트 수정', last.text); if (text == null || !text.trim()) return; setAnnotationsByFrame((current) => ({ ...current, [activeAnnotationKey]: (current[activeAnnotationKey] ?? []).map((item) => item.id === last.id ? { ...item, text: text.trim() } : item) })); setSaveNotice('저장되지 않은 변경사항') }}>텍스트 수정</button>
                    {viewerMode === '3D' && active3DPane === 'RENDERED' && <button type="button" disabled={!annotations.some((item) => item.cameraState)} onClick={() => setRestoreCamera([...annotations].reverse().find((item) => item.cameraState)?.cameraState ?? null)}>주석 저장 시점 보기</button>}
                  </div>
              </div>
            </header>

            {viewerMode === '3D' && <nav className="ct-view-tabs" role="tablist" aria-label="CT 영상 보기">
              <button id="ct-original-tab" type="button" role="tab" aria-controls="ct-original-panel" aria-selected={active3DPane === 'ORIGINAL'} className={active3DPane === 'ORIGINAL' ? 'active' : ''} onClick={() => setActive3DPane('ORIGINAL')}><Images size={18} />원본 CT</button>
              <button id="ct-rendered-tab" type="button" role="tab" aria-controls="ct-rendered-panel" aria-selected={active3DPane === 'RENDERED'} className={active3DPane === 'RENDERED' ? 'active' : ''} onClick={() => setActive3DPane('RENDERED')}><Rotate3D size={18} />3D 렌더링</button>
            </nav>}

            {viewerMode === '2D' && selectedAsset?.kind === 'STUDY' && (
              <div className="dicom-browser-bar">
                <label>
                  <span>Series</span>
                  <select value={selectedSeriesId ?? ''} onChange={(event) => setSelectedSeriesId(Number(event.target.value) || null)} disabled={!studySeries.length}>
                    {!studySeries.length && <option value="">Series 없음</option>}
                    {studySeries.map((series) => <option key={series.id} value={series.id}>{series.seriesNumber ?? series.id} · {series.description} ({series.instanceCount})</option>)}
                  </select>
                </label>
                <span className={viewerAccess ? 'connected' : ''}><i />{viewerAccess ? `Orthanc 인증 ${viewerAccess.expiresIn}초` : 'Orthanc 인증 확인 중'}</span>
                <button onClick={() => viewerAccess?.viewerUrl && window.open(viewerAccess.viewerUrl, '_blank', 'noopener,noreferrer')} disabled={!viewerAccess?.viewerUrl} title={viewerAccess?.viewerUrl ? 'Orthanc 원본 뷰어 열기' : '백엔드 응답에 viewer_url이 필요합니다.'} type="button">원본 뷰어</button>
              </div>
            )}

            {selectedAsset?.kind === 'SEQUENCE' && <p className="api-inline-notice">이 Angio 시퀀스의 주석은 화면에서만 편집됩니다. 서버 저장에는 해당 Study·Series 연결이 필요합니다.</p>}
            {viewerMode === '3D' && active3DPane === 'RENDERED' && selectedStudy && <div className="rendering-action-bar"><button type="button" disabled={renderingSaving} onClick={() => setRenderingRevision((value) => value + 1)}>목록 새로고침</button><button type="button" disabled={renderingSaving || !selectedSeriesId} onClick={() => setCreateRenderingOpen(true)}>고급 생성 설정</button></div>}

            <div className={`clinical-image-stage viewer-${viewerMode.toLowerCase()} tool-${tool.toLowerCase()}`}>
              {viewerMode === '2D' && selectedAsset?.kind === 'SEQUENCE' && currentFrame && <img key={currentFrame.url} src={currentFrame.url} alt={`${currentFrame.filename} 혈관조영 영상`} draggable={false} onLoad={() => setImageLoadError('')} onError={() => setImageLoadError('2D 프레임 URL에 브라우저가 접근하지 못했습니다.')} />}
              

              {viewerMode === '2D' && selectedAsset?.kind === 'STUDY' && renderDicomViewport()}
              {viewerMode === '2D' && currentFrame && !imageLoadError && (
                renderAnnotationLayer(frameAnnotationKey, true)
              )}
              {viewerMode === '2D' && selectedAsset?.kind === 'SEQUENCE' && imageLoadError && (
                <div className="image-viewer-empty image-load-error">
                  <Images size={34} />
                  <strong>2D 영상을 불러오지 못했습니다</strong>
                  <span>{imageLoadError}<br />RustFS 또는 Orthanc 프리뷰 주소와 CORS 설정을 확인해주세요.</span>
                  <button onClick={() => setFrameReloadKey((current) => current + 1)} type="button"><RefreshCw size={14} />새 URL로 다시 시도</button>
                </div>
              )}
              {viewerMode === '2D' && selectedAsset?.kind !== 'STUDY' && !currentFrame && (
                <div className="image-viewer-empty">
                  <Images size={34} />
                  <strong>{frameLoading ? '영상 프레임을 불러오는 중…' : '표시할 영상이 없습니다'}</strong>
                  <span>{frameError || 'CAG 시퀀스를 선택하거나 데이터 연동 상태를 확인해주세요.'}</span>
                </div>
              )}
              {viewerMode === '3D' && (
                <div className="three-d-comparison three-d-single-view">
                  {active3DPane === 'ORIGINAL' && <section
                    id="ct-original-panel" role="tabpanel" aria-labelledby="ct-original-tab"
                    className={`three-d-pane three-d-original-pane ${active3DPane === 'ORIGINAL' ? 'active' : ''}`}
                    onPointerDown={() => setActive3DPane('ORIGINAL')}
                  >
                    <header>
                      <span><i className={currentDicomInstance ? 'connected' : ''} />원본 {selectedStudy?.modality || 'CT·MR'} DICOM</span>
                      <small>{viewerFrameCount ? `${frameIndex + 1}/${viewerFrameCount} slice` : 'DICOM'}</small>
                    </header>
                    <div className={`three-d-stage tool-${tool.toLowerCase()}`}>
                      {renderDicomViewport()}
                      {renderAnnotationLayer(original3DAnnotationKey, Boolean(currentDicomInstance && !dicomError))}
                    </div>
                    <footer className="three-d-slice-footer"><div className="three-d-slice-controls"><button type="button" aria-label="이전 CT 슬라이스" disabled={!viewerFrameCount || frameIndex === 0} onClick={() => setFrameIndex((value) => Math.max(0, value - 1))}><ChevronLeft size={18} /></button><input type="range" aria-label="CT 슬라이스 선택" min="0" max={Math.max(0, viewerFrameCount - 1)} value={Math.min(frameIndex, Math.max(0, viewerFrameCount - 1))} disabled={viewerFrameCount < 2} onChange={(event) => setFrameIndex(Number(event.target.value))} /><span>{viewerFrameCount ? `${frameIndex + 1}/${viewerFrameCount}` : '0/0'}</span><button type="button" aria-label="다음 CT 슬라이스" disabled={!viewerFrameCount || frameIndex >= viewerFrameCount - 1} onClick={() => setFrameIndex((value) => Math.min(viewerFrameCount - 1, value + 1))}><ChevronRight size={18} /></button></div><small>{dicomError || dicomViewerStatus || '원본 CT 슬라이스를 선택해주세요.'}</small></footer>
                  </section>}

                  {active3DPane === 'RENDERED' && <section
                    id="ct-rendered-panel" role="tabpanel" aria-labelledby="ct-rendered-tab"
                    className={`three-d-pane three-d-rendered-pane ${active3DPane === 'RENDERED' ? 'active' : ''}`}
                    onPointerDown={() => setActive3DPane('RENDERED')}
                  >
                    <header>
                      <span><i className={modelUrl ? 'connected' : ''} />{localAnatomyTest ? 'CCTA 3D 렌더링' : `${renderingLabel(renderingType)} 렌더링`}</span>
                      <small>{localAnatomyTest ? 'GLB · 혈관 · 석회화' : selectedRendering ? `v${selectedRendering.version} · ${modelFormat}` : '결과 선택'}</small>
                    </header>
                    <div className="ccta-summary-bar">
                      <span className="ccta-summary-tag">CCTA</span>
                      <span className="ccta-summary-date">{selectedStudy?.studyDate ? formatDate(selectedStudy.studyDate) : '검사일 미등록'}</span>
                      <span className={`ccta-status-badge status-${(localAnatomyTest ? 'completed' : selectedRendering?.status ?? 'empty').toLowerCase()}`}>{renderingStatusLabel(localAnatomyTest ? 'COMPLETED' : selectedRendering?.status)}</span>
                      {Number.isSafeInteger(CT_AI_VERSION_ID) && CT_AI_VERSION_ID > 0 && <small className="ccta-summary-model">AI 모델 v{CT_AI_VERSION_ID}</small>}
                    </div>
                    <nav className="rendering-kind-buttons" aria-label="렌더링 종류 바로 보기">
                      {(anatomyCapable ? ANATOMY_VIEW_MODES : renderingKinds).map((kind) => {
                        const active = anatomyCapable ? anatomyViewMode === kind.value : renderingType === kind.value
                        return (
                          <button
                            key={kind.value}
                            type="button"
                            aria-pressed={active}
                            className={active ? 'active' : ''}
                            disabled={anatomyCapable ? false : (renderingSaving || renderingLoading)}
                            onClick={() => {
                              if (anatomyCapable) setAnatomyViewMode(kind.value as AnatomyViewMode)
                              else selectRenderingKind(kind.value)
                            }}
                          >
                            {kind.label}
                          </button>
                        )
                      })}
                    </nav>
                    <div className={`three-d-result-layout ${anatomyCapable ? 'anatomy-main-layout' : ''} ${hasAuxImages ? 'has-aux-side' : 'viewer-only'}`}>
                      <div className={`three-d-stage tool-${tool.toLowerCase()}`}>
                        {modelUrl ? (
                          <Suspense fallback={<div className="model-loading-state"><div className="model-skeleton" /><span><Loader2 size={16} className="spin-icon" />3D 모델을 불러오는 중…</span></div>}>
                            <MedicalModelViewer sourceUrl={modelUrl} format={modelFormat} viewMode={anatomyViewMode} dumpScene={false} onStatus={handleModelStatus} onError={handleModelError} onCameraChange={handleCameraChange} cameraState={restoreCamera} />
                          </Suspense>
                        ) : ['PENDING', 'PROCESSING'].includes(selectedRendering?.status ?? '') || modelWaiting || renderingLoading ? (
                          <div className="model-loading-state">
                            <div className="model-skeleton" />
                            <span><Loader2 size={16} className="spin-icon" />{selectedRendering?.status === 'PENDING' ? 'AI 분석 대기 중…' : renderingLoading ? '렌더링 결과 확인 중…' : '3D 모델 파일을 준비하는 중…'}</span>
                            <small>생성 상태를 자동으로 확인합니다.</small>
                          </div>
                        ) : (
                          <div className="image-viewer-empty">
                            <BoxIcon size={32} />
                            <strong>{renderingError ? '3D 결과를 불러오지 못했습니다' : selectedRendering?.status === 'FAILED' ? '3D 렌더링 생성에 실패했습니다' : `${renderingLabel(renderingType)} 결과가 아직 생성되지 않았습니다.`}</strong>
                            <span>{renderingError || (selectedRendering?.status === 'FAILED' ? '기존 원본 데이터로 다시 생성할 수 있습니다.' : 'AI 분할 및 3D 파일 생성 파이프라인이 완료되면 표시됩니다.')}</span>
                            {selectedRendering?.status === 'FAILED' && <button type="button" disabled={renderingSaving} onClick={() => requestRendering(true)}>3D 재생성</button>}
                            {!selectedRendering && !renderingLoading && !renderingError && <button type="button" disabled={renderingSaving || !selectedStudy || !selectedSeriesId} onClick={() => requestRendering(false, renderingType, renderingType === 'CALCIFICATION_ONLY' ? 'STL' : 'GLB')}>{renderingSaving ? '요청 중…' : `${renderingLabel(renderingType)} 생성 요청`}</button>}
                            {!selectedRendering && renderingType !== 'CALCIFICATION_ONLY' && <span>현재 COCA U-Net 패키지는 석회화 분할을 지원합니다. 이 결과에는 별도 모델·서버 연결이 필요합니다.</span>}
                          </div>
                        )}
                        {renderAnnotationLayer(rendered3DAnnotationKey, Boolean(modelUrl))}
                      </div>
                      {hasAuxImages && (
                        <aside className="ccta-result-panel" aria-label="석회화 AI 분석 보조 시각화">
                          <h3>보조 이미지</h3>
                          {renderingAuxImages.preview && (
                            <button type="button" className="ccta-result-card" onClick={() => setResultLightbox({ url: renderingAuxImages.preview!, title: '3D 석회화 시각화', caption: 'calcification_3d.png · 분할된 석회화를 3D로 시각화한 보조 이미지입니다.' })}>
                              <span className="ccta-result-card-image"><img src={renderingAuxImages.preview} alt="3D 석회화 시각화" /><em><ZoomIn size={14} />크게 보기</em></span>
                              <strong>3D 석회화 시각화</strong>
                              <small>calcification_3d.png</small>
                            </button>
                          )}
                          {renderingAuxImages.overlay && (
                            <button type="button" className="ccta-result-card" onClick={() => setResultLightbox({ url: renderingAuxImages.overlay!, title: '원본 영상 위 석회화 위치', caption: 'calcification_overlay.png · 원본 CT 영상에 석회화 예측 영역을 겹쳐 표시한 보조 이미지입니다.' })}>
                              <span className="ccta-result-card-image"><img src={renderingAuxImages.overlay} alt="원본 영상 위 석회화 위치" /><em><ZoomIn size={14} />크게 보기</em></span>
                              <strong>원본 영상 위 석회화 위치</strong>
                              <small>calcification_overlay.png</small>
                            </button>
                          )}
                        </aside>
                      )}
                    </div>
                    <footer>
                      <span>{renderingError || renderingAuxError || modelStatus || '렌더링 모델 선택 대기'}</span>
                      <small className="rendering-source-hint">{renderingSources.length ? `연결된 원본 ${renderingSources.length}개` : '연결된 렌더링 원본 없음'}</small>
                    </footer>
                  </section>}
                </div>
              )}
            </div>

            {(viewerMode === '2D' || active3DPane === 'RENDERED') && <footer className="image-frame-control">
              {viewerMode === '2D' ? (
                <>
                  <button
                    className={isPlaying ? 'active' : ''}
                    onClick={() => {
                      if (!isPlaying && frameIndex >= viewerFrameCount - 1) setFrameIndex(0)
                      setIsPlaying((current) => !current)
                    }}
                    disabled={viewerFrameCount < 2 || Boolean(imageLoadError)}
                    title={isPlaying ? '일시정지' : '재생'}
                    type="button"
                  >{isPlaying ? <Pause size={15} /> : <Play size={15} />}</button>
                  <button onClick={() => { setIsPlaying(false); setFrameIndex((current) => Math.max(0, current - 1)) }} disabled={frameIndex === 0} title="이전 프레임" type="button"><ChevronLeft size={16} /></button>
                  <input
                    aria-label="영상 프레임"
                    type="range"
                    min="0"
                    max={Math.max(viewerFrameCount - 1, 0)}
                    value={Math.min(frameIndex, Math.max(viewerFrameCount - 1, 0))}
                    onChange={(event) => { setIsPlaying(false); setFrameIndex(Number(event.target.value)) }}
                    disabled={viewerFrameCount < 2}
                  />
                  <span>{viewerFrameCount ? `${frameIndex + 1} / ${viewerFrameCount}` : '0 / 0'}</span>
                  <button onClick={() => { setIsPlaying(false); setFrameIndex((current) => Math.min(viewerFrameCount - 1, current + 1)) }} disabled={!viewerFrameCount || frameIndex >= viewerFrameCount - 1} title="다음 프레임" type="button"><ChevronRight size={16} /></button>
                  <select className="playback-speed" aria-label="재생 속도" value={playbackFps} onChange={(event) => setPlaybackFps(Number(event.target.value))} disabled={viewerFrameCount < 2}>
                    {[5, 10, 15, 30].map((fps) => <option key={fps} value={fps}>{fps} FPS</option>)}
                  </select>
                  <button className={playbackLoop ? 'active' : ''} onClick={() => setPlaybackLoop((current) => !current)} disabled={viewerFrameCount < 2} title={playbackLoop ? '반복 재생 켜짐' : '반복 재생 꺼짐'} type="button"><Repeat2 size={15} /></button>
                  <small>{saveNotice || (currentFrame ? '프레임별 주석 편집 가능' : selectedAsset?.kind === 'STUDY' && dicomManifest?.instances.length ? '원본 DICOM 연결됨' : '영상 선택 대기')}</small>
                </>
              ) : (
                <div className="rendering-control">
                  <Rotate3D size={16} />
                  <select aria-label="3D 렌더링 버전 선택" value={selectedRenderingId ?? ''} onChange={(event) => { const item = renderings3D.find((rendering) => rendering.id === Number(event.target.value)); if (item) { setSelectedRenderingId(item.id); setRestoreCamera(null); setModelCamera(null); setActive3DPane('RENDERED') } }} disabled={!renderings3D.some((item) => item.renderingType === renderingType)}>
                    {!renderings3D.some((item) => item.renderingType === renderingType) && <option value="">{renderingLabel(renderingType)} 결과 없음</option>}
                    {renderings3D.filter((item) => item.renderingType === renderingType).map((rendering) => <option key={rendering.id} value={rendering.id}>{renderingLabel(rendering.renderingType)} · v{rendering.version} · {rendering.status}</option>)}
                  </select>
                  <span className={`ccta-status-badge status-${selectedRendering?.status.toLowerCase() ?? 'empty'}`}>{renderingStatusLabel(selectedRendering?.status)}</span>
                  <small>{renderingError || modelStatus || '3D 모델을 선택해주세요.'}</small>
                </div>
              )}
            </footer>}
          </section>
        </div>
      ) : (
        <div className="lab-review-layout">
          <section className="lab-summary-row">
            <article><FlaskConical size={18} /><span>총 검사 항목</span><strong>{latestLabCounts.total}</strong><small>최근 검사 기준 · 누적 {labItems.length}개 수치</small></article>
            <article className="in-range"><CheckCircle2 size={18} /><span>{LAB_REFERENCE_LABELS.inRange}</span><strong>{latestLabCounts.inRange}</strong><small>참고범위 기준</small></article>
            <article className={latestLabCounts.outOfRange ? 'out-of-range' : ''}><Activity size={18} /><span>{LAB_REFERENCE_LABELS.outOfRange}</span><strong>{latestLabCounts.outOfRange}</strong><small>{[latestLabCounts.noReference ? `${LAB_REFERENCE_LABELS.noReference} ${latestLabCounts.noReference}` : '', latestLabCounts.noResult ? `${LAB_REFERENCE_LABELS.noResult} ${latestLabCounts.noResult}` : ''].filter(Boolean).join(' · ') || '참고범위 기준'}</small></article>
          </section>

          {labError && <div className="feature-error"><span>{labError}</span></div>}
          {labItems.some((item) => item.sourceWarning) && <p className="api-inline-notice">{labItems.find((item) => item.sourceWarning)?.sourceWarning}</p>}

          <div className="lab-main-grid">
            <section className="feature-card lab-item-list">
              <header><h2>핵심 혈액검사</h2><span>심혈관 항목 우선</span></header>
              <div>
                {labGroups.map((group) => {
                  const latest = group.observations[group.observations.length - 1]
                  return (
                    <button key={group.key} className={selectedLabCode === group.key ? 'active' : ''} onClick={() => setSelectedLabCode(group.key)} type="button">
                      <span className="lab-item-name"><strong>{latest.name}</strong><small>{group.code} · {group.observations.length}회 · {formatDate(latest.measuredAt)}</small></span>
                      <span className="lab-item-value"><b>{latest.value ?? (latest.textValue || '-')}</b><small>{latest.unit}</small></span>
                      <LabFlagBadge item={latest} />
                      <small className="lab-item-reference"><span>{LAB_REFERENCE_LABELS.referencePrefix}</span> {referenceText(latest)}{numericReferenceUnit(latest)}</small>
                    </button>
                  )
                })}
                {!dataLoading && labGroups.length === 0 && <div className="feature-empty"><FlaskConical size={28} /><strong>등록된 혈액검사 결과가 없습니다</strong><span>확정된 혈액검사 결과가 이곳에 표시됩니다.</span></div>}
                {dataLoading && <div className="feature-empty">혈액검사 결과를 불러오는 중…</div>}
              </div>
            </section>

            <section className="feature-card lab-trend-panel">
              <header>
                <div><h2>{selectedLab?.observations.at(-1)?.name ?? '검사항목 추세'}</h2><span>{selectedLab?.code ?? '항목을 선택해주세요.'}</span></div>
                {selectedLab && <b>{selectedLab.observations.length}회 측정</b>}
              </header>
              {selectedLab ? <TrendChart observations={selectedLab.observations} /> : <div className="lab-trend-empty">왼쪽에서 검사항목을 선택해주세요.</div>}
            </section>
          </div>

          <section className="feature-card lab-result-table-card">
            <header><h2>전체 혈액검사 결과</h2><span>수치·참고범위 기준 함께 보기</span>{selectedLabAi?.exam.result && <button type="button" onClick={() => { setLabEditorResultId(selectedLabAi.exam.result!.id); setLabEditorOpen(true) }}>선택 차수 검사값 편집</button>}</header>
            <div className="lab-result-table">
              <div className="lab-result-head"><span>검사일</span><span>항목</span><span>결과</span><span>단위</span><span>참고치</span><span>{LAB_REFERENCE_LABELS.tableStatusHeader}</span></div>
              {labGroups.flatMap((group) => {
                const comparison = [...group.observations].reverse().find(hasReference)
                return [...group.observations].reverse().map((item) => ({ item, comparison }))
              }).map(({ item, comparison }) => (
                <div className="lab-result-row" key={item.id}>
                  <span>{formatDate(item.measuredAt)}{item.stageLabel && <small className="lab-result-stage">{item.stageLabel}</small>}</span>
                  <strong>{item.name}<small>{item.code}</small><details className="lab-measurement-details"><summary>검사 상세</summary><dl><div><dt>검체</dt><dd>{item.specimenType || '미제공'}</dd></div><div><dt>검사 방법</dt><dd>{item.method || '미제공'}</dd></div><div><dt>공복</dt><dd>{item.fasting === undefined ? '미제공' : item.fasting ? '예' : '아니오'}</dd></div><div><dt>결과 참고치</dt><dd>{referenceText(item)}</dd></div><div><dt>적용 참고범위</dt><dd>{item.referenceRangeId ?? '미제공'}</dd></div><div><dt>{LAB_REFERENCE_LABELS.tableStatusHeader}</dt><dd>{labReferenceStatusLabel(labReferenceStatus(item))}{item.interpretationCode && ` · ${item.interpretationCode}`}</dd></div></dl></details></strong>
                  <b>{item.value ?? (item.textValue || '-')}</b>
                  <span>{item.unit || '-'}</span>
                  <LabReference item={item} comparison={comparison} />
                  <LabFlagBadge item={item} />
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {labEditorOpen && labEditorResultId && <LabResultEditor resultId={labEditorResultId} onClose={() => setLabEditorOpen(false)} onSaved={() => setLabRevision((value) => value + 1)} />}
      {resultLightbox && (
        <div className="feature-modal-backdrop" onClick={() => setResultLightbox(null)}>
          <section className="feature-modal ccta-lightbox" role="dialog" aria-modal="true" aria-label={resultLightbox.title} onClick={(event) => event.stopPropagation()}>
            <header><h2>{resultLightbox.title}</h2><button type="button" onClick={() => setResultLightbox(null)} aria-label="닫기"><X size={18} /></button></header>
            <img src={resultLightbox.url} alt={resultLightbox.title} />
            <footer>{resultLightbox.caption}</footer>
          </section>
        </div>
      )}
      {ctAiOpen && selectedStudy && <CTAIAnalysisPanel key={`${patient?.backendId ?? 'none'}-${selectedStudy.id}-${selectedSeriesId}`} study={selectedStudy} seriesId={selectedSeriesId} onClose={() => setCtAiOpen(false)} onRefresh={() => { selectRenderingKind('CALCIFICATION_ONLY'); setRenderingRevision((value) => value + 1) }} />}
      {createRenderingOpen && selectedStudy && <div className="feature-modal-backdrop"><form className="feature-modal" onSubmit={(event) => { event.preventDefault(); void requestRendering() }}><header><h2>3D 렌더링 생성</h2><button type="button" disabled={renderingSaving} onClick={() => setCreateRenderingOpen(false)}><X size={18} /></button></header><p>선택된 Series의 원본 데이터를 사용합니다. 실제 생성에는 모델·렌더링 처리 파이프라인 연결이 필요합니다.</p><label>렌더링 종류<select value={renderingType} onChange={(e) => selectRenderingKind(e.target.value)}>{renderingKinds.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}</select></label><label>파일 형식<select value={requestedFormat} onChange={(e) => setRequestedFormat(e.target.value)}><option>GLB</option><option>STL</option><option>VTK</option></select></label>{renderingError && <p className="api-inline-error">{renderingError}</p>}<footer><button type="submit" disabled={renderingSaving || !selectedSeriesId}>생성 요청</button></footer></form></div>}
      <XCAAnalysisPanel open={xcaAiOpen} patient={patient} examinationId={xcaExaminationId} sequences={xcaSequences}
        onClose={closeXcaAi} onBusyChange={setXcaAiBusy} />
      {clinicalAiOpen && patient && (
        <div className="feature-modal-backdrop lab-ai-modal-backdrop">
          <section className="lab-ai-modal" role="dialog" aria-modal="true" aria-label="혈액검사 Clinical AI 분석">
            <button className="lab-ai-modal-close" onClick={() => setClinicalAiOpen(false)} aria-label="닫기" type="button"><X size={18} /></button>
            <nav className="lab-ai-stage-tabs" aria-label="혈액검사 차수 선택">
              {labAiCandidates.map((candidate) => <button className={candidate.exam.examinationId === selectedLabAi?.exam.examinationId ? 'active' : ''} key={candidate.exam.examinationId} onClick={() => setSelectedLabExaminationId(candidate.exam.examinationId)} type="button"><strong>{candidate.stageLabel}</strong><small>{formatDate(candidate.visitDate || candidate.exam.performedAt)}</small></button>)}
            </nav>
            <ClinicalAIAnalysisPanel
              key={`${patient.backendId ?? patient.id}-${selectedLabAi?.exam.examinationId ?? 'none'}`}
              patient={displayPatient}
              patientDetail={null}
              examinationId={selectedLabAi?.exam.examinationId}
              examinationPatient={followUpRecords && followUpRecords.patient.id === patient.backendId ? followUpRecords.patient : null}
              initialInput={clinicalLabInput}
              sourceLabel={selectedLabAi?.stageLabel ?? (clinicalFeatureSnapshot ? '환자 등록 원본 임상기록' : '')}
            />
          </section>
        </div>
      )}
    </div>
  )
}
