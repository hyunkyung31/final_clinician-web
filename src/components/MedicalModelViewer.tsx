import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { VTKLoader } from 'three/examples/jsm/loaders/VTKLoader.js'

export type AnatomyViewMode = 'VESSEL' | 'CALCIFICATION' | 'VESSEL_CALCIFICATION'
export type AnatomyRole = 'heart' | 'aorta' | 'coronary' | 'calcification' | 'centerline' | 'other'

interface MedicalModelViewerProps {
  sourceUrl: string
  format: string
  color?: string
  viewMode?: AnatomyViewMode
  dumpScene?: boolean
  onStatus?: (status: string) => void
  onError?: (message: string) => void
  onCameraChange?: (state: Record<string, unknown>) => void
  cameraState?: Record<string, unknown> | null
}

// U_Net_전이학습.ipynb "전체 구조" Plotly Mesh3d 색/opacity.
const NOTEBOOK_ANATOMY_LOOK: Record<
  Exclude<AnatomyRole, 'centerline' | 'other'>,
  { color: number; opacity: number; roughness: number; metalness: number }
> = {
  heart: { color: 0xE9A6AF, opacity: 0.22, roughness: 0.75, metalness: 0.04 },
  aorta: { color: 0xB22222, opacity: 0.68, roughness: 0.42, metalness: 0.08 },
  coronary: { color: 0x4169E1, opacity: 1.0, roughness: 0.30, metalness: 0.10 },
  calcification: { color: 0xFFA500, opacity: 1.0, roughness: 0.22, metalness: 0.06 },
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    child.geometry?.dispose()
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    materials.forEach((material) => material?.dispose())
  })
}

function fitModel(object: THREE.Object3D, targetSize = 3.4) {
  const bounds = new THREE.Box3().setFromObject(object)
  const size = bounds.getSize(new THREE.Vector3())
  const center = bounds.getCenter(new THREE.Vector3())
  const longest = Math.max(size.x, size.y, size.z)
  if (Number.isFinite(longest) && longest > 0) {
    object.scale.setScalar(targetSize / longest)
  }
  object.position.sub(center.multiplyScalar(object.scale.x))
  object.updateMatrixWorld(true)
}

function frameOverview(
  object: THREE.Object3D,
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  direction: THREE.Vector3,
  padding = 1.65,
) {
  const box = new THREE.Box3().setFromObject(object)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const radius = Math.max(size.x, size.y, size.z, 0.01) * 0.5
  const fov = (camera.fov * Math.PI) / 180
  const aspect = Math.max(camera.aspect, 0.0001)
  const fitByHeight = radius / Math.tan(fov / 2)
  const fitByWidth = radius / (Math.tan(fov / 2) * aspect)
  const distance = Math.max(fitByHeight, fitByWidth) * padding
  const offset = direction.clone().normalize().multiplyScalar(distance)

  camera.up.set(0, 1, 0)
  camera.position.copy(center).add(offset)
  camera.near = Math.max(distance / 120, 0.01)
  camera.far = Math.max(distance * 24, 100)
  camera.updateProjectionMatrix()
  camera.lookAt(center)
  controls.target.copy(center)
  controls.minDistance = distance * 0.6
  controls.maxDistance = distance * 4.5
  controls.update()
}

function classifyAnatomyRole(name: string): AnatomyRole {
  const normalized = name.toLowerCase()
  if (normalized.includes('calcif') || normalized.includes('calcium')) return 'calcification'
  if (normalized.includes('coronar')) return 'coronary'
  if (normalized.includes('aorta')) return 'aorta'
  if (normalized.includes('heart') || normalized.includes('cardiac')) return 'heart'
  if (normalized.includes('centerline') || normalized.includes('centreline')) return 'centerline'
  return 'other'
}

function ancestryName(object: THREE.Object3D) {
  const parts: string[] = []
  let current: THREE.Object3D | null = object
  while (current) {
    if (current.name) parts.push(current.name)
    current = current.parent
  }
  return parts.join(' ')
}

function materialNames(object: THREE.Object3D) {
  if (!(object instanceof THREE.Mesh)) return ''
  const materials = Array.isArray(object.material) ? object.material : [object.material]
  return materials.map((material) => material?.name || '(unnamed)').join(', ')
}

function eachMaterial(object: THREE.Object3D, visit: (material: THREE.Material) => void) {
  if (!(object instanceof THREE.Mesh)) return
  const materials = Array.isArray(object.material) ? object.material : [object.material]
  materials.forEach((material) => {
    if (material) visit(material)
  })
}

function dumpSceneGraph(root: THREE.Object3D) {
  const rows: Array<Record<string, unknown>> = []
  root.traverse((node) => {
    const isMesh = node instanceof THREE.Mesh
    const box = isMesh ? new THREE.Box3().setFromObject(node) : null
    rows.push({
      name: node.name || '(unnamed)',
      type: node.type,
      isMesh,
      material: materialNames(node) || null,
      visible: node.visible,
      role: classifyAnatomyRole(ancestryName(node)),
      worldBounds: box && !box.isEmpty()
        ? { min: box.min.toArray(), max: box.max.toArray() }
        : null,
    })
  })
  console.info('[anatomy.glb] scene dump', rows)
  if (typeof window !== 'undefined') {
    ;(window as Window & { __anatomySceneDump?: unknown }).__anatomySceneDump = rows
  }
  return rows
}

function applyNotebookLook(root: THREE.Object3D) {
  root.traverse((node) => {
    const role = classifyAnatomyRole(ancestryName(node))
    node.userData.anatomyRole = role
    node.userData.originalVisible = node.visible
    const look = role in NOTEBOOK_ANATOMY_LOOK
      ? NOTEBOOK_ANATOMY_LOOK[role as keyof typeof NOTEBOOK_ANATOMY_LOOK]
      : null
    if (!look || !(node instanceof THREE.Mesh)) return
    node.renderOrder = role === 'heart' ? 0 : role === 'aorta' ? 1 : role === 'coronary' ? 2 : 3
    const next = new THREE.MeshLambertMaterial({
      color: look.color,
      opacity: look.opacity,
      transparent: look.opacity < 0.999,
      depthWrite: look.opacity >= 0.999,
      side: role === 'heart' ? THREE.FrontSide : THREE.DoubleSide,
    })
    next.userData.originalOpacity = look.opacity
    next.userData.originalTransparent = next.transparent
    next.userData.originalDepthWrite = next.depthWrite
    node.material = next
  })
}

function applyAnatomyViewMode(root: THREE.Object3D, viewMode: AnatomyViewMode) {
  root.traverse((node) => {
    const role = (node.userData.anatomyRole as AnatomyRole | undefined)
      ?? classifyAnatomyRole(ancestryName(node))

    if (role === 'centerline') {
      node.visible = false
      return
    }

    const vesselVisible = viewMode === 'VESSEL' || viewMode === 'VESSEL_CALCIFICATION'
    const calcVisible = viewMode === 'CALCIFICATION' || viewMode === 'VESSEL_CALCIFICATION'
    const heartVisible = viewMode !== 'CALCIFICATION'

    if (role === 'coronary' || role === 'aorta') node.visible = vesselVisible
    else if (role === 'calcification') node.visible = calcVisible
    else if (role === 'heart') node.visible = heartVisible
    else node.visible = node.userData.originalVisible !== false

    eachMaterial(node, (material) => {
      const opacityMaterial = material as THREE.MeshStandardMaterial
      if (typeof opacityMaterial.opacity !== 'number') return
      const originalOpacity = Number(material.userData.originalOpacity ?? opacityMaterial.opacity)
      const originalTransparent = Boolean(material.userData.originalTransparent)
      const originalDepthWrite = material.userData.originalDepthWrite as boolean | undefined
      opacityMaterial.opacity = originalOpacity
      opacityMaterial.transparent = originalTransparent
      if (typeof originalDepthWrite === 'boolean') opacityMaterial.depthWrite = originalDepthWrite
      opacityMaterial.needsUpdate = true
    })
  })
}

export function MedicalModelViewer({
  sourceUrl,
  format,
  color = '#ef5d63',
  viewMode = 'VESSEL_CALCIFICATION',
  dumpScene = true,
  onStatus,
  onError,
  onCameraChange,
  cameraState,
}: MedicalModelViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const loadedRootRef = useRef<THREE.Object3D | null>(null)
  const viewModeRef = useRef(viewMode)
  viewModeRef.current = viewMode

  useEffect(() => {
    const container = containerRef.current
    if (!container || !sourceUrl) return

    let disposed = false
    let loadedObject: THREE.Object3D | null = null
    let animationFrame = 0

    const scene = new THREE.Scene()
    const isAnatomyGlb = format.toUpperCase() === 'GLB' || format.toUpperCase() === 'GLTF'
    scene.background = new THREE.Color(isAnatomyGlb ? '#050a16' : '#07111e')

    const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 1000)
    camera.position.set(0, 0.35, 5.4)
    camera.up.set(0, 1, 0)

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    } catch {
      onError?.('브라우저에서 WebGL 3D 화면을 생성하지 못했습니다.')
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = isAnatomyGlb ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = isAnatomyGlb ? 1 : 1.15
    container.replaceChildren(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.075
    controls.screenSpacePanning = true
    controls.enableRotate = true
    controls.enableZoom = true
    controls.enablePan = true
    controls.minDistance = 1.2
    controls.maxDistance = 20
    const applyCamera = () => {
      if (!cameraState) return
      if (Array.isArray(cameraState.position)) camera.position.fromArray(cameraState.position as number[])
      if (Array.isArray(cameraState.target)) controls.target.fromArray(cameraState.target as number[])
      if (Array.isArray(cameraState.up)) camera.up.fromArray(cameraState.up as number[])
      controls.update()
    }
    const reportCamera = () => onCameraChange?.({ position: camera.position.toArray(), target: controls.target.toArray(), up: camera.up.toArray() })
    controls.addEventListener('change', reportCamera)

    if (isAnatomyGlb) {
      scene.add(new THREE.AmbientLight('#ffffff', 0.82))
      const keyLight = new THREE.DirectionalLight('#ffffff', 0.55)
      keyLight.position.set(1, 1, 1)
      scene.add(keyLight)
      const fillLight = new THREE.DirectionalLight('#ffffff', 0.22)
      fillLight.position.set(-0.8, 0.35, -0.6)
      scene.add(fillLight)
    } else {
      scene.add(new THREE.HemisphereLight('#d8e8ff', '#172235', 2.3))
      const keyLight = new THREE.DirectionalLight('#ffffff', 3.4)
      keyLight.position.set(4, 5, 5)
      scene.add(keyLight)
      const rimLight = new THREE.DirectionalLight('#4f8cff', 2.1)
      rimLight.position.set(-4, 1, -3)
      scene.add(rimLight)
      const grid = new THREE.GridHelper(8, 16, '#24476d', '#152a43')
      grid.position.y = -1.9
      scene.add(grid)
    }

    const resize = () => {
      const width = container.clientWidth
      const height = container.clientHeight
      if (width < 8 || height < 8) return
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height, false)
    }
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(container)
    resize()

    const progress = (event: ProgressEvent<EventTarget>) => {
      if (!event.lengthComputable || !event.total) return
      onStatus?.(`3D 모델 불러오는 중 ${Math.round((event.loaded / event.total) * 100)}%`)
    }

    const load = async () => {
      const normalizedFormat = format.toUpperCase()
      onStatus?.('3D 모델을 불러오는 중…')

      if (normalizedFormat === 'GLB' || normalizedFormat === 'GLTF') {
        const gltf = await new GLTFLoader().loadAsync(sourceUrl, progress)
        if (dumpScene) dumpSceneGraph(gltf.scene)
        applyNotebookLook(gltf.scene)
        applyAnatomyViewMode(gltf.scene, viewModeRef.current)
        return gltf.scene
      }

      if (normalizedFormat === 'STL') {
        const geometry = await new STLLoader().loadAsync(sourceUrl, progress)
        geometry.computeVertexNormals()
        return new THREE.Mesh(
          geometry,
          new THREE.MeshStandardMaterial({
            color,
            roughness: 0.48,
            metalness: 0.08,
            side: THREE.DoubleSide,
          }),
        )
      }

      if (normalizedFormat === 'VTK') {
        const geometry = await new VTKLoader().loadAsync(sourceUrl, progress)
        geometry.computeVertexNormals()
        return new THREE.Mesh(
          geometry,
          new THREE.MeshStandardMaterial({
            color: '#e64c57',
            roughness: 0.5,
            side: THREE.DoubleSide,
          }),
        )
      }

      throw new Error(`${format} 형식은 현재 웹 3D 뷰어에서 지원하지 않습니다.`)
    }

    load()
      .then((object) => {
        if (disposed) {
          disposeObject(object)
          return
        }
        loadedObject = object
        loadedRootRef.current = object
        if (isAnatomyGlb) {
          fitModel(object, 2.2)
          scene.add(object)
          frameOverview(
            object,
            camera,
            controls,
            new THREE.Vector3(0.52, 0.16, -1),
            1.75,
          )
        } else {
          fitModel(object)
          scene.add(object)
          controls.target.set(0, 0, 0)
          controls.update()
        }
        resize()
        applyCamera()
        reportCamera()
        onStatus?.('마우스로 회전 · 휠로 확대 · 우클릭으로 이동')
      })
      .catch((error) => {
        if (!disposed) {
          onError?.(
            error instanceof Error
              ? error.message
              : '3D 모델을 표시하지 못했습니다.',
          )
        }
      })

    const animate = () => {
      if (disposed) return
      controls.update()
      renderer.render(scene, camera)
      animationFrame = window.requestAnimationFrame(animate)
    }
    animate()

    return () => {
      disposed = true
      loadedRootRef.current = null
      window.cancelAnimationFrame(animationFrame)
      resizeObserver.disconnect()
      controls.dispose()
      if (loadedObject) disposeObject(loadedObject)
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [color, dumpScene, format, onError, onStatus, sourceUrl, onCameraChange, cameraState])

  useEffect(() => {
    if (!loadedRootRef.current) return
    applyAnatomyViewMode(loadedRootRef.current, viewMode)
  }, [viewMode])

  return <div className="medical-model-viewer" ref={containerRef} role="application" aria-label="3D anatomy viewer" />
}
