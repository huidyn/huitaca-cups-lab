import { OrthographicCamera, Scene, SRGBColorSpace, WebGLRenderer } from 'three'
import { createCup } from './geometry'
import type { CupDesign } from './designs'
import { bandLayout, designSvg, MASK_INKS, maskWidth, rasterizeSvg } from './pattern'
import type { VesselDefinition } from './types'

export interface CupView {
  element: HTMLElement
  vessel: VesselDefinition
  design?: CupDesign
}

export interface GalleryOptions {
  // Platine : on fait tourner la tasse à la main, elle ne suit plus le curseur.
  turntable?: boolean
  onTurn?: (degrees: number) => void
}

// Hauteur visible du cadrage orthographique (de -1.8 à 1.8).
const FRAME_HEIGHT = 3.6
// Petite marge de résolution, avant le plafond GPU ; les mipmaps filtrent les côtés fuyants.
const MASK_OVERSAMPLING = 1.25
const DRAG_RADIANS_PER_PIXEL = 0.012
const KEY_STEP = Math.PI / 12

export function maskDimensions(vessel: VesselDefinition, pixelsPerUnit: number, limit: number) {
  if (!vessel.pattern) throw new Error(`${vessel.id} has no pattern band`)
  const part = vessel.parts.find(p => p.id === vessel.pattern!.surface)
  if (!part) throw new Error(`Unknown pattern surface: ${vessel.pattern.surface}`)
  const { circumference, length } = bandLayout(part.outline, vessel.pattern)
  const width = maskWidth(pixelsPerUnit * MASK_OVERSAMPLING, circumference, limit)
  return {
    width,
    height: Math.max(64, Math.round(width * length / circumference)),
    // Unités du dessin : millièmes d'unité de paroi, identiques pour toutes les tailles de masque.
    viewWidth: Math.round(circumference * 1000),
    viewHeight: Math.round(length * 1000)
  }
}

export function renderDesignMask(vessel: VesselDefinition, design: CupDesign, pixelsPerUnit: number, limit: number) {
  const size = maskDimensions(vessel, pixelsPerUnit, limit)
  const svg = designSvg(design.draw(size.viewWidth, size.viewHeight), size.viewWidth, size.viewHeight, [size.width, size.height], MASK_INKS)
  return rasterizeSvg(svg, size.width, size.height)
}

export function createCupGallery(canvas: HTMLCanvasElement, views: CupView[], options: GalleryOptions = {}) {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.outputColorSpace = SRGBColorSpace
  renderer.setClearColor(0x000000, 0)
  const textureLimit = Math.min(2048, renderer.capabilities.maxTextureSize)
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
  const turntable = options.turntable ?? false
  const entries = views.map(({ element, vessel, design }) => {
    const cup = createCup(vessel, { pattern: Boolean(design && vessel.pattern) })
    const scene = new Scene()
    const pivot = cup.root
    // Le pivot est au milieu du corps, et non au pied de la tasse.
    for (const child of pivot.children) child.position.y -= 1.1
    pivot.position.x = vessel.handle ? -0.18 : 0
    scene.add(pivot)
    const camera = new OrthographicCamera(-1.6, 1.6, 1.8, -1.8, 0.1, 50)
    return { element, vessel, design, maskWidth: 0, cup, scene, camera, x: 0, y: 0, tx: 0, ty: 0 }
  })
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
  let frame = 0
  let previousTime = 0
  let turnTime = 0
  let turning = false
  let elevation = 16
  let disposed = false
  let frames = 0
  let yaw = 0
  let drag: { pointer: number; x: number } | undefined

  function updateMask(entry: typeof entries[number], pixelsPerUnit: number) {
    const design = entry.design
    if (!design || !entry.vessel.pattern) return
    // Le masque suit la taille de la tasse à l'écran : un redessin par palier, jamais par image.
    const width = maskDimensions(entry.vessel, pixelsPerUnit, textureLimit).width
    if (width === entry.maskWidth) return
    entry.maskWidth = width
    renderDesignMask(entry.vessel, design, pixelsPerUnit, textureLimit).then(mask => {
      if (disposed || entry.design !== design || entry.maskWidth !== width) return
      entry.cup.setMask(mask, anisotropy)
      invalidate()
    }).catch(() => {})
  }
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
      updateMask(entry, box.height * density / FRAME_HEIGHT)
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
    if (turntable) {
      if (animate) {
        yaw += dt * 0.5
        reportTurn()
      }
      for (const entry of entries) entry.cup.root.rotation.y = yaw
      draw()
      if (moving) invalidate()
      else previousTime = 0
      return
    }
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

  function reportTurn() {
    options.onTurn?.(Math.round(((yaw * 180 / Math.PI) % 360 + 360) % 360) % 360)
  }

  function turnBy(radians: number) {
    yaw += radians
    reportTurn()
    invalidate()
  }

  function grab(event: PointerEvent) {
    if (event.button !== 0 || drag) return
    ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
    drag = { pointer: event.pointerId, x: event.clientX }
  }

  function spin(event: PointerEvent) {
    if (drag?.pointer !== event.pointerId) return
    turnBy((event.clientX - drag.x) * DRAG_RADIANS_PER_PIXEL)
    drag.x = event.clientX
  }

  function release(event: PointerEvent) {
    if (drag?.pointer === event.pointerId) drag = undefined
  }

  function key(event: KeyboardEvent) {
    if (event.key === 'ArrowRight') turnBy(KEY_STEP)
    else if (event.key === 'ArrowLeft') turnBy(-KEY_STEP)
    else if (event.key === 'Home') turnBy(-yaw)
    else return
    event.preventDefault()
  }

  function pointer(event: PointerEvent) {
    if (turntable || reducedMotion.matches || event.pointerType === 'touch') return
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
  if (turntable) {
    for (const { element } of entries) {
      element.addEventListener('pointerdown', grab)
      element.addEventListener('pointermove', spin)
      element.addEventListener('pointerup', release)
      element.addEventListener('pointercancel', release)
      element.addEventListener('lostpointercapture', release)
      element.addEventListener('keydown', key)
    }
  }
  window.addEventListener('pointermove', pointer, { passive: true })
  document.documentElement.addEventListener('pointerleave', reset)
  window.addEventListener('blur', reset)
  document.addEventListener('visibilitychange', visibility)
  reducedMotion.addEventListener('change', reset)
  invalidate()

  return {
    setColors(index: number, colors: Record<string, string>) {
      entries[index]?.cup.setColors(colors)
      invalidate()
    },
    setDesign(index: number, design: CupDesign) {
      const entry = entries[index]
      if (!entry || entry.design === design) return
      // L'ancien masque reste affiché jusqu'à ce que le nouveau soit prêt : pas d'éclair uni.
      entry.design = design
      entry.maskWidth = 0
      invalidate()
    },
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
      for (const { element } of entries) {
        element.removeEventListener('pointerdown', grab)
        element.removeEventListener('pointermove', spin)
        element.removeEventListener('pointerup', release)
        element.removeEventListener('pointercancel', release)
        element.removeEventListener('lostpointercapture', release)
        element.removeEventListener('keydown', key)
      }
      entries.forEach(entry => entry.cup.dispose())
      renderer.dispose()
    }
  }
}

// Meme geometrie et meme cadrage pour les images de repli, sans second dessin.
export function exportCupPng(vessel: VesselDefinition, size: number, mask?: HTMLCanvasElement): string {
  if (!Number.isInteger(size) || size < 1 || size > 4096) throw new Error('PNG size must be 1–4096')
  const renderer = new WebGLRenderer({ antialias: true, alpha: true })
  const cup = createCup(vessel, { pattern: Boolean(mask) })
  if (mask) cup.setMask(mask)
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
