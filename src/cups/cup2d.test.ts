import { describe, expect, it } from 'vitest'
import { ACCESSORY_IDS } from './agent-look'
import { vessels } from './catalogue'
import { AVATAR_FRAME, flatCup } from './cup2d'
import { designCollections } from './designs'

const all = [...vessels, ...designCollections.map(collection => collection.vessel)]

describe('the flat cup', () => {
  it.each(all.map(vessel => [vessel.id, vessel] as const))('draws %s from its own outline, with its own colours and eyes', (_, vessel) => {
    const flat = flatCup(vessel)
    expect(flat.shapes.length).toBeGreaterThan(0)
    for (const shape of flat.shapes) {
      expect(shape.d).toMatch(/^M/)
      expect(shape.d).not.toMatch(/NaN|Infinity|undefined/)
      expect(shape.fill === 'none' || /^#[0-9a-f]{3,8}$/i.test(shape.fill)).toBe(true)
    }
    // Les yeux sont ceux de la 3D : même taille, même écart, même couleur.
    expect(flat.eyes).toHaveLength(2)
    expect(flat.eyes[0]!.width).toBe(vessel.face.eyeWidth)
    expect(flat.eyes[1]!.x - flat.eyes[0]!.x).toBeCloseTo(vessel.face.separation, 3)
    expect(flat.eyes[0]!.fill).toBe(vessel.colors[vessel.face.color])
    // Le fond de l'intérieur ne se dessine pas par-dessus la paroi.
    expect(flat.shapes.some(shape => shape.fill === vessel.colors.inside) && !vessel.parts.some(part => part.id !== 'inside' && vessel.colors[part.color] === vessel.colors.inside)).toBe(false)
    // Seule une tasse à anse a un trait épais.
    expect(flat.shapes.some(shape => shape.stroke !== undefined)).toBe(Boolean(vessel.handle))
  })

  it('fits the tight box around the cup, square, with the eyes inside it', () => {
    for (const vessel of all) {
      for (const accessory of [undefined, ...ACCESSORY_IDS]) {
        const { box, eyes } = flatCup(vessel, accessory)
        expect(box[2]).toBe(box[3])
        for (const eye of eyes) {
          expect(eye.x).toBeGreaterThanOrEqual(box[0])
          expect(eye.x + eye.width).toBeLessThanOrEqual(box[0] + box[2])
          expect(eye.y).toBeGreaterThanOrEqual(box[1])
          expect(eye.y + eye.height).toBeLessThanOrEqual(box[1] + box[3])
        }
      }
    }
  })

  it('uses the same frame as the 3D avatar when asked, so both fit one 32 px box', () => {
    for (const vessel of all) {
      const { box } = flatCup(vessel, undefined, AVATAR_FRAME)
      expect(box[2]).toBe(AVATAR_FRAME.halfHeight * 2)
      expect(box[3]).toBe(AVATAR_FRAME.halfHeight * 2)
      // Le bas de la tasse (y = 0) est dans le cadre, et son haut aussi, même avec un accessoire.
      expect(box[1]).toBeLessThan(0)
      expect(box[1] + box[3]).toBeGreaterThan(0)
      expect(box[0]).toBe(vessel.handle ? Math.round((-AVATAR_FRAME.halfHeight + 0.18) * 1000) / 1000 : -AVATAR_FRAME.halfHeight)
    }
  })

  it('adds one extra drawing per accessory, above the cup, and none without', () => {
    const vessel = vessels[0]!
    const bare = flatCup(vessel).shapes.length
    for (const accessory of ACCESSORY_IDS) {
      const worn = flatCup(vessel, accessory)
      expect(worn.shapes.length, accessory).toBeGreaterThan(bare)
      expect(worn.shapes.every(shape => !/NaN/.test(shape.d))).toBe(true)
    }
  })
})
