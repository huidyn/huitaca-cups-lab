export type Point2 = [number, number]
export type Point3 = [number, number, number]

export interface PatternBand {
  surface: string
  from: number
  to: number
}

export interface RevolvedPart {
  id: string
  outline: Point2[]
  material: 'flat'
  color: string
}

export interface LidDefinition {
  radius: number
  baseY: number
  height: number
  rise: number
  raise: {
    margin: number
    falloff: number
  }
  color: string
  insideColor: string
  opening: {
    center: Point2
    angle: number
    width: number
    depth: number
    wallDepth: number
  }
}

export interface VesselDefinition {
  id: string
  name: string
  heritage?: {
    origin: string
    note: string
    sources: {
      title: string
      url: string
    }[]
  }
  colors: Record<string, string>
  parts: RevolvedPart[]
  lid?: LidDefinition
  // Zone de paroi qui peut porter un motif, sous les yeux.
  pattern?: PatternBand
  handle: {
    points: Point3[]
    radius: number
    color: string
    flare?: {
      length: number
      scale: number
    }
  } | null
  face: {
    surface: string
    centerY: number
    width: number
    height: number
    eyeWidth: number
    eyeHeight: number
    separation: number
    color: string
  }
  anchors: Record<string, Point3>
}
