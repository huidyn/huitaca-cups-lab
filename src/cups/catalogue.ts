import definitions from './vessels.json'
import type { Point2, Point3, VesselDefinition } from './types'

function point2(point: number[]): Point2 {
  if (point.length !== 2 || !point.every(Number.isFinite)) throw new Error('Invalid outline point')
  return [point[0]!, point[1]!]
}

function point3(point: number[] | undefined): Point3 {
  if (!point || point.length !== 3 || !point.every(Number.isFinite)) throw new Error('Invalid 3D point')
  return [point[0]!, point[1]!, point[2]!]
}

export const vessels: VesselDefinition[] = definitions.map(definition => ({
  ...definition,
  colors: Object.fromEntries(Object.entries(definition.colors).map(([id, color]) => {
    if (typeof color !== 'string') throw new Error(`Invalid colour slot: ${id}`)
    return [id, color] as const
  })),
  parts: definition.parts.map(part => {
    if (part.material !== 'flat') throw new Error(`Unknown material: ${part.material}`)
    return { ...part, material: 'flat', outline: part.outline.map(point2) }
  }),
  handle: definition.handle ? {
    ...definition.handle,
    points: definition.handle.points.map(point3)
  } : null,
  lid: definition.lid ? {
    ...definition.lid,
    opening: { ...definition.lid.opening, center: point2(definition.lid.opening.center) }
  } : undefined,
  anchors: Object.fromEntries(Object.entries(definition.anchors).map(([id, point]) => [id, point3(point)]))
}))
