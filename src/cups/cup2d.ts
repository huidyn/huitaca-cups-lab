import type { VesselDefinition } from './types'
import type { AccessoryName } from './agent-look'

// La tasse à plat, de face : sans WebGL, pour les tout petits formats et le mouvement réduit.
// Même profil, mêmes couleurs, mêmes yeux que la 3D ; seuls le volume et les accessoires se simplifient.
export interface Flat {
  // x, y, largeur, hauteur du dessin, en unités de tasse (y vers le bas).
  box: [number, number, number, number]
  shapes: { d: string; fill: string; stroke?: string; width?: number }[]
  eyes: { x: number; y: number; width: number; height: number; fill: string }[]
}

// Cadrage d'un avatar de barre latérale, identique en 3D et en 2D : de la place au-dessus pour un béret ou un casque (le plus haut monte à 3,05).
export const AVATAR_FRAME = { lift: 1.5, halfHeight: 1.62 }

const round = (value: number) => Math.round(value * 1000) / 1000
const HIDDEN = new Set(['inside', 'throat'])
const MARK = {
  beret: ['#c84444', '#a93636'], scarf: ['#244bd2', '#1837a4'], 'tea-bag': ['#e2b245', '#e3dbd1'],
  headphones: ['#555958', '#626665'], paintbrush: ['#b5533c', '#e2b245'], leaf: ['#74a24f', '#5b8a3f']
} as const

// `frame` : le cadrage de la 3D (centre vertical et demi-hauteur), pour que les deux se superposent exactement.
export function flatCup(vessel: VesselDefinition, accessory?: AccessoryName, frame?: { lift: number; halfHeight: number }): Flat {
  const shapes: Flat['shapes'] = []
  let minX = Infinity
  let maxX = -Infinity
  let top = -Infinity
  const grow = (x: number, y: number, pad = 0) => {
    minX = Math.min(minX, x - pad)
    maxX = Math.max(maxX, x + pad)
    top = Math.max(top, y + pad)
  }
  for (const part of vessel.parts) {
    if (HIDDEN.has(part.id) || part.outline.length < 2) continue
    const half = part.outline.map(([r, y]) => [r, y] as const)
    const ring = [...half, ...[...half].reverse().map(([r, y]) => [-r, y] as const)]
    shapes.push({ d: `M${ring.map(([x, y]) => `${round(x)} ${round(-y)}`).join('L')}Z`, fill: vessel.colors[part.color] ?? '#999' })
    for (const [x, y] of ring) grow(x, y)
  }
  if (vessel.handle) {
    const { points, radius, color } = vessel.handle
    shapes.push({ d: `M${points.map(([x, y]) => `${round(x)} ${round(-y)}`).join('L')}`, fill: 'none', stroke: vessel.colors[color] ?? '#999', width: round(radius * 2) })
    for (const [x, y] of points) grow(x, y, radius)
  }
  const { face } = vessel
  // Le plan de la paroi sous les yeux : la bande de la face.
  const eyes = [-1, 1].map(side => ({
    x: round(side * face.separation / 2 - face.eyeWidth / 2),
    y: round(-face.centerY - face.eyeHeight / 2),
    width: face.eyeWidth,
    height: face.eyeHeight,
    fill: vessel.colors[face.color] ?? '#222'
  }))
  const bottom = Math.min(0, ...vessel.parts.flatMap(part => part.outline.map(point => point[1])))
  if (accessory) {
    const rim = Math.max(...vessel.parts.filter(part => !HIDDEN.has(part.id)).flatMap(part => part.outline.map(point => point[0])))
    const [a, b] = MARK[accessory]
    const y = -top
    if (accessory === 'beret') shapes.push({ d: `M${-rim * 1.12} ${round(y + 0.04)}Q0 ${round(y - 0.62)} ${rim * 1.12} ${round(y + 0.04)}Z`, fill: a }, { d: `M${-rim} ${round(y + 0.06)}H${rim}`, fill: 'none', stroke: b, width: 0.1 })
    if (accessory === 'headphones') {
      shapes.push({ d: `M${-rim * 1.05} ${round(y + 0.5)}Q${-rim * 1.05} ${round(y - 0.5)} 0 ${round(y - 0.5)}Q${rim * 1.05} ${round(y - 0.5)} ${rim * 1.05} ${round(y + 0.5)}`, fill: 'none', stroke: a, width: 0.14 })
      for (const side of [-1, 1]) shapes.push({ d: `M${round(side * rim * 1.05)} ${round(y + 0.34)}v0.5`, fill: 'none', stroke: b, width: 0.4 })
    }
    if (accessory === 'scarf') shapes.push({ d: `M${-rim} ${round(-face.centerY + face.eyeHeight / 2 + 0.2)}H${rim}`, fill: 'none', stroke: a, width: 0.3 }, { d: `M${round(rim * 0.45)} ${round(-face.centerY + face.eyeHeight / 2 + 0.2)}v0.5`, fill: 'none', stroke: b, width: 0.18 })
    if (accessory === 'tea-bag') shapes.push({ d: `M${round(-rim * 0.8)} ${round(y + 0.02)}l-0.16 0.5`, fill: 'none', stroke: b, width: 0.03 }, { d: `M${round(-rim * 0.8 - 0.3)} ${round(y + 0.5)}h0.28v0.3h-0.28Z`, fill: a })
    if (accessory === 'paintbrush') shapes.push({ d: `M${round(rim * 0.3)} ${round(y + 0.1)}l${round(rim * 0.5)} ${-0.9}`, fill: 'none', stroke: a, width: 0.12 }, { d: `M${round(rim * 0.3)} ${round(y + 0.1)}l-0.08 0.2`, fill: 'none', stroke: b, width: 0.1 })
    if (accessory === 'leaf') shapes.push({ d: `M0 ${round(y)}V${round(y - 0.5)}`, fill: 'none', stroke: b, width: 0.06 }, { d: `M0 ${round(y - 0.5)}q-0.4 -0.05 -0.45 -0.4q0.4 0 0.45 0.4Z`, fill: a }, { d: `M0 ${round(y - 0.5)}q0.4 -0.05 0.45 -0.4q-0.4 0 -0.45 0.4Z`, fill: b })
    grow(0, top + (accessory === 'beret' ? 0.62 : 0.9))
    grow(-rim * 1.2, 0)
    grow(rim * 1.2, 0)
  }
  const margin = 0.08
  const left = minX - margin
  const height = top - bottom + margin * 2
  const width = maxX - minX + margin * 2
  // Carré, centré sur la tasse : la même boîte que la 3D à cette taille.
  const side = Math.max(width, height)
  // La 3D décale une tasse à anse de 0,18 vers la gauche pour la centrer avec son anse.
  const offset = vessel.handle ? 0.18 : 0
  return {
    box: frame
      ? [round(-frame.halfHeight + offset), round(-(frame.lift + frame.halfHeight)), round(frame.halfHeight * 2), round(frame.halfHeight * 2)]
      : [round(left - (side - width) / 2), round(-top - margin - (side - height) / 2), round(side), round(side)],
    shapes,
    eyes
  }
}
