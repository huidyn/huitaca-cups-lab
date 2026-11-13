import { OrthographicCamera, Scene, SRGBColorSpace, WebGLRenderer } from 'three'
import { createCup } from './geometry'
import type { CupDesign } from './designs'
import { bandLayout, designSvg, MASK_INKS, maskWidth, rasterizeSvg } from './pattern'
import type { VesselDefinition } from './types'
import type { AccessoryId } from './accessories'
import type { Performance, PointerState } from './personality'
import { facePose } from './expressions'
import { createSteam, steamScale } from './steam'
import { createMorph } from './morph'

export interface CupView {
  element: HTMLElement
  vessel: VesselDefinition
  design?: CupDesign
  accessory?: AccessoryId
  // Tasse nue d'après laquelle l'accessoire se pose, si l'affichage cache une partie du fond.
  fitVessel?: VesselDefinition
}

// Cadrage en unités de tasse : centre vertical et demi-hauteur visible.
export interface CupFrame {
  lift: number
  halfHeight: number
}
export const DEFAULT_FRAME: CupFrame = { lift: 1.1, halfHeight: 1.8 }
// Plus de hauteur au-dessus de la tasse, pour ce qui dépasse du bord.
export const ACCESSORY_FRAME: CupFrame = { lift: 1.4, halfHeight: 2.05 }

export interface GalleryOptions {
  // Platine : on fait tourner la tasse à la main, elle ne suit plus le curseur.
  turntable?: boolean
  initialTurn?: number
  onTurn?: (degrees: number) => void
  frame?: CupFrame
  // Une tasse qui joue : expressions, clignements, vapeur. Appelée à chaque image.
  perform?: (dt: number, pointer: PointerState, still: boolean) => Performance
  steamColor?: string
}

// La tasse suit le curseur moins que ses yeux, et plus lentement : c'est le regard qui mène.
export const DEFAULT_ELEVATION = 8
const BODY_YAW = 0.22
const BODY_PITCH_UP = 0.13
const BODY_PITCH_DOWN = 0.085
const EYE_RATE = 14
const BODY_RATE = 5
// Sans mouvement depuis ce délai, le curseur n'est plus « à côté ».
const POINTER_IDLE = 3500
const RADIANS = Math.PI / 180
const RESTING = facePose()
// La vapeur part juste au-dessus de la tasse et s'arrête avant le haut du cadre :
// elle ne sort jamais de la boîte, même quand la tasse respire.
const STEAM_BASE = 0.07
const STEAM_MARGIN = 0.1

// Passage d'une tasse à l'autre : le motif et l'accessoire s'effacent, la forme glisse, puis ils reviennent.
const MORPH_OUT = 0.11
const MORPH_SHAPE = 0.32
const MORPH_IN = 0.16
// Un accessoire prend un peu plus de temps à se poser qu'un motif à paraître.
const WEAR_OUT = 0.16
const WEAR_IN = 0.3
// Départ et arrivée en douceur, milieu rapide : les formes intermédiaires ne s'attardent pas.
const ease = (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

function bodyPitch(y: number) {
  return -y * (y > 0 ? BODY_PITCH_UP : BODY_PITCH_DOWN)
}

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
  const framing = options.frame ?? DEFAULT_FRAME
  function build({ vessel, design, accessory, fitVessel }: Omit<CupView, 'element'>) {
    const cup = createCup(vessel, { pattern: Boolean(design && vessel.pattern), accessory, fitVessel })
    // Le pivot est au milieu du corps, et non au pied de la tasse.
    for (const child of cup.root.children) child.position.y -= framing.lift
    cup.root.position.x = vessel.handle ? -0.18 : 0
    return cup
  }
  type Cup = ReturnType<typeof build>
  interface Morphing { from: Cup; mid?: ReturnType<typeof createMorph>; time: number; out: number; shape: number; into: number }
  const entries = views.map(({ element, vessel, design, accessory, fitVessel }) => {
    const cup = build({ vessel, design, accessory, fitVessel })
    const scene = new Scene()
    const pivot = cup.root
    scene.add(pivot)
    const camera = new OrthographicCamera(-1.6, 1.6, framing.halfHeight, -framing.halfHeight, 0.1, 50)
    // La vapeur reste face à la caméra : elle ne tourne pas avec la tasse.
    const steam = options.perform ? createSteam(Math.min(1, framing.lift + framing.halfHeight - STEAM_MARGIN - STEAM_BASE - cup.topY), options.steamColor) : undefined
    if (steam) {
      steam.group.position.set(pivot.position.x, cup.topY - framing.lift + STEAM_BASE, 0)
      scene.add(steam.group)
    }
    return { element, vessel, design, accessory, morph: undefined as Morphing | undefined, maskWidth: 0, cup, scene, camera, steam, steamY: steam?.group.position.y ?? 0, x: 0, y: 0, bx: 0, by: 0, tx: 0, ty: 0 }
  })
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
  let frame = 0
  let previousTime = 0
  let turnTime = 0
  let turning = false
  let elevation = DEFAULT_ELEVATION
  let pointerAt = -Infinity
  let clock = 0
  let disposed = false
  let frames = 0
  let yaw = (options.initialTurn ?? 0) * Math.PI / 180
  let drag: { pointer: number; x: number } | undefined

  function endMorph(entry: typeof entries[number]) {
    const morph = entry.morph
    if (!morph) return
    entry.morph = undefined
    entry.scene.remove(morph.from.root)
    morph.from.dispose()
    if (morph.mid) {
      entry.scene.remove(morph.mid.root)
      morph.mid.dispose()
    }
    entry.cup.root.visible = true
    entry.cup.setInk(1)
    entry.cup.setAccessoryReveal(1)
  }

  // Fait avancer la transition, et recopie l'attitude de la tasse sur ce qui est à l'écran.
  function advance(entry: typeof entries[number], dt: number) {
    const morph = entry.morph
    if (!morph) return false
    morph.time += dt
    const { from, mid, out, shape, into } = morph
    const t = morph.time
    if (t >= out + shape + into) {
      endMorph(entry)
      return false
    }
    const leaving = t < out
    const shaping = !leaving && t < out + shape
    from.root.visible = leaving || (shaping && !mid)
    if (mid) mid.root.visible = shaping
    entry.cup.root.visible = !leaving && !shaping
    if (leaving) {
      const p = ease(t / out)
      from.setInk(1 - p)
      from.setAccessoryReveal(1 - p)
    } else if (shaping) {
      mid?.update(ease((t - out) / shape))
    } else {
      const p = ease((t - out - shape) / into)
      entry.cup.setInk(p)
      entry.cup.setAccessoryReveal(p)
    }
    return true
  }

  function follow(entry: typeof entries[number], pose: (cup: { pose: Cup['pose'] }) => void) {
    const morph = entry.morph
    if (!morph) return
    const { rotation, position } = entry.cup.root
    for (const other of [morph.from.root, morph.mid?.root]) {
      if (!other) continue
      other.rotation.copy(rotation)
      other.position.y = position.y
    }
    pose(morph.from)
    if (morph.mid) pose(morph.mid)
  }

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
      camera.left = -framing.halfHeight * box.width / box.height
      camera.right = -camera.left
      camera.updateProjectionMatrix()
      const angle = elevation * Math.PI / 180
      camera.position.set(0, Math.sin(angle) * 12, Math.cos(angle) * 12)
      camera.lookAt(0, 0, 0)
      renderer.setViewport(box.left - bounds.left, bounds.bottom - box.bottom, box.width, box.height)
      renderer.setScissor(box.left - bounds.left, bounds.bottom - box.bottom, box.width, box.height)
      updateMask(entry, box.height * density / (2 * framing.halfHeight))
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
    if (options.perform) {
      const still = reducedMotion.matches
      const first = entries[0]!
      clock += still ? 0 : dt
      const act = options.perform(still ? 0 : dt, { x: first.tx, y: first.ty, active: !still && time - pointerAt < POINTER_IDLE }, still)
      for (const entry of entries) {
        const { head } = act.face
        entry.cup.root.rotation.set(
          bodyPitch(act.turn[1]) - head.pitch * RADIANS,
          act.turn[0] * BODY_YAW + head.yaw * RADIANS + (animate ? Math.sin(turnTime * 0.5) * 0.22 : 0),
          head.roll * RADIANS
        )
        entry.cup.root.position.y = act.lift
        entry.cup.pose(act.face)
        advance(entry, still ? Infinity : dt)
        follow(entry, cup => cup.pose(act.face))
        if (entry.steam) {
          entry.steam.group.position.y = entry.steamY + act.lift
          // Plus épaisse à petite taille : à 48 px, un ruban fin disparaît.
          const height = entry.element.getBoundingClientRect().height
          entry.steam.update(clock, act.steam, height ? steamScale(height / (2 * framing.halfHeight)) : 1)
        }
      }
      draw()
      // Une tasse qui joue ne s'arrête jamais, sauf si on a demandé moins de mouvement.
      if (still) previousTime = 0
      else invalidate()
      return
    }
    for (const entry of entries) {
      const tx = reducedMotion.matches ? 0 : entry.tx
      const ty = reducedMotion.matches ? 0 : entry.ty
      const quick = reducedMotion.matches ? 1 : 1 - Math.exp(-dt * EYE_RATE)
      const slow = reducedMotion.matches ? 1 : 1 - Math.exp(-dt * BODY_RATE)
      entry.x += (tx - entry.x) * quick
      entry.y += (ty - entry.y) * quick
      entry.bx += (tx - entry.bx) * slow
      entry.by += (ty - entry.by) * slow
      if (Math.abs(tx - entry.bx) + Math.abs(ty - entry.by) < 0.001) {
        entry.x = entry.bx = tx
        entry.y = entry.by = ty
      } else {
        moving = true
      }
      entry.cup.root.rotation.y = entry.bx * BODY_YAW + (animate ? Math.sin(turnTime * 0.5) * 0.22 : 0)
      entry.cup.root.rotation.x = bodyPitch(entry.by)
      entry.cup.look(entry.x, entry.y)
      if (advance(entry, reducedMotion.matches ? Infinity : dt)) moving = true
      follow(entry, cup => cup.pose({ ...RESTING, gaze: [entry.x, entry.y] }))
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
    pointerAt = event.timeStamp
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
    pointerAt = -Infinity
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
    // Remplace la tasse d'une vue par une autre, en fondu de forme plutôt que d'un coup.
    replace(index: number, view: Omit<CupView, 'element'>) {
      const entry = entries[index]
      if (!entry) return
      endMorph(entry)
      const from = entry.cup
      const before = { vessel: entry.vessel, design: entry.design, accessory: entry.accessory }
      const to = build(view)
      to.root.rotation.copy(from.root.rotation)
      to.root.position.y = from.root.position.y
      entry.cup = to
      entry.vessel = view.vessel
      entry.design = view.design
      entry.accessory = view.accessory
      entry.maskWidth = 0
      entry.scene.add(to.root)
      const sameShape = before.vessel.id === view.vessel.id
      const mid = sameShape ? undefined : createMorph(before.vessel, view.vessel, framing.lift)
      if (mid) entry.scene.add(mid.root)
      entry.morph = {
        from, mid, time: 0,
        out: before.accessory ? WEAR_OUT : before.design ? MORPH_OUT : 0,
        shape: sameShape ? 0 : MORPH_SHAPE,
        into: view.accessory ? WEAR_IN : view.design ? MORPH_IN : 0
      }
      to.root.visible = false
      to.setInk(0)
      to.setAccessoryReveal(0)
      invalidate()
    },
    setSteamColor(value: string) {
      for (const entry of entries) entry.steam?.setColor(value)
      invalidate()
    },
    // À appeler quand ce que joue la tasse change alors que rien ne bouge (mouvement réduit).
    refresh: invalidate,
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
      entries.forEach(entry => {
        endMorph(entry)
        entry.cup.dispose()
        entry.steam?.dispose()
      })
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
