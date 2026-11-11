import { DoubleSide, Group, LatheGeometry, Mesh, MeshBasicMaterial, Vector2 } from 'three'
import type { Point2, Point3, VesselDefinition } from './types'
import { openingDistance } from './lid'

export type AccessoryId = 'paintbrush' | 'leaf' | 'beret' | 'tea-bag' | 'headphones' | 'scarf'

// Teintes relevées sur l'image de référence : manche moutarde, virole crème, pointe terre cuite.
export const BRUSH_COLORS = { handle: '#e2b245', ferrule: '#e3dbd1', bristles: '#b5533c' } as const

// Manche court et épais, touffe large pour rester lisible à petite taille.
export const BRUSH = {
  radius: 0.0715,
  endRadius: 0.0546,
  exposed: 0.38,
  ferrule: [[0.078, 0], [0.0871, 0.025], [0.0871, 0.14]] as Point2[],
  bristles: [[0.0871, 0], [0.1232, 0.089], [0.1288, 0.144], [0.1064, 0.244], [0.056, 0.344], [0, 0.4]] as Point2[]
}
const TAKEAWAY_BRUSH = {
  ...BRUSH,
  radius: 0.055,
  endRadius: 0.042,
  ferrule: [[0.06, 0], [0.067, 0.025], [0.067, 0.14]] as Point2[],
  bristles: BRUSH.bristles.map(([r, y], i): Point2 => [i === 0 ? 0.067 : r, y])
}
export const BRUSH_LENGTH = BRUSH.exposed + BRUSH.ferrule.at(-1)![1] + BRUSH.bristles.at(-1)![1]

export interface BrushFit {
  brush: typeof BRUSH
  // Point de l'axe à hauteur d'embouchure, là où commence la partie visible.
  mouth: Point3
  lean: number
  depth: number
  lid?: { pivot: Point2; angle: number; lift: number }
}

// Le couvercle du gaiwan bascule sur son bord gauche : le pinceau sort par l'entrebâillement.
export const GAIWAN_LID_PARTS = ['lid', 'lid-knob']
const fits = new WeakMap<VesselDefinition, BrushFit>()

export function brushAxis(lean: number) {
  const angle = lean * Math.PI / 180
  return [Math.sin(angle), Math.cos(angle), 0] as Point3
}

export function fitBrush(vessel: VesselDefinition): BrushFit {
  const cached = fits.get(vessel)
  if (cached) return cached
  const inside = vessel.parts.find(part => part.id === 'inside')?.outline
  if (!inside) throw new Error(`${vessel.id} has no inside surface`)
  const floor = Math.min(...inside.map(point => point[1]))
  const brush = vessel.id === 'takeaway' ? TAKEAWAY_BRUSH : BRUSH
  const surfaces: Point2[][] = []
  for (const part of vessel.parts) {
    if (part.id === 'rim' || part.id === 'lid-seat') surfaces.push(part.outline)
  }
  let mouthY = Math.max(...surfaces.flat().map(point => point[1]))
  if (vessel.lid) {
    const { opening, baseY, height, rise } = vessel.lid
    mouthY = baseY + height + rise
    // Le même trou géométrique que le couvercle, pas un second rayon choisi.
    let left = opening.center[0]
    let right = vessel.lid.radius
    for (let i = 0; i < 50; i++) {
      const x = (left + right) / 2
      if (openingDistance(vessel.lid, x, 0) < 0) left = x
      else right = x
    }
    surfaces.push([[right, baseY - opening.wallDepth], [right, mouthY]])
  }

  // Le bas du manche porte sur le fond, près du centre. On incline jusqu'au
  // contact avec la lèvre droite, en tenant compte du manche conique.
  // La distance signée à son côté est affine sur chaque segment du profil :
  // les extrémités suffisent, sans pas d'échantillonnage arbitraire.
  let bottomX = 0
  function pose(angle: number): BrushFit {
    const dx = Math.sin(angle)
    const dy = Math.cos(angle)
    const bottomY = floor + brush.endRadius * dx
    const depth = (mouthY - bottomY) / dy
    return { brush, mouth: [bottomX + depth * dx, mouthY, 0], lean: angle * 180 / Math.PI, depth }
  }
  function gap(fit: BrushFit, point: Point2) {
    const [dx, dy] = brushAxis(fit.lean)
    const x = point[0] - fit.mouth[0]
    const y = point[1] - fit.mouth[1]
    return x * dy - y * dx - handleRadius(fit, x * dx + y * dy)
  }
  const points = surfaces.flat()
  const supported = () => pose(contactAngle(value => Math.min(...points.map(point => gap(pose(value), point)))))
  let fit = supported()
  const walls = inside.filter(point => point[0] > 0)
  if (Math.min(...walls.map(point => gap(fit, point))) < -1e-10) {
    // Un col resserré (çay) peut intercepter le manche avant le bord. On décale
    // alors seulement son pied sur le fond plat, jusqu'à libérer la paroi.
    let low = 0
    let high = Math.max(...inside.filter(point => point[1] === floor).map(point => point[0])) - brush.endRadius
    for (let i = 0; i < 50; i++) {
      bottomX = -(low + high) / 2
      fit = supported()
      if (Math.min(...walls.map(point => gap(fit, point))) < 0) low = -bottomX
      else high = -bottomX
    }
    bottomX = -high
    fit = supported()
  }
  if (GAIWAN_LID_PARTS.every(id => vessel.parts.some(part => part.id === id)) && !vessel.lid) {
    const cover = vessel.parts.find(part => part.id === 'lid')!.outline
    const seat = vessel.parts.find(part => part.id === 'lid-seat')!.outline
    const pivot: Point2 = [-Math.max(...cover.map(point => point[0])), Math.min(...cover.map(point => point[1]))]
    const lift = Math.max(...seat.map(point => point[1])) - pivot[1]
    const lidPoints = vessel.parts.filter(part => GAIWAN_LID_PARTS.includes(part.id))
      .flatMap(part => part.outline.flatMap(([r, y]) => [[-r, y], [r, y]] as Point2[]))
    // Le bord gauche reste posé sur le siège ; le bord droit se soulève juste
    // assez pour reposer sur le manche, sans angle choisi à l'œil.
    const lidAngle = contactAngle(value => {
      const c = Math.cos(value)
      const s = Math.sin(value)
      return Math.min(...lidPoints.map(([x, y]) => {
        const px = pivot[0] + (x - pivot[0]) * c - (y - pivot[1]) * s
        const py = pivot[1] + lift + (x - pivot[0]) * s + (y - pivot[1]) * c
        const [dx, dy] = brushAxis(fit.lean)
        const along = (px - fit.mouth[0]) * dx + (py - fit.mouth[1]) * dy
        return -(px - fit.mouth[0]) * dy + (py - fit.mouth[1]) * dx - handleRadius(fit, along)
      }))
    }, true)
    fit.lid = { pivot, lift, angle: lidAngle * 180 / Math.PI }
  }
  fits.set(vessel, fit)
  return fit
}

export function handleRadius(fit: BrushFit, along: number) {
  const brush = fit.brush
  return brush.endRadius + (brush.radius - brush.endRadius) * (along + fit.depth) / (fit.depth + brush.exposed)
}

// Dichotomie de construction uniquement ; la pose mémorisée ne dépend ni de
// l'horloge, ni de la caméra, ni du pointeur.
function contactAngle(clearance: (angle: number) => number, opening = false) {
  let low = 0
  let high = Math.PI / 2 - 1e-6
  for (let i = 0; i < 50; i++) {
    const middle = (low + high) / 2
    if ((clearance(middle) >= 0) !== opening) low = middle
    else high = middle
  }
  return opening ? high : low
}

function lathe(profile: Point2[], material: MeshBasicMaterial, name: string, offset = 0) {
  const mesh = new Mesh(new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), 24), material)
  mesh.position.y = offset
  mesh.name = name
  return mesh
}

export function createPaintbrush(fit: BrushFit) {
  const brush = fit.brush
  const materials = Object.fromEntries(Object.entries(BRUSH_COLORS).map(([slot, color]) =>
    [slot, new MeshBasicMaterial({ color, side: DoubleSide, toneMapped: false })])) as Record<keyof typeof BRUSH_COLORS, MeshBasicMaterial>
  const group = new Group()
  group.name = 'paintbrush'
  const ferruleLength = brush.ferrule.at(-1)![1]
  group.add(
    lathe([[0, -fit.depth], [brush.endRadius, -fit.depth], [brush.radius, brush.exposed], [0, brush.exposed]], materials.handle, 'brush-handle'),
    lathe([[0, 0], ...brush.ferrule, [0, ferruleLength]], materials.ferrule, 'brush-ferrule', brush.exposed),
    lathe(brush.bristles, materials.bristles, 'brush-bristles', brush.exposed + ferruleLength)
  )
  group.position.set(...fit.mouth)
  group.rotation.z = -fit.lean * Math.PI / 180
  return { group, materials: Object.values(materials) }
}
