import { CatmullRomCurve3, DoubleSide, ExtrudeGeometry, Group, Mesh, MeshBasicMaterial, Shape, SphereGeometry, TubeGeometry, Vector3 } from 'three'
import { brushAxis, fitBrush, GAIWAN_LID_PARTS, handleRadius } from './accessories'
import { openingDistance } from './lid'
import type { Point2, VesselDefinition } from './types'

// Deux verts francs plutôt qu'un dégradé : une moitié claire, une moitié
// ombrée, lisibles même quand la tasse ne fait que 48 px.
export const SPROUT_COLORS = { light: '#74a24f', shade: '#5b8a3f', stem: '#5b8a3f' } as const

export const SPROUT = {
  stemRadius: 0.05,
  // Hauteur de tige visible au-dessus de l'embouchure, jusqu'aux feuilles.
  above: 0.3,
  // Rayon du coude du gaiwan, où la tige aplatie se redresse vers le haut.
  bend: 0.2,
  // Gaiwan : arc de la tige dans la tasse (vers la gauche, donc plus droite en
  // bas), surcroît d'inclinaison en degrés sous le couvercle qui la presse, et
  // longueur de ce passage aplati avant le coude.
  bow: 0.07,
  press: 14,
  flat: 0.16,
  // [longueur, largeur, élévation en degrés, lacet en degrés, courbure]
  leaves: [
    [0.66, 0.35, 34, -16, 0.16],
    [0.58, 0.31, 30, 196, 0.14]
  ] as [number, number, number, number, number][],
  thickness: 0.04
}

export interface SproutFit {
  // Ligne médiane de la tige dans le plan x-y (z = 0), du pied au sommet ;
  // les feuilles partent du dernier point.
  path: Point2[]
  lid?: { pivot: Point2; angle: number; lift: number }
}
// D'où la pousse sort de la tasse : c'est de là qu'elle grandit.
export function sproutRoot(fit: SproutFit): Point2 {
  const top = fit.path.at(-1)!
  return [top[0], top[1] - SPROUT.above]
}
const fits = new WeakMap<VesselDefinition, SproutFit>()

export function fitSprout(vessel: VesselDefinition): SproutFit {
  const cached = fits.get(vessel)
  if (cached) return cached
  const inside = vessel.parts.find(part => part.id === 'inside')?.outline
  if (!inside) throw new Error(`${vessel.id} has no inside surface`)
  const floor = Math.min(...inside.map(point => point[1]))
  const mouth = Math.max(...vessel.parts.filter(part => part.id === 'rim' || part.id === 'lid-seat')
    .flatMap(part => part.outline).map(point => point[1]))
  let fit: SproutFit

  if (vessel.lid) {
    // Gobelet : la tige monte du fond par le trou à boire, au centre de sa fente.
    const lid = vessel.lid
    const x = lid.opening.center[0]
    if (openingDistance(lid, x, 0) > -SPROUT.stemRadius) throw new Error(`${vessel.id}: sip hole too narrow for the sprout`)
    fit = { path: [[x, floor], [x, lid.baseY + lid.height + lid.rise + SPROUT.above]] }
  } else if (GAIWAN_LID_PARTS.every(id => vessel.parts.some(part => part.id === id))) {
    // Gaiwan : la pousse suit à peu près le chemin du pinceau, mais en plante :
    // un peu arquée dans la tasse, cassée sur le coin du bord où elle s'appuie,
    // aplatie là où le bord du couvercle la presse, puis redressée vers la lumière.
    // Le couvercle pivote sur son bord gauche et repose sur la tige.
    const brush = fitBrush(vessel)
    const [bx, by] = brushAxis(brush.lean)
    const base: Point2 = [brush.mouth[0] - bx * brush.depth, brush.mouth[1] - by * brush.depth]
    // Le manche du pinceau est plus épais : on descend la tige de la différence
    // pour qu'elle repose vraiment sur le coin du bord.
    const sink = handleRadius(brush, 0) - SPROUT.stemRadius
    const gap: Point2 = [brush.mouth[0] + by * sink, brush.mouth[1] - bx * sink]
    const middle: Point2 = [base[0] + bx * brush.depth * 0.55 - by * SPROUT.bow, base[1] + by * brush.depth * 0.55 + bx * SPROUT.bow]
    const pressed = brushAxis(brush.lean + SPROUT.press)
    const flat: Point2 = [gap[0] + pressed[0] * SPROUT.flat, gap[1] + pressed[1] * SPROUT.flat]
    const cover = vessel.parts.find(part => part.id === 'lid')!.outline
    const seat = vessel.parts.find(part => part.id === 'lid-seat')!.outline
    const pivot: Point2 = [-Math.max(...cover.map(point => point[0])), Math.min(...cover.map(point => point[1]))]
    const lift = Math.max(...seat.map(point => point[1])) - pivot[1]
    const lidPoints = vessel.parts.filter(part => GAIWAN_LID_PARTS.includes(part.id))
      .flatMap(part => part.outline.flatMap(([r, y]) => [[-r, y], [r, y]] as Point2[]))
    const rotated = (angle: number) => lidPoints.map(([px, py]) => [
      pivot[0] + (px - pivot[0]) * Math.cos(angle) - (py - pivot[1]) * Math.sin(angle),
      pivot[1] + lift + (px - pivot[0]) * Math.sin(angle) + (py - pivot[1]) * Math.cos(angle)
    ] as Point2)
    // Après le bord : un coude qui ramène la tige à la verticale, puis la tige
    // droite jusqu'aux feuilles. La courbe passe exactement par chaque appui.
    const build = (topY: number) => {
      const [ux, uy] = pressed
      const center: Point2 = [flat[0] - SPROUT.bend * uy, flat[1] + SPROUT.bend * ux]
      const from = Math.atan2(-ux, uy)
      const arc = Array.from({ length: 6 }, (_, i): Point2 => {
        const phi = from * (1 - (i + 1) / 6)
        return [center[0] + SPROUT.bend * Math.cos(phi), center[1] + SPROUT.bend * Math.sin(phi)]
      })
      const end = arc.at(-1)!
      const control = [base, middle, gap, flat, ...arc, [end[0], Math.max(end[1] + 0.05, topY)] as Point2]
      const curve = new CatmullRomCurve3(control.map(([x, y]) => new Vector3(x, y, 0)), false, 'centripetal')
      return curve.getSpacedPoints(96).map((point): Point2 => [point.x, point.y])
    }
    // Le plus petit angle qui libère la tige : le couvercle repose dessus.
    const smallest = (path: Point2[]) => {
      let a = 0
      let b = Math.PI / 4
      for (let i = 0; i < 50; i++) {
        const angle = (a + b) / 2
        if (rotated(angle).every(point => distanceToPath(path, point) >= SPROUT.stemRadius)) b = angle
        else a = angle
      }
      return b
    }
    // Même hauteur visible que sur les tasses ouvertes, comptée depuis le bord
    // soulevé du couvercle ; deux passes suffisent, le sommet ne touche pas le couvercle.
    let path = build(flat[1] + SPROUT.above)
    let angle = smallest(path)
    for (let pass = 0; pass < 2; pass++) {
      const edge = rotated(angle).reduce((best, point) => point[0] > best[0] ? point : best)
      path = build(edge[1] + SPROUT.above)
      angle = smallest(path)
    }
    fit = { path, lid: { pivot, lift, angle: angle * 180 / Math.PI } }
  } else {
    // Tasse ouverte : la tige part du fond, au centre ; elle sort de ce qu'il y
    // a dedans (thé, café, terre), comme enracinée.
    fit = { path: [[0, floor], [0, mouth + SPROUT.above]] }
  }
  fits.set(vessel, fit)
  return fit
}

export function distanceToPath(path: Point2[], [x, y]: Point2) {
  let best = Infinity
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, ay] = path[i]!
    const [bx, by] = path[i + 1]!
    const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2 || 1)))
    best = Math.min(best, Math.hypot(x - ax - t * (bx - ax), y - ay - t * (by - ay)))
  }
  return best
}

// Feuille pointue le long de +x, nervure centrale relevée en arc. Deux moitiés
// extrudées : la claire au-dessus de la nervure, l'ombrée dessous.
function leafHalves(length: number, width: number, curl: number) {
  const steps = 24
  const mid = (s: number) => curl * length * s * s
  const half = (s: number) => width / 2 * Math.pow(Math.sin(Math.PI * Math.pow(s, 0.8)), 0.85)
  const build = (side: number) => {
    const shape = new Shape()
    shape.moveTo(0, 0)
    for (let i = 1; i <= steps; i++) {
      const s = i / steps
      shape.lineTo(s * length, mid(s) + side * half(s))
    }
    for (let i = steps - 1; i >= 1; i--) {
      const s = i / steps
      shape.lineTo(s * length, mid(s))
    }
    shape.lineTo(0, 0)
    const geometry = new ExtrudeGeometry(shape, { depth: SPROUT.thickness, bevelEnabled: false, curveSegments: 1 })
    geometry.translate(0, 0, -SPROUT.thickness / 2)
    return geometry
  }
  return { upper: build(1), lower: build(-1) }
}

export function createSprout(fit: SproutFit) {
  const materials = Object.fromEntries(Object.entries(SPROUT_COLORS).map(([slot, color]) =>
    [slot, new MeshBasicMaterial({ color, side: DoubleSide, toneMapped: false })])) as Record<keyof typeof SPROUT_COLORS, MeshBasicMaterial>
  const group = new Group()
  group.name = 'sprout'
  const r = SPROUT.stemRadius
  const points = fit.path.map(([x, y]) => new Vector3(x, y, 0))
  const stem = new Mesh(new TubeGeometry(new CatmullRomCurve3(points, false, 'centripetal'), 48, r, 12, false), materials.stem)
  stem.name = 'sprout-stem'
  const top = fit.path.at(-1)!
  // Bout arrondi au sommet, sous les feuilles ; le pied reste caché dans la tasse.
  const tip = new Mesh(new SphereGeometry(r, 12, 8), materials.stem)
  tip.name = 'sprout-tip'
  tip.position.set(top[0], top[1], 0)
  group.add(stem, tip)
  SPROUT.leaves.forEach(([length, width, elevation, yaw, curl], i) => {
    const leaf = new Group()
    leaf.name = `sprout-leaf-${i ? 'left' : 'right'}`
    const { upper, lower } = leafHalves(length, width, curl)
    const light = new Mesh(upper, materials.light)
    light.name = `${leaf.name}-light`
    const shade = new Mesh(lower, materials.shade)
    shade.name = `${leaf.name}-shade`
    leaf.add(light, shade)
    leaf.position.set(top[0], top[1], 0)
    leaf.rotation.set(0, yaw * Math.PI / 180, elevation * Math.PI / 180, 'YZX')
    group.add(leaf)
  })
  return { group, materials: Object.values(materials) }
}
