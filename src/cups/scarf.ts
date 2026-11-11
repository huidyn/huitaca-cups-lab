import { BufferGeometry, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial } from 'three'
import type { TubeGeometry } from 'three'
import type { VesselDefinition } from './types'
import { addEdgeTones } from './edge-tones'

export const SCARF_COLORS = { cloth: '#244bd2', fold: '#1837a4' } as const
const CLEARANCE = 0.008
const HANDLE_SECTOR = 0.6
// Épaisseur maximale du tissu enroulé, ondulation des bords et position du nœud.
const DEPTH = 0.06
const WAVE = 0.012
export const KNOT_ANGLE = 0.78
const TAU = Math.PI * 2

export interface ScarfFit {
  vessel: VesselDefinition
  floor: number
  tailFloor: number
  top: number
  height: number
  tailLength: number
  handleShift: number
  handleSqueeze: number
}
const fits = new WeakMap<VesselDefinition, ScarfFit>()

// Enveloppe des pièces réelles, y compris le porte-verre, pas seulement du corps.
function surfaceRadius(vessel: VesselDefinition, y: number) {
  let radius = 0
  for (const part of vessel.parts) {
    if (part.id === 'inside') continue
    for (let i = 1; i < part.outline.length; i++) {
      const a = part.outline[i - 1]!
      const b = part.outline[i]!
      if (y < Math.min(a[1], b[1]) || y > Math.max(a[1], b[1])) continue
      radius = Math.max(radius, a[1] === b[1] ? Math.max(a[0], b[0])
        : a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]))
    }
  }
  if (radius <= 0) throw new Error(`${vessel.id}: scarf outside the vessel at ${y}`)
  return radius
}

// Le tissu enjambe un rebord (porte-verre, pied arrondi) au lieu de suivre une marche
// entre deux rangées de sommets : sinon la face plane d'un triangle traverse la paroi.
function clothWall(vessel: VesselDefinition, y: number, reach: number) {
  let wall = 0
  for (const step of [-1, -0.5, 0, 0.5, 1]) wall = Math.max(wall, surfaceRadius(vessel, y + step * reach))
  return wall + CLEARANCE
}

// Irrégularité fixe du tissu : fréquences entières, donc la jointure du tour se referme.
function wobble(angle: number, phase: number) {
  return 0.5 * Math.sin(2 * angle + phase) + 0.3 * Math.sin(3 * angle + 1.7 * phase) + 0.2 * Math.sin(5 * angle + 2.3 + phase)
}

function gap(a: number, b: number) {
  return Math.abs(((a - b) % TAU + TAU * 1.5) % TAU - Math.PI)
}

const ease = (t: number) => t <= 0 ? 0 : t >= 1 ? 1 : (1 - Math.cos(Math.PI * t)) / 2
const RISE_FROM = 0.4
const RISE_TO = 1.4
const FALL_TO = TAU - 0.4

// Côté anse, l'écharpe pend plus haut : elle monte doucement depuis l'œil droit jusqu'à l'anse,
// reste haute par le dos et redescend lentement par le flanc gauche. Jamais de bosse locale.
export function handleLift(angle: number) {
  const a = (angle % TAU + TAU) % TAU
  if (a < RISE_TO) return ease((a - RISE_FROM) / (RISE_TO - RISE_FROM))
  return ease((FALL_TO - a) / (FALL_TO - RISE_TO))
}

export function band(fit: ScarfFit, angle: number) {
  const distance = gap(angle, Math.PI / 2)
  const handle = distance < HANDLE_SECTOR ? (1 + Math.cos(distance / HANDLE_SECTOR * Math.PI)) / 2 : 0
  // Le nœud tire légèrement le tissu vers le bas.
  const pull = Math.exp(-((gap(angle, KNOT_ANGLE) / 0.45) ** 2))
  const top = fit.top + 0.02 * (1 - Math.cos(angle)) - 0.025 * pull + WAVE * wobble(angle, 0.4) + fit.handleShift * handleLift(angle)
  const height = fit.height * (1 - fit.handleSqueeze * handle) + 0.018 * wobble(angle, 2.1)
  return { top, height }
}

// Profil d'un tissu roulé : bords arrondis, deux plis qui dérivent autour de la tasse.
function depthAt(angle: number, v: number) {
  const edge = 0.01
  const thick = DEPTH * (0.85 + 0.15 * wobble(angle, 1.1))
  const first = 0.36 + 0.08 * wobble(angle, 3.3)
  const second = 0.68 + 0.08 * wobble(angle, 5.2)
  const crease = 1 - 0.28 * Math.exp(-(((v - first) / 0.07) ** 2)) - 0.2 * Math.exp(-(((v - second) / 0.06) ** 2))
  return edge + (thick - edge) * Math.sin(Math.PI * v) ** 0.45 * crease
}

function wrapDepth(fit: ScarfFit, angle: number, y: number) {
  const { top, height } = band(fit, angle)
  const v = (y - top + height) / height
  return v < 0 || v > 1 ? 0 : depthAt(angle, v)
}

function knotFrame(fit: ScarfFit) {
  const { top, height } = band(fit, KNOT_ANGLE)
  const halfHeight = Math.min(0.45 * height, 0.11)
  return { center: top - height / 2 + 0.01, halfHeight, halfWidth: 0.11 }
}

export function fitScarf(vessel: VesselDefinition, handle: TubeGeometry | undefined): ScarfFit {
  const cached = fits.get(vessel)
  if (cached) return cached
  if (vessel.handle && !handle) throw new Error(`${vessel.id}: scarf needs the rendered handle geometry`)
  const face = vessel.face
  const eyeTravel = Math.min(0.07, Math.max(0, (face.height - face.eyeHeight) / 2))
  const top = face.centerY - face.eyeHeight / 2 - eyeTravel - 0.04 - WAVE
  const body = vessel.parts.find(part => part.id === face.surface)!
  const ceiling = Math.max(...body.outline.map(point => point[1]))
  // Le sol utile est le plus haut rebord qui dépasse sous l'écharpe (soucoupe), sinon le fond du corps :
  // une queue qui l'atteint s'étalait sur toute la soucoupe.
  let floor = Math.min(...body.outline.map(point => point[1]))
  let reach = 0
  for (let y = top - 0.32; y <= top; y += 0.005) reach = Math.max(reach, surfaceRadius(vessel, Math.max(floor, y)))
  for (let y = top - 0.16; y > floor; y -= 0.005) {
    if (surfaceRadius(vessel, y) > reach + DEPTH + 0.04) { floor = y; break }
  }
  // Un quart environ de la hauteur, comme la référence ; un peu moins sur les motifs culturels.
  const height = Math.min(0.32, Math.max(0.2, (top - floor) * 0.6)) * (vessel.pattern ? 0.8 : 1)
  // Les queues visent le vrai pied ou le dessus de la soucoupe, pas le fond du bol.
  // Sous un pied haut (verre à pied), on garde une marge supplémentaire le long de la tige.
  const ground = Math.min(...vessel.parts.filter(part => part.id !== 'inside').flatMap(part => part.outline.map(point => point[1])))
  const saucers = vessel.parts.filter(part => part.id === 'saucer')
  const tailFloor = saucers.length ? Math.max(...saucers.flatMap(part => part.outline.map(point => point[1])))
    : floor - ground >= 0.3 ? ground + 0.1 : ground
  const fit: ScarfFit = { vessel, floor, tailFloor, top, height, tailLength: 0, handleShift: 0, handleSqueeze: 0 }
  if (handle) {
    const { path, tubularSegments, radialSegments } = handle.parameters
    const positions = handle.attributes.position!
    const rings = Array.from({ length: tubularSegments + 1 }, (_, ring) => {
      const center = path.getPointAt(ring / tubularSegments)
      let radius = 0
      for (let side = 0; side <= radialSegments; side++) {
        const i = ring * (radialSegments + 1) + side
        radius = Math.max(radius, Math.hypot(positions.getX(i) - center.x, positions.getY(i) - center.y, positions.getZ(i) - center.z))
      }
      return { center, radius }
    })
    // Capsules conservatrices issues des anneaux évasés du vrai maillage.
    const capsules = rings.slice(1).map((ring, i) => {
      const a = rings[i]!
      const dx = ring.center.x - a.center.x
      const dy = ring.center.y - a.center.y
      const dz = ring.center.z - a.center.z
      return { a: a.center, dx, dy, dz, length2: dx * dx + dy * dy + dz * dz,
        radius2: (Math.max(a.radius, ring.radius) + 0.025) ** 2 }
    })
    const clears = () => {
      for (let column = 0; column < 64; column++) {
        if (band(fit, column / 64 * TAU).top > ceiling - 0.05) return false
      }
      for (let column = 0; column <= 32; column++) {
        const angle = Math.PI / 2 - HANDLE_SECTOR + column / 32 * HANDLE_SECTOR * 2
        const { top: upper, height: tall } = band(fit, angle)
        if (upper > ceiling - 0.05 || upper - tall < floor + 0.05) return false
        for (let row = 0; row <= 8; row++) {
          const y = upper - row / 8 * tall
          const surface = surfaceRadius(vessel, y) + CLEARANCE
          for (const depth of [0, depthAt(angle, 1 - row / 8) / 2, depthAt(angle, 1 - row / 8)]) {
            const x = Math.sin(angle) * (surface + depth)
            const z = Math.cos(angle) * (surface + depth)
            for (const capsule of capsules) {
              const vx = x - capsule.a.x
              const vy = y - capsule.a.y
              const vz = z - capsule.a.z
              const t = Math.max(0, Math.min(1, (vx * capsule.dx + vy * capsule.dy + vz * capsule.dz) / capsule.length2))
              if ((vx - t * capsule.dx) ** 2 + (vy - t * capsule.dy) ** 2 + (vz - t * capsule.dz) ** 2 < capsule.radius2) return false
            }
          }
        }
      }
      return true
    }
    // Le tissu passe toujours AU-DESSUS de l'attache basse, dans la boucle de l'anse, et peut s'y
    // resserrer un peu : on retient le plus petit changement qui dégage la vraie anse.
    const candidates: [number, number][] = []
    for (let squeeze = 0; squeeze <= 10; squeeze++) {
      for (let step = 0; step <= 120; step++) candidates.push([step * 0.005, squeeze * 0.05])
    }
    // Resserrer coûte plus que déplacer : un tissu trop pincé ne se lit plus comme une écharpe.
    candidates.sort((a, b) => Math.abs(a[0]) + a[1] * height * 1.5 - Math.abs(b[0]) - b[1] * height * 1.5)
    const found = candidates.find(([shift, squeeze]) => {
      fit.handleShift = shift
      fit.handleSqueeze = squeeze
      return clears()
    })
    if (!found) throw new Error(`${vessel.id}: no scarf route clear of the handle`)
  }
  // Après l'anse : la montée douce déplace aussi un peu le nœud.
  const frame = knotFrame(fit)
  const knot = frame.center - 0.35 * frame.halfHeight
  // La pointe oblique descend encore de 0,028 environ : elle reste juste au-dessus du sol utile.
  fit.tailLength = Math.min(0.75, knot - tailFloor - 0.06)
  fits.set(vessel, fit)
  return fit
}

function geometry(vertices: number[], indices: number[]) {
  const result = new BufferGeometry()
  result.setAttribute('position', new Float32BufferAttribute(vertices, 3))
  result.setIndex(indices)
  result.computeVertexNormals()
  addEdgeTones(result)
  return result
}

function wrapGeometry(fit: ScarfFit) {
  // Contour fermé de la section : dessous, face extérieure plissée, dessus, retour contre la paroi.
  const outer = Array.from({ length: 17 }, (_, i) => i / 16)
  const loop: [boolean, number][] = [[false, 0], ...outer.map(v => [true, v] as [boolean, number]),
    ...outer.slice().reverse().map(v => [false, v] as [boolean, number])]
  const columns = 192
  const vertices: number[] = []
  const indices: number[] = []
  for (let column = 0; column <= columns; column++) {
    const angle = column / columns * TAU
    const { top, height } = band(fit, angle)
    for (const [face, v] of loop) {
      const y = top - height * (1 - v)
      const radius = clothWall(fit.vessel, y, height / 16) + (face ? depthAt(angle, v) : 0)
      vertices.push(Math.sin(angle) * radius, y, Math.cos(angle) * radius)
    }
    if (column === columns) continue
    for (let row = 0; row < loop.length - 1; row++) {
      const a = column * loop.length + row
      const b = a + loop.length
      indices.push(a, a + 1, b, a + 1, b + 1, b)
    }
  }
  return geometry(vertices, indices)
}

// Pièce de tissu épaisse : deux couches (dos, face) reliées par leurs bords.
function slab(rows: number, columns: number, vertex: (layer: number, row: number, column: number) => [number, number, number]) {
  const layerSize = (rows + 1) * (columns + 1)
  const vertices: number[] = []
  const indices: number[] = []
  for (let layer = 0; layer < 2; layer++) {
    for (let row = 0; row <= rows; row++) {
      for (let column = 0; column <= columns; column++) {
        const [angle, y, radius] = vertex(layer, row, column)
        vertices.push(Math.sin(angle) * radius, y, Math.cos(angle) * radius)
      }
    }
  }
  for (let layer = 0; layer < 2; layer++) {
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const a = layer * layerSize + row * (columns + 1) + column
        const b = a + columns + 1
        if (layer) indices.push(a, b, a + 1, a + 1, b, b + 1)
        else indices.push(a, a + 1, b, a + 1, b + 1, b)
      }
    }
  }
  const cap = (a: number, b: number) => indices.push(a, b, a + layerSize, b, b + layerSize, a + layerSize)
  for (let column = 0; column < columns; column++) {
    cap(column, column + 1)
    cap(rows * (columns + 1) + column + 1, rows * (columns + 1) + column)
  }
  for (let row = 0; row < rows; row++) {
    cap((row + 1) * (columns + 1), row * (columns + 1))
    cap(row * (columns + 1) + columns, (row + 1) * (columns + 1) + columns)
  }
  return geometry(vertices, indices)
}

function middle(fit: ScarfFit, angle: number) {
  const { top, height } = band(fit, angle)
  return top - height / 2
}

function knotGeometry(fit: ScarfFit) {
  const { center, halfHeight, halfWidth } = knotFrame(fit)
  const base = surfaceRadius(fit.vessel, center)
  return slab(14, 14, (layer, row, column) => {
    const u = column / 14 * 2 - 1
    const v = row / 14 * 2 - 1
    const angle = KNOT_ANGLE + u * halfWidth / base * (1 - 0.15 * v * v) + 0.03 * v
    // Le nœud épouse la pente de la bande : à plat, il glissait sous elle côté anse.
    const slope = middle(fit, angle) - middle(fit, KNOT_ANGLE)
    const y = center + slope - v * halfHeight * (1 - 0.12 * u * u)
    const wall = clothWall(fit.vessel, y, halfHeight / 7)
    if (!layer) return [angle, y, wall + 0.004]
    // Coussin bosselé, traversé d'un pli en diagonale.
    const pillow = ((1 - u * u) * (1 - v * v)) ** 0.6
    const ridge = 0.015 * Math.exp(-(((u - 0.6 * v) / 0.3) ** 2)) * pillow
    const lump = 0.008 * Math.sin(3 * u + 2 * v + 0.7) * pillow
    return [angle, y, wall + wrapDepth(fit, angle, y) + 0.012 + 0.075 * pillow + ridge + lump]
  })
}

interface Tail { angle: number; top: number; length: number; widths: [number, number]; lift: number; thick: number; drift: number; slant: number; phase: number }

function tailGeometry(fit: ScarfFit, tail: Tail) {
  const rows = 36
  const columns = 10
  const base = surfaceRadius(fit.vessel, tail.top)
  // Chute verticale libre : le rayon requis ne diminue jamais en descendant.
  let hanging = 0
  const required = Array.from({ length: rows + 1 }, (_, row) => {
    const y = tail.top - tail.length * row / rows
    for (const across of [-1, 0, 1]) {
      const angle = tail.angle + across * tail.widths[0] / (2 * base)
      hanging = Math.max(hanging, clothWall(fit.vessel, y, tail.length / rows) + wrapDepth(fit, angle, y))
    }
    return hanging
  })
  return slab(rows, columns, (layer, row, column) => {
    const u = column / columns * 2 - 1
    const t = row / rows
    const width = tail.widths[0] + (tail.widths[1] - tail.widths[0]) * t
    const angle = tail.angle + tail.drift * t ** 1.5 + u * width / (2 * required[row]!)
    const hem = Math.max(0, (t - 0.88) / 0.12)
    const y = tail.top - tail.length * t + hem * (tail.slant * u + 0.01 * Math.sin(5 * u + tail.phase))
    const fold = 0.012 * (1 + Math.sin(u * Math.PI * 1.4 + tail.phase)) / 2 * Math.min(1, t * 4)
    const radius = Math.max(required[row]!, clothWall(fit.vessel, y, tail.length / rows)) + tail.lift + fold + layer * tail.thick
    return [angle, y, radius]
  })
}

export function createScarf(fit: ScarfFit) {
  const materials = Object.fromEntries(Object.entries(SCARF_COLORS).map(([slot, color]) => [
    slot, new MeshBasicMaterial({ color, side: DoubleSide, toneMapped: false, vertexColors: true })
  ])) as Record<keyof typeof SCARF_COLORS, MeshBasicMaterial>
  const group = new Group()
  group.name = 'scarf'
  const { center, halfHeight } = knotFrame(fit)
  const tailTop = center - 0.35 * halfHeight
  const parts: [string, BufferGeometry, MeshBasicMaterial][] = [
    ['scarf-wrap', wrapGeometry(fit), materials.cloth],
    ['scarf-knot', knotGeometry(fit), materials.cloth],
    // Les queues sortent sous le cœur du nœud, qui reste visible au-dessus d'elles.
    ['scarf-tail', tailGeometry(fit, { angle: KNOT_ANGLE - 0.01, top: tailTop, length: fit.tailLength,
      widths: [0.17, 0.23], lift: 0.024, thick: 0.026, drift: -0.05, slant: 0.035, phase: 0.6 }), materials.cloth],
    ['scarf-tail-back', tailGeometry(fit, { angle: KNOT_ANGLE - 0.17, top: tailTop - 0.02,
      length: Math.min(fit.tailLength * 0.85, tailTop - 0.02 - fit.tailFloor - 0.06),
      widths: [0.15, 0.19], lift: 0, thick: 0.022, drift: -0.06, slant: -0.03, phase: 2.2 }), materials.fold]
  ]
  for (const [name, shape, material] of parts) {
    const mesh = new Mesh(shape, material)
    mesh.name = name
    group.add(mesh)
  }
  return { group, materials: Object.values(materials) }
}
