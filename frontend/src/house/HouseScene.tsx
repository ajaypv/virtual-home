import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Minus, Plus, RotateCcw } from 'lucide-react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS3DObject, CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js'
import { TvScreen } from './HouseTv'
import { HOUSE_DOORS, HOUSE_ROOMS, type HouseDoor, type HouseRoom, type HouseState, type HouseView } from './types'

const ROOM_POSITIONS: Record<HouseRoom, [number, number, number]> = {
  living: [-2, 0.8, 1.5], kitchen: [-0.2, 0.8, -2.3], bedroom: [3, 3.6, -1], reading: [0.8, 0.8, 3],
}
const LIGHT_POSITIONS: Record<HouseRoom, [number, number, number]> = {
  living: [-2, 2.4, 1.5], kitchen: [-0.2, 2.4, -2.3], bedroom: [3, 5, -1], reading: [0.8, 2.4, 3],
}

function disposeModels(models: THREE.Object3D[]) {
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  for (const model of models) model.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      geometries.add(object.geometry)
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material)
    }
  })
  geometries.forEach((geometry) => geometry.dispose())
  materials.forEach((material) => material.dispose())
}

function mountScene(host: HTMLDivElement, tvElement: HTMLDivElement, ready: () => void, failed: (error: unknown) => void) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setClearColor('#122329')
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.25
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  const canvas = renderer.domElement
  canvas.tabIndex = 0
  canvas.setAttribute('aria-label', '3D house. Drag to orbit, scroll to zoom, or use the view buttons.')
  const htmlRenderer = new CSS3DRenderer()
  htmlRenderer.domElement.className = 'house-tv-layer'
  host.append(htmlRenderer.domElement, canvas)
  const htmlScene = new THREE.Scene()
  const tvSurface = new CSS3DObject(tvElement)
  const tvTarget = new THREE.Vector3(-0.85, 1.5, 2.5)
  htmlScene.add(tvSurface)
  tvSurface.visible = false
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100)
  const controls = new OrbitControls(camera, host)
  controls.enableDamping = true
  controls.dampingFactor = 0.12
  controls.minDistance = 4
  controls.maxDistance = 38
  controls.maxPolarAngle = Math.PI / 2.08
  controls.listenToKeyEvents(canvas)
  scene.add(new THREE.HemisphereLight('#c8e7ff', '#46504c', 0.45))
  const moon = new THREE.DirectionalLight('#b8d8ff', 0.5)
  moon.position.set(-5, 10, 7)
  scene.add(moon)

  const lights = {} as Record<HouseRoom, THREE.PointLight>
  const targets = {} as Record<HouseRoom, number>
  const lampMaterials: Partial<Record<HouseRoom, THREE.MeshStandardMaterial[]>> = {}
  for (const room of HOUSE_ROOMS) {
    const light = new THREE.PointLight(room === 'bedroom' ? '#ffd3a0' : '#ffe1ad', 48, 7, 2)
    light.position.set(...LIGHT_POSITIONS[room])
    light.castShadow = true
    light.shadow.mapSize.set(512, 512)
    light.shadow.bias = -0.002
    scene.add(light)
    lights[room] = light
    targets[room] = 48
  }
  const doors: Partial<Record<HouseDoor, THREE.Group>> = {}
  const doorTargets: Record<HouseDoor, number> = { front: 0, bedroom: 0 }
  const models: THREE.Object3D[] = []
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
  let disposed = false
  let frame = 0
  let previous = performance.now()
  let view: HouseView = 'all'

  const invalidate = () => {
    if (!disposed && !frame) frame = requestAnimationFrame(draw)
  }
  function draw(now: number) {
    frame = 0
    const step = motion.matches ? 1 : 1 - Math.exp(-Math.min((now - previous) / 1000, 0.1) * 10)
    previous = now
    let moving = false
    for (const room of HOUSE_ROOMS) {
      const delta = targets[room] - lights[room].intensity
      lights[room].intensity = Math.abs(delta) < 0.02 ? targets[room] : lights[room].intensity + delta * step
      if (Math.abs(delta) >= 0.02) moving = true
      lampMaterials[room]?.forEach((material) => { material.emissiveIntensity = lights[room].intensity / 40 })
    }
    for (const key of HOUSE_DOORS) {
      const pivot = doors[key]
      if (!pivot) continue
      const delta = doorTargets[key] - pivot.rotation.y
      pivot.rotation.y = Math.abs(delta) < 0.001 ? doorTargets[key] : pivot.rotation.y + delta * step
      if (Math.abs(delta) >= 0.001) moving = true
    }
    const orbiting = controls.update()
    htmlRenderer.render(htmlScene, camera)
    renderer.render(scene, camera)
    if (moving || orbiting) invalidate()
  }
  function setView(next: HouseView) {
    view = next
    const { width, height } = host.getBoundingClientRect()
    if (next === 'tv' && width && height) camera.setViewOffset(width, height, 0, height * 0.12, width, height)
    else camera.clearViewOffset()
    const target = next === 'all' ? new THREE.Vector3(0, 1.6, 0) : next === 'tv' ? tvTarget.clone() : new THREE.Vector3(...ROOM_POSITIONS[next])
    const scale = Math.max(1, 0.85 / camera.aspect)
    controls.target.copy(target)
    camera.position.copy(target).add((next === 'all' ? new THREE.Vector3(10, 9, 14) : next === 'tv' ? new THREE.Vector3(0, 0.2, 4) : new THREE.Vector3(5, 4, 7)).multiplyScalar(scale))
    controls.update()
    invalidate()
  }
  const resize = new ResizeObserver(() => {
    const { width, height } = host.getBoundingClientRect()
    if (!width || !height) return
    renderer.setSize(width, height)
    htmlRenderer.setSize(width, height)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    setView(view)
  })
  resize.observe(host)
  controls.addEventListener('change', invalidate)
  const contextLost = (event: Event) => {
    event.preventDefault()
    failed(new Error('The 3D graphics context was lost. Reload the scene to reconnect.'))
  }
  canvas.addEventListener('webglcontextlost', contextLost)

  const loader = new GLTFLoader()
  async function loadModel(path: string) {
    const { scene: model } = await loader.loadAsync(`${import.meta.env.BASE_URL}models/cozy-home/${path}`)
    if (disposed) disposeModels([model])
    else models.push(model)
    return model
  }
  void Promise.all([loadModel('house.glb'), loadModel('door.glb'), loadModel('tv.glb'), loadModel('tv-unit.glb')]).then(([house, door, tv, cabinet]) => {
    if (disposed) return
    scene.add(house)
    cabinet.scale.setScalar(1.5)
    cabinet.position.set(-0.85, 0.065, 2.5)
    scene.add(cabinet)
    tv.scale.setScalar(1.5)
    tv.position.set(-0.85, new THREE.Box3().setFromObject(cabinet).max.y, 2.5)
    scene.add(tv)
    tv.updateWorldMatrix(true, true)
    const glass = tv.getObjectByName('tv_1')
    if (!(glass instanceof THREE.Mesh)) throw new Error('The TV asset is missing its screen.')
    const bounds = new THREE.Box3().setFromObject(glass)
    const size = bounds.getSize(new THREE.Vector3())
    tvTarget.copy(bounds.getCenter(new THREE.Vector3()))
    tvTarget.z = bounds.max.z + 0.002
    tvSurface.position.copy(tvTarget)
    tvSurface.scale.set(size.x / 640, size.y / 360, 1)
    tvSurface.visible = true
    // A depth-tested transparent window reveals the iframe behind WebGL, so furniture still occludes it.
    const windowMaterial = new THREE.MeshBasicMaterial({ color: '#000000', opacity: 0, blending: THREE.NoBlending })
    const screenWindow = new THREE.Mesh(new THREE.PlaneGeometry(size.x, size.y), windowMaterial)
    screenWindow.position.copy(tvTarget)
    scene.add(screenWindow)
    models.push(screenWindow)
    for (const [room, node] of [['living', '033-floor-lamp'], ['bedroom', '046-table-lamp']] as const) {
      const lamp = house.getObjectByName(node)
      if (!lamp) throw new Error(`The house asset is missing ${node}.`)
      lampMaterials[room] = []
      lamp.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return
        const cloned = (Array.isArray(object.material) ? object.material : [object.material]).map((material: THREE.Material) => {
          const copy = material.clone()
          if (copy instanceof THREE.MeshStandardMaterial && (copy.name === 'cream' || copy.name === 'mustard')) {
            copy.emissive.set('#ffc477')
            lampMaterials[room]!.push(copy)
          }
          return copy
        })
        object.material = cloned
      })
    }
    for (const key of HOUSE_DOORS) {
      const module = door.clone(true)
      models.push(module)
      const leaf = module.getObjectByName('door')
      if (!leaf?.parent) throw new Error('The door asset is missing its door leaf.')
      const parent = leaf.parent
      const parts = parent.children.filter((child) => child.name === 'door' || child.name.startsWith('door-'))
      const pivot = new THREE.Group()
      pivot.position.x = new THREE.Box3().setFromObject(leaf).min.x
      parent.add(pivot)
      parent.updateMatrixWorld(true)
      // The downloaded module has separate panel, glass and handle meshes, all on the same hinge.
      for (const part of parts) pivot.attach(part)
      module.position.set(key === 'front' ? -3 : 3, key === 'front' ? 0.065 : 3, 4)
      doors[key] = pivot
      scene.add(module)
    }
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh && object !== screenWindow) {
        object.castShadow = true
        object.receiveShadow = true
      }
    })
    setView(view)
    ready()
    invalidate()
  }).catch((error: unknown) => { if (!disposed) failed(error) })

  setView('all')
  return {
    setView,
    update(house: HouseState) {
      for (const room of HOUSE_ROOMS) targets[room] = house.lights[room].on ? house.lights[room].brightness * 0.6 : 0
      for (const key of HOUSE_DOORS) doorTargets[key] = house.doors[key].open ? -Math.PI / 2 : 0
      invalidate()
    },
    zoom(factor: number) {
      const offset = camera.position.clone().sub(controls.target)
      offset.setLength(THREE.MathUtils.clamp(offset.length() * factor, controls.minDistance, controls.maxDistance))
      camera.position.copy(controls.target).add(offset)
      controls.update()
      invalidate()
    },
    dispose() {
      disposed = true
      cancelAnimationFrame(frame)
      resize.disconnect()
      controls.removeEventListener('change', invalidate)
      controls.dispose()
      canvas.removeEventListener('webglcontextlost', contextLost)
      disposeModels(models)
      HOUSE_ROOMS.forEach((room) => lights[room].dispose())
      renderer.dispose()
      canvas.remove()
      htmlScene.remove(tvSurface)
      htmlRenderer.domElement.remove()
    },
  }
}

export function HouseScene({ house, focus, onReset }: { house: HouseState | null; focus: HouseView; onReset: () => void }) {
  const host = useRef<HTMLDivElement>(null)
  const [tvElement] = useState(() => {
    const element = document.createElement('div')
    element.className = 'house-tv-screen'
    return element
  })
  const scene = useRef<ReturnType<typeof mountScene> | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!host.current) return
    setLoaded(false)
    setError(null)
    const failed = (e: unknown) => {
      console.error('House scene failed to load', e)
      setError(e instanceof Error ? e.message : 'The house could not load.')
    }
    try {
      scene.current = mountScene(host.current, tvElement, () => setLoaded(true), failed)
    } catch (e) {
      failed(e)
    }
    return () => { scene.current?.dispose(); scene.current = null }
  }, [attempt, tvElement])
  useEffect(() => { if (house) scene.current?.update(house) }, [house, attempt])
  useEffect(() => { scene.current?.setView(focus) }, [focus, attempt])
  return (
    <div className="house-scene">
      <div className="house-canvas" ref={host} />
      {loaded && !error && createPortal(<TvScreen tv={house?.tv} />, tvElement)}
      {!loaded && !error && <p className="house-scene-message" role="status">Opening your 3D house...</p>}
      {error && <div className="house-scene-message" role="alert">
        <p>Unable to display the 3D house. {error}</p>
        <p>Check your connection and that WebGL is enabled.</p>
        <button type="button" onClick={() => setAttempt((n) => n + 1)}>Retry scene</button>
      </div>}
      <div className="house-camera" aria-label="Camera controls">
        <button type="button" aria-label="Zoom in" onClick={() => scene.current?.zoom(0.8)}><Plus size={18} /></button>
        <button type="button" aria-label="Zoom out" onClick={() => scene.current?.zoom(1.25)}><Minus size={18} /></button>
        <button type="button" aria-label="Reset house view" onClick={() => { scene.current?.setView('all'); onReset() }}><RotateCcw size={17} /></button>
      </div>
    </div>
  )
}
