import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { VTKLoader } from 'three/examples/jsm/loaders/VTKLoader.js'

interface MedicalModelViewerProps {
  sourceUrl: string
  format: string
  onStatus?: (status: string) => void
  onError?: (message: string) => void
  onCameraChange?: (state: Record<string, unknown>) => void
  cameraState?: Record<string, unknown> | null
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    child.geometry?.dispose()
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    materials.forEach((material) => material?.dispose())
  })
}

function fitModel(object: THREE.Object3D) {
  const bounds = new THREE.Box3().setFromObject(object)
  const size = bounds.getSize(new THREE.Vector3())
  const center = bounds.getCenter(new THREE.Vector3())
  const longest = Math.max(size.x, size.y, size.z)
  if (Number.isFinite(longest) && longest > 0) {
    const scale = 3.4 / longest
    object.scale.setScalar(scale)
  }
  object.position.sub(center.multiplyScalar(object.scale.x))
}

export function MedicalModelViewer({
  sourceUrl,
  format,
  onStatus,
  onError,
  onCameraChange,
  cameraState,
}: MedicalModelViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container || !sourceUrl) return

    let disposed = false
    let loadedObject: THREE.Object3D | null = null
    let animationFrame = 0

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#07111e')

    const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 1000)
    camera.position.set(0, 0.35, 5.4)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.15
    container.replaceChildren(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.075
    controls.screenSpacePanning = true
    controls.minDistance = 1.2
    controls.maxDistance = 12
    const applyCamera = () => {
      if (!cameraState) return
      if (Array.isArray(cameraState.position)) camera.position.fromArray(cameraState.position as number[])
      if (Array.isArray(cameraState.target)) controls.target.fromArray(cameraState.target as number[])
      if (Array.isArray(cameraState.up)) camera.up.fromArray(cameraState.up as number[])
      controls.update()
    }
    const reportCamera = () => onCameraChange?.({ position: camera.position.toArray(), target: controls.target.toArray(), up: camera.up.toArray() })
    controls.addEventListener('change', reportCamera)

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

    const resize = () => {
      const width = Math.max(container.clientWidth, 1)
      const height = Math.max(container.clientHeight, 1)
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
        return gltf.scene
      }

      if (normalizedFormat === 'STL') {
        const geometry = await new STLLoader().loadAsync(sourceUrl, progress)
        geometry.computeVertexNormals()
        return new THREE.Mesh(
          geometry,
          new THREE.MeshStandardMaterial({
            color: '#ef5d63',
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
        fitModel(object)
        scene.add(object)
        controls.target.set(0, 0, 0)
        controls.update()
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
      window.cancelAnimationFrame(animationFrame)
      resizeObserver.disconnect()
      controls.dispose()
      if (loadedObject) disposeObject(loadedObject)
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [format, onError, onStatus, sourceUrl, onCameraChange, cameraState])

  return <div className="medical-model-viewer" ref={containerRef} />
}
