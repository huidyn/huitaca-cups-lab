import { Box3, OrthographicCamera, Scene, SRGBColorSpace, WebGLRenderer } from 'three'
import { createCup } from './geometry'
import type { CupDesign } from './designs'
import { bandLayout, designSvg, MASK_INKS, maskWidth, rasterizeSvg } from './pattern'
import type { VesselDefinition } from './types'
import type { AccessoryId } from './accessories'
import type { Performance, PointerState } from './personality'
import { blendFace, facePose } from './expressions'
import { createSteam, steamScale } from './steam'
import { createMorph } from './morph'
import { QUALITY, type QualityId, type Sample } from './quality'

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
  // Niveau de rendu (densité de pixels et cadence plafonnées) ; « high » par défaut.
  quality?: Exclude<QualityId, 'static'>
  // Appelée après chaque image dessinée, avec ce qu'elle a coûté au processeur.
  onFrame?: (sample: Sample) => void
  // Mode repos (barre latérale) : chaque tasse regarde par là et n'est PAS dessinée ; la page montre
  // son image (`snapshot`). Seule une tasse réveillée (`wake`) suit le curseur et coûte des images ;
  // rendormie (`rest`), elle revient à ce regard puis disparaît du canevas.
  resting?: { x: number; y: number }
  // Appelée quand l'ensemble des tasses dessinées change : la page cache leur image, montre les autres.
  onShown?: (indices: number[]) => void
  // Mode repos : ce que joue la tasse `index` tant qu'elle « joue » (`setActing`) : un agent qui
  // réfléchit, avec sa personnalité et sa vapeur. Chaque tasse a son propre interprète, donc son
  // propre rythme. Quand elle cesse de jouer, elle revient à la pose de repos puis rend la main à l'image.
  act?: (index: number, dt: number, pointer: PointerState) => Performance
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
// Plafond de la hauteur de vapeur, en unités de tasse : au-delà elle ne ferait que s'étirer.
const STEAM_MAX = 1.5
// Plancher : la vapeur ne se réduit jamais en dessous, même sous un grand chapeau.
const STEAM_MIN = 1

// Passage d'une tasse à l'autre : le motif et l'accessoire s'effacent, la forme glisse, puis ils reviennent.
const MORPH_OUT = 0.11
const MORPH_SHAPE = 0.32
const MORPH_IN = 0.16
// Un accessoire prend un peu plus de temps à se poser qu'un motif à paraître.
const WEAR_OUT = 0.16
const WEAR_IN = 0.3
// Entrée et sortie du jeu d'une tasse au repos : la pose glisse de l'image vers le jeu, et retour.
const ACT_BLEND = 0.45
// Une tasse qui réfléchit sans être survolée n'a pas besoin de plus : deux fois moins d'images.
const ACT_FPS = 30
// Décalage d'horloge entre deux vapeurs voisines : jamais les mêmes volutes au même instant.
const STEAM_PHASE = 1.7
const mix = (a: number, b: number, t: number) => a + (b - a) * t
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

// Coordonnées entières d'un pixel en plein milieu de la panse (sous les yeux), pour comparer
// à l'unité près ce que sortent le tampon WebGL, le canevas en direct et l'image de repos.
export function cupBodyPixel(vessel: VesselDefinition, frame: CupFrame = DEFAULT_FRAME, pixels: number, elevation = DEFAULT_ELEVATION) {
  const part = vessel.parts.find(p => p.id === vessel.face.surface) ?? vessel.parts[0]!
  const ys = part.outline.map(point => point[1])
  const minY = Math.min(...ys)
  const eyeBottom = vessel.face.centerY - vessel.face.eyeHeight / 2
  const sampleY = Math.max(minY + 0.15, eyeBottom - 0.18)
  let radius = part.outline[0]![0]
  for (let i = 1; i < part.outline.length; i++) {
    const [r0, y0] = part.outline[i - 1]!
    const [r1, y1] = part.outline[i]!
    if ((sampleY >= y0 && sampleY <= y1) || (sampleY >= y1 && sampleY <= y0)) {
      radius = y1 === y0 ? r1 : r0 + (r1 - r0) * (sampleY - y0) / (y1 - y0)
      break
    }
  }
  const angle = elevation * RADIANS
  const wx = vessel.handle ? -0.18 : 0
  const wy = sampleY - frame.lift
  const camY = wy * Math.cos(angle) - radius * Math.sin(angle)
  const ndcX = wx / frame.halfHeight
  const ndcY = camY / frame.halfHeight
  const x = Math.max(0, Math.min(pixels - 1, Math.floor((ndcX * 0.5 + 0.5) * pixels)))
  const y = Math.max(0, Math.min(pixels - 1, Math.floor((-ndcY * 0.5 + 0.5) * pixels)))
  return { x, y, glY: pixels - 1 - y }
}

export function createCupGallery(canvas: HTMLCanvasElement, views: CupView[], options: GalleryOptions = {}) {
  const resting = options.resting
  // En mode repos, quand un contexte 2D sRGB est disponible sur le canevas de la page, WebGL dessine
  // hors écran à (0, 0, pixels, pixels) et copie aussi bien les tasses vivantes que les images de repos
  // par `gl.readPixels` et `putImageData` : même grille de pixels et même gestion des couleurs.
  const surface = resting
    ? (canvas.getContext('2d', { colorSpace: 'srgb', willReadFrequently: true }) ?? canvas.getContext('2d'))
    : null
  const glCanvas = surface ? document.createElement('canvas') : canvas
  const renderer = new WebGLRenderer({ canvas: glCanvas, antialias: true, alpha: true })
  renderer.outputColorSpace = SRGBColorSpace
  renderer.setClearColor(0x000000, 0)
  const gl = (renderer as { getContext?: () => (WebGLRenderingContext & { drawingBufferColorSpace?: string; unpackColorSpace?: string }) | null }).getContext?.() ?? undefined
  if (gl) {
    if ('drawingBufferColorSpace' in gl) gl.drawingBufferColorSpace = 'srgb'
    if ('unpackColorSpace' in gl) gl.unpackColorSpace = 'srgb'
  }
  const textureLimit = Math.min(2048, renderer.capabilities.maxTextureSize)
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
  const turntable = options.turntable ?? false
  let quality = QUALITY[options.quality ?? 'high']
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
    // La vapeur part du plus haut de ce qui est sur la tasse (béret, plumes, tige) et monte
    // jusqu'à la marge du cadre. Quand la place manque, elle garde une hauteur minimale,
    // collée en haut du cadre, et passe devant l'accessoire plutôt que de s'écraser.
    const top = Math.max(cup.topY - framing.lift, new Box3().setFromObject(pivot).max.y)
    const ceiling = framing.halfHeight - STEAM_MARGIN
    const start = Math.min(top + STEAM_BASE, ceiling - STEAM_MIN)
    const steam = options.perform || (options.resting && options.act) ? createSteam(Math.min(STEAM_MAX, ceiling - start), options.steamColor) : undefined
    if (steam) {
      steam.group.position.set(pivot.position.x, start, 0)
      scene.add(steam.group)
    }
    return { element, vessel, design, accessory, morph: undefined as Morphing | undefined, maskWidth: 0, maskReady: Promise.resolve(), awake: false, settled: true, acting: false, act: 0, steamLevel: 0, cup, scene, camera, steam, steamY: steam?.group.position.y ?? 0, x: 0, y: 0, bx: 0, by: 0, tx: 0, ty: 0 }
  })
  let shown: number[] = []
  // Dernière position connue du curseur : une tasse réveillée vise là tout de suite.
  let last: { x: number; y: number } | undefined
  if (resting) {
    for (const entry of entries) {
      entry.x = entry.bx = entry.tx = resting.x
      entry.y = entry.by = entry.ty = resting.y
      pose(entry, 0)
    }
  }
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
    if (!design || !entry.vessel.pattern) return Promise.resolve()
    // Le masque suit la taille de la tasse à l'écran : un redessin par palier, jamais par image.
    const width = maskDimensions(entry.vessel, pixelsPerUnit, textureLimit).width
    if (width === entry.maskWidth) return entry.maskReady
    entry.maskWidth = width
    entry.maskReady = renderDesignMask(entry.vessel, design, pixelsPerUnit, textureLimit).then(mask => {
      if (disposed || entry.design !== design || entry.maskWidth !== width) return
      entry.cup.setMask(mask, anisotropy)
      invalidate()
    }).catch(() => {})
    return entry.maskReady
  }

  // Attitude de la tasse d'après son regard courant (yeux) et son corps (plus lent).
  function pose(entry: typeof entries[number], sway: number) {
    entry.cup.root.rotation.set(bodyPitch(entry.by), entry.bx * BODY_YAW + sway, 0)
    if (resting) entry.cup.root.position.y = 0
    entry.cup.look(entry.x, entry.y)
  }

  // Joue-t-elle encore : en scène, en train d'y entrer ou d'en sortir, ou sa vapeur pas encore dissipée.
  const playing = (entry: typeof entries[number]) =>
    Boolean(options.act) && ((entry.acting && !reducedMotion.matches) || entry.act > 0 || entry.steamLevel > 0.01)
  // Une tasse au repos, arrivée à son regard de repos et qui ne joue plus, n'est pas dessinée :
  // la page montre son image.
  const hidden = (entry: typeof entries[number]) => Boolean(resting) && !entry.awake && entry.settled && !playing(entry)

  // Le jeu de la tasse, fondu avec sa pose de repos (ou de survol) : poids 0, c'est exactement l'image.
  function play(entry: typeof entries[number], index: number, dt: number) {
    const on = entry.acting && !reducedMotion.matches
    entry.act = Math.max(0, Math.min(1, entry.act + (on ? dt : -dt) / ACT_BLEND))
    const played = options.act!(index, dt, { x: entry.tx, y: entry.ty, active: entry.awake })
    const weight = ease(entry.act)
    // Survolée, même une tasse qui réfléchit suit d'abord le curseur, tout en gardant ses yeux et sa vapeur.
    const aimWeight = entry.awake ? weight * 0.25 : weight
    const { head } = played.face
    entry.cup.root.rotation.set(
      mix(bodyPitch(entry.by), bodyPitch(played.turn[1]) - head.pitch * RADIANS, aimWeight),
      mix(entry.bx * BODY_YAW, played.turn[0] * BODY_YAW + head.yaw * RADIANS, aimWeight),
      head.roll * RADIANS * weight
    )
    entry.cup.root.position.y = played.lift * weight
    const face = blendFace({ ...RESTING, gaze: [entry.x, entry.y] }, played.face, weight)
    face.gaze = [mix(entry.x, played.face.gaze[0], aimWeight), mix(entry.y, played.face.gaze[1], aimWeight)]
    entry.cup.pose(face)
    entry.steamLevel = played.steam
    if (entry.steam) {
      entry.steam.group.position.y = entry.steamY + played.lift * weight
      const height = entry.element.getBoundingClientRect().height
      entry.steam.update(clock + index * STEAM_PHASE, played.steam, height ? steamScale(height / (2 * framing.halfHeight)) : 1)
    }
  }

  function fit() {
    const density = Math.min(window.devicePixelRatio || 1, quality.density)
    if (resting) {
      // L'image de repos et la tasse vivante doivent tomber sur les mêmes pixels. Un canevas dont la
      // taille n'est pas un nombre entier de pixels d'écran est étiré, donc flou et décalé d'un pixel :
      // on lui donne une taille CSS qui vaut exactement sa grille, d'après la boîte de son parent.
      const host = (canvas.parentElement ?? canvas).getBoundingClientRect()
      const width = Math.round(host.width * density)
      const height = Math.round(host.height * density)
      if (!width || !height) return { bounds: host, density, ok: false }
      if (renderer.getPixelRatio() !== density || canvas.width !== width || canvas.height !== height || glCanvas.width !== width || glCanvas.height !== height) {
        canvas.style.width = `${width / density}px`
        canvas.style.height = `${height / density}px`
        if (surface) {
          canvas.width = width
          canvas.height = height
        }
        renderer.setPixelRatio(density)
        // Un quart de pixel de marge : three arrondit vers le bas, et la division n'est pas exacte.
        renderer.setSize((width + 0.25) / density, (height + 0.25) / density, false)
      }
      return { bounds: canvas.getBoundingClientRect(), density, ok: true }
    }
    const bounds = canvas.getBoundingClientRect()
    if (!bounds.width || !bounds.height) return { bounds, density, ok: false }
    if (renderer.getPixelRatio() !== density ||
        canvas.width !== Math.round(bounds.width * density) ||
        canvas.height !== Math.round(bounds.height * density)) {
      renderer.setPixelRatio(density)
      renderer.setSize(bounds.width, bounds.height, false)
    }
    return { bounds, density, ok: true }
  }

  // Zone de dessin donnée en pixels d'écran entiers, depuis le coin haut gauche du canevas WebGL.
  function place(left: number, top: number, width: number, height: number, density: number) {
    const at = [(left + 0.01) / density, (glCanvas.height - top - height + 0.01) / density, (width + 0.01) / density, (height + 0.01) / density] as const
    renderer.setViewport(...at)
    renderer.setScissor(...at)
  }

  // Copie la vignette (0, 0, width, height) du tampon WebGL vers un contexte 2D sRGB via `gl.readPixels`.
  function transferTile(target: CanvasRenderingContext2D, dx: number, dy: number, width: number, height: number) {
    if (gl && typeof gl.readPixels === 'function' && typeof target.putImageData === 'function') {
      const raw = new Uint8Array(width * height * 4)
      gl.pixelStorei?.(gl.PACK_ALIGNMENT ?? 0x0cf5, 1)
      gl.readPixels(0, glCanvas.height - height, width, height, gl.RGBA ?? 0x1908, gl.UNSIGNED_BYTE ?? 0x1401, raw)
      const data = new Uint8ClampedArray(width * height * 4)
      const stride = width * 4
      for (let y = 0; y < height; y++) {
        const src = (height - 1 - y) * stride
        const dst = y * stride
        for (let x = 0; x < stride; x += 4) {
          const a = raw[src + x + 3]!
          if (a === 255 || a === 0) {
            data[dst + x] = raw[src + x]!
            data[dst + x + 1] = raw[src + x + 1]!
            data[dst + x + 2] = raw[src + x + 2]!
            data[dst + x + 3] = a
          } else {
            data[dst + x] = Math.min(255, Math.round(raw[src + x]! * 255 / a))
            data[dst + x + 1] = Math.min(255, Math.round(raw[src + x + 1]! * 255 / a))
            data[dst + x + 2] = Math.min(255, Math.round(raw[src + x + 2]! * 255 / a))
            data[dst + x + 3] = a
          }
        }
      }
      const image = typeof ImageData === 'function'
        ? new ImageData(data, width, height)
        : { data, width, height, colorSpace: 'srgb' as PredefinedColorSpace }
      target.putImageData(image, dx, dy)
      return
    }
    target.clearRect(dx, dy, width, height)
    target.drawImage(glCanvas, 0, 0, width, height, dx, dy, width, height)
  }

  function aimCamera(entry: typeof entries[number], aspect: number) {
    const { camera } = entry
    camera.left = -framing.halfHeight * aspect
    camera.right = -camera.left
    camera.updateProjectionMatrix()
    const angle = elevation * Math.PI / 180
    camera.position.set(0, Math.sin(angle) * 12, Math.cos(angle) * 12)
    camera.lookAt(0, 0, 0)
  }

  function draw() {
    const visible = resting ? entries.flatMap((entry, i) => hidden(entry) ? [] : [i]) : undefined
    // Rien à dessiner, et le canevas est déjà vide : pas d'image du tout.
    if (visible && !visible.length && !shown.length) return
    const { bounds, density, ok } = fit()
    if (!ok) return
    if (surface) surface.clearRect(0, 0, canvas.width, canvas.height)
    renderer.setScissorTest(false)
    renderer.clear()
    renderer.setScissorTest(true)
    for (const entry of entries) {
      if (hidden(entry)) continue
      const box = entry.element.getBoundingClientRect()
      if (!box.width || !box.height) continue
      // Hors du canevas (liste qui défile) : rien à dessiner, et pas de masque à calculer.
      if (box.bottom < bounds.top || box.top > bounds.bottom || box.right < bounds.left || box.left > bounds.right) continue
      if (resting) {
        // Arrondi comme le navigateur arrondit l'image de la même rangée : chacun depuis la page.
        const snap = (value: number) => Math.round(value * density)
        const left = snap(box.left) - snap(bounds.left)
        const top = snap(box.top) - snap(bounds.top)
        const width = snap(box.width)
        const height = snap(box.height)
        aimCamera(entry, 1)
        void updateMask(entry, box.height * density / (2 * framing.halfHeight))
        if (surface) {
          place(0, 0, width, height, density)
          renderer.clear()
          renderer.render(entry.scene, entry.camera)
          transferTile(surface, left, top, width, height)
        } else {
          place(left, top, width, height, density)
          renderer.render(entry.scene, entry.camera)
        }
      } else {
        aimCamera(entry, box.width / box.height)
        renderer.setViewport(box.left - bounds.left, bounds.bottom - box.bottom, box.width, box.height)
        renderer.setScissor(box.left - bounds.left, bounds.bottom - box.bottom, box.width, box.height)
        void updateMask(entry, box.height * density / (2 * framing.halfHeight))
        renderer.render(entry.scene, entry.camera)
      }
    }
    frames++
    canvas.dataset.frames = String(frames)
    // Même tâche que le dessin : l'image disparaît et la tasse paraît au même affichage.
    if (visible && visible.join() !== shown.join()) {
      shown = visible
      options.onShown?.(visible)
    }
  }

  let drawnAt = 0
  function tick(time: number) {
    frame = 0
    if (disposed || document.hidden) return
    // Cadence plafonnée : on rend la main sans dessiner, et le temps s'accumule dans le prochain dt.
    const throttled = Boolean(resting) && !entries.some(entry => entry.awake) && ACT_FPS < quality.maxFps
    const fps = throttled ? ACT_FPS : quality.maxFps
    if (previousTime && time - previousTime < 1000 / fps - 5) {
      invalidate()
      return
    }
    const started = options.onFrame ? performance.now() : 0
    const moving = step(time)
    if (options.onFrame) {
      options.onFrame({ cost: performance.now() - started, interval: drawnAt && !throttled ? time - drawnAt : 0 })
      // Un intervalle ne compte que d'une image à la suivante, sans pause au repos.
      drawnAt = moving ? time : 0
    }
  }

  // Une image ; rend vrai quand quelque chose bouge encore.
  function step(time: number): boolean {
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
      return moving
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
      return !still
    }
    if (resting && !reducedMotion.matches) clock += dt
    for (const [index, entry] of entries.entries()) {
      if (hidden(entry)) continue
      const tx = reducedMotion.matches ? resting?.x ?? 0 : entry.tx
      const ty = reducedMotion.matches ? resting?.y ?? 0 : entry.ty
      const quick = reducedMotion.matches ? 1 : 1 - Math.exp(-dt * EYE_RATE)
      const slow = reducedMotion.matches ? 1 : 1 - Math.exp(-dt * BODY_RATE)
      entry.x += (tx - entry.x) * quick
      entry.y += (ty - entry.y) * quick
      entry.bx += (tx - entry.bx) * slow
      entry.by += (ty - entry.by) * slow
      entry.settled = Math.abs(tx - entry.bx) + Math.abs(ty - entry.by) < 0.001
      if (entry.settled) {
        entry.x = entry.bx = tx
        entry.y = entry.by = ty
      } else {
        moving = true
      }
      if (resting && playing(entry)) {
        play(entry, index, dt)
        if (playing(entry)) moving = true
      } else {
        pose(entry, animate ? Math.sin(turnTime * 0.5) * 0.22 : 0)
      }
      if (advance(entry, reducedMotion.matches ? Infinity : dt)) moving = true
      follow(entry, cup => cup.pose({ ...RESTING, gaze: [entry.x, entry.y] }))
    }
    draw()
    if (moving) invalidate()
    else previousTime = 0
    return moving
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
    if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return
    let changed = false
    pointerAt = event.timeStamp
    last = { x: event.clientX, y: event.clientY }
    for (const entry of entries) {
      // Au repos, une tasse endormie ne lit même pas sa boîte : le curseur ne lui coûte rien.
      if (resting && !entry.awake) continue
      changed = aim(entry) || changed
    }
    if (changed) invalidate()
  }

  function aim(entry: typeof entries[number]) {
    if (!last) return false
    const box = entry.element.getBoundingClientRect()
    // En barre latérale, le regard part du visage réel de la tasse dans sa vignette, à son échelle :
    // le curseur ne la réveille que sur sa rangée, donc à quelques dizaines de pixels autour d'elle.
    const unit = box.height / (2 * framing.halfHeight)
    const cx = box.left + box.width / 2 + (resting ? entry.cup.root.position.x * unit : 0)
    const cy = box.top + box.height / 2 + (resting ? (framing.lift - entry.vessel.face.centerY) * unit : 0)
    const u = (last.x - cx) / (resting && box.width ? box.width / 2 : 420)
    const tx = Math.max(-1, Math.min(1, !resting || u <= 0 ? u : u < 1 ? u * 0.75 : 0.75 + (u - 1) * 0.05))
    const ty = Math.max(-1, Math.min(1, (cy - last.y) / (resting && box.height ? box.height / 2 : 300)))
    const changed = tx !== entry.tx || ty !== entry.ty
    entry.tx = tx
    entry.ty = ty
    return changed
  }

  function reset() {
    for (const entry of entries) {
      entry.tx = resting?.x ?? 0
      entry.ty = resting?.y ?? 0
      entry.awake = false
    }
    last = undefined
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
  window.addEventListener('pointerover', pointer, { passive: true })
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
    // Change de niveau en cours de route (le juge de la barre latérale, ou un réglage).
    setQuality(id: Exclude<QualityId, 'static'>) {
      quality = QUALITY[id]
      invalidate()
    },
    setSteamColor(value: string) {
      for (const entry of entries) entry.steam?.setColor(value)
      invalidate()
    },
    // À appeler quand ce que joue la tasse change alors que rien ne bouge (mouvement réduit).
    refresh: invalidate,
    // Mode repos : la tasse se met à suivre le curseur (survol de sa rangée).
    wake(index: number) {
      const entry = entries[index]
      if (!resting || !entry || entry.awake || reducedMotion.matches) return
      entry.awake = true
      entry.settled = false
      aim(entry)
      invalidate()
    },
    // Mode repos : retour au regard de repos ; une fois arrivée, elle quitte le canevas.
    rest(index: number) {
      const entry = entries[index]
      if (!resting || !entry || !entry.awake) return
      entry.awake = false
      entry.settled = false
      entry.tx = resting.x
      entry.ty = resting.y
      invalidate()
    },
    // Mode repos : la tasse joue (réfléchit) ou cesse de jouer ; elle rend la main à son image
    // une fois revenue à la pose de repos et sa vapeur dissipée.
    setActing(index: number, value: boolean) {
      const entry = entries[index]
      if (!resting || !options.act || !entry || entry.acting === value) return
      entry.acting = value
      invalidate()
    },
    // Mode repos : tout le monde redevient image, tout de suite et sans retour en douceur. Pour le
    // défilement : la liste bouge avant que le canevas ne soit redessiné, donc une tasse vivante
    // traînerait derrière sa rangée. Le canevas est vidé dans la même tâche.
    sleep() {
      if (!resting) return
      for (const entry of entries) {
        entry.awake = entry.acting = false
        entry.act = entry.steamLevel = 0
        entry.x = entry.bx = entry.tx = resting.x
        entry.y = entry.by = entry.ty = resting.y
        entry.settled = true
        if (entry.steam) entry.steam.group.visible = false
        pose(entry, 0)
      }
      draw()
    },
    // Images de repos, faites par ce rendu-ci, dans ce canevas-ci, à la taille et la densité
    // où la tasse vivante sera dessinée : le passage de l'image à la 3D ne se voit pas.
    // Rend une image (data URL) par indice, ou undefined si le canevas n'a pas la place.
    async snapshot(indices: number[], size: number): Promise<(string | undefined)[]> {
      const none = () => indices.map(() => undefined)
      if (!resting) return none()
      const density = Math.min(window.devicePixelRatio || 1, quality.density)
      // Les motifs d'abord : une image sans son motif serait fausse pour toujours.
      await Promise.all(indices.map(i => entries[i] ? updateMask(entries[i], size * density / (2 * framing.halfHeight)) : undefined))
      if (disposed) return none()
      const { ok } = fit()
      const pixels = Math.round(size * density)
      if (!ok || glCanvas.width < pixels || glCanvas.height < pixels) return none()
      const copy = document.createElement('canvas')
      copy.width = copy.height = pixels
      const context = copy.getContext('2d', { colorSpace: 'srgb', willReadFrequently: true }) ?? copy.getContext('2d')
      if (!context) return none()
      renderer.setScissorTest(true)
      // En haut à gauche du canevas, copié dans la même tâche : rien de tout cela ne s'affiche.
      place(0, 0, pixels, pixels, density)
      const urls = indices.map(i => {
        const entry = entries[i]
        if (!entry) return undefined
        const live = { x: entry.x, y: entry.y, bx: entry.bx, by: entry.by }
        const steaming = entry.steam?.group.visible ?? false
        entry.x = entry.bx = resting.x
        entry.y = entry.by = resting.y
        pose(entry, 0)
        // L'image est celle du repos : jamais de vapeur dedans, même si la tasse réfléchit.
        if (entry.steam) entry.steam.group.visible = false
        aimCamera(entry, 1)
        renderer.clear()
        renderer.render(entry.scene, entry.camera)
        transferTile(context, 0, 0, pixels, pixels)
        Object.assign(entry, live)
        if (entry.steam) entry.steam.group.visible = steaming
        // Une tasse qui joue reprend sa pose à l'image suivante (`invalidate` plus bas).
        pose(entry, 0)
        return copy.toDataURL('image/png')
      })
      // Le canevas reprend ce qu'il montrait (rien, ou la tasse réveillée).
      renderer.setScissorTest(false)
      renderer.clear()
      shown = []
      invalidate()
      return urls
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
      window.removeEventListener('pointerover', pointer)
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
