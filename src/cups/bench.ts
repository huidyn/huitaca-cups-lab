import { editorLook, PLAIN } from './editor'
import { toEditorChoice, defaultAgentLook } from './agent-look'
import { judge, type QualityId, type Sample, summarise, type Summary, type Verdict } from './quality'
import type { CupView } from './renderer'

// Mesure du coût du rendu, dans le navigateur, avec les vraies tasses.
// On ne mesure que le temps processeur de préparation des images : le temps GPU n'est pas
// visible depuis la page (voir le panneau Performance des outils de développement).

export interface Scenario {
  id: 'hero' | 'sidebar'
  label: string
  cups: number
  // Côté de chaque tasse, en pixels CSS.
  size: number
}
export const SCENARIOS: Scenario[] = [
  { id: 'hero', label: 'One large cup', cups: 1, size: 320 },
  { id: 'sidebar', label: 'Sidebar, 10 agents', cups: 10, size: 32 }
]
// Ralentissement simulé du processeur : l'image attend (k - 1) fois son propre coût.
export const SLOWDOWNS = [1, 2, 4, 6]

export interface BenchOptions {
  quality: Exclude<QualityId, 'static'>
  slowdown: number
  // Secondes de mouvement du curseur, puis repos mesuré pendant IDLE_MS.
  seconds?: number
}
export interface BenchResult {
  scenario: Scenario
  quality: Exclude<QualityId, 'static'>
  slowdown: number
  move: Summary
  // Images dessinées pendant le repos, une fois la tasse arrêtée : doit rester 0.
  idleFrames: number
  verdict: Verdict
}

const SETTLE_MS = 2200
const IDLE_MS = 2000
const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

export function deviceInfo(gpu?: string) {
  const nav = navigator as Navigator & { deviceMemory?: number }
  return {
    cores: nav.hardwareConcurrency ?? 0,
    memoryGb: nav.deviceMemory ?? 0,
    pixelRatio: window.devicePixelRatio || 1,
    gpu: gpu ?? 'unknown'
  }
}

// Le nom du GPU tel que le pilote le donne, quand le navigateur le laisse lire.
export function gpuName(): string | undefined {
  const gl = document.createElement('canvas').getContext('webgl2') ?? undefined
  const info = gl?.getExtension('WEBGL_debug_renderer_info')
  const name = gl && info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : undefined
  gl?.getExtension('WEBGL_lose_context')?.loseContext()
  return name
}

export async function runScenario(scenario: Scenario, options: BenchOptions): Promise<BenchResult> {
  const { createCupGallery, DEFAULT_FRAME } = await import('./renderer')
  const seconds = options.seconds ?? 3
  // Hors écran mais mis en page : les boîtes ont de vraies dimensions.
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.style.cssText = `position:fixed;left:-20000px;top:0;width:${scenario.size}px;pointer-events:none;display:flex;flex-direction:column`
  const canvas = document.createElement('canvas')
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%'
  host.append(canvas)
  const views: CupView[] = []
  for (let i = 0; i < scenario.cups; i++) {
    const element = document.createElement('div')
    element.style.cssText = `width:${scenario.size}px;height:${scenario.size}px;flex:none`
    host.append(element)
    const look = editorLook({ ...toEditorChoice(defaultAgentLook(`bench-${i}`)), accessory: i % 2 ? PLAIN : 'beret' })
    views.push({ element, vessel: look.vessel, fitVessel: look.fitVessel, design: look.design, accessory: look.accessory })
  }
  document.body.append(host)

  let samples: Sample[] = []
  let recording = true
  let idleFrames = 0
  let counting = false
  const gallery = createCupGallery(canvas, views, {
    quality: options.quality,
    frame: DEFAULT_FRAME,
    onFrame: sample => {
      // Le ralentissement simulé s'ajoute au coût mesuré, et il fait réellement attendre l'image.
      if (options.slowdown > 1) {
        const until = performance.now() + sample.cost * (options.slowdown - 1)
        while (performance.now() < until) { /* attente active */ }
      }
      if (recording) samples.push({ cost: sample.cost * options.slowdown, interval: sample.interval })
      if (counting) idleFrames++
    }
  })
  try {
    // Un curseur qui se promène autour des tasses, comme une vraie main.
    const box = host.getBoundingClientRect()
    const cx = box.left + box.width / 2
    const cy = box.top + (scenario.cups * scenario.size) / 2
    const start = performance.now()
    await new Promise<void>(resolve => {
      const move = () => {
        const t = (performance.now() - start) / 1000
        if (t >= seconds) return resolve()
        window.dispatchEvent(new PointerEvent('pointermove', {
          pointerType: 'mouse', clientX: cx + Math.sin(t * 2.3) * 360, clientY: cy + Math.sin(t * 3.1 + 1) * 260
        }))
        requestAnimationFrame(move)
      }
      move()
    })
    await wait(SETTLE_MS)
    recording = false
    counting = true
    await wait(IDLE_MS)
    counting = false
    const move = summarise(samples)
    return { scenario, quality: options.quality, slowdown: options.slowdown, move, idleFrames, verdict: judge(move, options.quality) }
  } finally {
    gallery.dispose()
    canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext()
    host.remove()
    samples = []
  }
}
