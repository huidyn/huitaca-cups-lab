import { describe, expect, it } from 'vitest'
import { Mesh, MeshBasicMaterial } from 'three'
import { vessels } from './catalogue'
import { ACCESSORY_FRAME } from './renderer'
import { createSteam, STEAM, steamReach, steamScale, wispRibbon } from './steam'

const opacities = (steam: ReturnType<typeof createSteam>) =>
  steam.group.children.map(child => ((child as Mesh).material as MeshBasicMaterial).opacity)

describe('thinking steam', () => {
  it('keeps three tapered ribbons inside their height through a whole cycle', () => {
    for (let index = 0; index < STEAM.wisps.length; index++) {
      for (let time = 0; time < STEAM.period * 2; time += 0.05) {
        const { positions, fade } = wispRibbon(index, time, 1)
        expect(fade).toBeGreaterThanOrEqual(0)
        expect(fade).toBeLessThanOrEqual(1)
        for (let i = 0; i < positions.length; i += 6) {
          expect(positions[i + 1]).toBeGreaterThanOrEqual(0)
          expect(positions[i + 1]).toBeLessThanOrEqual(1 + 1e-6)
          expect(positions[i + 3]! - positions[i]!).toBeLessThanOrEqual(STEAM.width * 2 + 1e-6)
          expect(Math.abs((positions[i]! + positions[i + 3]!) / 2 - STEAM.wisps[index]!.x)).toBeLessThanOrEqual(STEAM.sway + 1e-6)
        }
        // Pointu aux deux bouts.
        expect(positions[3]! - positions[0]!).toBeCloseTo(0, 6)
        expect(positions[positions.length - 3]! - positions[positions.length - 6]!).toBeCloseTo(0, 6)
      }
    }
  })

  it('fades in with its strength and hides entirely at zero', () => {
    const steam = createSteam(1)
    expect(steam.group.visible).toBe(false)
    steam.update(1, 0.5)
    expect(steam.group.visible).toBe(true)
    const half = Math.max(...opacities(steam))
    expect(half).toBeGreaterThan(0)
    expect(half).toBeLessThanOrEqual(STEAM.opacity * 0.5)
    steam.update(1, 1)
    expect(Math.max(...opacities(steam))).toBeCloseTo(half * 2, 6)
    steam.update(1, 0)
    expect(steam.group.visible).toBe(false)
    steam.dispose()
  })

  it('thickens at small sizes so a ribbon is about three pixels wide at 48 px', () => {
    const large = 600 / (2 * ACCESSORY_FRAME.halfHeight)
    const small = 48 / (2 * ACCESSORY_FRAME.halfHeight)
    expect(steamScale(large)).toBe(1)
    const scale = steamScale(small)
    expect(scale).toBeGreaterThan(1.3)
    let widest = 0
    for (let time = 0; time < STEAM.period; time += 0.05) {
      const { positions } = wispRibbon(1, time, 1, undefined, scale)
      for (let i = 0; i < positions.length; i += 6) widest = Math.max(widest, positions[i + 3]! - positions[i]!)
    }
    expect(widest * small).toBeGreaterThan(2.5)
    expect(widest * small).toBeLessThan(3.2)
    // Les rubans s'écartent aussi : ils restent trois, pas une tache.
    expect((STEAM.wisps[2]!.x - STEAM.wisps[1]!.x) * Math.min(scale, STEAM.maxSpread) * small).toBeGreaterThan(widest * small)
  })

  it.each(vessels)('stays inside the $id box at every size, so nothing is clipped at 48 px', vessel => {
    const { lift, halfHeight } = ACCESSORY_FRAME
    const topY = Math.max(...vessel.parts.flatMap(part => part.outline.map(point => point[1])),
      vessel.lid ? vessel.lid.baseY + vessel.lid.height + vessel.lid.rise : 0)
    // Mêmes valeurs que le rendu : départ 0,07 au-dessus de la tasse, marge 0,1 sous le haut du cadre.
    const height = Math.min(1.5, lift + halfHeight - 0.1 - 0.07 - topY)
    expect(height).toBeGreaterThan(0.6)
    const offset = vessel.handle ? -0.18 : 0
    for (const size of [24, 32, 48, 96, 600]) {
      const scale = steamScale(size / (2 * halfHeight))
      // Boîte carrée : la demi-largeur visible vaut la demi-hauteur.
      expect(Math.abs(offset) + steamReach(scale), `${size}px`).toBeLessThan(halfHeight)
      for (let index = 0; index < STEAM.wisps.length; index++) {
        for (let time = 0; time < STEAM.period; time += 0.1) {
          const { positions } = wispRibbon(index, time, height, undefined, scale)
          for (let i = 0; i < positions.length; i += 3) {
            expect(Math.abs(positions[i]!), `${size}px`).toBeLessThanOrEqual(steamReach(scale) + 1e-6)
            // Même au plus haut d'un rebond, le sommet reste sous le bord de la boîte.
            expect(topY + 0.07 + positions[i + 1]! + 0.02, `${size}px`).toBeLessThan(lift + halfHeight)
          }
        }
      }
    }
  })
})
