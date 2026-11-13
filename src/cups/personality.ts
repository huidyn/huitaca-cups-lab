import {
  CHANNELS, EXPRESSION_BY_ID, type ExpressionId, type FacePose, facePose, flatten, inflate, NEUTRAL
} from './expressions'

// Un agent choisit une expression ; la personnalité décide comment elle est jouée :
// son amplitude, sa vitesse, son rebond, et ce que la tasse fait quand rien ne se passe.
export type PersonalityId = 'lively' | 'calm' | 'focused' | 'playful' | 'shy' | 'deadpan'

export interface Personality {
  id: PersonalityId
  name: string
  note: string
  // Amplitude de l'expression autour du visage de repos : 1 = telle quelle.
  range: number
  // Vitesse (rad/s) et amortissement du ressort : sous 1, l'expression dépasse puis revient.
  tempo: number
  damping: number
  // Intervalle des clignements en secondes, chance d'un double, et durée relative.
  blink: [number, number]
  doubleBlink: number
  blinkTime: number
  // Regard qui se promène au repos : amplitude et intervalle.
  wander: number
  wanderEvery: [number, number]
  // Part du curseur que le regard suit, et part du regard que la tasse suit.
  attention: number
  lead: number
  breath: number
  // Amplitude des petits mouvements (rebond, hochement).
  motion: number
  // Le visage de repos, d'où partent toutes les expressions.
  rest: FacePose
  // Ce qui lui passe sur le visage quand l'agent ne dit rien.
  idle: ExpressionId[]
  idleEvery: [number, number]
}

const rest = (eyes: Partial<FacePose['eyes'][number]> = {}, patch: Partial<FacePose> = {}): FacePose => {
  const base = facePose(patch)
  return { ...base, eyes: [{ ...base.eyes[0], ...eyes }, { ...base.eyes[1], ...eyes }] }
}

export const PERSONALITIES: Personality[] = [
  {
    id: 'lively', name: 'Lively', note: 'The default. Wide range, quick to react, always a little curious.',
    range: 1, tempo: 16, damping: 0.62, blink: [2.2, 5], doubleBlink: 0.2, blinkTime: 1,
    wander: 0.45, wanderEvery: [1.2, 3], attention: 1, lead: 0.8, breath: 0.012, motion: 1,
    rest: rest(), idle: ['curious', 'happy', 'attentive'], idleEvery: [4, 8]
  },
  {
    id: 'calm', name: 'Calm', note: 'Soft and unhurried. Feelings arrive slowly and never overshoot.',
    range: 0.65, tempo: 7, damping: 1, blink: [4, 7.5], doubleBlink: 0, blinkTime: 1.5,
    wander: 0.2, wanderEvery: [3, 6], attention: 0.7, lead: 0.5, breath: 0.018, motion: 0.4,
    rest: rest({ h: 0.96, lid: 0.08 }), idle: ['happy'], idleEvery: [9, 15]
  },
  {
    id: 'focused', name: 'Focused', note: 'Steady eyes, small precise reactions, hardly a blink.',
    range: 0.55, tempo: 20, damping: 0.95, blink: [5, 9], doubleBlink: 0, blinkTime: 0.85,
    wander: 0.08, wanderEvery: [3, 5], attention: 0.9, lead: 0.35, breath: 0.006, motion: 0.3,
    rest: rest({ w: 1.04, lid: 0.16, slant: 0.12 }), idle: ['focused'], idleEvery: [10, 16]
  },
  {
    id: 'playful', name: 'Playful', note: 'Everything a size bigger. Bouncy, tilts its head, winks at you.',
    range: 1.25, tempo: 19, damping: 0.42, blink: [1.8, 4], doubleBlink: 0.35, blinkTime: 0.9,
    wander: 0.6, wanderEvery: [0.8, 2.2], attention: 1, lead: 1, breath: 0.014, motion: 1.5,
    rest: rest({ w: 1.05, h: 1.05 }, { head: { yaw: 0, pitch: 0, roll: 3 } }), idle: ['wink', 'delighted', 'curious', 'excited'], idleEvery: [3, 6]
  },
  {
    id: 'shy', name: 'Shy', note: 'Smaller eyes that look away first. Warm, but quietly.',
    range: 0.7, tempo: 9, damping: 0.9, blink: [1.6, 3.6], doubleBlink: 0.3, blinkTime: 1,
    wander: 0.3, wanderEvery: [1.5, 3.5], attention: 0.55, lead: 0.6, breath: 0.01, motion: 0.5,
    rest: rest({ w: 0.9, h: 0.88 }, { gap: 0.96, gaze: [-0.15, -0.3], head: { yaw: 0, pitch: -3, roll: 0 } }), idle: ['shy', 'attentive'], idleEvery: [5, 9]
  },
  {
    id: 'deadpan', name: 'Deadpan', note: 'Half-lidded and unbothered. A raised eyelid is a big day.',
    range: 0.4, tempo: 6, damping: 1, blink: [5, 10], doubleBlink: 0, blinkTime: 2.2,
    wander: 0.12, wanderEvery: [3, 7], attention: 0.6, lead: 0.2, breath: 0.005, motion: 0.15,
    rest: rest({ h: 0.95, lid: 0.36 }), idle: ['skeptical', 'sleepy'], idleEvery: [8, 14]
  }
]

export const PERSONALITY_BY_ID = new Map<PersonalityId, Personality>(PERSONALITIES.map(personality => [personality.id, personality]))
export const DEFAULT_PERSONALITY: PersonalityId = 'lively'

export interface PointerState {
  // Position du curseur autour de la tasse, de -1 à 1, et s'il bouge à proximité.
  x: number
  y: number
  active: boolean
}

export interface Performance {
  face: FacePose
  // Ce que la tasse elle-même suit du regard, de -1 à 1 : moins, et plus lentement, que les yeux.
  turn: [number, number]
  // Décalage vertical de la tasse : respiration et rebonds.
  lift: number
  // Vapeur de 0 à 1.
  steam: number
  expression: ExpressionId
}

const NEUTRAL_VALUES = flatten(NEUTRAL)
const BLINK = 0.17
const GAZE_RATE = 14
const TURN_RATE = 4.5
const STEAM_RATE = 3.5

// Générateur déterministe : une même graine rejoue la même tasse.
function mulberry(seed: number) {
  let state = seed >>> 0
  return () => {
    state = state + 0x6d2b79f5 >>> 0
    let t = state
    t = Math.imul(t ^ t >>> 15, t | 1)
    t ^= t + Math.imul(t ^ t >>> 7, t | 61)
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

// L'expression telle que la personnalité la joue : le repos, plus l'écart au neutre mis à l'échelle.
export function performedFace(personality: Personality, expression: ExpressionId): FacePose {
  const target = flatten(EXPRESSION_BY_ID.get(expression)!)
  const base = flatten(personality.rest)
  return inflate(base.map((value, i) => value + (target[i]! - NEUTRAL_VALUES[i]!) * personality.range))
}

export function createPerformer(seed = 1) {
  const random = mulberry(seed)
  const between = ([min, max]: [number, number]) => min + (max - min) * random()
  let personality = PERSONALITY_BY_ID.get(DEFAULT_PERSONALITY)!
  let chosen: ExpressionId = 'neutral'
  let thinking = false
  let idling = true
  let shown: ExpressionId = 'neutral'
  let target = flatten(performedFace(personality, shown))
  const values = [...target]
  const speeds = new Array<number>(CHANNELS).fill(0)
  let clock = 0
  let motionAt = 0
  let blinkIn = between(personality.blink)
  let blinkAt = -1
  let blinkAgain = false
  let wanderIn = between(personality.wanderEvery)
  let wanderTo: [number, number] = [0, 0]
  let thinkSide = 1
  let thinkIn = 0
  let idleIn = between(personality.idleEvery)
  let idleLeft = 0
  let idleShown: ExpressionId | undefined
  const look: [number, number] = [0, 0]
  const turn: [number, number] = [0, 0]
  let steam = 0

  function show(next: ExpressionId) {
    if (next === shown) return
    shown = next
    target = flatten(performedFace(personality, shown))
    motionAt = clock
    // Un changement d'expression s'accompagne souvent d'un clignement.
    if (blinkAt < 0 && random() < 0.4) blinkAt = clock
  }

  function current(): ExpressionId {
    return thinking ? 'thinking' : idleShown ?? chosen
  }

  function step(dt: number, pointer: PointerState, still = false): Performance {
    const steaming = thinking || EXPRESSION_BY_ID.get(chosen)!.steam === true
    if (still) {
      // Mouvement réduit : la pose juste, sans clignement ni vie propre.
      shown = thinking ? 'thinking' : chosen
      target = flatten(performedFace(personality, shown))
      for (let i = 0; i < CHANNELS; i++) {
        values[i] = target[i]!
        speeds[i] = 0
      }
      idleShown = undefined
      steam = steaming ? 1 : 0
      return { face: inflate(values), turn: [0, 0], lift: 0, steam, expression: shown }
    }
    clock += dt

    // Les petites expressions de repos ne viennent que si l'agent ne dit rien.
    if (idling && chosen === 'neutral' && !thinking && personality.idle.length) {
      if (idleShown) {
        idleLeft -= dt
        if (idleLeft <= 0) {
          idleShown = undefined
          idleIn = between(personality.idleEvery)
        }
      } else {
        idleIn -= dt
        if (idleIn <= 0) {
          idleShown = personality.idle[Math.floor(random() * personality.idle.length)]!
          idleLeft = 0.9 + random() * 1.1
        }
      }
    } else {
      idleShown = undefined
    }
    show(current())

    // Un ressort par canal : c'est l'amortissement qui fait le caractère de la transition.
    const steps = Math.max(1, Math.ceil(dt * personality.tempo / 0.4))
    const h = dt / steps
    const k = personality.tempo * personality.tempo
    const c = 2 * personality.damping * personality.tempo
    for (let s = 0; s < steps; s++) {
      for (let i = 0; i < CHANNELS; i++) {
        speeds[i] = speeds[i]! + ((target[i]! - values[i]!) * k - speeds[i]! * c) * h
        values[i] = values[i]! + speeds[i]! * h
      }
    }

    // Clignement : fermeture rapide, réouverture un peu plus lente.
    let open = 1
    const duration = BLINK * personality.blinkTime
    if (blinkAt < 0) {
      blinkIn -= dt
      if (blinkIn <= 0) {
        blinkAt = clock
        blinkAgain = random() < personality.doubleBlink
      }
    }
    if (blinkAt >= 0) {
      const t = (clock - blinkAt) / duration
      if (t >= 1) {
        blinkAt = blinkAgain ? clock + 0.06 : -1
        blinkAgain = false
        blinkIn = between(personality.blink)
      } else if (t >= 0) {
        const closing = t < 0.4 ? t / 0.4 : 1 - (t - 0.4) / 0.6
        open = 1 - closing * closing * (3 - 2 * closing)
      }
    }

    // Où regarder : en l'air quand elle réfléchit, vers le curseur s'il est là, sinon ailleurs.
    let lookX: number
    let lookY: number
    if (thinking || shown === 'thinking') {
      thinkIn -= dt
      if (thinkIn <= 0) {
        thinkSide = -thinkSide
        thinkIn = 1.3 + random() * 1.2
      }
      lookX = thinkSide * 0.55 + (pointer.active ? pointer.x * 0.12 : 0)
      lookY = pointer.active ? pointer.y * 0.1 : 0
    } else if (pointer.active) {
      lookX = pointer.x * personality.attention
      lookY = pointer.y * personality.attention
    } else {
      wanderIn -= dt
      if (wanderIn <= 0) {
        wanderIn = between(personality.wanderEvery)
        // Une fois sur trois, le regard revient simplement devant.
        wanderTo = random() < 0.33 ? [0, 0] : [(random() * 2 - 1) * personality.wander, (random() * 2 - 1) * personality.wander * 0.6]
      }
      lookX = wanderTo[0]
      lookY = wanderTo[1]
    }
    const quick = 1 - Math.exp(-dt * GAZE_RATE)
    look[0] += (lookX - look[0]) * quick
    look[1] += (lookY - look[1]) * quick
    const slow = 1 - Math.exp(-dt * TURN_RATE)
    turn[0] += (look[0] * personality.lead - turn[0]) * slow
    turn[1] += (look[1] * personality.lead - turn[1]) * slow
    steam += ((steaming ? 1 : 0) - steam) * (1 - Math.exp(-dt * STEAM_RATE))

    const face = inflate(values, [open, open])
    // Le regard propre à l'expression s'efface en partie devant ce que la tasse regarde.
    const own = pointer.active && !thinking ? 0.35 : 1
    face.gaze = [Math.max(-1, Math.min(1, face.gaze[0] * own + look[0])), Math.max(-1, Math.min(1, face.gaze[1] * own + look[1]))]

    // Les petits mouvements partent au changement d'expression, puis s'éteignent.
    const since = clock - motionAt
    const fade = Math.exp(-since * 2.4)
    const amount = personality.motion
    let lift = Math.sin(clock * Math.PI * 0.5) * personality.breath
    const motion = EXPRESSION_BY_ID.get(shown)!.motion
    if (motion === 'bounce') lift += Math.abs(Math.sin(since * Math.PI * 3.2)) * 0.09 * amount * fade
    else if (motion === 'nod') face.head.pitch += Math.sin(since * Math.PI * 4.4) * 4 * amount * fade
    else if (motion === 'shake') face.head.yaw += Math.sin(since * Math.PI * 6) * 5 * amount * fade
    else if (motion === 'sway') face.head.roll += Math.sin(clock * Math.PI * 0.7) * 2.5 * Math.max(0.4, amount)
    return { face, turn: [turn[0], turn[1]], lift, steam, expression: shown }
  }

  return {
    step,
    // L'expression choisie par l'agent. Elle tient jusqu'à la suivante.
    express(id: ExpressionId) {
      if (!EXPRESSION_BY_ID.has(id)) throw new Error(`Unknown expression: ${id}`)
      chosen = id
      idleShown = undefined
    },
    setThinking(value: boolean) {
      thinking = value
    },
    // Sans vie propre, la tasse tient l'expression choisie : c'est la planche des expressions.
    setIdle(value: boolean) {
      idling = value
      if (!value) idleShown = undefined
    },
    setPersonality(id: PersonalityId) {
      const next = PERSONALITY_BY_ID.get(id)
      if (!next) throw new Error(`Unknown personality: ${id}`)
      personality = next
      target = flatten(performedFace(personality, shown))
      blinkIn = Math.min(blinkIn, between(personality.blink))
      idleIn = between(personality.idleEvery)
      wanderIn = Math.min(wanderIn, between(personality.wanderEvery))
    }
  }
}

export type Performer = ReturnType<typeof createPerformer>
