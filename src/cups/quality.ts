// Niveaux de qualité du rendu 3D, et le juge qui choisit le bon selon ce qu'on mesure.
// Pas de three : la barre latérale lit ceci avant de charger le moteur.

export type QualityId = 'high' | 'balanced' | 'low' | 'static'
export interface Quality {
  label: string
  // Plafond de la densité de pixels, et d'images par seconde quand la tasse bouge.
  density: number
  maxFps: number
}

export const QUALITY: Record<QualityId, Quality> = {
  high: { label: 'High', density: 2, maxFps: 60 },
  balanced: { label: 'Balanced', density: 1.5, maxFps: 30 },
  low: { label: 'Low', density: 1, maxFps: 20 },
  // Plus de canvas : la tasse est une image fixe avec des yeux en 2D.
  static: { label: 'Static', density: 0, maxFps: 0 }
}
export const QUALITY_ORDER: QualityId[] = ['high', 'balanced', 'low', 'static']

// Point de départ d'après ce que l'appareil dit de lui-même. Ce n'est qu'un indice (les navigateurs
// arrondissent ces valeurs, et certains les taisent) : c'est le juge, d'après les images réellement
// dessinées, qui décide ensuite.
export function suggestTier(device: { cores?: number; memoryGb?: number; saveData?: boolean }): Exclude<QualityId, 'static'> {
  if (device.saveData) return 'low'
  const cores = device.cores || 8
  const memory = device.memoryGb || 8
  if (cores <= 2 || memory <= 2) return 'low'
  if (cores <= 4 || memory <= 4) return 'balanced'
  return 'high'
}

// Le plus bas de deux niveaux : un niveau retenu d'une visite précédente ne remonte pas tout seul.
export function lowerTier<T extends QualityId>(a: T, b: T): T {
  return QUALITY_ORDER.indexOf(a) >= QUALITY_ORDER.indexOf(b) ? a : b
}

// Ce que le dessin peut coûter au processeur par image : le reste de l'app doit tenir dans l'image.
export const COST_BUDGET_MS = 6

export interface Sample {
  // Millisecondes passées à préparer et soumettre l'image (côté processeur).
  cost: number
  // Millisecondes depuis l'image précédente quand la tasse bouge, sinon 0.
  interval: number
}

function percentile(values: number[], p: number) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]!
}

export interface Summary {
  frames: number
  mean: number
  p95: number
  max: number
  // Cadence tenue pendant le mouvement, d'après la médiane des intervalles.
  fps: number
}

export function summarise(samples: Sample[]): Summary {
  const costs = samples.map(sample => sample.cost)
  const intervals = samples.map(sample => sample.interval).filter(interval => interval > 0)
  const median = percentile(intervals, 0.5)
  return {
    frames: samples.length,
    mean: costs.length ? costs.reduce((sum, cost) => sum + cost, 0) / costs.length : 0,
    p95: percentile(costs, 0.95),
    max: costs.length ? Math.max(...costs) : 0,
    fps: median ? 1000 / median : 0
  }
}

export type Verdict = 'ok' | 'tight' | 'over'

// Le niveau tient-il ? « tight » : sous le budget mais sans marge ; « over » : au-delà, ou cadence ratée.
export function judge(summary: Summary, tier: QualityId, budget = COST_BUDGET_MS): Verdict {
  const target = QUALITY[tier].maxFps
  const slow = target > 0 && summary.fps > 0 && summary.fps < target * 0.75
  if (summary.p95 > budget || slow) return 'over'
  return summary.p95 > budget * 0.6 ? 'tight' : 'ok'
}

// Le niveau le plus haut qui tient, d'après une mesure faite au niveau le plus haut :
// coût processeur trop fort, on descend ; on ne remonte pas dans la session (pas d'oscillation).
export function createGovernor(options: { start?: QualityId; window?: number; budget?: number } = {}) {
  const size = options.window ?? 60
  const budget = options.budget ?? COST_BUDGET_MS
  let tier = options.start ?? 'high'
  let samples: Sample[] = []
  return {
    get tier() { return tier },
    // Rend le nouveau niveau quand il change, sinon rien.
    push(sample: Sample): QualityId | undefined {
      if (tier === 'static') return undefined
      samples.push(sample)
      if (samples.length < size) return undefined
      const verdict = judge(summarise(samples), tier, budget)
      samples = []
      if (verdict !== 'over') return undefined
      tier = QUALITY_ORDER[QUALITY_ORDER.indexOf(tier) + 1]!
      return tier
    }
  }
}
