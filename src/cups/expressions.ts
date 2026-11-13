// Les expressions de la tasse : deux yeux, et rien d'autre. Tout passe par la forme de
// chaque œil, leur écart, la direction du regard et l'inclinaison de la tasse.
// Aucune dépendance à three : ces formes servent aussi aux vignettes SVG.

export interface EyePose {
  // Multiples de la largeur et de la hauteur de l'œil au repos.
  w: number
  h: number
  // Degrés ; positif = le haut de l'œil part vers le nez. Les deux yeux sont donc en miroir.
  tilt: number
  // Cambrure en largeurs d'œil ; positif = arc vers le haut, l'œil qui sourit.
  bend: number
  // Paupière : part de la hauteur coupée par le haut, et pente de la coupe (positif = plus basse côté nez).
  lid: number
  slant: number
  // Joue : part de la hauteur coupée par le bas.
  cheek: number
  // Clignement : 1 ouvert, 0 fermé.
  open: number
}

export interface FacePose {
  eyes: [EyePose, EyePose]
  // Multiple de l'écart au repos.
  gap: number
  // Regard dans la zone du visage, de -1 à 1.
  gaze: [number, number]
  // Inclinaison de la tasse en degrés : lacet (vers la droite), tangage (vers le haut), roulis.
  head: { yaw: number; pitch: number; roll: number }
}

export type ExpressionId =
  | 'neutral' | 'attentive' | 'happy' | 'delighted' | 'excited' | 'curious' | 'surprised' | 'thinking'
  | 'focused' | 'skeptical' | 'confused' | 'sad' | 'shy' | 'sleepy' | 'annoyed' | 'wink'

export type Motion = 'bounce' | 'nod' | 'shake' | 'sway'

export interface Expression extends FacePose {
  id: ExpressionId
  name: string
  // Petit mouvement de la tasse qui accompagne l'expression.
  motion?: Motion
  // La vapeur monte : la tasse réfléchit.
  steam?: boolean
}

const eye = (patch: Partial<EyePose> = {}): EyePose => ({ w: 1, h: 1, tilt: 0, bend: 0, lid: 0, slant: 0, cheek: 0, open: 1, ...patch })
const pair = (patch: Partial<EyePose> = {}): [EyePose, EyePose] => [eye(patch), eye(patch)]
const head = (yaw = 0, pitch = 0, roll = 0) => ({ yaw, pitch, roll })

export const EXPRESSIONS: Expression[] = [
  { id: 'neutral', name: 'Neutral', eyes: pair(), gap: 1, gaze: [0, 0], head: head() },
  { id: 'attentive', name: 'Attentive', eyes: pair({ w: 1.08, h: 1.1 }), gap: 1.03, gaze: [0, 0.1], head: head(0, 2, 3), motion: 'nod' },
  // Deux arcs : la gélule s'aplatit et se cambre.
  { id: 'happy', name: 'Happy', eyes: pair({ w: 1.55, h: 0.36, bend: 0.55 }), gap: 1.05, gaze: [0, 0.1], head: head(0, 4, 0), motion: 'nod' },
  { id: 'delighted', name: 'Delighted', eyes: pair({ w: 1.75, h: 0.32, bend: 0.85 }), gap: 1.08, gaze: [0, 0.25], head: head(0, 8, 0), motion: 'bounce' },
  { id: 'excited', name: 'Excited', eyes: pair({ w: 1.35, h: 1.2 }), gap: 1.1, gaze: [0, 0.3], head: head(0, 5, 0), motion: 'bounce' },
  // Un œil plus grand que l'autre, et la tasse qui penche : c'est le roulis qui porte la curiosité.
  { id: 'curious', name: 'Curious', eyes: [eye({ w: 1.16, h: 1.16 }), eye({ w: 0.94, h: 0.88 })], gap: 1, gaze: [0.35, 0.2], head: head(6, 2, -9) },
  { id: 'surprised', name: 'Surprised', eyes: pair({ w: 1.55, h: 1.06 }), gap: 1.14, gaze: [0, 0.15], head: head(0, 6, 0) },
  { id: 'thinking', name: 'Thinking', eyes: [eye({ h: 0.92, lid: 0.14 }), eye({ h: 0.96 })], gap: 1, gaze: [0, 0.8], head: head(0, 3, 4), motion: 'sway', steam: true },
  { id: 'focused', name: 'Focused', eyes: pair({ w: 1.1, h: 0.8, lid: 0.28, slant: 0.25 }), gap: 0.97, gaze: [0, -0.1], head: head(0, -3, 0) },
  { id: 'skeptical', name: 'Skeptical', eyes: [eye({ h: 0.96 }), eye({ h: 0.9, lid: 0.5 })], gap: 1, gaze: [-0.3, 0], head: head(-3, 0, 6) },
  { id: 'confused', name: 'Confused', eyes: [eye({ w: 1.2, h: 1.1, tilt: -10 }), eye({ w: 0.92, h: 0.6, tilt: 8 })], gap: 1.02, gaze: [-0.2, 0.15], head: head(-5, 0, -7) },
  // Les hauts divergent et le regard tombe.
  { id: 'sad', name: 'Sad', eyes: pair({ h: 0.85, tilt: -14, lid: 0.22, slant: -0.5 }), gap: 0.98, gaze: [0, -0.6], head: head(0, -7, 0) },
  { id: 'shy', name: 'Shy', eyes: pair({ w: 0.85, h: 0.7 }), gap: 0.92, gaze: [-0.6, -0.55], head: head(-8, -5, -4) },
  { id: 'sleepy', name: 'Sleepy', eyes: pair({ h: 0.9, lid: 0.58 }), gap: 1, gaze: [0, -0.3], head: head(0, -5, 3) },
  { id: 'annoyed', name: 'Annoyed', eyes: pair({ w: 1.1, h: 0.85, lid: 0.4, slant: 0.7 }), gap: 0.96, gaze: [0, 0], head: head(0, -2, 0), motion: 'shake' },
  { id: 'wink', name: 'Wink', eyes: [eye({ w: 1.05, h: 1.05 }), eye({ w: 1.5, h: 0.36, bend: 0.55 })], gap: 1.03, gaze: [0, 0.1], head: head(0, 2, -5) }
]

export const EXPRESSION_BY_ID = new Map<ExpressionId, Expression>(EXPRESSIONS.map(expression => [expression.id, expression]))
export const NEUTRAL: Expression = EXPRESSIONS[0]!

export function facePose(patch: Partial<FacePose> = {}): FacePose {
  return { eyes: pair(), gap: 1, gaze: [0, 0], head: head(), ...patch }
}

// Une pose est une suite de nombres : c'est ce qui permet de la mélanger et de l'animer.
const EYE_KEYS = ['w', 'h', 'tilt', 'bend', 'lid', 'slant', 'cheek'] as const
export const CHANNELS = EYE_KEYS.length * 2 + 6

export function flatten(face: FacePose, out: number[] = []): number[] {
  let i = 0
  for (const current of face.eyes) for (const key of EYE_KEYS) out[i++] = current[key]
  out[i++] = face.gap
  out[i++] = face.gaze[0]
  out[i++] = face.gaze[1]
  out[i++] = face.head.yaw
  out[i++] = face.head.pitch
  out[i++] = face.head.roll
  return out
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

// Les bornes gardent un œil lisible même quand une personnalité exagère l'expression.
export function inflate(values: number[], open: [number, number] = [1, 1]): FacePose {
  let i = 0
  const eyes = open.map(value => {
    const lid = clamp(values[i + 4]!, 0, 0.85)
    const current: EyePose = {
      w: clamp(values[i]!, 0.3, 2.2), h: clamp(values[i + 1]!, 0.2, 1.5), tilt: values[i + 2]!, bend: clamp(values[i + 3]!, -1.2, 1.2),
      lid, slant: values[i + 5]!, cheek: clamp(values[i + 6]!, 0, 0.85 - lid), open: clamp(value, 0, 1)
    }
    i += EYE_KEYS.length
    return current
  }) as [EyePose, EyePose]
  return {
    eyes, gap: clamp(values[i]!, 0.7, 1.3), gaze: [clamp(values[i + 1]!, -1, 1), clamp(values[i + 2]!, -1, 1)],
    head: { yaw: values[i + 3]!, pitch: values[i + 4]!, roll: values[i + 5]! }
  }
}

export function blendFace(a: FacePose, b: FacePose, t: number): FacePose {
  const from = flatten(a)
  const to = flatten(b)
  return inflate(from.map((value, i) => value + (to[i]! - value) * t), [a.eyes[0].open + (b.eyes[0].open - a.eyes[0].open) * t, a.eyes[1].open + (b.eyes[1].open - a.eyes[1].open) * t])
}

// Même grille que l'œil d'origine : les lignes suivent la courbure de la paroi.
export const EYE_COLUMNS = 8
export const EYE_ROWS = 32
export const EYE_POINTS = (EYE_COLUMNS + 1) * (EYE_ROWS + 1)
// Un œil fermé reste un trait, jamais rien.
const BLINK_THICKNESS = 0.034

// Les sommets de l'œil dans le plan du visage, autour de son centre. `side` : -1 à gauche, 1 à droite.
export function eyeShape(pose: EyePose, side: number, width: number, height: number, out = new Float32Array(EYE_POINTS * 2)) {
  const halfW = pose.w * width / 2
  const halfH = Math.max(BLINK_THICKNESS / 2, pose.h * height * pose.open / 2)
  const radius = Math.min(halfW, halfH)
  const cut = pose.lid > 0 || pose.slant !== 0
  const top = halfH - pose.lid * 2 * halfH
  const bottom = -halfH + pose.cheek * 2 * halfH
  const angle = pose.tilt * side * Math.PI / 180
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  let i = 0
  for (let row = 0; row <= EYE_ROWS; row++) {
    const y0 = (row / EYE_ROWS * 2 - 1) * halfH
    const capY = Math.max(0, Math.abs(y0) - (halfH - radius))
    const rowHalf = halfW - radius + Math.sqrt(Math.max(0, radius * radius - capY * capY))
    for (let col = 0; col <= EYE_COLUMNS; col++) {
      const x = (col / EYE_COLUMNS * 2 - 1) * rowHalf
      let y = y0
      // La paupière est une droite : ce qui dépasse se rabat dessus.
      if (cut) y = Math.min(y, Math.max(top + pose.slant * x * side, -halfH * 0.6))
      if (pose.cheek > 0) y = Math.max(y, bottom)
      const ratio = x / halfW
      y += pose.bend * width * (0.5 - ratio * ratio)
      out[i++] = x * cos - y * sin
      out[i++] = x * sin + y * cos
    }
  }
  return out
}

// Le contour du même œil, pour les vignettes : colonne de gauche vers le haut, colonne de droite vers le bas.
export function eyeOutline(pose: EyePose, side: number, width: number, height: number): [number, number][] {
  const shape = eyeShape(pose, side, width, height)
  const at = (row: number, col: number): [number, number] => {
    const i = (row * (EYE_COLUMNS + 1) + col) * 2
    return [shape[i]!, shape[i + 1]!]
  }
  const points: [number, number][] = []
  for (let col = 0; col <= EYE_COLUMNS; col++) points.push(at(0, col))
  for (let row = 1; row <= EYE_ROWS; row++) points.push(at(row, EYE_COLUMNS))
  for (let col = EYE_COLUMNS - 1; col >= 0; col--) points.push(at(EYE_ROWS, col))
  for (let row = EYE_ROWS - 1; row >= 1; row--) points.push(at(row, 0))
  return points
}

// Proportions de l'œil au repos, communes à presque toutes les tasses.
const GLYPH = { width: 0.17, height: 0.37, separation: 0.39 }

// Une vignette des deux yeux, dans une boîte de 100 × 60.
export function expressionGlyph(face: FacePose): string[] {
  const scale = 100
  return face.eyes.map((pose, i) => {
    const side = i ? 1 : -1
    const cx = 50 + side * GLYPH.separation * face.gap / 2 * scale
    return eyeOutline(pose, side, GLYPH.width, GLYPH.height)
      .map(([x, y]) => `${(cx + x * scale).toFixed(1)},${(30 - y * scale).toFixed(1)}`).join(' ')
  })
}
