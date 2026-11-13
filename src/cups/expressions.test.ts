import { describe, expect, it } from 'vitest'
import { Box3, type Mesh } from 'three'
import { vessels } from './catalogue'
import { createCup } from './geometry'
import {
  blendFace, CHANNELS, EXPRESSIONS, EYE_COLUMNS, EYE_POINTS, EYE_ROWS, expressionGlyph, eyeShape, facePose, flatten, inflate, NEUTRAL
} from './expressions'

const WIDTH = 0.17
const HEIGHT = 0.37

// La boîte est recalculée à chaque pose : three garde sinon celle de la première.
function eyeBox(cup: ReturnType<typeof createCup>, name: string) {
  const mesh = cup.root.getObjectByName(name) as Mesh
  mesh.geometry.boundingBox = null
  return new Box3().setFromObject(mesh)
}

function bounds(shape: Float32Array) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (let i = 0; i < shape.length; i += 2) {
    minX = Math.min(minX, shape[i]!)
    maxX = Math.max(maxX, shape[i]!)
    minY = Math.min(minY, shape[i + 1]!)
    maxY = Math.max(maxY, shape[i + 1]!)
  }
  return { minX, maxX, minY, maxY }
}

describe('cup expressions', () => {
  it('offers sixteen named expressions, starting from neutral', () => {
    expect(EXPRESSIONS).toHaveLength(16)
    expect(new Set(EXPRESSIONS.map(expression => expression.id)).size).toBe(16)
    expect(EXPRESSIONS[0]).toBe(NEUTRAL)
    expect(flatten(NEUTRAL)).toEqual(flatten(facePose()))
    // Seule la réflexion fait monter la vapeur.
    expect(EXPRESSIONS.filter(expression => expression.steam).map(expression => expression.id)).toEqual(['thinking'])
  })

  it('keeps the resting eye exactly the original capsule', () => {
    const shape = eyeShape(NEUTRAL.eyes[0], -1, WIDTH, HEIGHT)
    expect(shape).toHaveLength(EYE_POINTS * 2)
    const w = WIDTH / 2
    const h = HEIGHT / 2 - w
    for (let row = 0; row <= EYE_ROWS; row++) {
      const y = (row / EYE_ROWS - 0.5) * HEIGHT
      const capY = Math.max(0, Math.abs(y) - h)
      const half = Math.sqrt(Math.max(0, w * w - capY * capY))
      for (let col = 0; col <= EYE_COLUMNS; col++) {
        const i = (row * (EYE_COLUMNS + 1) + col) * 2
        expect(shape[i]).toBeCloseTo((col / EYE_COLUMNS * 2 - 1) * half, 6)
        expect(shape[i + 1]).toBeCloseTo(y, 6)
      }
    }
  })

  it('mirrors the two eyes of a symmetric expression', () => {
    for (const expression of EXPRESSIONS) {
      const [left, right] = expression.eyes
      if (JSON.stringify(left) !== JSON.stringify(right)) continue
      const a = bounds(eyeShape(left, -1, WIDTH, HEIGHT))
      const b = bounds(eyeShape(right, 1, WIDTH, HEIGHT))
      expect(a.minX, expression.id).toBeCloseTo(-b.maxX, 6)
      expect(a.maxY, expression.id).toBeCloseTo(b.maxY, 6)
    }
  })

  it('reads every expression as a different face', () => {
    const seen = new Set(EXPRESSIONS.map(expression => JSON.stringify(flatten(expression))))
    expect(seen.size).toBe(EXPRESSIONS.length)
  })

  it('closes a blink to a thin line rather than nothing', () => {
    const closed = bounds(eyeShape({ ...NEUTRAL.eyes[0], open: 0 }, -1, WIDTH, HEIGHT))
    expect(closed.maxY - closed.minY).toBeGreaterThan(0.02)
    expect(closed.maxY - closed.minY).toBeLessThan(0.05)
    expect(closed.maxX - closed.minX).toBeCloseTo(WIDTH, 6)
  })

  it('cuts an eyelid flat and arches a smiling eye', () => {
    const open = bounds(eyeShape(NEUTRAL.eyes[0], -1, WIDTH, HEIGHT))
    const lidded = bounds(eyeShape({ ...NEUTRAL.eyes[0], lid: 0.5 }, -1, WIDTH, HEIGHT))
    expect(lidded.maxY).toBeCloseTo(0, 6)
    expect(lidded.minY).toBeCloseTo(open.minY, 6)
    const happy = EXPRESSIONS.find(expression => expression.id === 'happy')!
    const arc = eyeShape(happy.eyes[0], -1, WIDTH, HEIGHT)
    const middle = (EYE_ROWS / 2 * (EYE_COLUMNS + 1) + EYE_COLUMNS / 2) * 2 + 1
    const corner = (EYE_ROWS / 2 * (EYE_COLUMNS + 1)) * 2 + 1
    expect(arc[middle]! - arc[corner]!).toBeGreaterThan(0.05)
  })

  it('blends and round-trips a face through its channels', () => {
    for (const expression of EXPRESSIONS) {
      const values = flatten(expression)
      expect(values).toHaveLength(CHANNELS)
      expect(flatten(inflate(values))).toEqual(values)
      flatten(blendFace(NEUTRAL, expression, 1)).forEach((value, i) => expect(value).toBeCloseTo(values[i]!, 9))
      expect(flatten(blendFace(NEUTRAL, expression, 0))).toEqual(flatten(NEUTRAL))
    }
  })

  it('draws a two-eye glyph that fits its 100 by 60 box', () => {
    for (const expression of EXPRESSIONS) {
      const polygons = expressionGlyph(expression)
      expect(polygons).toHaveLength(2)
      for (const polygon of polygons) {
        for (const pair of polygon.split(' ')) {
          const [x, y] = pair.split(',').map(Number)
          expect(x, expression.id).toBeGreaterThanOrEqual(0)
          expect(x, expression.id).toBeLessThanOrEqual(100)
          expect(y, expression.id).toBeGreaterThanOrEqual(0)
          expect(y, expression.id).toBeLessThanOrEqual(60)
        }
      }
    }
  })

  describe.each(vessels)('$id', vessel => {
    it('keeps every expression on the wall, at every gaze, with finite geometry', () => {
      const cup = createCup(vessel)
      const outline = vessel.parts.find(part => part.id === vessel.face.surface)!.outline
      const top = Math.max(...outline.map(point => point[1]))
      const bottom = Math.min(...outline.map(point => point[1]))
      for (const expression of EXPRESSIONS) {
        for (const gaze of [[0, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]] as [number, number][]) {
          cup.pose({ ...expression, gaze })
          for (const name of ['left-eye', 'right-eye']) {
            const box = eyeBox(cup, name)
            expect(Number.isFinite(box.min.x + box.max.x + box.min.y + box.max.y + box.min.z + box.max.z), `${expression.id} ${name}`).toBe(true)
            expect(box.max.y, `${expression.id} ${name}`).toBeLessThanOrEqual(top + 1e-6)
            expect(box.min.y, `${expression.id} ${name}`).toBeGreaterThanOrEqual(bottom - 1e-6)
            // Les yeux restent sur la moitié avant de la tasse.
            expect(box.min.z, `${expression.id} ${name}`).toBeGreaterThan(0)
          }
          // Les deux yeux ne se touchent jamais.
          const left = eyeBox(cup, 'left-eye')
          const right = eyeBox(cup, 'right-eye')
          expect(right.min.x - left.max.x, expression.id).toBeGreaterThan(0.02)
        }
      }
      // Regarder en l'air déplace les yeux plus que regarder en bas : l'écharpe passe dessous.
      cup.look(0, 0)
      const rest = eyeBox(cup, 'left-eye').max.y
      cup.look(0, 1)
      const up = eyeBox(cup, 'left-eye').max.y
      cup.look(0, -1)
      const down = eyeBox(cup, 'left-eye').max.y
      expect(up - rest).toBeGreaterThan(rest - down)
      expect(cup.topY).toBeGreaterThanOrEqual(top)
      cup.dispose()
    })
  })
})
