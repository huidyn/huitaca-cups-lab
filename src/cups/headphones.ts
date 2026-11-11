import {
  Box3, BufferGeometry, DoubleSide, Float32BufferAttribute, Group, LatheGeometry,
  Mesh, MeshBasicMaterial, Object3D, Raycaster, Vector2, Vector3
} from 'three'
import { addEdgeTones } from './edge-tones'
import type { VesselDefinition } from './types'

export const HEADPHONE_COLORS = { band: '#555958', shell: '#626665', cushion: '#474c4b' } as const
// Proportions relevées sur la référence : coque ronde d'environ la moitié du
// diamètre de la tasse, coussin épais, arceau franc.
const CUSHION_DEPTH = 0.09
const SHELL_DEPTH = 0.2
const SHELL_OVERLAP = 0.01
const BAND_THICKNESS = 0.075
const BAND_DEPTH = 0.08
const CLEARANCE = 0.008
const SLICES = 16

export interface HeadphoneFit {
  radius: number
  earY: number
  earRadius: number
  lean: number
  tilt: number
  span: number
  footSpan: number
  bandX: number
  bandZ: number
  heading: number
  bandY: number
  legTop: number
  rise: number
  cushionPositions: number[]
}
const fits = new WeakMap<VesselDefinition, HeadphoneFit>()

// Rayon réel de tous les triangles qui passent dans une tranche de hauteur.
// Les arêtes coupées aux deux limites comptent aussi, notamment sur les bols évasés.
function supportRadius(surfaces: Mesh[], bottom: number, top: number) {
  let radius = 0
  for (const mesh of surfaces) {
    const points = mesh.geometry.attributes.position!
    const index = mesh.geometry.index
    const count = index?.count ?? points.count
    for (let i = 0; i < count; i += 3) {
      for (let side = 0; side < 3; side++) {
        const a = index ? index.getX(i + side) : i + side
        const b = index ? index.getX(i + (side + 1) % 3) : i + (side + 1) % 3
        const ay = points.getY(a)
        const by = points.getY(b)
        if (ay >= bottom && ay <= top) radius = Math.max(radius, Math.hypot(points.getX(a), points.getZ(a)))
        for (const y of [bottom, top]) {
          if (ay === by || y < Math.min(ay, by) || y > Math.max(ay, by)) continue
          const t = (y - ay) / (by - ay)
          radius = Math.max(radius, Math.hypot(
            points.getX(a) + t * (points.getX(b) - points.getX(a)),
            points.getZ(a) + t * (points.getZ(b) - points.getZ(a))
          ))
        }
      }
    }
  }
  return radius
}

// Repère d'une oreille : origine sur la face du coussin, +x vers l'extérieur.
// L'inclinaison suit la pente de la paroi. Seule l'oreille côté anse avance,
// comme un écouteur qu'on décale pour entendre : l'autre reste bien en place.
function earFrame(fit: Pick<HeadphoneFit, 'radius' | 'earY' | 'lean' | 'tilt'>, side: number, target = new Object3D()) {
  const tilt = side > 0 ? fit.tilt : 0
  target.position.set(side * fit.radius * Math.cos(tilt), fit.earY, fit.radius * Math.sin(tilt))
  target.rotation.set(0, side > 0 ? -tilt : Math.PI, fit.lean)
  return target
}

// Point de l'arceau : u le long de la corde entre les deux coques, w en travers.
export function bandPoint(fit: Pick<HeadphoneFit, 'bandX' | 'bandZ' | 'heading'>, u: number, w: number) {
  return [fit.bandX + u * Math.cos(fit.heading) - w * Math.sin(fit.heading),
    fit.bandZ + u * Math.sin(fit.heading) + w * Math.cos(fit.heading)] as const
}

// Un sommet de l'anse touche-t-il le volume d'une oreille (coussin et coque) ?
export function earTouches(fit: Pick<HeadphoneFit, 'radius' | 'earY' | 'earRadius' | 'lean' | 'tilt'>, point: Vector3, margin: number) {
  for (const side of [-1, 1]) {
    const frame = earFrame(fit, side)
    frame.updateMatrix()
    const local = point.clone().applyMatrix4(frame.matrix.invert())
    if (local.x > -margin && local.x < CUSHION_DEPTH - SHELL_OVERLAP + SHELL_DEPTH + margin
      && Math.hypot(local.y, local.z) < fit.earRadius + margin) return true
  }
  return false
}

// L'oreille côté anse avance juste assez pour passer devant la vraie anse,
// testée sommet par sommet plutôt que par sa boîte englobante.
function handleTilt(cup: Group, fit: Pick<HeadphoneFit, 'radius' | 'earY' | 'earRadius' | 'lean'>) {
  const handle = cup.getObjectByName('handle')
  if (!(handle instanceof Mesh)) return 0
  handle.updateWorldMatrix(true, false)
  const points = handle.geometry.attributes.position!
  const vertices = Array.from({ length: points.count }, (_, i) =>
    new Vector3().fromBufferAttribute(points, i).applyMatrix4(handle.matrixWorld))
    .filter(point => point.y > fit.earY - fit.earRadius - 0.05)
  for (let tilt = 0; tilt < 0.9; tilt += 0.01) {
    if (!vertices.some(point => earTouches({ ...fit, tilt }, point, 0.02))) return tilt
  }
  return 0.9
}

function placeEar(cup: Group, surfaces: Mesh[], rimY: number, earRadius: number) {
  const earY = rimY - earRadius - 0.02
  // Le coussin est un disque plat : on l'incline selon la paroi réelle pour qu'il
  // repose à plat, puis on le recule jusqu'à ce qu'aucune tranche ne le traverse.
  const step = earRadius * 2 / SLICES
  const slices = Array.from({ length: SLICES }, (_, i) => {
    const y = earY - earRadius + (i + 0.5) * step
    return { y, radius: supportRadius(surfaces, y - step / 2, y + step / 2) }
  })
  // Pente qui colle au plus près : la plus petite distance au centre qui reste
  // hors de toutes les tranches (fonction convexe, d'où la recherche ternaire).
  const offset = (slope: number) => Math.max(...slices.map(slice =>
    slice.radius - slope * (slice.y - earY) + Math.abs(slope) * step / 2))
  let low = -0.6
  let high = 0.6
  for (let i = 0; i < 60; i++) {
    const a = low + (high - low) / 3
    const b = high - (high - low) / 3
    if (offset(a) <= offset(b)) high = b
    else low = a
  }
  const slope = (low + high) / 2
  let radius = offset(slope) + CLEARANCE
  const lean = -Math.atan(slope)
  const frame = earFrame({ radius, earY, lean, tilt: 0 }, 1)
  frame.updateMatrixWorld(true)
  const foam = cushionGeometry(earRadius)
  const points = foam.attributes.position!
  let ringWall = -Infinity
  for (let i = 0; i < points.count; i++) {
    const wall = wallDepth(surfaces, frame, points.getY(i), points.getZ(i))
    if (wall !== null) ringWall = Math.max(ringWall, wall)
  }
  foam.dispose()
  // La coque rigide reste à l'extérieur ; seule la mousse se comprime. Le
  // centre vide ne repousse plus le coussinet loin de la paroi bombée.
  const inward = Math.min(0.03, Math.max(0, 0.001 - ringWall))
  const seatRadius = radius
  radius -= inward / Math.cos(lean)
  return { earY, earRadius, radius, seatRadius, lean, tilt: handleTilt(cup, { radius, earY, earRadius, lean }) }
}

// Intersection dans le repère de l'écouteur, depuis l'extérieur vers la tasse.
function wallDepth(surfaces: Mesh[], frame: Object3D, y: number, z: number) {
  const origin = frame.localToWorld(new Vector3(2, y, z))
  const direction = new Vector3(-1, 0, 0).transformDirection(frame.matrixWorld)
  const hit = new Raycaster(origin, direction, 0, 4).intersectObjects(surfaces, false)[0]
  return hit ? frame.worldToLocal(hit.point.clone()).x : null
}

export function fitHeadphones(vessel: VesselDefinition, cup: Group): HeadphoneFit {
  const cached = fits.get(vessel)
  if (cached) return cached
  const rim = vessel.parts.filter(part => part.id === 'rim' || (vessel.lid && part.id === 'lid')).flatMap(part => part.outline)
  if (!rim.length) throw new Error(`${vessel.id}: headphones need a rim`)
  const rimY = Math.max(...rim.map(point => point[1]))
  const rimRadius = Math.max(...rim.map(point => point[0]))
  const surfaces: Mesh[] = []
  cup.traverse(object => { if (object instanceof Mesh && object.name !== 'handle') surfaces.push(object) })
  // Au-delà de cette avance, l'oreille déplacée masquerait l'œil vu de trois
  // quarts : sur une anse très haute, la coque rapetisse un peu plutôt.
  let ear = placeEar(cup, surfaces, rimY, Math.min(0.46, Math.max(0.38, rimRadius * 0.52)))
  while (ear.tilt > 0.635 && ear.earRadius > 0.3) ear = placeEar(cup, surfaces, rimY, ear.earRadius - 0.01)
  const { earY, earRadius, radius, lean, tilt } = ear
  const frame = earFrame(ear, 1)
  frame.updateMatrixWorld(true)
  const foam = cushionGeometry(earRadius)
  const points = foam.attributes.position!
  for (let i = 0; i < points.count; i++) {
    const wall = wallDepth(surfaces, frame, points.getY(i), points.getZ(i))
    if (wall === null) continue
    // Une mousse souple, pas un moulage : déformation douce et limitée, sans
    // chercher à remplir tous les jours entre l'anneau et la tasse.
    const x = points.getX(i)
    const compression = 0.012 * Math.tanh(wall / 0.025)
    points.setX(i, x + compression * (1 - x / CUSHION_DEPTH))
  }
  const cushionPositions = Array.from(points.array)
  foam.dispose()
  const [left, right] = [-1, 1].map(side => {
    const frame = earFrame({ radius, earY, lean, tilt }, side)
    frame.updateMatrix()
    return new Vector3(CUSHION_DEPTH - SHELL_OVERLAP + SHELL_DEPTH / 2, earRadius * 0.55, 0).applyMatrix4(frame.matrix)
  }) as [Vector3, Vector3]
  const footSpan = Math.hypot(right.x - left.x, right.z - left.z) / 2
  // La mousse avance, mais les montants rigides s'écartent toujours du couvercle.
  const span = footSpan + (ear.seatRadius - radius) * Math.cos(tilt / 2)
  const band = { bandX: (left.x + right.x) / 2, bandZ: (left.z + right.z) / 2, heading: Math.atan2(right.z - left.z, right.x - left.x) }
  const bandY = right.y
  const highest = new Box3().setFromObject(cup).max.y
  const ray = new Raycaster(new Vector3(), new Vector3(0, -1, 0))
  // L'arceau monte d'abord tout droit au-dessus de tout ce qui est proche de ses
  // montants (rebord de couvercle du gaiwan, lèvre roulée), puis s'arrondit.
  let legTop = bandY
  for (const side of [-1, 1]) {
    for (let inset = 0; inset <= 0.15 + 1e-9; inset += 0.025) {
      for (const depth of [-1, 0, 1]) {
        const [x, z] = bandPoint(band, side * (span - BAND_THICKNESS - inset), depth * BAND_DEPTH)
        ray.ray.origin.set(x, highest + 1, z)
        const hit = ray.intersectObjects(surfaces, false)[0]
        if (hit) legTop = Math.max(legTop, hit.point.y + 0.03)
      }
    }
  }
  let rise = Math.max(span * 0.78, highest - legTop + 0.12)
  // Le dessous de l'arceau franchit aussi les vrais couvercles, becs et boutons.
  // Le calcul n'a lieu qu'à la construction ; les vues suivantes gardent cette pose.
  for (let pass = 0; pass < 3; pass++) {
    let needed = rise
    for (let step = 1; step < 192; step++) {
      const t = step / 192 * Math.PI
      const nx = rise * Math.cos(t)
      const ny = span * Math.sin(t)
      const normalX = nx / Math.hypot(nx, ny)
      for (const across of [-1, 0, 1]) {
        for (const depth of [-1, 0, 1]) {
          const [x, z] = bandPoint(band, span * Math.cos(t) + across * BAND_THICKNESS * normalX, depth * BAND_DEPTH)
          ray.ray.origin.set(x, highest + 1, z)
          const hit = ray.intersectObjects(surfaces, false)[0]
          if (hit) needed = Math.max(needed, (hit.point.y + 0.025 + BAND_THICKNESS - legTop) / Math.sin(t))
        }
      }
    }
    if (needed <= rise + 1e-6) break
    rise = needed
  }
  const fit = { radius, earY, earRadius, lean, tilt, span, footSpan, ...band, bandY, legTop, rise, cushionPositions }
  fits.set(vessel, fit)
  return fit
}

// Anneau fermé de mousse, sans disque au centre : le creux va jusqu'à la coque.
function cushionGeometry(earRadius: number) {
  const outer = earRadius * 0.9
  const inner = earRadius * 0.52
  const bevel = 0.018
  const profile: Vector2[] = []
  for (const [r, x, from] of [
    [outer - bevel, bevel, -Math.PI / 2],
    [outer - bevel, CUSHION_DEPTH - bevel, 0],
    [inner + bevel, CUSHION_DEPTH - bevel, Math.PI / 2],
    [inner + bevel, bevel, Math.PI]
  ]) {
    for (let i = 0; i <= 6; i++) {
      const a = from! + i / 6 * Math.PI / 2
      profile.push(new Vector2(r! + bevel * Math.cos(a), x! + bevel * Math.sin(a)))
    }
  }
  profile.push(profile[0]!.clone())
  // Les faces plates ont aussi des sommets intermédiaires : une grande
  // diagonale ne doit pas couper une lèvre de couvercle entre deux mesures.
  const sampled = profile.flatMap((point, i) => {
    const next = profile[i + 1]
    if (!next) return [point]
    const steps = Math.ceil(point.distanceTo(next) / 0.012)
    return Array.from({ length: Math.max(1, steps) }, (_, j) => point.clone().lerp(next, j / Math.max(1, steps)))
  })
  const geometry = new LatheGeometry(sampled, 64)
  geometry.rotateZ(-Math.PI / 2)
  geometry.computeVertexNormals()
  return geometry
}

// Profil tourné (rayon, profondeur) avec des bords arrondis en quart de cercle.
function roundedDisc(radius: number, depth: number, inner: number, outer: number) {
  const profile = [new Vector2(0, 0)]
  const arc = (cr: number, cd: number, size: number, from: number) => {
    for (let i = 0; i <= 6; i++) {
      const a = from + i / 6 * Math.PI / 2
      profile.push(new Vector2(cr + size * Math.cos(a), cd + size * Math.sin(a)))
    }
  }
  arc(radius - inner, inner, inner, -Math.PI / 2)
  arc(radius - outer, depth - outer, outer, 0)
  profile.push(new Vector2(0, depth))
  const geometry = new LatheGeometry(profile, 64)
  // L'axe du tour devient +x, la profondeur vers l'extérieur de la tasse.
  geometry.rotateZ(-Math.PI / 2)
  geometry.computeVertexNormals()
  addEdgeTones(geometry)
  return geometry
}

function bandGeometry(fit: HeadphoneFit) {
  // Ligne médiane : montant droit, demi-ellipse, montant gauche.
  const path: { x: number, y: number, nx: number, ny: number }[] = []
  const legs = fit.legTop - fit.bandY > 1e-3 ? 8 : 0
  for (let i = 0; i < legs; i++) path.push({ x: fit.footSpan + i / legs * (fit.span - fit.footSpan), y: fit.bandY + i / legs * (fit.legTop - fit.bandY), nx: 1, ny: 0 })
  for (let i = 0; i <= 96; i++) {
    const t = i / 96 * Math.PI
    const nx = fit.rise * Math.cos(t)
    const ny = fit.span * Math.sin(t)
    const length = Math.hypot(nx, ny)
    path.push({ x: fit.span * Math.cos(t), y: fit.legTop + fit.rise * Math.sin(t), nx: nx / length, ny: ny / length })
  }
  for (let i = legs - 1; i >= 0; i--) path.push({ x: -fit.footSpan - i / legs * (fit.span - fit.footSpan), y: fit.bandY + i / legs * (fit.legTop - fit.bandY), nx: -1, ny: 0 })
  const sides = 16
  const vertices: number[] = []
  const indices: number[] = []
  path.forEach((point, segment) => {
    for (let side = 0; side <= sides; side++) {
      const a = side / sides * Math.PI * 2
      const offset = BAND_THICKNESS * Math.cos(a)
      const [x, z] = bandPoint(fit, point.x + offset * point.nx, BAND_DEPTH * Math.sin(a))
      vertices.push(x, point.y + offset * point.ny, z)
      if (segment === path.length - 1 || side === sides) continue
      const i = segment * (sides + 1) + side
      const next = i + sides + 1
      indices.push(i, next, i + 1, i + 1, next, next + 1)
    }
  })
  // Les extrémités sont fermées et se logent dans les coques.
  for (const start of [0, (path.length - 1) * (sides + 1)]) {
    for (let side = 1; side < sides - 1; side++) indices.push(start, start + side, start + side + 1)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  addEdgeTones(geometry)
  return geometry
}

export function createHeadphones(fit: HeadphoneFit) {
  const materials = Object.fromEntries(Object.entries(HEADPHONE_COLORS).map(([slot, color]) => [
    slot, new MeshBasicMaterial({ color, side: DoubleSide, toneMapped: false, vertexColors: true })
  ])) as Record<keyof typeof HEADPHONE_COLORS, MeshBasicMaterial>
  const group = new Group()
  group.name = 'headphones'
  const band = new Mesh(bandGeometry(fit), materials.band)
  band.name = 'headphones-band'
  group.add(band)
  for (const side of [-1, 1]) {
    const name = side < 0 ? 'left' : 'right'
    const ear = earFrame(fit, side, new Group())
    ear.name = `headphones-${name}`
    const foam = cushionGeometry(fit.earRadius)
    foam.setAttribute('position', new Float32BufferAttribute(fit.cushionPositions, 3))
    foam.computeVertexNormals()
    addEdgeTones(foam)
    const cushion = new Mesh(foam, materials.cushion)
    cushion.name = `headphones-${name}-cushion`
    const shell = new Mesh(roundedDisc(fit.earRadius, SHELL_DEPTH, 0.03, 0.08), materials.shell)
    shell.name = `headphones-${name}-shell`
    shell.position.x = CUSHION_DEPTH - SHELL_OVERLAP
    ear.add(cushion, shell)
    group.add(ear)
  }
  return { group, materials: Object.values(materials) }
}
