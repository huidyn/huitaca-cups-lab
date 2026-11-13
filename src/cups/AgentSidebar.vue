<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  AGENT_LOOK_MAX_BYTES, type AgentLook, defaultAgentLook, MAX_ACCESSORIES, normaliseAgentLook, serialiseAgentLook, toEditorChoice
} from './agent-look'
import { AVATAR_FRAME, flatCup } from './cup2d'
import { editorLook } from './editor'
import { createGovernor, QUALITY, type QualityId } from './quality'
import { type BenchResult, deviceInfo, gpuName, runScenario, SCENARIOS, SLOWDOWNS } from './bench'
import type { createCupGallery } from './renderer'
import './agents.css'

// Des agents d'exemple : ce que l'app a enregistré pour chacun, et son nom. Le reste de la liste
// vient de `defaultAgentLook`, comme pour un agent qui n'a encore rien choisi.
const ROSTER: { id: string; name: string; look: unknown }[] = [
  { id: 'research', name: 'Research', look: { v: 1, cup: 'teacup', colour: 'sage', accessories: ['paintbrush'], personality: 'focused' } },
  { id: 'contracts', name: 'Contracts review', look: { v: 1, cup: 'goblet', colour: 'deepBlue', accessories: ['beret'], personality: 'deadpan' } },
  { id: 'inbox', name: 'Inbox triage', look: { v: 1, cup: 'takeaway', colour: 'terracotta', accessories: [], personality: 'lively' } },
  { id: 'billing', name: 'Billing', look: { v: 1, cup: 'rimmed-cup', colour: 'honey', accessories: ['tea-bag'], personality: 'calm' } },
  { id: 'onboarding', name: 'Onboarding', look: { v: 1, cup: 'yunomi', design: 'seigaiha', accessories: [], personality: 'shy' } },
  { id: 'scheduling', name: 'Scheduling', look: { v: 1, cup: 'tall-mug', colour: 'lavender', accessories: ['headphones'], personality: 'playful' } },
  { id: 'support', name: 'Customer support', look: { v: 1, cup: 'round-mug', colour: 'blush', accessories: ['scarf'], personality: 'lively' } },
  { id: 'analytics', name: 'Analytics', look: { v: 1, cup: 'tumbler', colour: 'graphite', accessories: [], personality: 'focused' } },
  { id: 'drafts', name: 'Drafts', look: { v: 1, cup: 'gaiwan', design: 'yunwen', accessories: [], personality: 'calm' } },
  { id: 'translator', name: 'Translator', look: { v: 1, cup: 'small-cup', colour: 'teal', accessories: ['leaf'], personality: 'playful' } }
]
const COUNTS = [5, 10, 20, 40]
const SIZES = [24, 28, 32]
const TIERS: Exclude<QualityId, 'static'>[] = ['high', 'balanced', 'low']

const mode = ref<'3d' | '2d'>('3d')
const size = ref(32)
const count = ref(10)
const collapsed = ref(false)
const selected = ref(ROSTER[0]!.id)
const tier = ref<Exclude<QualityId, 'static'>>('high')
const adaptive = ref(true)
const notice = ref('')
const reduced = ref(false)
const fallback = ref(false)
const frames = ref(0)
// Sans WebGL, avec mouvement réduit, ou une fois le juge à bout : une image fixe, des yeux en 2D.
const flat = computed(() => mode.value === '2d' || reduced.value || fallback.value)

const rows = computed(() => Array.from({ length: count.value }, (_, i) => {
  const entry = ROSTER[i] ?? { id: `agent-${i + 1}`, name: `Agent ${i + 1}`, look: defaultAgentLook(`agent-${i + 1}`) }
  const look: AgentLook = normaliseAgentLook(entry.look).look
  const view = editorLook(toEditorChoice(look))
  return { id: entry.id, name: entry.name, look, view, flat: flat.value ? flatCup(view.vessel, look.accessories[0], AVATAR_FRAME) : undefined }
}))
const current = computed(() => rows.value.find(row => row.id === selected.value) ?? rows.value[0]!)
const stored = computed(() => serialiseAgentLook(current.value.look))
const storedIssues = computed(() => normaliseAgentLook(JSON.parse(stored.value)).issues)

const canvas = ref<HTMLCanvasElement>()
const scroller = ref<HTMLElement>()
let gallery: ReturnType<typeof createCupGallery> | undefined
let governor = createGovernor()
let disposed = false
let media: MediaQueryList
let observer: MutationObserver | undefined

async function start() {
  gallery?.dispose()
  gallery = undefined
  frames.value = 0
  if (flat.value) return
  await nextTick()
  try {
    const { createCupGallery } = await import('./renderer')
    if (disposed || flat.value || gallery || !canvas.value || !scroller.value) return
    const elements = [...scroller.value.querySelectorAll<HTMLElement>('.agent-viewport')]
    gallery = createCupGallery(canvas.value, rows.value.map((row, i) => ({
      element: elements[i]!, vessel: row.view.vessel, fitVessel: row.view.fitVessel, design: row.view.design, accessory: row.view.accessory
    })), {
      frame: AVATAR_FRAME,
      quality: tier.value,
      onFrame: sample => {
        if (!adaptive.value) return
        const next = governor.push(sample)
        if (!next) return
        if (next === 'static') {
          notice.value = 'Frames ran over budget at every level: switched to the static cup.'
          mode.value = '2d'
        } else {
          notice.value = `Frames ran over budget: dropped to ${QUALITY[next].label.toLowerCase()}.`
          tier.value = next
          gallery?.setQuality(next)
        }
      }
    })
  } catch {
    fallback.value = true
  }
}

watch([count, flat], () => { void start() })
watch(tier, value => {
  governor = createGovernor({ start: value })
  gallery?.setQuality(value)
})
// Le panneau replié change la place des tasses sans changer leur taille : on redessine.
watch([collapsed, size], async () => {
  await nextTick()
  gallery?.refresh()
})

// Yeux 2D : même règle que la 3D (le regard suit le curseur, borné), une seule mise à jour par image écran.
let pointer: { x: number; y: number } | undefined
let pending = 0
function aim() {
  pending = 0
  if (!scroller.value) return
  for (const element of scroller.value.querySelectorAll<HTMLElement>('.flat-cup')) {
    const box = element.getBoundingClientRect()
    const x = pointer ? Math.max(-1, Math.min(1, (pointer.x - box.left - box.width / 2) / 420)) : 0
    const y = pointer ? Math.max(-1, Math.min(1, (box.top + box.height / 2 - pointer.y) / 300)) : 0
    element.style.setProperty('--gx', x.toFixed(3))
    element.style.setProperty('--gy', y.toFixed(3))
  }
}
function follow(event: PointerEvent) {
  if (!flat.value || reduced.value || event.pointerType === 'touch') return
  pointer = { x: event.clientX, y: event.clientY }
  if (!pending) pending = requestAnimationFrame(aim)
}
function leave() {
  pointer = undefined
  if (flat.value && !pending) pending = requestAnimationFrame(aim)
}
// La liste défile sous un canevas fixe : il faut redessiner les tasses à leur nouvelle place.
const scrolled = () => gallery?.refresh()

function syncMotion() {
  reduced.value = media.matches
}

// Mesures
const measuring = ref(false)
const progress = ref('')
const slowdown = ref(1)
const results = ref<BenchResult[]>([])
const device = ref<ReturnType<typeof deviceInfo>>()
async function measure() {
  if (measuring.value) return
  measuring.value = true
  results.value = []
  try {
    device.value = deviceInfo(gpuName())
    for (const scenario of SCENARIOS) {
      progress.value = `${scenario.label}…`
      results.value = [...results.value, await runScenario(scenario, { quality: tier.value, slowdown: slowdown.value })]
    }
    progress.value = ''
  } catch {
    progress.value = 'WebGL is not available here.'
  } finally {
    measuring.value = false
  }
}
const ms = (value: number) => value.toFixed(value < 10 ? 2 : 1)

onMounted(() => {
  media = matchMedia('(prefers-reduced-motion: reduce)')
  media.addEventListener('change', syncMotion)
  syncMotion()
  window.addEventListener('pointermove', follow, { passive: true })
  document.documentElement.addEventListener('pointerleave', leave)
  if (canvas.value) {
    observer = new MutationObserver(() => { frames.value = Number(canvas.value?.dataset.frames ?? 0) })
    observer.observe(canvas.value, { attributes: true, attributeFilter: ['data-frames'] })
  }
  void start()
})
onUnmounted(() => {
  disposed = true
  media?.removeEventListener('change', syncMotion)
  window.removeEventListener('pointermove', follow)
  document.documentElement.removeEventListener('pointerleave', leave)
  cancelAnimationFrame(pending)
  observer?.disconnect()
  gallery?.dispose()
})
</script>

<template>
  <div class="agents-workspace">
    <div class="agents-demo">
      <aside class="side" :class="{ 'is-collapsed': collapsed }" :style="{ '--cup': `${size}px` }" aria-label="Agents sidebar, mock-up">
        <div class="side-top">
          <div class="side-org" aria-hidden="true">
            <span class="sk sk-logo" />
            <span v-if="!collapsed" class="side-org-text"><span class="sk sk-line" style="width: 96px" /><span class="sk sk-line sk-small" style="width: 52px" /></span>
            <span v-if="!collapsed" class="sk sk-chevron" />
          </div>
          <div class="side-nav" aria-hidden="true">
            <div v-for="width in [84, 64, 100]" :key="width" class="side-item">
              <span class="sk sk-icon" />
              <span v-if="!collapsed" class="sk sk-line" :style="{ width: `${width}px` }" />
            </div>
          </div>
        </div>
        <p v-if="!collapsed" class="side-label">Agents</p>
        <div class="side-list-wrap">
          <canvas ref="canvas" class="side-canvas" :class="{ 'is-hidden': flat }" aria-hidden="true" />
          <ul ref="scroller" class="side-list" @scroll.passive="scrolled">
            <li v-for="row in rows" :key="row.id">
              <button type="button" class="side-agent" :class="{ 'is-current': row.id === selected }" :aria-current="row.id === selected ? 'true' : undefined" :title="collapsed ? row.name : undefined" @click="selected = row.id">
                <span class="agent-cup" aria-hidden="true">
                  <svg v-if="row.flat" class="flat-cup" :viewBox="row.flat.box.join(' ')" focusable="false">
                    <path v-for="(shape, i) in row.flat.shapes" :key="i" :d="shape.d" :fill="shape.fill" :stroke="shape.stroke" :stroke-width="shape.width" stroke-linejoin="round" />
                    <g class="flat-eyes">
                      <rect v-for="(eye, i) in row.flat.eyes" :key="i" :x="eye.x" :y="eye.y" :width="eye.width" :height="eye.height" :rx="eye.width / 2" :fill="eye.fill" />
                    </g>
                  </svg>
                  <span v-else class="agent-viewport" />
                </span>
                <span v-if="!collapsed" class="agent-name">{{ row.name }}</span>
              </button>
            </li>
          </ul>
        </div>
        <div class="side-foot" aria-hidden="true">
          <span class="sk sk-line" style="width: 100%; height: 6px" />
          <div class="side-account"><span class="sk sk-avatar" /><span v-if="!collapsed" class="side-org-text"><span class="sk sk-line" style="width: 88px" /><span class="sk sk-line sk-small" style="width: 120px" /></span></div>
        </div>
      </aside>
      <p class="agents-caption">{{ flat ? 'Static cups · SVG, no canvas' : `One shared canvas · ${frames} frames drawn since it started` }}</p>
    </div>

    <div class="agents-panel">
      <fieldset class="palette-picker editor-section">
        <legend>Display</legend>
        <div class="agents-controls">
          <div class="agents-control" role="group" aria-label="Renderer">
            <span>Renderer</span>
            <div class="segment">
              <button type="button" :aria-pressed="!flat" :disabled="reduced || fallback" @click="mode = '3d'; notice = ''; governor = createGovernor({ start: tier })">3D, shared canvas</button>
              <button type="button" :aria-pressed="flat" @click="mode = '2d'">Static, 2D eyes</button>
            </div>
          </div>
          <div class="agents-control" role="group" aria-label="Cup size">
            <span>Cup</span>
            <div class="segment"><button v-for="value in SIZES" :key="value" type="button" :aria-pressed="size === value" @click="size = value">{{ value }} px</button></div>
          </div>
          <div class="agents-control" role="group" aria-label="Agents">
            <span>Agents</span>
            <div class="segment"><button v-for="value in COUNTS" :key="value" type="button" :aria-pressed="count === value" @click="count = value">{{ value }}</button></div>
          </div>
          <div class="agents-control" role="group" aria-label="Sidebar">
            <span>Sidebar</span>
            <div class="segment">
              <button type="button" :aria-pressed="!collapsed" @click="collapsed = false">Expanded</button>
              <button type="button" :aria-pressed="collapsed" @click="collapsed = true">Collapsed</button>
            </div>
          </div>
          <div class="agents-control" role="group" aria-label="Quality">
            <span>Quality</span>
            <div class="segment"><button v-for="id in TIERS" :key="id" type="button" :aria-pressed="tier === id" :disabled="flat" @click="tier = id; notice = ''">{{ QUALITY[id].label }}</button></div>
          </div>
          <label class="agents-check"><input v-model="adaptive" type="checkbox" :disabled="flat" /> Step down by itself when frames run over budget</label>
          <p v-if="reduced" class="agents-note">Reduced motion is on: cups are static and their eyes stay put.</p>
          <p v-if="notice" class="agents-note" role="status">{{ notice }}</p>
        </div>
      </fieldset>

      <fieldset class="palette-picker editor-section">
        <legend>What the app stores for “{{ current.name }}”</legend>
        <pre class="agent-json" aria-label="Stored agent look">{{ stored }}</pre>
        <p class="agents-note">{{ stored.length }} of {{ AGENT_LOOK_MAX_BYTES }} bytes. One accessory at most ({{ MAX_ACCESSORIES }}), and either a colour or a pattern, decided by the cup. Anything else is dropped when it is read back{{ storedIssues.length ? `: ${storedIssues.join('; ')}` : '' }}.</p>
      </fieldset>

      <fieldset class="palette-picker editor-section">
        <legend>Frame cost</legend>
        <div class="agents-measure">
          <label class="agents-control">
            <span>Simulated CPU</span>
            <select v-model.number="slowdown" aria-label="Simulated CPU slowdown"><option v-for="value in SLOWDOWNS" :key="value" :value="value">{{ value === 1 ? 'This machine' : `${value}× slower` }}</option></select>
          </label>
          <button type="button" class="agents-run" :disabled="measuring" @click="measure">{{ measuring ? 'Measuring…' : 'Measure' }}</button>
        </div>
        <p v-if="progress" class="agents-note" role="status">{{ progress }}</p>
        <table v-if="results.length" class="agents-results">
          <thead><tr><th>Scenario</th><th>Frames</th><th>fps</th><th>mean</th><th>p95</th><th>max</th><th>Idle</th><th /></tr></thead>
          <tbody>
            <tr v-for="result in results" :key="result.scenario.id">
              <td>{{ result.scenario.label }}<small>{{ result.scenario.cups }} × {{ result.scenario.size }} px</small></td>
              <td>{{ result.move.frames }}</td>
              <td>{{ Math.round(result.move.fps) }}</td>
              <td>{{ ms(result.move.mean) }}</td>
              <td>{{ ms(result.move.p95) }}</td>
              <td>{{ ms(result.move.max) }}</td>
              <td>{{ result.idleFrames }}</td>
              <td><span class="verdict" :data-verdict="result.verdict">{{ result.verdict }}</span></td>
            </tr>
          </tbody>
        </table>
        <p v-if="device" class="agents-note">{{ device.cores }} cores{{ device.memoryGb ? `, ${device.memoryGb} GB` : '' }}, {{ device.pixelRatio }}× screen, {{ device.gpu }}.</p>
        <p class="agents-note">Milliseconds are CPU time to prepare each frame while the cursor moves, at the quality chosen above, times the simulated slowdown (the frame really waits for the extra time). Idle is the number of frames drawn in the two seconds after the cursor stops: it should be 0. GPU time is not visible from a page.</p>
      </fieldset>
    </div>
  </div>
</template>
