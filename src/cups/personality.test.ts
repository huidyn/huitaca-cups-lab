import { describe, expect, it } from 'vitest'
import { EXPRESSIONS, flatten, NEUTRAL } from './expressions'
import { createPerformer, DEFAULT_PERSONALITY, performedFace, PERSONALITIES, PERSONALITY_BY_ID, type PointerState } from './personality'

const AWAY: PointerState = { x: 0, y: 0, active: false }
const FRAME = 1 / 60

function run(performer: ReturnType<typeof createPerformer>, seconds: number, pointer = AWAY) {
  let last = performer.step(FRAME, pointer)
  for (let t = FRAME; t < seconds; t += FRAME) last = performer.step(FRAME, pointer)
  return last
}

const distance = (a: number[], b: number[]) => Math.sqrt(a.reduce((sum, value, i) => sum + (value - b[i]!) ** 2, 0))

describe('cup personalities', () => {
  it('offers six personalities with Lively as the full-range default', () => {
    expect(PERSONALITIES.map(personality => personality.id)).toEqual(['lively', 'calm', 'focused', 'playful', 'shy', 'deadpan'])
    const lively = PERSONALITY_BY_ID.get(DEFAULT_PERSONALITY)!
    expect(lively.id).toBe('lively')
    expect(lively.range).toBe(1)
    expect(flatten(lively.rest)).toEqual(flatten(NEUTRAL))
    // Dans la personnalité par défaut, chaque expression est jouée telle quelle.
    for (const expression of EXPRESSIONS) {
      const played = flatten(performedFace(lively, expression.id))
      flatten(expression).forEach((value, i) => expect(played[i], expression.id).toBeCloseTo(value, 9))
    }
  })

  it('scales how far an expression moves the face with the personality range', () => {
    const reach = (id: string) => {
      const personality = PERSONALITIES.find(option => option.id === id)!
      return distance(flatten(performedFace(personality, 'surprised')), flatten(personality.rest))
    }
    expect(reach('playful')).toBeGreaterThan(reach('lively'))
    expect(reach('lively')).toBeGreaterThan(reach('calm'))
    expect(reach('calm')).toBeGreaterThan(reach('deadpan'))
    // L'œil mi-clos du pince-sans-rire survit à la joie.
    expect(performedFace(PERSONALITY_BY_ID.get('deadpan')!, 'excited').eyes[0].lid).toBeGreaterThan(0.3)
  })

  it('replays identically from the same seed', () => {
    const a = createPerformer(7)
    const b = createPerformer(7)
    for (let i = 0; i < 600; i++) expect(a.step(FRAME, AWAY)).toEqual(b.step(FRAME, AWAY))
  })

  it.each(PERSONALITIES)('$id settles on the expression the agent picked, with finite values throughout', personality => {
    for (const expression of EXPRESSIONS) {
      const performer = createPerformer(3)
      performer.setPersonality(personality.id)
      performer.setIdle(false)
      performer.express(expression.id)
      let last = performer.step(FRAME, AWAY)
      for (let i = 0; i < 360; i++) {
        last = performer.step(i % 7 ? FRAME : 0.05, AWAY)
        expect(flatten(last.face).every(Number.isFinite), expression.id).toBe(true)
        expect(Number.isFinite(last.lift + last.steam + last.turn[0] + last.turn[1])).toBe(true)
      }
      expect(last.expression).toBe(expression.id)
      const target = performedFace(personality, expression.id)
      expect(last.face.eyes[0].w, expression.id).toBeCloseTo(target.eyes[0].w, 2)
      expect(last.face.eyes[1].lid, expression.id).toBeCloseTo(target.eyes[1].lid, 2)
      expect(last.face.gap, expression.id).toBeCloseTo(target.gap, 2)
    }
  })

  it('overshoots when playful and never when calm', () => {
    const peak = (id: 'playful' | 'calm') => {
      const personality = PERSONALITY_BY_ID.get(id)!
      const performer = createPerformer(1)
      performer.setPersonality(id)
      performer.setIdle(false)
      performer.express('surprised')
      const target = performedFace(personality, 'surprised').eyes[0].w
      let max = 0
      for (let i = 0; i < 240; i++) max = Math.max(max, performer.step(FRAME, AWAY).face.eyes[0].w)
      return max - target
    }
    expect(peak('playful')).toBeGreaterThan(0.02)
    expect(peak('calm')).toBeLessThan(0.001)
  })

  it('blinks on its own, more often when lively than when deadpan', () => {
    const blinks = (id: 'lively' | 'deadpan') => {
      const performer = createPerformer(11)
      performer.setPersonality(id)
      performer.setIdle(false)
      let count = 0
      let closed = false
      for (let i = 0; i < 60 * 60; i++) {
        const open = performer.step(FRAME, AWAY).face.eyes[0].open
        if (open < 0.3 && !closed) count++
        closed = open < 0.3
      }
      return count
    }
    expect(blinks('lively')).toBeGreaterThan(blinks('deadpan'))
    expect(blinks('deadpan')).toBeGreaterThan(2)
  })

  it('follows a nearby cursor with its eyes first and its body less', () => {
    const performer = createPerformer(5)
    performer.setIdle(false)
    const early = run(performer, 0.12, { x: 1, y: 1, active: true })
    expect(early.face.gaze[0]).toBeGreaterThan(0.7)
    expect(early.turn[0]).toBeLessThan(early.face.gaze[0] * 0.6)
    const late = run(performer, 2, { x: 1, y: 1, active: true })
    expect(late.face.gaze[0]).toBeGreaterThan(0.99)
    expect(late.face.gaze[1]).toBeGreaterThan(0.99)
    expect(late.turn[0]).toBeCloseTo(0.8, 1)
    // Le curseur parti, le regard revient se promener près du centre.
    const after = run(performer, 6)
    expect(Math.abs(after.face.gaze[0])).toBeLessThan(0.5)
  })

  it('looks up, glances side to side and lets steam rise while thinking', () => {
    const performer = createPerformer(9)
    performer.setThinking(true)
    const sides = new Set<number>()
    let last = performer.step(FRAME, AWAY)
    for (let i = 0; i < 60 * 8; i++) {
      last = performer.step(FRAME, AWAY)
      if (i > 60) {
        expect(last.face.gaze[1]).toBeGreaterThan(0.5)
        sides.add(Math.sign(Math.round(last.face.gaze[0] * 2)))
      }
    }
    expect(last.expression).toBe('thinking')
    expect(last.steam).toBeGreaterThan(0.98)
    expect(sides.has(1) && sides.has(-1)).toBe(true)
    performer.setThinking(false)
    expect(run(performer, 3).steam).toBeLessThan(0.01)
    // Choisir l'expression « thinking » suffit aussi à faire monter la vapeur.
    performer.express('thinking')
    expect(run(performer, 3).steam).toBeGreaterThan(0.98)
  })

  it('drifts into its own small expressions only when idle and resting', () => {
    const seen = (idle: boolean, held: 'neutral' | 'sad') => {
      const performer = createPerformer(2)
      performer.setPersonality('playful')
      performer.setIdle(idle)
      performer.express(held)
      const ids = new Set<string>()
      for (let i = 0; i < 60 * 40; i++) ids.add(performer.step(FRAME, AWAY).expression)
      return ids
    }
    const idle = seen(true, 'neutral')
    expect(idle.size).toBeGreaterThan(2)
    for (const id of idle) expect(['neutral', ...PERSONALITY_BY_ID.get('playful')!.idle]).toContain(id)
    expect([...seen(false, 'neutral')]).toEqual(['neutral'])
    expect([...seen(true, 'sad')]).toEqual(['sad'])
  })

  it('snaps to the chosen pose without any life of its own when motion is reduced', () => {
    const performer = createPerformer(4)
    performer.express('happy')
    const first = performer.step(0, AWAY, true)
    expect(flatten(first.face)).toEqual(flatten(performedFace(PERSONALITY_BY_ID.get('lively')!, 'happy')))
    expect(first.face.eyes[0].open).toBe(1)
    expect(first).toMatchObject({ turn: [0, 0], lift: 0, steam: 0, expression: 'happy' })
    performer.setThinking(true)
    expect(performer.step(0, AWAY, true)).toMatchObject({ steam: 1, expression: 'thinking' })
  })

  it('rejects an unknown expression or personality', () => {
    const performer = createPerformer()
    expect(() => performer.express('grumpy' as never)).toThrow('Unknown expression')
    expect(() => performer.setPersonality('loud' as never)).toThrow('Unknown personality')
  })
})
