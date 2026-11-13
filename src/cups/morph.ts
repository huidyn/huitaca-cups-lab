import {
  BufferAttribute, BufferGeometry, CatmullRomCurve3, Color, DoubleSide, Group, Mesh, MeshBasicMaterial, TubeGeometry, Vector3
} from 'three'
import { createHandleGeometry, GAZE_TRAVEL, radiusAtY } from './geometry'
import { createLidGeometry } from './lid'
import { EYE_COLUMNS, EYE_POINTS, EYE_ROWS, eyeShape, type FacePose, facePose } from './expressions'
import type { Point2, VesselDefinition } from './types'

// Le passage d'une tasse à une autre : les parties de même nom glissent d'un contour à l'autre,
// celles qui n'existent que d'un côté poussent depuis l'axe ou s'y retirent.
// Cet objet ne vit que le temps de la transition, entre les deux vraies tasses.
export const MORPH = { points: 64, segments: 72, handlePoints: 20 }

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

// Rééchantillonne un contour à pas constant : deux contours ont alors le même nombre de points.
export function resample(outline: Point2[], count = MORPH.points): Point2[] {
  const lengths = [0]
  for (let i = 1; i < outline.length; i++) {
    lengths.push(lengths[i - 1]! + Math.hypot(outline[i]![0] - outline[i - 1]![0], outline[i]![1] - outline[i - 1]![1]))
  }
  const total = lengths.at(-1)!
  const points: Point2[] = []
  let segment = 1
  for (let i = 0; i < count; i++) {
    const at = total * i / (count - 1)
    while (segment < outline.length - 1 && lengths[segment]! < at) segment++
    const span = lengths[segment]! - lengths[segment - 1]!
    const t = span > 0 ? (at - lengths[segment - 1]!) / span : 0
    const a = outline[segment - 1]!
    const b = outline[segment]!
    points.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t)])
  }
  return points
}

// La paroi qui porte le visage : ses hauteurs utiles, et son rayon au bord.
function wallOf(vessel: VesselDefinition) {
  const outline = vessel.parts.find(part => part.id === vessel.face.surface)!.outline
  let bottom = Infinity
  let top = -Infinity
  for (let i = 1; i < outline.length; i++) {
    if (outline[i]![1] <= outline[i - 1]![1]) continue
    bottom = Math.min(bottom, outline[i - 1]![1])
    top = Math.max(top, outline[i]![1])
  }
  const inside = vessel.parts.find(part => part.id === 'inside')
  return { outline, bottom, top, rim: radiusAtY(outline, top), body: vessel.colors[vessel.parts.find(part => part.id === vessel.face.surface)!.color]!, inside: vessel.colors[inside?.color ?? '']  }
}

// Une partie absente d'un côté ne sort pas de l'axe : elle est rentrée dans la paroi de
// l'autre tasse, à sa hauteur, et en émerge. Un couvercle part donc du bord, un pied du fond.
function tucked(outline: Point2[], host: VesselDefinition): Point2[] {
  const wall = wallOf(host)
  return outline.map(([r, y]) => {
    const v = Math.max(wall.bottom + 0.01, Math.min(wall.top - 0.01, y))
    return [Math.min(r, radiusAtY(wall.outline, v)) * 0.97, v]
  })
}

// Et elle part de la couleur qui la cache : l'intérieur si elle est au-dessus du bord, le corps sinon.
function hidden(outline: Point2[], host: VesselDefinition) {
  const wall = wallOf(host)
  const height = outline.reduce((sum, point) => sum + point[1], 0) / outline.length
  return height > wall.top ? wall.inside ?? wall.body : wall.body
}

function grid(points: number, segments: number) {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array((segments + 1) * points * 3), 3))
  const indices: number[] = []
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < points - 1; j++) {
      const a = i * points + j
      const b = a + points
      indices.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }
  geometry.setIndex(indices)
  return geometry
}

export function createMorph(from: VesselDefinition, to: VesselDefinition, lift: number) {
  const root = new Group()
  const inner = new Group()
  inner.position.y = -lift
  root.add(inner)
  const materials: MeshBasicMaterial[] = []
  const flat = () => {
    const material = new MeshBasicMaterial({ side: DoubleSide, toneMapped: false })
    materials.push(material)
    return material
  }
  const shade = (a: string | undefined, b: string | undefined) => {
    const start = new Color(a ?? b)
    return { material: flat(), start, end: new Color(b ?? a) }
  }

  const ids = [...new Set([...from.parts, ...to.parts].map(part => part.id))]
  const sines = Array.from({ length: MORPH.segments + 1 }, (_, i) => Math.sin(i / MORPH.segments * Math.PI * 2))
  const cosines = Array.from({ length: MORPH.segments + 1 }, (_, i) => Math.cos(i / MORPH.segments * Math.PI * 2))
  const parts = ids.map(id => {
    const a = from.parts.find(part => part.id === id)
    const b = to.parts.find(part => part.id === id)
    const start = a ? resample(a.outline) : tucked(resample(b!.outline), from)
    const end = b ? resample(b.outline) : tucked(resample(a!.outline), to)
    const colour = shade(a ? from.colors[a.color] : hidden(b!.outline, from), b ? to.colors[b.color] : hidden(a!.outline, to))
    const geometry = grid(MORPH.points, MORPH.segments)
    const mesh = new Mesh(geometry, colour.material)
    mesh.name = id
    mesh.frustumCulled = false
    inner.add(mesh)
    return { id, start, end, now: start.map(point => [...point] as Point2), geometry, colour }
  })
  const wall = parts.find(part => part.id === to.face.surface) ?? parts[0]!

  // L'anse glisse d'une forme à l'autre si les deux tasses en ont une ; sinon elle pousse ou se retire.
  const sample = (handle: NonNullable<VesselDefinition['handle']>) =>
    new CatmullRomCurve3(handle.points.map(point => new Vector3(...point))).getPoints(MORPH.handlePoints - 1)
  const both = from.handle && to.handle
    ? { start: sample(from.handle), end: sample(to.handle), radius: [from.handle.radius, to.handle.radius] as const, mesh: new Mesh(new BufferGeometry(), undefined as unknown as MeshBasicMaterial), colour: shade(from.colors[from.handle.color], to.colors[to.handle.color]) }
    : undefined
  if (both) {
    both.mesh.material = both.colour.material
    both.mesh.frustumCulled = false
    inner.add(both.mesh)
  }
  // L'anse qui n'existe que d'un côté pousse depuis ses deux attaches sur la paroi.
  const lone: { object: Group | Mesh; anchor: Vector3; grows: boolean }[] = []
  const single = both ? undefined : from.handle ?? to.handle
  if (single) {
    const owner = from.handle ? from : to
    const mesh = new Mesh(createHandleGeometry(single), flat())
    ;(mesh.material as MeshBasicMaterial).color.set(owner.colors[single.color]!)
    const first = single.points[0]!
    const last = single.points.at(-1)!
    inner.add(mesh)
    lone.push({ object: mesh, anchor: new Vector3((first[0] + last[0]) / 2, (first[1] + last[1]) / 2, (first[2] + last[2]) / 2), grows: !from.handle })
  }
  // Le couvercle à bec monte du bord de l'autre tasse : un disque plat, de la couleur de l'intérieur.
  const lids: { group: Group; baseY: number; grows: boolean; narrow: number; rest: number; colours: ReturnType<typeof shade>[] }[] = []
  for (const owner of [from, to]) {
    const lid = owner.lid
    if (!lid || (from.lid && to.lid)) continue
    const host = wallOf(owner === from ? to : from)
    const group = new Group()
    const colours = Object.entries(createLidGeometry(lid)).map(([name, geometry]) => {
      const colour = shade(host.inside ?? host.body, owner.colors[name === 'throat' ? lid.insideColor : lid.color])
      group.add(new Mesh(geometry, colour.material))
      return colour
    })
    inner.add(group)
    lids.push({ group, baseY: lid.baseY, grows: owner === to, narrow: Math.min(1, host.rim / lid.radius) * 0.97, rest: host.top - 0.02, colours })
  }

  const eyeColour = shade(from.colors[from.face.color], to.colors[to.face.color])
  const indices: number[] = []
  for (let row = 0; row < EYE_ROWS; row++) {
    for (let col = 0; col < EYE_COLUMNS; col++) {
      const a = row * (EYE_COLUMNS + 1) + col
      const b = a + EYE_COLUMNS + 1
      indices.push(a, a + 1, b, a + 1, b + 1, b)
    }
  }
  const eyes = [-1, 1].map(side => {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(EYE_POINTS * 3), 3))
    geometry.setIndex(indices)
    const mesh = new Mesh(geometry, eyeColour.material)
    mesh.frustumCulled = false
    inner.add(mesh)
    return { geometry, shape: new Float32Array(EYE_POINTS * 2), side }
  })

  const offset = (vessel: VesselDefinition) => vessel.handle ? -0.18 : 0
  let amount = 0
  let face = facePose()

  function drawEyes() {
    const a = from.face
    const b = to.face
    const width = lerp(a.eyeWidth, b.eyeWidth, amount)
    const height = lerp(a.eyeHeight, b.eyeHeight, amount)
    const separation = lerp(a.separation, b.separation, amount)
    const centerY = lerp(a.centerY, b.centerY, amount)
    const zoneWidth = lerp(a.width, b.width, amount)
    const zoneHeight = lerp(a.height, b.height, amount)
    const outline = wall.now
    let bottom = Infinity
    let top = -Infinity
    for (let i = 1; i < outline.length; i++) {
      if (outline[i]![1] <= outline[i - 1]![1]) continue
      bottom = Math.min(bottom, outline[i - 1]![1])
      top = Math.max(top, outline[i]![1])
    }
    const gazeX = Math.max(-1, Math.min(1, face.gaze[0]))
    const gazeY = Math.max(-1, Math.min(1, face.gaze[1]))
    const dx = gazeX * Math.min(GAZE_TRAVEL.x, Math.max(0, (zoneWidth - separation - width) / 2))
    const dy = gazeY * Math.min(gazeY > 0 ? GAZE_TRAVEL.up : GAZE_TRAVEL.down, Math.max(0, (zoneHeight - height) / 2))
    eyes.forEach((eye, index) => {
      eyeShape(face.eyes[index]!, eye.side, width, height, eye.shape)
      const position = eye.geometry.attributes.position!
      for (let i = 0; i < position.count; i++) {
        const u = eye.shape[i * 2]! + eye.side * separation * face.gap / 2 + dx
        const v = Math.max(bottom, Math.min(top, eye.shape[i * 2 + 1]! + centerY + dy))
        const r = radiusAtY(outline, v)
        const angle = u / r
        position.setXYZ(i, Math.sin(angle) * (r + 0.006), v, Math.cos(angle) * (r + 0.006))
      }
      position.needsUpdate = true
    })
  }

  // `t` de 0 (la tasse de départ) à 1 (la tasse d'arrivée).
  function update(t: number) {
    amount = Math.max(0, Math.min(1, t))
    root.position.x = lerp(offset(from), offset(to), amount)
    for (const part of parts) {
      const position = part.geometry.attributes.position!
      const array = position.array as Float32Array
      for (let j = 0; j < MORPH.points; j++) {
        part.now[j]![0] = lerp(part.start[j]![0], part.end[j]![0], amount)
        part.now[j]![1] = lerp(part.start[j]![1], part.end[j]![1], amount)
      }
      let k = 0
      for (let i = 0; i <= MORPH.segments; i++) {
        for (let j = 0; j < MORPH.points; j++) {
          const r = part.now[j]![0]
          array[k++] = r * sines[i]!
          array[k++] = part.now[j]![1]
          array[k++] = r * cosines[i]!
        }
      }
      position.needsUpdate = true
      part.colour.material.color.lerpColors(part.colour.start, part.colour.end, amount)
    }
    if (both) {
      const points = both.start.map((point, i) => point.clone().lerp(both.end[i]!, amount))
      both.mesh.geometry.dispose()
      both.mesh.geometry = new TubeGeometry(new CatmullRomCurve3(points), 48, lerp(both.radius[0], both.radius[1], amount), 12, false)
      both.colour.material.color.lerpColors(both.colour.start, both.colour.end, amount)
    }
    for (const item of lone) {
      const scale = Math.max(0.001, item.grows ? amount : 1 - amount)
      item.object.scale.setScalar(scale)
      item.object.position.copy(item.anchor).multiplyScalar(1 - scale)
    }
    for (const lid of lids) {
      const shown = lid.grows ? amount : 1 - amount
      const wide = lerp(lid.narrow, 1, shown)
      const tall = lerp(0.02, 1, shown)
      lid.group.scale.set(wide, tall, wide)
      lid.group.position.y = lerp(lid.rest, lid.baseY, shown) - tall * lid.baseY
      for (const colour of lid.colours) colour.material.color.lerpColors(colour.start, colour.end, shown)
    }
    eyeColour.material.color.lerpColors(eyeColour.start, eyeColour.end, amount)
    drawEyes()
  }

  update(0)
  return {
    root,
    update,
    pose(next: FacePose) {
      face = next
      drawEyes()
    },
    dispose() {
      root.traverse(object => {
        if (object instanceof Mesh) object.geometry.dispose()
      })
      materials.forEach(material => material.dispose())
    }
  }
}
