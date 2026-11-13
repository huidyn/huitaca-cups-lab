import { describe, expect, it } from 'vitest'
import {
  ACCESSORY_IDS, AGENT_LOOK_MAX_BYTES, AGENT_LOOK_VERSION, COLOUR_IDS, CUP_IDS, DESIGN_IDS, defaultAgentLook, designsOf,
  fromEditorChoice, MAX_ACCESSORIES, normaliseAgentLook, parseAgentLook, PERSONALITY_IDS, sameAgentLook, serialiseAgentLook, toEditorChoice
} from './agent-look'
import { vessels } from './catalogue'
import { designCollections } from './designs'
import { collectionFor, editorLook, PLAIN } from './editor'
import { palette } from './palette'
import { PERSONALITIES } from './personality'

describe('the look an agent stores', () => {
  it('knows exactly the ids of the real catalogues, in the same order', () => {
    expect([...CUP_IDS]).toEqual(vessels.map(vessel => vessel.id))
    expect([...COLOUR_IDS]).toEqual(palette.map(option => option.id))
    expect([...PERSONALITY_IDS]).toEqual(PERSONALITIES.map(option => option.id))
    expect(Object.keys(DESIGN_IDS).sort()).toEqual(designCollections.map(collection => collection.vessel.id).sort())
    for (const collection of designCollections) {
      expect([...DESIGN_IDS[collection.vessel.id as keyof typeof DESIGN_IDS]]).toEqual(collection.designs.map(design => design.id))
    }
    // Les 6 accessoires modélisés du lab, ni plus ni moins.
    expect([...ACCESSORY_IDS].sort()).toEqual(['beret', 'headphones', 'leaf', 'paintbrush', 'scarf', 'tea-bag'])
  })

  it('keeps a valid look as it is, with keys in a fixed order', () => {
    const { look, issues } = normaliseAgentLook({ personality: 'calm', accessories: ['beret'], colour: 'teal', cup: 'goblet', v: 1 })
    expect(issues).toEqual([])
    expect(JSON.stringify(look)).toBe('{"v":1,"cup":"goblet","colour":"teal","accessories":["beret"],"personality":"calm"}')
    const cultural = normaliseAgentLook({ v: 1, cup: 'yunomi', design: 'tokusa', accessories: [], personality: 'shy' })
    expect(cultural.issues).toEqual([])
    expect(JSON.stringify(cultural.look)).toBe('{"v":1,"cup":"yunomi","design":"tokusa","accessories":[],"personality":"shy"}')
  })

  it('allows one accessory, and says what it dropped beyond that', () => {
    expect(MAX_ACCESSORIES).toBe(1)
    const { look, issues } = normaliseAgentLook({ v: 1, cup: 'mug', colour: 'oat', accessories: ['scarf', 'beret', 'scarf', 'crown'], personality: 'lively' })
    expect(look.accessories).toEqual(['scarf'])
    expect(issues).toContain('more than 1 accessory: dropped beret')
    expect(issues).toContain('repeated accessory scarf')
    expect(issues).toContain('unknown accessory crown')
  })

  it('gives a cup either a colour or a pattern, never both and never neither', () => {
    for (const cup of CUP_IDS) {
      const { look } = normaliseAgentLook({ v: 1, cup, colour: 'teal', design: 'seigaiha' })
      if (designsOf(cup).length) {
        expect(look.colour).toBeUndefined()
        expect(designsOf(cup)).toContain(look.design)
      } else {
        expect(look.design).toBeUndefined()
        expect(COLOUR_IDS).toContain(look.colour)
      }
    }
    expect(normaliseAgentLook({ v: 1, cup: 'gaiwan', colour: 'teal' }).look.design).toBe('yunwen')
    expect(normaliseAgentLook({ v: 1, cup: 'mug', design: 'seigaiha' }).look.colour).toBe('stone')
    // Un motif d'une autre tasse est refusé, et remplacé par le premier de la bonne.
    expect(normaliseAgentLook({ v: 1, cup: 'kulhad', design: 'seigaiha' }).look.design).toBe('kulhad-floral')
  })

  it('never throws and always returns a look that renders, whatever it is given', () => {
    for (const input of [undefined, null, 7, 'mug', [], {}, { v: 2 }, { cup: 'nope' }, { v: 1, cup: 'mug', colour: 'neon', accessories: 'beret', personality: 3 }]) {
      const { look, issues } = normaliseAgentLook(input)
      expect(look.v).toBe(AGENT_LOOK_VERSION)
      expect(CUP_IDS).toContain(look.cup)
      expect(PERSONALITY_IDS).toContain(look.personality)
      expect(Array.isArray(look.accessories)).toBe(true)
      expect(issues.length).toBeGreaterThan(0)
      expect(() => editorLook(toEditorChoice(look))).not.toThrow()
    }
  })

  it('drops fields it does not know, so the app stores nothing else', () => {
    const { look, issues } = normaliseAgentLook({ v: 1, cup: 'mug', colour: 'oat', accessories: [], personality: 'calm', name: 'Ada', secret: 'x' })
    expect(Object.keys(look)).toEqual(['v', 'cup', 'colour', 'accessories', 'personality'])
    expect(issues).toEqual(['unknown field name', 'unknown field secret'])
  })

  it('reads back what it wrote, and survives bad text', () => {
    const look = defaultAgentLook('agent-7')
    expect(parseAgentLook(serialiseAgentLook(look))).toEqual({ look, issues: [] })
    expect(parseAgentLook('{oops').issues).toEqual(['not JSON'])
    expect(parseAgentLook('').issues).toEqual(['empty'])
    expect(parseAgentLook(null).look.cup).toBe('mug')
    expect(sameAgentLook(look, parseAgentLook(serialiseAgentLook(look)).look)).toBe(true)
  })

  it('derives a stable starting look from an agent id, spread over the catalogue', () => {
    expect(defaultAgentLook('a1')).toEqual(defaultAgentLook('a1'))
    const seen = { cups: new Set<string>(), personalities: new Set<string>(), worn: 0 }
    for (let i = 0; i < 400; i++) {
      const look = defaultAgentLook(`agent-${i}`)
      expect(normaliseAgentLook(look).issues).toEqual([])
      seen.cups.add(look.cup)
      seen.personalities.add(look.personality)
      if (look.accessories.length) seen.worn++
    }
    expect(seen.cups.size).toBeGreaterThan(12)
    expect(seen.personalities.size).toBe(6)
    expect(seen.worn).toBeGreaterThan(120)
    expect(seen.worn).toBeLessThan(280)
  })

  it('round-trips with the editor choice, for every cup', () => {
    for (const cup of CUP_IDS) {
      const collection = collectionFor(cup)
      const look = normaliseAgentLook({ v: 1, cup, ...(collection ? { design: collection.designs.at(-1)!.id } : { colour: 'cocoa' }), accessories: ['headphones'], personality: 'deadpan' }).look
      const choice = toEditorChoice(look)
      expect(choice.accessory).toBe('headphones')
      expect(fromEditorChoice(choice, 'deadpan')).toEqual(look)
      expect(editorLook(choice).accessory).toBe('headphones')
    }
    expect(toEditorChoice(normaliseAgentLook({ v: 1, cup: 'mug' }).look).accessory).toBe(PLAIN)
    // L'éditeur garde aussi la couleur d'une tasse à motif : le format, non.
    const fromGaiwan = fromEditorChoice({ cupId: 'gaiwan', colourId: 'teal', designId: 'huiwen', accessory: PLAIN })
    expect(fromGaiwan).toEqual({ v: 1, cup: 'gaiwan', design: 'huiwen', accessories: [], personality: 'lively' })
  })

  it('stays within its byte budget for the longest names it can hold', () => {
    let longest = 0
    for (const cup of CUP_IDS) {
      for (const accessory of ACCESSORY_IDS) {
        for (const personality of PERSONALITY_IDS) {
          const finishes = designsOf(cup).length ? designsOf(cup).map(design => ({ design })) : COLOUR_IDS.map(colour => ({ colour }))
          for (const finish of finishes) {
            longest = Math.max(longest, serialiseAgentLook(normaliseAgentLook({ v: 1, cup, ...finish, accessories: [accessory], personality }).look).length)
          }
        }
      }
    }
    expect(longest).toBeLessThanOrEqual(AGENT_LOOK_MAX_BYTES)
    expect(longest).toBeGreaterThan(100)
  })
})
