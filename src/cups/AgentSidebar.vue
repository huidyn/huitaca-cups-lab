<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  AGENT_LOOK_MAX_BYTES, type AgentLook, defaultAgentLook, MAX_ACCESSORIES, normaliseAgentLook, serialiseAgentLook, toEditorChoice
} from './agent-look'
import { AVATAR_FRAME, flatCup } from './cup2d'
import { editorLook } from './editor'
import { createGovernor, lowerTier, QUALITY, type QualityId, suggestTier } from './quality'
import { createPerformer, type Performer } from './personality'
import { STEAM } from './steam'
import { type BenchResult, deviceInfo, gpuName, runScenario, SCENARIOS, SLOWDOWNS } from './bench'
import type { createCupGallery } from './renderer'
import './agents.css'

// Au repos, les agents regardent vers la droite : vers la conversation, pas vers le curseur.
const REST = { x: 0.6, y: 0 }
// Images de repos déjà faites, pour toute la session (une page qui revient ne les refait pas).
const STILLS: Record<string, string> = {}
// Sans défilement depuis ce délai, les tasses peuvent revivre.
const SCROLL_REST_MS = 160
// Images prises par lot, en rendant la main entre deux : 40 agents ne bloquent pas la page.
const STILL_BATCH = 8
// Le niveau où le juge s'est arrêté, retenu d'une visite à l'autre : on ne refait pas la descente.
const TIER_KEY = 'cups.quality'
type Tier = Exclude<QualityId, 'static'>
function rememberedTier(): Tier | undefined {
  try {
    const value = localStorage.getItem(TIER_KEY)
    return value === 'high' || value === 'balanced' || value === 'low' ? value : undefined
  } catch {
    return undefined
  }
}
function rememberTier(value: Tier) {
  try {
    localStorage.setItem(TIER_KEY, value)
  } catch { /* stockage refusé : on redescendra à la prochaine visite */ }
}
// Une graine par agent, tirée de son identifiant : deux agents ne jouent jamais la même partition.
function seedOf(id: string) {
  let hash = 2166136261
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619)
  return hash >>> 0
}

// Qui réfléchit : des cas d'usage plutôt qu'un nombre. Les agents du haut sont les plus récents,
// donc les plus souvent actifs ; « heavy » en garde un tout en bas, rare mais possible.
type Activity = 'none' | 'light' | 'heavy' | 'all'
const ACTIVITIES: { id: Activity; label: string }[] = [
  { id: 'none', label: 'Nobody' },
  { id: 'light', label: 'Light' },
  { id: 'heavy', label: 'Heavy' },
  { id: 'all', label: 'Everybody' }
]
function thinkingRows(activity: Activity, total: number): number[] {
  if (activity === 'none') return []
  if (activity === 'light') return [0]
  if (activity === 'all') return Array.from({ length: total }, (_, i) => i)
  return [...new Set([0, 1, 3, 4, 7, total - 4])].filter(i => i >= 0 && i < total)
}

const props = withDefaults(defineProps<{ theme?: 'light' | 'dark' }>(), { theme: 'light' })

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
const COUNTS = [10, 20, 40]
const SIZES = [24, 28, 32]
const TIERS: Exclude<QualityId, 'static'>[] = ['high', 'balanced', 'low']

const size = ref(32)
const count = ref(40)
const activity = ref<Activity>('light')
const collapsed = ref(false)
const selected = ref(ROSTER[0]!.id)
const tier = ref<Tier>('high')
const adaptive = ref(true)
const notice = ref('')
const reduced = ref(false)
const fallback = ref(false)
const frames = ref(0)
// Sans WebGL, ou une fois le juge à bout : les tasses SVG, sans canevas.
const flat = computed(() => fallback.value)

const rows = computed(() => Array.from({ length: count.value }, (_, i) => {
  const entry = ROSTER[i] ?? { id: `agent-${i + 1}`, name: `Agent ${i + 1}`, look: defaultAgentLook(`agent-${i + 1}`) }
  const look: AgentLook = normaliseAgentLook(entry.look).look
  const view = editorLook(toEditorChoice(look))
  return { id: entry.id, name: entry.name, look, key: serialiseAgentLook(look), view, flat: flatCup(view.vessel, look.accessories[0], AVATAR_FRAME) }
}))
const current = computed(() => rows.value.find(row => row.id === selected.value) ?? rows.value[0]!)
const stored = computed(() => current.value.key)
const storedIssues = computed(() => normaliseAgentLook(JSON.parse(stored.value)).issues)

// Images de repos : faites par le rendu 3D, une fois par apparence, taille et densité, gardées pour
// la session (elles se déduisent de ce qui est enregistré : rien de plus à stocker).
const density = computed(() => Math.min(window.devicePixelRatio || 1, QUALITY[tier.value].density))
const stills = ref<Record<string, string>>({ ...STILLS })
const stillKey = (row: { key: string }) => `${row.key}|${size.value}|${density.value}`
const still = (row: { key: string }) => flat.value ? undefined : stills.value[stillKey(row)]
// Les rangées dont la tasse est dessinée en 3D en ce moment (survolée, qui réfléchit, ou qui revient au repos).
const live = ref(new Set<number>())
const hovered = ref<number>()
// Pendant que la liste défile, tout est image : une tasse vivante traînerait derrière sa rangée.
const scrolling = ref(false)
const thinking = computed(() => new Set(thinkingRows(activity.value, rows.value.length)))
// Ceux qui réfléchissent en 3D, avec leur personnalité : l'agent ouvert (celui qu'on regarde) et
// celui qu'on survole, pas plus. Deux tasses vivantes au pire, qu'il y ait 10 agents ou 40.
// Tous les autres gardent leur image, avec la vapeur dessinée par-dessus.
const actors = computed(() => {
  const chosen = new Set<number>()
  if (flat.value || reduced.value || scrolling.value) return chosen
  const open = rows.value.findIndex(row => row.id === selected.value)
  for (const index of [open, hovered.value]) {
    if (index !== undefined && index >= 0 && thinking.value.has(index) && still(rows.value[index]!)) chosen.add(index)
  }
  return chosen
})
// Un interprète par agent, créé à la demande, avec sa personnalité et sa propre graine.
const performers = new Map<string, Performer>()
function performerOf(index: number) {
  const row = rows.value[index]!
  let performer = performers.get(row.id)
  if (!performer) {
    performer = createPerformer(seedOf(row.id))
    performer.setPersonality(row.look.personality)
    performers.set(row.id, performer)
  }
  return performer
}
// Ce que le rendu joue en ce moment, pour ne lui dire que les changements.
let acting = new Set<number>()
function cast() {
  if (!gallery) return
  const next = actors.value
  for (const index of acting) {
    if (next.has(index) || index >= rows.value.length) continue
    performerOf(index).setThinking(false)
    gallery.setActing(index, false)
  }
  for (const index of next) {
    if (acting.has(index)) continue
    performerOf(index).setThinking(true)
    gallery.setActing(index, true)
  }
  acting = new Set(next)
}
// Décalage de la vapeur dessinée, propre à chaque rangée : jamais deux volutes au même instant.
const phase = (index: number) => ((index * 0.618) % 1 * 3).toFixed(2)

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
  live.value = new Set()
  acting = new Set()
  hovered.value = undefined
  for (const performer of performers.values()) performer.setThinking(false)
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
      resting: REST,
      steamColor: STEAM.colors[props.theme],
      act: (index, dt, pointer) => performerOf(index).step(dt, pointer),
      onShown: indices => { live.value = new Set(indices) },
      onFrame: sample => {
        if (!adaptive.value) return
        const next = governor.push(sample)
        if (!next) return
        if (next === 'static') {
          notice.value = 'Frames ran over budget at every level: switched to the static cup.'
          fallback.value = true
        } else {
          notice.value = `Frames ran over budget: dropped to ${QUALITY[next].label.toLowerCase()}.`
          tier.value = next
          gallery?.setQuality(next)
        }
      }
    })
    cast()
    await photograph()
  } catch {
    fallback.value = true
  }
}

// Prend les images qui manquent, à la taille et la densité courantes.
async function photograph() {
  const target = gallery
  if (!target) return
  const missing = rows.value.flatMap((row, i) => stills.value[stillKey(row)] ? [] : [i])
  // Du haut vers le bas, par lots : les rangées visibles ont leur image d'abord.
  for (let from = 0; from < missing.length; from += STILL_BATCH) {
    const batch = missing.slice(from, from + STILL_BATCH)
    const asked = size.value
    const keys = batch.map(i => stillKey(rows.value[i]!))
    const urls = await target.snapshot(batch, asked)
    // La taille ou le niveau a changé entre-temps : un autre passage est déjà parti.
    if (target !== gallery || asked !== size.value) return
    const next = { ...stills.value }
    urls.forEach((url, i) => {
      if (!url) return
      next[keys[i]!] = url
      STILLS[keys[i]!] = url
    })
    stills.value = next
    await new Promise<void>(resolve => setTimeout(resolve, 0))
    if (target !== gallery) return
  }
}

// La 3D se prépare quand la page n'a rien d'autre à faire : la première image n'attend pas three.
function soon(callback: () => void) {
  const idle = (window as Window & { requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number }).requestIdleCallback
  if (idle) idle(callback, { timeout: 800 })
  else setTimeout(callback, 0)
}

watch([count, flat], () => { void start() })
watch(tier, value => {
  governor = createGovernor({ start: value })
  gallery?.setQuality(value)
  rememberTier(value)
  void photograph()
})
// La distribution change (cas d'usage, défilement, survol, images prêtes, niveau) : on la donne au rendu.
watch(actors, cast)
watch(() => props.theme, value => gallery?.setSteamColor(STEAM.colors[value]))
// Le panneau replié change la place des tasses sans changer leur taille : on redessine.
watch([collapsed, size], async () => {
  await nextTick()
  gallery?.refresh()
  void photograph()
})

// Survol : seule la rangée sous le curseur s'anime, et seulement une fois son image prête,
// pour que le passage de l'image à la 3D tombe sur la même tasse, au même regard.
function enter(event: PointerEvent, index: number) {
  if (event.pointerType === 'touch' || reduced.value || !gallery || !still(rows.value[index]!)) return
  if (hovered.value !== undefined && hovered.value !== index) gallery.rest(hovered.value)
  hovered.value = index
  // Pendant le défilement, les rangées passent sous le curseur : on retient la dernière, sans la réveiller.
  if (!scrolling.value) gallery.wake(index)
}
function exit(index: number) {
  if (hovered.value === index) hovered.value = undefined
  gallery?.rest(index)
}
// La liste défile sous un canevas fixe, et le navigateur la fait défiler avant que le canevas ne soit
// redessiné : dès le premier mouvement, tout redevient image d'un coup ; la vie reprend à l'arrêt.
let scrollTimer = 0
function scrolled() {
  if (!scrolling.value) {
    scrolling.value = true
    for (const index of acting) performerOf(index).setThinking(false)
    acting = new Set()
    gallery?.sleep()
  }
  clearTimeout(scrollTimer)
  scrollTimer = window.setTimeout(() => {
    scrolling.value = false
    const over = hovered.value
    if (over !== undefined && !reduced.value && rows.value[over] && still(rows.value[over])) gallery?.wake(over)
  }, SCROLL_REST_MS)
}

function syncMotion() {
  reduced.value = media.matches
  if (reduced.value && hovered.value !== undefined) exit(hovered.value)
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
  if (canvas.value) {
    observer = new MutationObserver(() => { frames.value = Number(canvas.value?.dataset.frames ?? 0) })
    observer.observe(canvas.value, { attributes: true, attributeFilter: ['data-frames'] })
  }
  // Indice de départ : ce que l'appareil dit de lui-même, sans dépasser le niveau retenu la dernière fois.
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } }
  const hint = suggestTier({ cores: nav.hardwareConcurrency, memoryGb: nav.deviceMemory, saveData: nav.connection?.saveData })
  const remembered = rememberedTier()
  tier.value = remembered ? lowerTier(hint, remembered) : hint
  soon(() => { void start() })
})
onUnmounted(() => {
  disposed = true
  media?.removeEventListener('change', syncMotion)
  observer?.disconnect()
  clearTimeout(scrollTimer)
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
            <li v-for="(row, index) in rows" :key="row.id">
              <button
                type="button" class="side-agent" :class="{ 'is-current': row.id === selected }" :aria-current="row.id === selected ? 'true' : undefined" :title="collapsed ? row.name : undefined"
                @click="selected = row.id" @pointerenter="enter($event, index)" @pointerleave="exit(index)"
              >
                <span class="agent-cup" :class="{ 'is-live': live.has(index) }" aria-hidden="true">
                  <span v-if="!flat" class="agent-viewport" />
                  <img v-if="still(row)" class="agent-still" :src="still(row)" alt="" draggable="false" />
                  <!-- Il réfléchit sans place vivante : la vapeur est dessinée par-dessus son image. -->
                  <svg v-if="thinking.has(index) && !actors.has(index)" class="agent-steam" viewBox="0 0 32 32" :style="{ '--phase': phase(index) }" focusable="false">
                    <path d="M11 12c-2-2.4 2-3.6 0-6s2-3.2 0.4-5M16 11c2-2.6-2-3.8 0-6.4s-1.6-3 0-4.4M21 12c-1.8-2.2 1.8-3.4 0-5.6s1.8-3 0.2-4.8" />
                  </svg>
                  <svg v-if="!still(row)" class="flat-cup" :viewBox="row.flat.box.join(' ')" :style="{ '--gx': REST.x, '--gy': REST.y }" focusable="false">
                    <path v-for="(shape, i) in row.flat.shapes" :key="i" :d="shape.d" :fill="shape.fill" :stroke="shape.stroke" :stroke-width="shape.width" stroke-linejoin="round" />
                    <g class="flat-eyes">
                      <rect v-for="(eye, i) in row.flat.eyes" :key="i" :x="eye.x" :y="eye.y" :width="eye.width" :height="eye.height" :rx="eye.width / 2" :fill="eye.fill" />
                    </g>
                  </svg>
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
      <p class="agents-caption">{{ flat ? 'Static cups · SVG, no canvas' : `${live.size} live in 3D of ${count} · ${thinking.size} thinking · ${frames} frames drawn` }}</p>
    </div>

    <div class="agents-panel">
      <fieldset class="palette-picker editor-section">
        <legend>Display</legend>
        <div class="agents-controls">
          <div class="agents-control" role="group" aria-label="Cup size">
            <span>Cup</span>
            <div class="segment"><button v-for="value in SIZES" :key="value" type="button" :aria-pressed="size === value" @click="size = value">{{ value }} px</button></div>
          </div>
          <div class="agents-control" role="group" aria-label="Activity">
            <span>Thinking</span>
            <div class="segment"><button v-for="option in ACTIVITIES" :key="option.id" type="button" :aria-pressed="activity === option.id" @click="activity = option.id">{{ option.label }}</button></div>
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
          <p class="agents-note">At rest every agent is a still image of its own 3D cup, looking right. Hovering a row brings that one cup to life in the shared canvas; leaving lets it look back, then hands over to the image again. Nothing is drawn while nobody thinks and the pointer is elsewhere.</p>
          <p class="agents-note">Thinking shows as a light steam drawn over the image. Only two cups can be live with their own personality and real steam: the agent that is open (click one) and the one under the pointer. While the list scrolls, everything is an image.</p>
          <p v-if="reduced" class="agents-note">Reduced motion is on: the cups stay still images, even on hover.</p>
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
