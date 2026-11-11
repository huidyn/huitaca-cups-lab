import {
  CurvePath, DoubleSide, ExtrudeGeometry, Group, LineCurve3,
  Mesh, MeshBasicMaterial, Shape, TubeGeometry, Vector3
} from 'three'
import type { Point2, Point3, VesselDefinition } from './types'

export const TEA_TAG_COLORS = { string: '#e3dbd1', paper: '#e2b245' } as const
export const TEA_TAG = { cordRadius: 0.016, width: 0.26, height: 0.3, depth: 0.025, pinchHeight: 0.006 }

export interface TeaTagFit {
  points: Point3[]
  tag: Point3
  outerRadius: number
  releaseRadius: number
  azimuth: number
  tilt: number
  lidLift: number
  lidParts: string[]
}
const fits = new WeakMap<VesselDefinition, TeaTagFit>()

export function fitTeaTag(vessel: VesselDefinition): TeaTagFit {
  const cached = fits.get(vessel)
  if (cached) return cached
  const cover = vessel.parts.find(part => part.id === 'lid')
  const support = vessel.parts.filter(part => ['rim', 'lid-seat', 'lid-edge'].includes(part.id))
    .flatMap(part => part.outline)
  if (!support.length) throw new Error(`${vessel.id} has no tea-string support`)
  const top = Math.max(...support.map(point => point[1]))
  const inner = Math.min(...support.filter(point => point[1] === top).map(point => point[0]))
  const supportRadius = Math.max(...support.map(point => point[0]))
  const outerRadius = Math.max(supportRadius, ...(cover?.outline.map(point => point[0]) ?? []))
  const lidParts = cover ? ['lid', vessel.lid ? 'lid-top' : 'lid-knob'] : []
  // Le fil s'aplatit seulement dans la pince : le couvercle ne monte que de
  // l'épaisseur comprimée, plus le recouvrement déjà présent entre les pièces.
  const lidLift = cover ? Math.max(0, top - Math.min(...cover.outline.map(point => point[1]))) + TEA_TAG.pinchHeight + 0.002 : 0
  const body = vessel.parts.find(part => part.id === vessel.face.surface)!
  const floor = Math.min(...body.outline.map(point => point[1]))
  const tagTop = top - Math.min(0.54, (top - floor) * 0.36)
  const walls = vessel.parts.filter(part => part.id !== 'inside' && !lidParts.includes(part.id))
  function wallPoints(bottom: number, upper: number) {
    const found: Point2[] = []
    for (const part of walls) {
      for (let i = 1; i < part.outline.length; i++) {
        const a = part.outline[i - 1]!
        const b = part.outline[i]!
        const low = Math.max(bottom, Math.min(a[1], b[1]))
        const high = Math.min(upper, Math.max(a[1], b[1]))
        if (low > high) continue
        for (const y of [low, high]) {
          const r = a[1] === b[1] ? Math.max(a[0], b[0]) : a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1])
          found.push([r, y])
        }
      }
    }
    return found
  }
  const azimuth = -Math.asin(0.9)
  const direction = new Vector3(Math.sin(azimuth), 0, Math.cos(azimuth))
  const at = (r: number, y: number): Point3 => [direction.x * r, y, direction.z * r]
  const crest = top + (cover ? (TEA_TAG.pinchHeight + 0.002) / 2 : TEA_TAG.cordRadius + 0.002)
  // Un couvercle plastique enveloppe le bord : le fil tombe depuis le siège
  // de la tasse, sous le surplomb, pas depuis le diamètre maximal du plastique.
  const releaseRadius = vessel.lid ? supportRadius + TEA_TAG.cordRadius + 0.002
    : outerRadius + (cover ? 0.035 : TEA_TAG.cordRadius + 0.002)
  const dropStart = top - 0.05
  const heights = [...new Set([dropStart, tagTop, ...wallPoints(tagTop, dropStart).map(point => point[1])])]
    .sort((a, b) => b - a)
  // Sous la gravité, le fil descend verticalement tant que la tasse ne le
  // repousse pas. Son enveloppe tendue franchit les creux, puis quitte une
  // panse bombée à la verticale au lieu de suivre la paroi vers l'intérieur.
  const rope: Point2[] = []
  let hangingRadius = releaseRadius
  for (const y of heights) {
    hangingRadius = Math.max(hangingRadius, ...wallPoints(y, y).map(point => point[0] + TEA_TAG.cordRadius + 0.002))
    const point: Point2 = [hangingRadius, y]
    while (rope.length >= 2) {
      const a = rope.at(-2)!
      const b = rope.at(-1)!
      if ((b[0] - a[0]) * (b[1] - y) > (point[0] - b[0]) * (a[1] - b[1]) + 1e-12) break
      rope.pop()
    }
    rope.push(point)
  }
  const tagRadius = rope.at(-1)![0]
  function paperGap(angle: number) {
    const backR = tagRadius - TEA_TAG.depth / 2 * Math.cos(angle)
    const backY = tagTop - TEA_TAG.depth / 2 * Math.sin(angle)
    return Math.min(...wallPoints(backY - TEA_TAG.height * Math.cos(angle), backY)
      .map(([r, y]) => backR + (backY - y) * Math.tan(angle) - r))
  }
  let tilt = 0
  if (paperGap(0) < 0.002) {
    let low = 0
    let high = Math.PI / 3
    for (let i = 0; i < 50; i++) {
      const middle = (low + high) / 2
      if (paperGap(middle) < 0.002) low = middle
      else high = middle
    }
    tilt = high
  }
  const tag = at(tagRadius + TEA_TAG.height / 2 * Math.sin(tilt), tagTop - TEA_TAG.height / 2 * Math.cos(tilt))
  const points: Point3[] = [
    at(inner - 0.1, cover ? crest : top - 0.14),
    at(inner - 0.04, crest),
    at(releaseRadius, crest),
    ...rope.map(([r, y]) => at(r, y)),
    at(tagRadius + 0.015 * Math.sin(tilt), tagTop - 0.015 * Math.cos(tilt))
  ]
  const fit = { points, tag, outerRadius, releaseRadius, azimuth, tilt, lidLift, lidParts }
  fits.set(vessel, fit)
  return fit
}

export function createTeaTag(fit: TeaTagFit) {
  const materials = Object.fromEntries(Object.entries(TEA_TAG_COLORS).map(([slot, color]) => [
    slot, new MeshBasicMaterial({ color, side: DoubleSide, toneMapped: false })
  ])) as Record<keyof typeof TEA_TAG_COLORS, MeshBasicMaterial>
  const group = new Group()
  group.name = 'tea-bag'
  const points = fit.points.map(point => new Vector3(...point))
  const path = new CurvePath<Vector3>()
  for (let i = 1; i < points.length; i++) path.add(new LineCurve3(points[i - 1]!, points[i]!))
  const geometry = new TubeGeometry(path, 96, TEA_TAG.cordRadius, 8, false)
  if (fit.lidLift) {
    const positions = geometry.attributes.position!
    for (let ring = 0; ring <= 96; ring++) {
      const center = path.getPointAt(ring / 96)
      const t = Math.max(0, Math.min(1, (Math.hypot(center.x, center.z) - fit.outerRadius - 0.02) / 0.06))
      const squash = TEA_TAG.pinchHeight / (2 * TEA_TAG.cordRadius) * (1 - t) + t
      for (let side = 0; side <= 8; side++) {
        const i = ring * 9 + side
        positions.setY(i, center.y + (positions.getY(i) - center.y) * squash)
      }
    }
    positions.needsUpdate = true
    geometry.computeVertexNormals()
  }
  const string = new Mesh(geometry, materials.string)
  string.name = 'tea-string'
  const w = TEA_TAG.width / 2
  const h = TEA_TAG.height / 2
  const shape = new Shape()
  shape.moveTo(-w, -h)
  shape.lineTo(w, -h)
  shape.lineTo(w, h - 0.025)
  shape.lineTo(w - 0.025, h)
  shape.lineTo(-w + 0.025, h)
  shape.lineTo(-w, h - 0.025)
  shape.closePath()
  const paperGeometry = new ExtrudeGeometry(shape, { depth: TEA_TAG.depth, bevelEnabled: false, steps: 1 })
  paperGeometry.translate(0, 0, -TEA_TAG.depth / 2)
  const paper = new Mesh(paperGeometry, materials.paper)
  paper.name = 'tea-tag'
  paper.position.set(...fit.tag)
  paper.rotation.set(-fit.tilt, fit.azimuth, 0, 'YXZ')
  paper.scale.set(1.3, 1.3, 1)
  // Le point d'attache reste fixe : seul le papier grandit, pas le fil.
  paper.position.add(new Vector3(0, (h - 0.015) * (1 - paper.scale.y), 0).applyQuaternion(paper.quaternion))
  group.add(string, paper)
  return { group, materials: Object.values(materials) }
}
