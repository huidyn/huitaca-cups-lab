import { OrthographicCamera, Scene, SRGBColorSpace, WebGLRenderer } from 'three'
import { createCup } from './geometry'
import type { VesselDefinition } from './types'

export interface CupView {
  element: HTMLElement
  vessel: VesselDefinition
}

export function createCupGallery(canvas: HTMLCanvasElement, views: CupView[]) {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.outputColorSpace = SRGBColorSpace
  renderer.setClearColor(0x000000, 0)
  const entries = views.map(({ element, vessel }) => {
    const cup = createCup(vessel)
    const scene = new Scene()
    const pivot = cup.root
    // Le pivot est au milieu du corps, et non au pied de la tasse.
    for (const child of pivot.children) child.position.y -= 1.1
    pivot.position.x = vessel.handle ? -0.18 : 0
    scene.add(pivot)
    const camera = new OrthographicCamera(-1.6, 1.6, 1.8, -1.8, 0.1, 50)
    return { element, cup, scene, camera, x: 0, y: 0, tx: 0, ty: 0 }
  })
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
  let frame = 0
  let previousTime = 0
  let turnTime = 0
  let turning = false
  let elevation = 16
  let disposed = false
  let frames = 0

  function draw() {
    const bounds = canvas.getBoundingClientRect()
    if (!bounds.width || !bounds.height) return
    const density = Math.min(window.devicePixelRatio || 1, 2)
    if (renderer.getPixelRatio() !== density ||
        canvas.width !== Math.round(bounds.width * density) ||
        canvas.height !== Math.round(bounds.height * density)) {
      renderer.setPixelRatio(density)
      renderer.setSize(bounds.width, bounds.height, false)
    }
    renderer.setScissorTest(false)
    renderer.clear()
    renderer.setScissorTest(true)
    for (const entry of entries) {
      const box = entry.element.getBoundingClientRect()
      if (!box.width || !box.height) continue
      const { camera } = entry
      camera.left = -1.8 * box.width / box.height
      camera.right = -camera.left
      camera.updateProjectionMatrix()
      const angle = elevation * Math.PI / 180
      camera.position.set(0, Math.sin(angle) * 12, Math.cos(angle) * 12)
      camera.lookAt(0, 0, 0)
      renderer.setViewport(box.left - bounds.left, bounds.bottom - box.bottom, box.width, box.height)
      renderer.setScissor(box.left - bounds.left, bounds.bottom - box.bottom, box.width, box.height)
      renderer.render(entry.scene, camera)
    }
    frames++
    canvas.dataset.frames = String(frames)
  }

  function tick(time: number) {
    frame = 0
    if (disposed || document.hidden) return
    const dt = previousTime ? Math.min((time - previousTime) / 1000, 0.05) : 1 / 60
    previousTime = time
    const animate = turning && !reducedMotion.matches
    if (animate) turnTime += dt
    let moving = animate
    for (const entry of entries) {
      const tx = reducedMotion.matches ? 0 : entry.tx
      const ty = reducedMotion.matches ? 0 : entry.ty
      const blend = reducedMotion.matches ? 1 : 1 - Math.exp(-dt * 10)
      entry.x += (tx - entry.x) * blend
      entry.y += (ty - entry.y) * blend
      if (Math.abs(tx - entry.x) + Math.abs(ty - entry.y) < 0.001) {
        entry.x = tx
        entry.y = ty
      } else {
        moving = true
      }
      entry.cup.root.rotation.y = entry.x * 0.22 + (animate ? Math.sin(turnTime * 0.5) * 0.22 : 0)
      entry.cup.root.rotation.x = -entry.y * 0.065
      entry.cup.look(entry.x, entry.y)
    }
    draw()
    if (moving) invalidate()
    else previousTime = 0
  }

  function invalidate() {
    if (!frame && !document.hidden && !disposed) frame = requestAnimationFrame(tick)
  }

  function pointer(event: PointerEvent) {
    if (reducedMotion.matches || event.pointerType === 'touch') return
    let changed = false
    for (const entry of entries) {
      const box = entry.element.getBoundingClientRect()
      const tx = Math.max(-1, Math.min(1, (event.clientX - box.left - box.width / 2) / 420))
      const ty = Math.max(-1, Math.min(1, (box.top + box.height / 2 - event.clientY) / 300))
      changed ||= tx !== entry.tx || ty !== entry.ty
      entry.tx = tx
      entry.ty = ty
    }
    if (changed) invalidate()
  }

  function reset() {
    for (const entry of entries) entry.tx = entry.ty = 0
    invalidate()
  }

  function visibility() {
    cancelAnimationFrame(frame)
    frame = 0
    previousTime = 0
    if (!document.hidden) invalidate()
  }

  const observer = new ResizeObserver(invalidate)
  observer.observe(canvas)
  entries.forEach(entry => observer.observe(entry.element))
  window.addEventListener('pointermove', pointer, { passive: true })
  document.documentElement.addEventListener('pointerleave', reset)
  window.addEventListener('blur', reset)
  document.addEventListener('visibilitychange', visibility)
  reducedMotion.addEventListener('change', reset)
  invalidate()

  return {
    setTurning(value: boolean) {
      turning = value
      turnTime = 0
      invalidate()
    },
    setElevation(value: number) {
      elevation = value
      invalidate()
    },
    dispose() {
      disposed = true
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('pointermove', pointer)
      document.documentElement.removeEventListener('pointerleave', reset)
      window.removeEventListener('blur', reset)
      document.removeEventListener('visibilitychange', visibility)
      reducedMotion.removeEventListener('change', reset)
      entries.forEach(entry => entry.cup.dispose())
      renderer.dispose()
    }
  }
}

// Meme geometrie et meme cadrage pour les images de repli, sans second dessin.
export function exportCupPng(vessel: VesselDefinition, size: number): string {
  if (!Number.isInteger(size) || size < 1 || size > 4096) throw new Error('PNG size must be 1–4096')
  const renderer = new WebGLRenderer({ antialias: true, alpha: true })
  const cup = createCup(vessel)
  try {
    renderer.setSize(size, size)
    renderer.outputColorSpace = SRGBColorSpace
    renderer.setClearColor(0x000000, 0)
    const scene = new Scene()
    cup.root.position.set(vessel.handle ? -0.18 : 0, -1.1, 0)
    scene.add(cup.root)
    const camera = new OrthographicCamera(-1.8, 1.8, 1.8, -1.8, 0.1, 50)
    const angle = 16 * Math.PI / 180
    camera.position.set(0, Math.sin(angle) * 12, Math.cos(angle) * 12)
    camera.lookAt(0, 0, 0)
    renderer.render(scene, camera)
    return renderer.domElement.toDataURL('image/png')
  } finally {
    cup.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
  }
}
