import { describe, expect, it } from 'vitest'
import { COST_BUDGET_MS, createGovernor, judge, QUALITY, QUALITY_ORDER, type Sample, suggestTier, summarise } from './quality'

const frames = (count: number, cost: number, interval = 16.7): Sample[] => Array.from({ length: count }, () => ({ cost, interval }))

describe('render quality', () => {
  it('goes from richest to cheapest and ends on a static cup', () => {
    const tiers = QUALITY_ORDER.map(id => QUALITY[id])
    for (let i = 1; i < tiers.length; i++) {
      expect(tiers[i]!.density).toBeLessThanOrEqual(tiers[i - 1]!.density)
      expect(tiers[i]!.maxFps).toBeLessThanOrEqual(tiers[i - 1]!.maxFps)
    }
    expect(QUALITY.high.density).toBeLessThanOrEqual(2)
    expect(QUALITY.static).toMatchObject({ density: 0, maxFps: 0 })
  })

  it('summarises cost and cadence', () => {
    const summary = summarise([...frames(19, 1, 16.7), { cost: 9, interval: 16.7 }])
    expect(summary.frames).toBe(20)
    expect(summary.mean).toBeCloseTo(1.4, 6)
    expect(summary.p95).toBe(1)
    expect(summary.max).toBe(9)
    expect(summary.fps).toBeCloseTo(59.9, 0)
    expect(summarise([])).toEqual({ frames: 0, mean: 0, p95: 0, max: 0, fps: 0 })
  })

  it('judges by the slow tail, not the average, and by the cadence held', () => {
    expect(judge(summarise(frames(60, 1)), 'high')).toBe('ok')
    expect(judge(summarise(frames(60, COST_BUDGET_MS * 0.8)), 'high')).toBe('tight')
    expect(judge(summarise(frames(60, COST_BUDGET_MS * 1.2)), 'high')).toBe('over')
    // Quelques images lentes sur beaucoup de rapides : le 95e centile les ignore, pas le pire cas.
    expect(judge(summarise([...frames(58, 1), ...frames(2, 40)]), 'high')).toBe('ok')
    expect(judge(summarise([...frames(50, 1), ...frames(10, 40)]), 'high')).toBe('over')
    // Peu coûteux, mais la cadence cible n'est pas tenue.
    expect(judge(summarise(frames(60, 1, 50)), 'high')).toBe('over')
    expect(judge(summarise(frames(60, 1, 50)), 'low')).toBe('ok')
  })

  it('steps down one tier at a time while frames stay over budget, and stops at static', () => {
    const governor = createGovernor({ window: 10 })
    const changes: string[] = []
    for (let i = 0; i < 100; i++) {
      const next = governor.push({ cost: COST_BUDGET_MS * 3, interval: 16.7 })
      if (next) changes.push(next)
    }
    expect(changes).toEqual(['balanced', 'low', 'static'])
    expect(governor.tier).toBe('static')
  })

  it('stays put on a fast device, and never climbs back up', () => {
    const governor = createGovernor({ window: 10 })
    for (let i = 0; i < 100; i++) expect(governor.push({ cost: 1, interval: 16.7 })).toBeUndefined()
    expect(governor.tier).toBe('high')
    for (let i = 0; i < 10; i++) governor.push({ cost: 50, interval: 16.7 })
    expect(governor.tier).toBe('balanced')
    for (let i = 0; i < 100; i++) governor.push({ cost: 0.5, interval: 33 })
    expect(governor.tier).toBe('balanced')
  })

  it('waits for a full window before judging', () => {
    const governor = createGovernor({ window: 30 })
    for (let i = 0; i < 29; i++) expect(governor.push({ cost: 100, interval: 16.7 })).toBeUndefined()
    expect(governor.push({ cost: 100, interval: 16.7 })).toBe('balanced')
  })

  it('respects a floor tier and suggests balanced as the minimum device tier', () => {
    expect(suggestTier({ cores: 1, memoryGb: 1, saveData: true })).toBe('balanced')
    expect(suggestTier({ cores: 4, memoryGb: 4 })).toBe('balanced')
    expect(suggestTier({ cores: 8, memoryGb: 8 })).toBe('high')
    const governor = createGovernor({ window: 10, floor: 'balanced' })
    const changes: string[] = []
    for (let i = 0; i < 60; i++) {
      const next = governor.push({ cost: COST_BUDGET_MS * 3, interval: 50 })
      if (next) changes.push(next)
    }
    expect(changes).toEqual(['balanced'])
    expect(governor.tier).toBe('balanced')
  })
})
