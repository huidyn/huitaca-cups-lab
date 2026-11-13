import { describe, expect, it } from 'vitest'
import { Mesh, MeshBasicMaterial } from 'three'
import { createSteam, STEAM, wispRibbon } from './steam'

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
})
