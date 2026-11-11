import { DoubleSide, Group, LatheGeometry, Mesh, MeshBasicMaterial, Vector2 } from 'three'
import { createLidGeometry } from './lid'
import { addEdgeTones } from './edge-tones'
import type { Point2, VesselDefinition } from './types'

export const BERET_COLORS = { crown: '#c84444', band: '#a93636' } as const
const SEGMENTS = 48
const DROOP = 0.16
// Rayon, hauteur, décalage, retombée : couronne arrondie et compacte ;
// le bord gauche descend devant le bandeau au lieu de s'étaler à plat.
const CROWN: [number, number, number, number][] = [
  [1.02, 0, 0, 0], [1.1, -0.01, -0.025, 0.65],
  [1.18, 0.01, -0.04, 1], [1.215, 0.1, -0.05, 1],
  [1.22, 0.25, -0.06, 0.9], [1.19, 0.43, -0.075, 0.75],
  [1.11, 0.63, -0.08, 0.55], [0.98, 0.79, -0.08, 0.36],
  [0.8, 0.92, -0.075, 0.2], [0.56, 1, -0.065, 0.1],
  [0.3, 1.04, -0.06, 0.04], [0, 1.06, -0.06, 0]
]

export interface BeretFit {
  radius: number
  baseY: number
  height: number
}
const fits = new WeakMap<VesselDefinition, BeretFit>()

export function fitBeret(vessel: VesselDefinition): BeretFit {
  const cached = fits.get(vessel)
  if (cached) return cached
  const support = vessel.parts.filter(part => vessel.lid
    ? part.id === 'lid'
    : part.id === 'rim' || part.id === 'lid-seat').flatMap(part => part.outline)
  if (!support.length) throw new Error(`${vessel.id} has no beret support`)
  const baseY = Math.max(...support.map(point => point[1]))
  const radius = Math.max(...support.filter(point => point[1] === baseY).map(point => point[0]))
  let height = radius * 0.48

  // Chaque polygone supérieur contient ce disque centré sur la tasse.
  // Sa hauteur minimale borne toute la coque au-dessus d'un couvercle,
  // même entre les sommets et sur le côté où le tissu retombe.
  const rings = CROWN.slice(4, -1).map(([r, h, shift, drape]) => ({
    radius: (r * Math.cos(Math.PI / SEGMENTS) - Math.abs(shift)) * radius,
    height: h,
    sag: r * radius * DROOP * drape
  })).reverse()
  function clearCover(minRadius: number, maxRadius: number, top: number) {
    for (let i = 0; i < rings.length; i++) {
      const ring = rings[i]!
      const inner = i === 0 ? 0 : rings[i - 1]!.radius
      if (maxRadius < inner || minRadius > ring.radius) continue
      height = Math.max(height, (top - baseY - radius * 0.07 + ring.sag + radius * 0.015) / ring.height)
    }
  }
  for (const part of vessel.parts.filter(part => part.id === 'lid' || part.id === 'lid-knob')) {
    for (let i = 1; i < part.outline.length; i++) {
      const a = part.outline[i - 1]!
      const b = part.outline[i]!
      clearCover(Math.min(a[0], b[0]), Math.max(a[0], b[0]), Math.max(a[1], b[1]))
    }
  }
  if (vessel.lid) {
    const geometries = createLidGeometry(vessel.lid)
    const geometry = geometries.top
    const points = geometry.attributes.position!
    const indices = geometry.index!
    for (let i = 0; i < indices.count; i += 3) {
      const corners = [0, 1, 2].map(j => indices.getX(i + j))
      const radii = corners.map(j => Math.hypot(points.getX(j), points.getZ(j)))
      const edge = Math.max(...corners.map((a, j) => {
        const b = corners[(j + 1) % 3]!
        return Math.hypot(points.getX(a) - points.getX(b), points.getZ(a) - points.getZ(b))
      }))
      // Une borne large englobe aussi les intérieurs des triangles du bec.
      clearCover(Math.max(0, Math.min(...radii) - edge), Math.max(...radii), Math.max(...corners.map(j => points.getY(j))))
    }
    Object.values(geometries).forEach(geometry => geometry.dispose())
  }
  const fit = { radius, baseY, height }
  fits.set(vessel, fit)
  return fit
}

export function createBeret(fit: BeretFit) {
  const { radius, height } = fit
  const materials = {
    crown: new MeshBasicMaterial({ color: BERET_COLORS.crown, side: DoubleSide, toneMapped: false, vertexColors: true }),
    band: new MeshBasicMaterial({ color: BERET_COLORS.band, side: DoubleSide, toneMapped: false })
  }
  const group = new Group()
  group.name = 'beret'
  group.position.y = fit.baseY
  const bandHeight = radius * 0.07
  const band: Point2[] = [
    [radius * 0.98, 0], [radius * 1.02, 0], [radius * 1.02, bandHeight],
    [radius * 0.98, bandHeight], [radius * 0.98, 0]
  ]
  const bandMesh = new Mesh(new LatheGeometry(band.map(point => new Vector2(...point)), SEGMENTS), materials.band)
  bandMesh.name = 'beret-band'
  const crownGeometry = new LatheGeometry(CROWN.map(([r, h]) => new Vector2(r, h)), SEGMENTS)
  const points = crownGeometry.attributes.position!
  for (let i = 0; i < points.count; i++) {
    const [, h, shift, drape] = CROWN[i % CROWN.length]!
    const x = points.getX(i) * radius
    points.setXYZ(i, x + shift * radius,
      bandHeight + h * height + x * DROOP * drape, points.getZ(i) * radius)
  }
  points.needsUpdate = true
  crownGeometry.computeVertexNormals()
  addEdgeTones(crownGeometry)
  const crown = new Mesh(crownGeometry, materials.crown)
  crown.name = 'beret-crown'
  const stem: Point2[] = [[0, 0], [0.045, 0], [0.055, 0.045], [0.053, 0.16], [0.04, 0.22], [0.02, 0.24], [0, 0.245]]
  const stemMesh = new Mesh(new LatheGeometry(stem.map(([r, y]) => new Vector2(r * radius, y * radius)), 12), materials.band)
  stemMesh.name = 'beret-stem'
  stemMesh.scale.setScalar(1.2)
  const [, tipHeight, tipShift] = CROWN.at(-1)!
  stemMesh.position.set(tipShift * radius, bandHeight + tipHeight * height - 0.01 * radius, 0)
  stemMesh.rotation.z = -0.24
  group.add(bandMesh, crown, stemMesh)
  return { group, materials: Object.values(materials) }
}
