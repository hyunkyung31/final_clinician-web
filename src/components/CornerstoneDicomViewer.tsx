import {
  Enums as CornerstoneEnums,
  RenderingEngine,
  init as initCornerstone,
  type Types as CornerstoneTypes,
} from '@cornerstonejs/core'
import {
  addTool,
  Enums as ToolEnums,
  PanTool,
  StackScrollTool,
  ToolGroupManager,
  WindowLevelTool,
  ZoomTool,
  init as initCornerstoneTools,
} from '@cornerstonejs/tools'
import {
  init as initDicomImageLoader,
  wadouri,
} from '@cornerstonejs/dicom-image-loader'
import * as dicomParser from 'dicom-parser'
import { useEffect, useRef, useState } from 'react'
import { getImagingDicomBlob } from '../api/client'
import { withDicomTimeout } from '../api/dicomLoading'
import type { ImagingDicomManifestInstance } from '../types'

interface PreparedInstance {
  instance: ImagingDicomManifestInstance
  imageId: string
  position?: number
  instanceNumber?: number
  sourceIndex: number
}

interface CornerstoneDicomViewerProps {
  onAnnotationTransform?: (transform: DicomAnnotationTransform | null) => void
  instances: ImagingDicomManifestInstance[]
  currentIndex: number
  onCurrentIndexChange: (index: number) => void
  onOrderedInstances: (instances: ImagingDicomManifestInstance[]) => void
  onStatus?: (status: string) => void
  onError?: (message: string) => void
}

export interface DicomAnnotationTransform {
  toImage: (point: { x: number; y: number }) => { x: number; y: number }
  toViewport: (point: { x: number; y: number }) => { x: number; y: number }
}

let cornerstoneInitialization: Promise<void> | null = null
let toolsRegistered = false

function initializeCornerstone() {
  if (cornerstoneInitialization) return cornerstoneInitialization

  cornerstoneInitialization = (async () => {
    await initCornerstone()
    initDicomImageLoader({
      // Our stack uses local Part-10 blobs and dicom-parser metadata.
      useLegacyMetadataProvider: true,
      maxWebWorkers: Math.max(1, Math.min(4, Math.floor((navigator.hardwareConcurrency || 4) / 2))),
    })
    initCornerstoneTools()

    if (!toolsRegistered) {
      ;[WindowLevelTool, PanTool, ZoomTool, StackScrollTool].forEach((tool) => addTool(tool))
      toolsRegistered = true
    }
  })()

  cornerstoneInitialization = cornerstoneInitialization.catch((error) => {
    cornerstoneInitialization = null
    throw error
  })
  return cornerstoneInitialization
}

function parseNumberList(value?: string) {
  if (!value) return undefined
  const values = value.split('\\').map((item) => Number(item.trim()))
  return values.length && values.every(Number.isFinite) ? values : undefined
}

function crossProduct(a: number[], b: number[]) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]
}

function projectedSlicePosition(position?: number[], orientation?: number[]) {
  if (!position || position.length < 3) return undefined
  if (!orientation || orientation.length < 6) return position[2]
  const normal = crossProduct(orientation.slice(0, 3), orientation.slice(3, 6))
  return position[0] * normal[0] + position[1] * normal[1] + position[2] * normal[2]
}

async function prepareInstance(
  instance: ImagingDicomManifestInstance,
  sourceIndex: number,
  signal: AbortSignal,
  onManagedFile: (imageId: string) => void,
): Promise<PreparedInstance> {
  const blob = await getImagingDicomBlob(instance.dicomUrl, signal)
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const dataSet = dicomParser.parseDicom(bytes, { untilTag: 'x7fe00010' })
  const position = instance.imagePositionPatient ?? parseNumberList(dataSet.string('x00200032'))
  const orientation = instance.imageOrientationPatient ?? parseNumberList(dataSet.string('x00200037'))
  const sliceLocation = instance.sliceLocation ?? dataSet.floatString('x00201041')
  const instanceNumber = instance.instanceNumber ?? dataSet.intString('x00200013')
  const imageId = wadouri.fileManager.add(blob)
  onManagedFile(imageId)

  return {
    instance: {
      ...instance,
      instanceNumber,
      imagePositionPatient: position,
      imageOrientationPatient: orientation,
      sliceLocation,
    },
    imageId,
    position: projectedSlicePosition(position, orientation) ?? sliceLocation,
    instanceNumber,
    sourceIndex,
  }
}

async function prepareWithConcurrency(
  instances: ImagingDicomManifestInstance[],
  onProgress: (completed: number) => void,
  signal: AbortSignal,
  onManagedFile: (imageId: string) => void,
) {
  const prepared = new Array<PreparedInstance>(instances.length)
  let cursor = 0
  let completed = 0
  const workerCount = Math.min(4, Math.max(1, instances.length))

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (cursor < instances.length) {
      signal.throwIfAborted()
      const index = cursor
      cursor += 1
      prepared[index] = await prepareInstance(instances[index], index, signal, onManagedFile)
      completed += 1
      onProgress(completed)
    }
  }))

  return prepared.sort((a, b) => {
    if (a.position !== undefined && b.position !== undefined && a.position !== b.position) {
      return a.position - b.position
    }
    if (a.instanceNumber !== undefined && b.instanceNumber !== undefined && a.instanceNumber !== b.instanceNumber) {
      return a.instanceNumber - b.instanceNumber
    }
    return a.sourceIndex - b.sourceIndex
  })
}

function removeManagedFile(imageId: string) {
  const index = Number(imageId.replace('dicomfile:', '').split('?')[0])
  if (Number.isInteger(index)) wadouri.fileManager.remove(index)
}

export function CornerstoneDicomViewer({
  instances,
  currentIndex,
  onCurrentIndexChange,
  onOrderedInstances,
  onStatus,
  onError,
  onAnnotationTransform,
}: CornerstoneDicomViewerProps) {
  const elementRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<CornerstoneTypes.IStackViewport | null>(null)
  const [loadingText, setLoadingText] = useState('DICOM 원본 준비 중…')
  const [error, setError] = useState('')
  const [retryRevision, setRetryRevision] = useState(0)
  const idsRef = useRef({
    renderingEngineId: `dicom-engine-${crypto.randomUUID()}`,
    viewportId: `dicom-viewport-${crypto.randomUUID()}`,
    toolGroupId: `dicom-tools-${crypto.randomUUID()}`,
  })

  useEffect(() => {
    const element = elementRef.current
    if (!element || !instances.length) return

    let disposed = false
    let renderingEngine: RenderingEngine | null = null
    let managedImageIds: string[] = []
    const controller = new AbortController()
    let resizeFrame = 0
    const resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(resizeFrame)
      resizeFrame = requestAnimationFrame(() => {
        if (!disposed && renderingEngine && viewportRef.current) {
          renderingEngine.resize(true, false)
          viewportRef.current.resetCamera({ resetPan: true, resetZoom: true, resetToCenter: true })
          viewportRef.current.render()
        }
      })
    })
    resizeObserver.observe(element)
    const { renderingEngineId, viewportId, toolGroupId } = idsRef.current

    const handleNewImage = (event: Event) => {
      const detail = (event as CustomEvent<{ imageIdIndex?: number }>).detail
      if (typeof detail?.imageIdIndex === 'number') onCurrentIndexChange(detail.imageIdIndex)
    }
    const preventContextMenu = (event: Event) => event.preventDefault()

    element.addEventListener(CornerstoneEnums.Events.STACK_NEW_IMAGE, handleNewImage)
    const reportTransform = () => {
      const viewport = viewportRef.current
      if (!viewport) return
      const data = viewport.getImageData() as unknown as { dimensions: number[]; imageData: { worldToIndex: (point: number[]) => number[]; indexToWorld: (point: number[]) => number[] } }
      if (!data?.imageData?.worldToIndex || !data.dimensions) return
      const rect = element.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      onAnnotationTransform?.({
        toImage: (point) => {
          const index = data.imageData.worldToIndex(viewport.canvasToWorld([point.x / 1000 * rect.width, point.y / 600 * rect.height]))
          return { x: Math.max(0, Math.min(1000, index[0] / Math.max(1, data.dimensions[0] - 1) * 1000)), y: Math.max(0, Math.min(600, index[1] / Math.max(1, data.dimensions[1] - 1) * 600)) }
        },
        toViewport: (point) => {
          const world = data.imageData.indexToWorld([point.x / 1000 * Math.max(1, data.dimensions[0] - 1), point.y / 600 * Math.max(1, data.dimensions[1] - 1), 0])
          const canvas = viewport.worldToCanvas(world as CornerstoneTypes.Point3)
          return { x: canvas[0] / rect.width * 1000, y: canvas[1] / rect.height * 600 }
        },
      })
    }
    element.addEventListener(CornerstoneEnums.Events.IMAGE_RENDERED, reportTransform)
    element.addEventListener('contextmenu', preventContextMenu)

    const run = async () => {
      try {
        setError('')
        setLoadingText(`DICOM 원본 준비 중 · 0/${instances.length}`)
        onStatus?.(`DICOM 원본 준비 중 · 0/${instances.length}`)
        await withDicomTimeout(initializeCornerstone(), 20000, 'DICOM Viewer 초기화가 지연되고 있습니다. 다시 시도해주세요.')
        if (disposed) return

        const prepared = await withDicomTimeout(prepareWithConcurrency(instances, (completed) => {
          if (disposed) return
          const status = `DICOM 원본 준비 중 · ${completed}/${instances.length}`
          setLoadingText(status)
          onStatus?.(status)
        }, controller.signal, (imageId) => {
          if (disposed || controller.signal.aborted) removeManagedFile(imageId)
          else managedImageIds.push(imageId)
        }), 90000, 'DICOM 원본 다운로드가 지연되고 있습니다. 연결 상태를 확인하고 다시 시도해주세요.')
        if (disposed) {
          return
        }

        onOrderedInstances(prepared.map((item) => item.instance))
        renderingEngine = new RenderingEngine(renderingEngineId)
        renderingEngine.enableElement({
          viewportId,
          type: CornerstoneEnums.ViewportType.STACK,
          element,
          defaultOptions: { background: [0.027, 0.067, 0.11] },
        })

        const viewport = renderingEngine.getViewport(viewportId) as CornerstoneTypes.IStackViewport
        viewportRef.current = viewport
        const decodingStatus = `DICOM 영상 해석 중 · ${prepared.length}슬라이스`
        setLoadingText(decodingStatus)
        onStatus?.(decodingStatus)
        // Download registration order may differ from physical slice order.
        const orderedImageIds = prepared.map((item) => item.imageId)
        await withDicomTimeout(viewport.setStack(orderedImageIds, Math.min(currentIndex, orderedImageIds.length - 1)), 30000, 'DICOM 영상 해석이 지연되고 있습니다. 브라우저를 새로고침하거나 다시 시도해주세요.')
        if (disposed) return
        viewport.resetCamera({ resetPan: true, resetZoom: true, resetToCenter: true })
        viewport.render()

        const toolGroup = ToolGroupManager.createToolGroup(toolGroupId)
        if (!toolGroup) throw new Error('DICOM 조작 도구를 초기화하지 못했습니다.')
        toolGroup.addTool(WindowLevelTool.toolName)
        toolGroup.addTool(PanTool.toolName)
        toolGroup.addTool(ZoomTool.toolName)
        toolGroup.addTool(StackScrollTool.toolName)
        toolGroup.addViewport(viewportId, renderingEngineId)
        toolGroup.setToolActive(WindowLevelTool.toolName, {
          bindings: [{ mouseButton: ToolEnums.MouseBindings.Primary }],
        })
        toolGroup.setToolActive(PanTool.toolName, {
          bindings: [{ mouseButton: ToolEnums.MouseBindings.Auxiliary }],
        })
        toolGroup.setToolActive(ZoomTool.toolName, {
          bindings: [{ mouseButton: ToolEnums.MouseBindings.Secondary }],
        })
        toolGroup.setToolActive(StackScrollTool.toolName, {
          bindings: [{ mouseButton: ToolEnums.MouseBindings.Wheel }],
        })

        setLoadingText('')
        onStatus?.(`원본 DICOM 연결됨 · ${prepared.length}슬라이스`)
      } catch (caught) {
        controller.abort()
        const message = caught instanceof Error ? caught.message : 'DICOM 원본을 표시하지 못했습니다.'
        if (!disposed) {
          viewportRef.current = null
          ToolGroupManager.destroyToolGroup(toolGroupId)
          renderingEngine?.destroy()
          renderingEngine = null
          managedImageIds.forEach(removeManagedFile)
          managedImageIds = []
          setError(message)
          setLoadingText('')
          onError?.(message)
        }
      }
    }

    void run()

    return () => {
      disposed = true
      controller.abort()
      resizeObserver.disconnect()
      cancelAnimationFrame(resizeFrame)
      element.removeEventListener(CornerstoneEnums.Events.STACK_NEW_IMAGE, handleNewImage)
      element.removeEventListener(CornerstoneEnums.Events.IMAGE_RENDERED, reportTransform)
      onAnnotationTransform?.(null)
      element.removeEventListener('contextmenu', preventContextMenu)
      viewportRef.current = null
      ToolGroupManager.destroyToolGroup(toolGroupId)
      renderingEngine?.destroy()
      managedImageIds.forEach(removeManagedFile)
    }
  }, [instances, onCurrentIndexChange, onError, onOrderedInstances, onStatus, onAnnotationTransform, retryRevision])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || currentIndex === viewport.getCurrentImageIdIndex()) return
    void viewport.setImageIdIndex(currentIndex).then(() => viewport.render()).catch(() => undefined)
  }, [currentIndex])

  return (
    <div className="cornerstone-dicom-viewer" ref={elementRef}>
      {!loadingText && !error && <button className="dicom-fit-button" type="button" onClick={() => {
        const viewport = viewportRef.current
        if (!viewport) return
        viewport.resetCamera({ resetPan: true, resetZoom: true, resetToCenter: true })
        viewport.render()
      }}>화면에 맞춤</button>}
      {(loadingText || error) && (
        <div className={`cornerstone-dicom-state ${error ? 'error' : ''}`}>
          <strong>{error ? 'DICOM 원본을 열지 못했습니다' : loadingText}</strong>
          {error && <span>{error}</span>}
          {error && <button type="button" onClick={() => setRetryRevision((value) => value + 1)}>DICOM 다시 불러오기</button>}
        </div>
      )}
      {!loadingText && !error && (
        <div className="cornerstone-dicom-help">
          좌클릭 밝기 · 휠 슬라이스 · 가운데 이동 · 우클릭 확대
        </div>
      )}
    </div>
  )
}
