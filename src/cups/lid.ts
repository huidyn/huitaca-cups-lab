import { BufferGeometry, Float32BufferAttribute, Path, Shape, ShapeGeometry, Vector2 } from 'three'
import type { LidDefinition } from './types'

// Distance signee au bord du trou (capsule tournee de opening.angle degres).
export function openingDistance(lid: LidDefinition, x: number, z: number) {
  const { opening } = lid
  const angle = opening.angle * Math.PI / 180
  const dx = x - opening.center[0]
  const dz = z - opening.center[1]
  const u = dx * Math.cos(angle) + dz * Math.sin(angle)
  const v = -dx * Math.sin(angle) + dz * Math.cos(angle)
  const straight = (opening.width - opening.depth) / 2
  return Math.hypot(Math.max(Math.abs(u) - straight, 0), v) - opening.depth / 2
}

// Seule une levre autour du trou monte ; le reste du couvercle reste plat.
export function lidHeight(lid: LidDefinition, x: number, z: number) {
  const d = openingDistance(lid, x, z)
  const t = Math.max(0, Math.min(1, (d - lid.raise.margin) / lid.raise.falloff))
  return lid.baseY + lid.height + lid.rise * (1 - t * t * (3 - 2 * t))
}

function topSurface(shape: Shape, lid: LidDefinition) {
  const flat = new ShapeGeometry(shape)
  const points = Array.from(flat.attributes.position!.array)
  let indices = Array.from(flat.index!.array)
  flat.dispose()

  // On affine avant de soulever le bec pour que les grandes faces ne coupent
  // pas sa courbe. Les bords du trou restent de vrais bords, sans couvercle.
  for (let level = 0; level < 2; level++) {
    const midpoints = new Map<string, number>()
    const midpoint = (a: number, b: number) => {
      const key = a < b ? `${a}:${b}` : `${b}:${a}`
      const found = midpoints.get(key)
      if (found !== undefined) return found
      const index = points.length / 3
      points.push((points[a * 3]! + points[b * 3]!) / 2,
        (points[a * 3 + 1]! + points[b * 3 + 1]!) / 2, 0)
      midpoints.set(key, index)
      return index
    }
    const refined: number[] = []
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i]!
      const b = indices[i + 1]!
      const c = indices[i + 2]!
      const ab = midpoint(a, b)
      const bc = midpoint(b, c)
      const ca = midpoint(c, a)
      refined.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca)
    }
    indices = refined
  }
  for (let i = 0; i < points.length; i += 3) {
    const z = points[i + 1]!
    points[i + 1] = lidHeight(lid, points[i]!, z)
    points[i + 2] = z
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(points, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function wall(loop: Vector2[], lid: LidDefinition, bottom: number) {
  const positions: number[] = []
  for (let edge = 0; edge < loop.length; edge++) {
    const a = loop[edge]!
    const b = loop[(edge + 1) % loop.length]!
    // Meme subdivision que le dessus : les raccords restent jointifs.
    for (let step = 0; step < 4; step++) {
      const p = a.clone().lerp(b, step / 4)
      const q = a.clone().lerp(b, (step + 1) / 4)
      const py = lidHeight(lid, p.x, p.y)
      const qy = lidHeight(lid, q.x, q.y)
      positions.push(
        p.x, py, p.y, p.x, bottom, p.y, q.x, qy, q.y,
        q.x, qy, q.y, p.x, bottom, p.y, q.x, bottom, q.y
      )
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  return geometry
}

export function createLidGeometry(lid: LidDefinition) {
  const { opening } = lid
  if (opening.width < opening.depth || opening.depth <= 0 ||
      opening.wallDepth <= 0 || lid.radius <= 0 || lid.height <= 0 ||
      lid.rise < 0 || lid.raise.margin < 0 || lid.raise.falloff <= 0) {
    throw new Error('Invalid raised lid dimensions')
  }
  const outline = Array.from({ length: 96 }, (_, i) => {
    const angle = i / 96 * Math.PI * 2
    return new Vector2(Math.cos(angle) * lid.radius, Math.sin(angle) * lid.radius)
  })
  const hole: Vector2[] = []
  const radius = opening.depth / 2
  const straight = (opening.width - opening.depth) / 2
  const turn = opening.angle * Math.PI / 180
  for (let side = 0; side < 2; side++) {
    for (let i = 0; i <= 16; i++) {
      const angle = -Math.PI / 2 + side * Math.PI + i / 16 * Math.PI
      const u = (side === 0 ? straight : -straight) + Math.cos(angle) * radius
      const v = Math.sin(angle) * radius
      hole.push(new Vector2(
        opening.center[0] + u * Math.cos(turn) - v * Math.sin(turn),
        opening.center[1] + u * Math.sin(turn) + v * Math.cos(turn)
      ))
    }
  }
  if (hole.some(point => point.length() >= lid.radius)) {
    throw new Error('Lid opening must fit inside its outer edge')
  }
  const shape = new Shape(outline)
  shape.holes.push(new Path(hole))
  return {
    top: topSurface(shape, lid),
    skirt: wall(outline, lid, lid.baseY),
    throat: wall(hole, lid, lid.baseY - opening.wallDepth)
  }
}
