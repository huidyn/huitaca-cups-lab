import { type Mesh, Vector3 } from 'three'
import type { VesselDefinition } from './types'

// Lancer de rayons sur la tasse, pour poser un accessoire. Le Raycaster de three
// teste chaque triangle à chaque rayon : avec des milliers de rayons, la pose
// d'un casque gelait l'onglet. Ici les triangles sont rangés une fois dans un
// arbre de boîtes, et un rayon n'en visite qu'une poignée.
const LEAF = 8

export function createCaster(surfaces: Mesh[]) {
  const coords: number[] = []
  const point = new Vector3()
  for (const mesh of surfaces) {
    const positions = mesh.geometry.attributes.position!
    const index = mesh.geometry.index
    const count = index?.count ?? positions.count
    for (let i = 0; i < count; i++) {
      point.fromBufferAttribute(positions, index ? index.getX(i) : i).applyMatrix4(mesh.matrixWorld)
      coords.push(point.x, point.y, point.z)
    }
  }
  const triangles = Float64Array.from(coords)
  const total = triangles.length / 9
  const centroids = new Float64Array(total * 3)
  for (let i = 0; i < total; i++) {
    for (let axis = 0; axis < 3; axis++) {
      centroids[i * 3 + axis] = (triangles[i * 9 + axis]! + triangles[i * 9 + 3 + axis]! + triangles[i * 9 + 6 + axis]!) / 3
    }
  }
  const order = Array.from({ length: total }, (_, i) => i)
  // Par nœud : six bornes, puis soit deux enfants, soit une plage de triangles.
  const boxes: number[] = []
  const links: number[] = []

  function build(start: number, end: number): number {
    const node = links.length / 2
    const box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]
    for (let i = start; i < end; i++) {
      const base = order[i]! * 9
      for (let k = 0; k < 9; k++) {
        const value = triangles[base + k]!
        const axis = k % 3
        if (value < box[axis]!) box[axis] = value
        if (value > box[axis + 3]!) box[axis + 3] = value
      }
    }
    boxes.push(...box)
    links.push(0, 0)
    if (end - start <= LEAF) {
      links[node * 2] = -start - 1
      links[node * 2 + 1] = end
      return node
    }
    const sizes = [box[3]! - box[0]!, box[4]! - box[1]!, box[5]! - box[2]!]
    const axis = sizes.indexOf(Math.max(...sizes))
    const sorted = order.slice(start, end).sort((a, b) => centroids[a * 3 + axis]! - centroids[b * 3 + axis]!)
    for (let i = 0; i < sorted.length; i++) order[start + i] = sorted[i]!
    const middle = (start + end) >> 1
    links[node * 2] = build(start, middle)
    links[node * 2 + 1] = build(middle, end)
    return node
  }
  if (total) build(0, total)

  const stack: number[] = []
  // Distance du premier triangle touché, des deux côtés, ou null.
  return function cast(origin: Vector3, direction: Vector3, far = Infinity): number | null {
    if (!total) return null
    const o = [origin.x, origin.y, origin.z]
    const d = [direction.x, direction.y, direction.z]
    let nearest = far
    let found = false
    stack.length = 0
    stack.push(0)
    while (stack.length) {
      const node = stack.pop()!
      let enter = 0
      let leave = nearest
      let miss = false
      for (let axis = 0; axis < 3 && !miss; axis++) {
        const low = boxes[node * 6 + axis]!
        const high = boxes[node * 6 + axis + 3]!
        if (d[axis] === 0) {
          miss = o[axis]! < low || o[axis]! > high
          continue
        }
        let a = (low - o[axis]!) / d[axis]!
        let b = (high - o[axis]!) / d[axis]!
        if (a > b) [a, b] = [b, a]
        if (a > enter) enter = a
        if (b < leave) leave = b
        miss = enter > leave
      }
      if (miss) continue
      const first = links[node * 2]!
      if (first >= 0) {
        stack.push(first, links[node * 2 + 1]!)
        continue
      }
      for (let i = -first - 1; i < links[node * 2 + 1]!; i++) {
        const t = order[i]! * 9
        // Möller-Trumbore, sans élimination des faces arrière.
        const e1x = triangles[t + 3]! - triangles[t]!
        const e1y = triangles[t + 4]! - triangles[t + 1]!
        const e1z = triangles[t + 5]! - triangles[t + 2]!
        const e2x = triangles[t + 6]! - triangles[t]!
        const e2y = triangles[t + 7]! - triangles[t + 1]!
        const e2z = triangles[t + 8]! - triangles[t + 2]!
        const px = d[1]! * e2z - d[2]! * e2y
        const py = d[2]! * e2x - d[0]! * e2z
        const pz = d[0]! * e2y - d[1]! * e2x
        const det = e1x * px + e1y * py + e1z * pz
        if (Math.abs(det) < 1e-14) continue
        const sx = o[0]! - triangles[t]!
        const sy = o[1]! - triangles[t + 1]!
        const sz = o[2]! - triangles[t + 2]!
        const u = (sx * px + sy * py + sz * pz) / det
        if (u < 0 || u > 1) continue
        const qx = sy * e1z - sz * e1y
        const qy = sz * e1x - sx * e1z
        const qz = sx * e1y - sy * e1x
        const v = (d[0]! * qx + d[1]! * qy + d[2]! * qz) / det
        if (v < 0 || u + v > 1) continue
        const distance = (e2x * qx + e2y * qy + e2z * qz) / det
        if (distance < 0 || distance > nearest) continue
        nearest = distance
        found = true
      }
    }
    return found ? nearest : null
  }
}

// La forme d'une tasse, sans ses couleurs : l'éditeur recrée la tasse à chaque
// couleur, et une pose rangée par objet était alors recalculée à chaque fois.
export function shapeKey(vessel: VesselDefinition) {
  return JSON.stringify([vessel.id, vessel.parts.map(part => [part.id, part.outline]), vessel.lid, vessel.handle])
}
