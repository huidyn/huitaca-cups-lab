// Ce que l'app enregistre pour l'apparence d'un agent, et rien d'autre.
// Pas de three, pas de Vue : ce fichier part dans le bundle initial de la barre latérale,
// donc il ne connaît les catalogues que par leurs identifiants (un test les garde synchronisés).

export const AGENT_LOOK_VERSION = 1
// Un seul accessoire à la fois : ils se posent tous au même endroit (autour du visage,
// sur le bord, sur l'anse) et se traversent. Le champ est une liste pour qu'on puisse
// relever cette limite un jour sans changer le format enregistré.
export const MAX_ACCESSORIES = 1
// Marge de sécurité pour la base de données : le JSON d'un agent ne dépasse jamais ceci.
export const AGENT_LOOK_MAX_BYTES = 160

export const CUP_IDS = [
  'mug', 'tall-mug', 'teacup', 'tumbler', 'takeaway', 'small-cup', 'footed-bowl', 'round-bowl', 'rimmed-cup',
  'rounded-tumbler', 'goblet', 'round-mug', 'colombian-mug', 'gaiwan', 'yunomi', 'kulhad', 'cay-glass', 'podstakannik'
] as const
// Les tasses culturelles se déclinent en motifs (jamais en couleurs), les autres en couleurs.
export const DESIGN_IDS = {
  yunomi: ['seigaiha', 'tokusa', 'mizutama'],
  gaiwan: ['yunwen', 'lianban', 'huiwen'],
  'colombian-mug': ['colombia-stepped', 'colombia-square-spirals', 'colombia-diagonals'],
  'cay-glass': ['cay-stars', 'cay-diamonds', 'cay-cintamani'],
  kulhad: ['kulhad-floral', 'kulhad-triangles', 'kulhad-vine'],
  podstakannik: ['podstakannik-windows', 'podstakannik-scroll', 'podstakannik-filigree']
} as const satisfies Record<string, readonly string[]>
export const COLOUR_IDS = [
  'oat', 'blush', 'honey', 'lavender', 'dusty', 'sage', 'stone', 'teal', 'terracotta', 'deepBlue', 'cocoa', 'graphite'
] as const
// Le couvercle n'est pas un accessoire : il fait partie de la forme (gobelet, gaiwan).
export const ACCESSORY_IDS = ['paintbrush', 'leaf', 'beret', 'tea-bag', 'headphones', 'scarf'] as const
export const PERSONALITY_IDS = ['lively', 'calm', 'focused', 'playful', 'shy', 'deadpan'] as const

export type CupId = typeof CUP_IDS[number]
export type ColourId = typeof COLOUR_IDS[number]
export type AccessoryName = typeof ACCESSORY_IDS[number]
export type PersonalityName = typeof PERSONALITY_IDS[number]

export const DEFAULT_CUP: CupId = 'mug'
export const DEFAULT_COLOUR_ID: ColourId = 'stone'
export const DEFAULT_PERSONALITY_ID: PersonalityName = 'lively'

// Exactement un de `colour` et `design`, selon la tasse. Les clés sortent toujours dans cet ordre.
export interface AgentLook {
  v: typeof AGENT_LOOK_VERSION
  cup: CupId
  colour?: ColourId
  design?: string
  accessories: AccessoryName[]
  personality: PersonalityName
}
type Draft = Pick<AgentLook, 'v' | 'cup'> & Partial<AgentLook>

export const isCultural = (cup: string): cup is keyof typeof DESIGN_IDS => cup in DESIGN_IDS
export const designsOf = (cup: string): readonly string[] => isCultural(cup) ? DESIGN_IDS[cup] : []

const has = <T extends string>(list: readonly T[], value: unknown): value is T => typeof value === 'string' && (list as readonly string[]).includes(value)

export interface Normalised {
  look: AgentLook
  // Ce qui a été corrigé ou écarté, pour les journaux : jamais une erreur qui bloque l'enregistrement.
  issues: string[]
}

// Remet n'importe quelle entrée (base de données, ancienne version, saisie fausse) dans le format.
// Ne lève jamais : un agent a toujours une apparence valide.
export function normaliseAgentLook(input: unknown): Normalised {
  const issues: string[] = []
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {}
  if (source !== input) issues.push('not an object')
  if (source.v !== AGENT_LOOK_VERSION && source === input) issues.push(`unknown version ${String(source.v)}`)

  let cup = DEFAULT_CUP
  if (has(CUP_IDS, source.cup)) cup = source.cup
  else if (source === input) issues.push(`unknown cup ${String(source.cup)}`)

  const look: Draft = { v: AGENT_LOOK_VERSION, cup }
  if (isCultural(cup)) {
    const options = DESIGN_IDS[cup] as readonly string[]
    if (has(options, source.design)) look.design = source.design
    else {
      look.design = options[0]!
      if (source.design !== undefined || source.colour === undefined) issues.push(`design ${String(source.design)} does not fit ${cup}`)
    }
    if (source.colour !== undefined) issues.push(`${cup} has a pattern, not a colour`)
  } else {
    if (has(COLOUR_IDS, source.colour)) look.colour = source.colour
    else {
      look.colour = DEFAULT_COLOUR_ID
      if (source.colour !== undefined || source.design === undefined) issues.push(`colour ${String(source.colour)} is not in the palette`)
    }
    if (source.design !== undefined) issues.push(`${cup} has a colour, not a pattern`)
  }

  look.accessories = []
  look.personality = DEFAULT_PERSONALITY_ID
  const listed = Array.isArray(source.accessories) ? source.accessories : source.accessories === undefined ? [] : (issues.push('accessories is not a list'), [])
  for (const item of listed) {
    if (!has(ACCESSORY_IDS, item)) issues.push(`unknown accessory ${String(item)}`)
    else if (look.accessories.includes(item)) issues.push(`repeated accessory ${item}`)
    else if (look.accessories.length >= MAX_ACCESSORIES) issues.push(`more than ${MAX_ACCESSORIES} accessory: dropped ${item}`)
    else look.accessories.push(item)
  }

  if (has(PERSONALITY_IDS, source.personality)) look.personality = source.personality
  else if (source.personality !== undefined) issues.push(`unknown personality ${String(source.personality)}`)

  const known = new Set(['v', 'cup', 'colour', 'design', 'accessories', 'personality'])
  for (const key of Object.keys(source)) if (!known.has(key)) issues.push(`unknown field ${key}`)
  return { look: look as AgentLook, issues }
}

// Le texte exact que l'app enregistre.
export function serialiseAgentLook(look: AgentLook): string {
  return JSON.stringify(normaliseAgentLook(look).look)
}

export function parseAgentLook(text: string | null | undefined): Normalised {
  if (!text) return { look: normaliseAgentLook({}).look, issues: ['empty'] }
  try {
    return normaliseAgentLook(JSON.parse(text))
  } catch {
    return { look: normaliseAgentLook({}).look, issues: ['not JSON'] }
  }
}

// Ce que fait l'éditeur du lab de ce format, et inversement.
export interface EditorChoiceLike {
  cupId: string
  colourId: string
  designId: string
  accessory: AccessoryName | 'none'
}
export function toEditorChoice(look: AgentLook): EditorChoiceLike {
  return {
    cupId: look.cup,
    colourId: look.colour ?? DEFAULT_COLOUR_ID,
    designId: look.design ?? designsOf(look.cup)[0] ?? '',
    accessory: look.accessories[0] ?? 'none'
  }
}
export function fromEditorChoice(choice: EditorChoiceLike, personality: PersonalityName = DEFAULT_PERSONALITY_ID): AgentLook {
  return normaliseAgentLook({
    v: AGENT_LOOK_VERSION,
    cup: choice.cupId,
    ...(isCultural(choice.cupId) ? { design: choice.designId } : { colour: choice.colourId }),
    accessories: choice.accessory === 'none' ? [] : [choice.accessory],
    personality
  }).look
}

// Une apparence de départ pour un agent qui n'en a pas encore, toujours la même pour un même identifiant.
export function defaultAgentLook(seed: string): AgentLook {
  let hash = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) hash = Math.imul(hash ^ seed.charCodeAt(i), 0x01000193) >>> 0
  const pick = <T>(list: readonly T[]) => {
    hash = Math.imul(hash ^ (hash >>> 15), 0x2c1b3c6d) >>> 0
    return list[hash % list.length]!
  }
  const cup = pick(CUP_IDS)
  return normaliseAgentLook({
    v: AGENT_LOOK_VERSION,
    cup,
    ...(isCultural(cup) ? { design: pick(DESIGN_IDS[cup] as readonly string[]) } : { colour: pick(COLOUR_IDS) }),
    // Un agent sur deux porte quelque chose.
    accessories: pick<AccessoryName[]>([[], [pick(ACCESSORY_IDS)]]),
    personality: pick(PERSONALITY_IDS)
  }).look
}

export const sameAgentLook = (a: AgentLook, b: AgentLook) => serialiseAgentLook(a) === serialiseAgentLook(b)
