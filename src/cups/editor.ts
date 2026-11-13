import { vessels } from './catalogue'
import { type CupDesign, type DesignCollection, designCollections } from './designs'
import { palette, paletteVessel } from './palette'
import type { AccessoryId } from './accessories'
import type { VesselDefinition } from './types'

// Le choix de l'éditeur : une forme, puis une couleur (tasse ordinaire) OU un motif
// (tasse culturelle), puis un accessoire. Chaque tasse a une option par défaut, jamais
// un gris hors palette : la pierre pour une couleur, le premier motif pour une tasse culturelle.
export const DEFAULT_COLOUR = 'stone'
export const PLAIN = 'none'
export interface EditorChoice {
  cupId: string
  colourId: string
  designId: string
  accessory: AccessoryId | typeof PLAIN
}

// Seules les formes à motif ont une collection : les autres n'ont que la couleur.
export function collectionFor(cupId: string): DesignCollection | undefined {
  return designCollections.find(collection => collection.vessel.id === cupId)
}

export function defaultDesign(cupId: string) {
  return collectionFor(cupId)?.designs[0]?.id ?? ''
}

export interface EditorLook {
  // Ce qui s'affiche, et la tasse nue d'après laquelle les accessoires se posent :
  // un verre rempli cache son fond, mais le pinceau doit tout de même y descendre.
  vessel: VesselDefinition
  fitVessel: VesselDefinition
  design?: CupDesign
  accessory?: AccessoryId
  // Ce qui oblige à reconstruire la scène. Une autre couleur, ou un autre
  // motif de la même tasse, se règle en place sur la scène existante.
  key: string
}

export function editorLook(choice: EditorChoice): EditorLook {
  const base = vessels.find(vessel => vessel.id === choice.cupId)
  if (!base) throw new Error(`Unknown cup: ${choice.cupId}`)
  const collection = collectionFor(choice.cupId)
  const accessory = choice.accessory === PLAIN ? undefined : choice.accessory
  // Une tasse culturelle se décline en motifs, une tasse ordinaire en couleurs :
  // jamais les deux, et jamais de gris hors des douze couleurs.
  const design = collection && (collection.designs.find(option => option.id === choice.designId) ?? collection.designs[0])
  const colour = collection ? undefined
    : palette.find(option => option.id === choice.colourId) ?? palette.find(option => option.id === DEFAULT_COLOUR)!
  const vessel = design ? collection!.vessel : paletteVessel(base, { ...base.colors, ...colour!.colors })
  return { vessel, fitVessel: base, design, accessory, key: `${base.id}|${design ? 'design' : 'colour'}|${accessory ?? '-'}` }
}
