import { describe, expect, it } from 'vitest'
import { Mesh, MeshBasicMaterial } from 'three'
import { vessels } from './catalogue'
import { designCollections } from './designs'
import { collectionFor, DEFAULT_COLOUR, defaultDesign, editorLook, PLAIN } from './editor'
import { createCup } from './geometry'
import { palette } from './palette'
import type { AccessoryId } from './accessories'

const ACCESSORIES: AccessoryId[] = ['paintbrush', 'leaf', 'beret', 'tea-bag', 'headphones', 'scarf']
const choice = (cupId: string, patch: Partial<Parameters<typeof editorLook>[0]> = {}) =>
  ({ cupId, colourId: DEFAULT_COLOUR, designId: defaultDesign(cupId), accessory: PLAIN as AccessoryId | typeof PLAIN, ...patch })

describe('editor look', () => {
  it('starts from a default that is always one of the twelve colours or one of the three patterns', () => {
    const stone = palette.find(option => option.id === DEFAULT_COLOUR)!
    // La pierre est le gris de la palette, le même que celui du catalogue.
    expect(stone.colors.body).toBe(vessels[0]!.colors.body)
    for (const vessel of vessels) {
      const look = editorLook(choice(vessel.id))
      const collection = collectionFor(vessel.id)
      expect(look.fitVessel).toBe(vessel)
      expect(look.accessory).toBeUndefined()
      if (collection) {
        expect(look.design).toBe(collection.designs[0])
        expect(look.vessel).toBe(collection.vessel)
      } else {
        expect(look.design).toBeUndefined()
        expect(look.vessel.colors.body).toBe(stone.colors.body)
      }
    }
  })

  it('offers patterns only to the six cultural vessels that own them', () => {
    expect(vessels.filter(vessel => collectionFor(vessel.id)).map(vessel => vessel.id).sort())
      .toEqual(designCollections.map(collection => collection.vessel.id).sort())
  })

  it('applies a colour to every ordinary cup without changing the catalogue', () => {
    const before = JSON.stringify(vessels)
    for (const vessel of vessels.filter(vessel => !collectionFor(vessel.id))) {
      for (const colour of palette) {
        const look = editorLook(choice(vessel.id, { colourId: colour.id }))
        expect(look.vessel.id).toBe(vessel.id)
        expect(look.vessel.colors.body).toBe(colour.colors.body)
        // Aucun emplacement de couleur utilisé par la tasse ne disparaît.
        for (const part of look.vessel.parts) expect(look.vessel.colors[part.color], `${vessel.id} ${part.id}`).toBeDefined()
      }
    }
    expect(JSON.stringify(vessels)).toBe(before)
  })

  it('gives a cultural vessel patterns instead of colours, so it never shows grey or an ordinary colour', () => {
    for (const collection of designCollections) {
      const look = editorLook(choice(collection.vessel.id, { colourId: 'blush' }))
      expect(look.design).toBe(collection.designs[0])
      expect(look.vessel).toBe(collection.vessel)
      // Même sans motif choisi ou avec un motif inconnu, on retombe sur le premier.
      expect(editorLook(choice(collection.vessel.id, { designId: '' })).design).toBe(collection.designs[0])
      expect(editorLook(choice(collection.vessel.id, { designId: 'nope' })).design).toBe(collection.designs[0])
    }
  })

  it('lets a pattern bring its own colours instead of the chosen one', () => {
    for (const collection of designCollections) {
      const design = collection.designs[1]!
      const look = editorLook(choice(collection.vessel.id, { colourId: 'blush', designId: design.id }))
      expect(look.design).toBe(design)
      expect(look.vessel).toBe(collection.vessel)
    }
  })

  it('ignores a pattern that belongs to another cup', () => {
    const [japan, china] = designCollections
    const look = editorLook(choice(japan!.vessel.id, { designId: china!.designs[0]!.id }))
    expect(look.design).toBe(japan!.designs[0])
  })

  it('rebuilds the scene only when its structure changes, not for another colour or pattern', () => {
    const keys = (patch: Parameters<typeof editorLook>[0]) => editorLook(patch).key
    expect(keys(choice('mug', { colourId: 'blush' }))).toBe(keys(choice('mug', { colourId: 'oat' })))
    expect(keys(choice('mug'))).toBe(keys(choice('mug', { colourId: 'oat' })))
    expect(keys(choice('mug'))).not.toBe(keys(choice('tall-mug')))
    expect(keys(choice('mug'))).not.toBe(keys(choice('mug', { accessory: 'beret' })))
    const [first, second] = designCollections[0]!.designs
    const id = designCollections[0]!.vessel.id
    expect(keys(choice(id, { designId: first!.id }))).toBe(keys(choice(id, { designId: second!.id })))
    // Le motif par défaut est le premier, donc rien à reconstruire non plus.
    expect(keys(choice(id))).toBe(keys(choice(id, { designId: first!.id })))
    // Le gobelet a toujours le même couvercle clair, quelle que soit la couleur.
    expect(keys(choice('takeaway'))).toBe(keys(choice('takeaway', { colourId: 'blush' })))
  })

  it('builds every combination of cup, finish and accessory without error', () => {
    let built = 0
    for (const vessel of vessels) {
      const collection = collectionFor(vessel.id)
      // Une couleur ne change que des teintes : sans accessoire, elle suffit à vérifier la tasse.
      const finishes = [
        ...(collection ? [] : [
          { colourId: DEFAULT_COLOUR, designId: '', accessories: [PLAIN, ...ACCESSORIES] as const },
          { colourId: 'lavender', designId: '', accessories: [PLAIN] as const }
        ]),
        ...(collection?.designs.map(design => ({ colourId: DEFAULT_COLOUR, designId: design.id, accessories: [PLAIN, ...ACCESSORIES] as const })) ?? [])
      ]
      for (const { accessories, ...finish } of finishes) {
        for (const accessory of accessories) {
          const look = editorLook(choice(vessel.id, { ...finish, accessory }))
          const cup = createCup(look.vessel, { pattern: Boolean(look.design && look.vessel.pattern), accessory: look.accessory, fitVessel: look.fitVessel })
          const colours = new Set<MeshBasicMaterial>()
          cup.root.traverse(object => { if (object instanceof Mesh) colours.add(object.material) })
          expect(colours.size).toBeGreaterThan(0)
          cup.dispose()
          built++
        }
      }
    }
    expect(built).toBeGreaterThan(200)
  }, 120_000)
})
