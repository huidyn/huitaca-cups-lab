import {
  BufferGeometry, CatmullRomCurve3, DoubleSide, Float32BufferAttribute,
  Group, LatheGeometry, Mesh, MeshBasicMaterial, TubeGeometry, Vector2, Vector3
} from 'three'
import type { Point2, VesselDefinition } from './types'
import { createLidGeometry } from './lid'

export function radiusAtY(outline: Point2[], y: number): number {
  for (let i = 1; i < outline.length; i++) {
    const a = outline[i - 1]!
    const b = outline[i]!
    if (b[1] > a[1] && y >= a[1] && y <= b[1]) {
      return a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1])
    }
  }
  throw new Error(`Face outside the vessel outline at y=${y}`)
}

export function createHandleGeometry(handle: NonNullable<VesselDefinition['handle']>) {
  const curve = new CatmullRomCurve3(handle.points.map(p => new Vector3(...p)))
  const geometry = new TubeGeometry(curve, 64, handle.radius, 12, false)
  if (!handle.flare) return geometry

  const { length, scale } = handle.flare
  if (!Number.isFinite(length) || length <= 0 || !Number.isFinite(scale) || scale < 1) {
    geometry.dispose()
    throw new Error('Invalid handle flare')
  }
  const totalLength = curve.getLength()
  const position = geometry.attributes.position!
  const { tubularSegments, radialSegments } = geometry.parameters
  // On elargit les anneaux existants a la construction, jamais dans la boucle
  // de rendu. La pente s'annule aux deux extremites du raccord.
  for (let ring = 0; ring <= tubularSegments; ring++) {
    const t = ring / tubularSegments
    const center = curve.getPointAt(t)
    const distance = Math.min(t, 1 - t) * totalLength
    const weight = Math.max(0, 1 - distance / length)
    const factor = 1 + (scale - 1) * weight * weight * (3 - 2 * weight)
    for (let i = 0; i <= radialSegments; i++) {
      const vertex = ring * (radialSegments + 1) + i
      position.setXYZ(vertex,
        center.x + (position.getX(vertex) - center.x) * factor,
        center.y + (position.getY(vertex) - center.y) * factor,
        center.z + (position.getZ(vertex) - center.z) * factor
      )
    }
  }
  position.needsUpdate = true
  geometry.computeVertexNormals()
  return geometry
}

export function createCup(definition: VesselDefinition) {
  const root = new Group()
  const materials = new Map<string, MeshBasicMaterial>()
  const material = (slot: string) => {
    let found = materials.get(slot)
    if (!found) {
      found = new MeshBasicMaterial({
        color: definition.colors[slot], side: DoubleSide, toneMapped: false
      })
      materials.set(slot, found)
    }
    return found
  }

  for (const part of definition.parts) {
    const geometry = new LatheGeometry(part.outline.map(([r, y]) => new Vector2(r, y)), 96)
    const mesh = new Mesh(geometry, material(part.color))
    mesh.name = part.id
    root.add(mesh)
  }

  if (definition.lid) {
    const lid = definition.lid
    const geometries = createLidGeometry(lid)
    const group = new Group()
    group.name = 'lid-top'
    for (const [name, geometry] of Object.entries(geometries)) {
      const mesh = new Mesh(geometry, material(name === 'throat' ? lid.insideColor : lid.color))
      mesh.name = `lid-${name}`
      group.add(mesh)
    }
    root.add(group)
  }

  if (definition.handle) {
    const handle = definition.handle
    const mesh = new Mesh(createHandleGeometry(handle), material(handle.color))
    mesh.name = 'handle'
    root.add(mesh)
  }

  const face = definition.face
  const outline = definition.parts.find(p => p.id === face.surface)!.outline
  const w = face.eyeWidth / 2
  const h = face.eyeHeight / 2 - w
  // Une grille suit aussi la courbure ENTRE les bords. Un simple polygone
  // triangule traversait la paroi convexe de la tasse a the.
  const columns = 8
  const rows = 32
  const vertices: number[] = []
  const indices: number[] = []
  for (let row = 0; row <= rows; row++) {
    const y = (row / rows - 0.5) * face.eyeHeight
    const capY = Math.max(0, Math.abs(y) - h)
    const halfWidth = Math.sqrt(Math.max(0, w * w - capY * capY))
    for (let col = 0; col <= columns; col++) {
      vertices.push((col / columns * 2 - 1) * halfWidth, y, 0)
      if (row < rows && col < columns) {
        const a = row * (columns + 1) + col
        const b = a + columns + 1
        indices.push(a, a + 1, b, a + 1, b + 1, b)
      }
    }
  }

  const eyes = [-1, 1].map(side => {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3))
    geometry.setIndex(indices)
    const source = Float32Array.from(vertices)
    const mesh = new Mesh(geometry, material(face.color))
    mesh.name = side < 0 ? 'left-eye' : 'right-eye'
    root.add(mesh)
    return { geometry, source, side }
  })

  function look(x: number, y: number) {
    // Le regard reste dans la zone JSON, y compris le bord des capsules.
    const travelX = Math.max(0, (face.width - face.separation - face.eyeWidth) / 2)
    const travelY = Math.max(0, (face.height - face.eyeHeight) / 2)
    const dx = Math.max(-1, Math.min(1, x)) * Math.min(0.11, travelX)
    const dy = Math.max(-1, Math.min(1, y)) * Math.min(0.07, travelY)
    for (const eye of eyes) {
      const position = eye.geometry.attributes.position!
      for (let i = 0; i < position.count; i++) {
        const u = eye.source[i * 3]! + eye.side * face.separation / 2 + dx
        const v = eye.source[i * 3 + 1]! + face.centerY + dy
        const r = radiusAtY(outline, v)
        const angle = u / r
        // Chaque sommet suit la paroi : pas de panneau blanc face a la camera.
        position.setXYZ(i, Math.sin(angle) * (r + 0.006), v, Math.cos(angle) * (r + 0.006))
      }
      position.needsUpdate = true
      eye.geometry.computeBoundingSphere()
    }
  }

  look(0, 0)
  return {
    root,
    look,
    dispose() {
      root.traverse(object => {
        if (object instanceof Mesh) object.geometry.dispose()
      })
      materials.forEach(m => m.dispose())
    }
  }
}
