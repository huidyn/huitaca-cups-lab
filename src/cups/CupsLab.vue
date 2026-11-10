<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { vessels } from './catalogue'
import { designColors, yunomiDesigns } from './designs'
import { palette } from './palette'
import { bandLayout, designSvg } from './pattern'
import type { createCupGallery } from './renderer'
import './lab.css'

type Study = 'shapes' | 'colours' | 'designs'
const STUDIES: Record<Study, { number: string; label: string; eyebrow: string; title: string; description: string }> = {
  shapes: { number: '01', label: 'Shapes', eyebrow: 'STUDY 01 / FORM', title: 'A little character.', description: 'Eighteen shapes. Two eyes. Nothing extra.' },
  colours: { number: '02', label: 'Colours', eyebrow: 'STUDY 02 / COLOUR', title: 'Find its colour.', description: 'One shape. Twelve colours. Pick one to try it.' },
  designs: { number: '03', label: 'Designs', eyebrow: 'STUDY 03 / PATTERN', title: 'Give it a pattern.', description: 'One yunomi. Three Japanese patterns. Drag the cup to turn it.' }
}

const canvas = ref<HTMLCanvasElement>()
const stage = ref<HTMLElement>()
const study = ref<Study>('shapes')
const theme = ref<'light' | 'dark'>('light')
const selected = ref('terracotta')
const colour = computed(() => palette.find(option => option.id === selected.value)!)
const preview = computed(() => ({ ...vessels[0]!, colors: { ...colour.value.colors } }))
const yunomi = vessels.find(vessel => vessel.id === 'yunomi')!
const designVessel = { ...yunomi, face: { ...yunomi.face, centerY: 1.12 }, colors: { ...designColors } }
const designId = ref(yunomiDesigns[0]!.id)
const design = computed(() => yunomiDesigns.find(option => option.id === designId.value)!)
const shownVessels = computed(() => study.value === 'shapes' ? vessels : study.value === 'colours' ? [preview.value] : [designVessel])
const single = computed(() => study.value !== 'shapes')
const turning = ref(false)
const elevation = ref(16)
const turn = ref(0)
const fallback = ref(false)
const reduced = ref(false)
const ready = ref(false)
// La platine reste en 3D avec mouvement réduit : rien ne bouge sans la main de l'utilisateur.
const still = computed(() => fallback.value || (reduced.value && study.value !== 'designs'))
const elevationRange = computed(() => study.value === 'designs' ? [-20, 60] : [0, 32])
const culturalVessels = vessels.filter(vessel => vessel.heritage)
const culturalStart = vessels.findIndex(vessel => vessel.heritage)
let gallery: ReturnType<typeof createCupGallery> | undefined
let disposed = false
let media: MediaQueryList

// Vignette du motif à plat, centrée sous le visage, dans les vraies couleurs.
const thumbnails = ref<Record<string, string>>({})
function drawThumbnails() {
  const band = designVessel.pattern!
  const part = designVessel.parts.find(part => part.id === band.surface)!
  const layout = bandLayout(part.outline, band)
  const size = { viewWidth: Math.round(layout.circumference * 1000), viewHeight: Math.round(layout.length * 1000) }
  const view: [number, number, number, number] = [-size.viewWidth * 0.12, 0, size.viewWidth * 0.24, size.viewHeight]
  thumbnails.value = Object.fromEntries(yunomiDesigns.map(option => [option.id,
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(designSvg(option.draw(size.viewWidth, size.viewHeight), size.viewWidth, size.viewHeight, [120, 84], designColors, view))}`]))
}

async function syncMotion() {
  reduced.value = media.matches
  if (media.matches) {
    turning.value = false
    gallery?.setTurning(false)
  }
  if (still.value) {
    gallery?.dispose()
    gallery = undefined
    ready.value = true
  } else if (!gallery) {
    try {
      const { createCupGallery } = await import('./renderer')
      if (disposed || still.value || gallery || !canvas.value || !stage.value) return
      const elements = [...stage.value.querySelectorAll<HTMLElement>('.cup-viewport')]
      const designs = study.value === 'designs'
      gallery = createCupGallery(canvas.value, shownVessels.value.map((vessel, i) => ({
        vessel, element: elements[i]!, design: designs ? design.value : undefined
      })), { turntable: designs, onTurn: degrees => { turn.value = degrees } })
      gallery.setElevation(elevation.value)
      ready.value = true
    } catch {
      fallback.value = true
      ready.value = true
    }
  }
}

// Un seul contexte actif ; changer de couleur ou de motif ne reconstruit ni géométrie ni moteur.
watch(selected, () => {
  if (study.value === 'colours') gallery?.setColors(0, preview.value.colors)
})
watch(design, () => {
  if (study.value === 'designs') gallery?.setDesign(0, design.value)
})
watch(study, async () => {
  gallery?.dispose()
  gallery = undefined
  turning.value = false
  turn.value = 0
  const [min, max] = elevationRange.value
  elevation.value = Math.max(min!, Math.min(max!, elevation.value))
  ready.value = false
  await nextTick()
  if (!disposed) await syncMotion()
})

function toggleTurning() {
  turning.value = !turning.value
  gallery?.setTurning(turning.value)
}

function changeElevation(event: Event) {
  elevation.value = Number((event.target as HTMLInputElement).value)
  gallery?.setElevation(elevation.value)
}

function label(vessel: typeof vessels[number]) {
  if (study.value === 'designs') return `${vessel.name} with the ${design.value.name.toLowerCase()} pattern, cream on navy, turned ${turn.value} degrees`
  return `${vessel.name}, ${study.value === 'shapes' ? 'grey' : colour.value.name} with ${vessel.colors.eyes === '#1c1c1a' ? 'dark' : 'white'} eyes${vessel.lid || vessel.parts.some(part => part.id === 'lid') ? ' and a lid' : ' and a dark interior'}`
}

function stillSource(vessel: typeof vessels[number]) {
  if (study.value === 'shapes') return `/cups/stills/${vessel.id}.png`
  if (study.value === 'colours') return `/cups/stills/palette/${selected.value}.png`
  return `/cups/stills/designs/${designId.value}.png`
}

onMounted(() => {
  document.title = 'Huitaca · Cups lab'
  document.documentElement.lang = 'en'
  media = matchMedia('(prefers-reduced-motion: reduce)')
  media.addEventListener('change', syncMotion)
  void syncMotion()
  drawThumbnails()
})

onUnmounted(() => {
  disposed = true
  media?.removeEventListener('change', syncMotion)
  gallery?.dispose()
})
</script>

<template>
  <main class="cups-lab" :data-theme="theme">
    <header class="lab-header">
      <a class="lab-wordmark" href="/cups">huitaca<span> / cups lab</span></a>
      <div class="lab-header-actions">
        <div class="theme-control" role="group" aria-label="Colour mode">
          <button type="button" :aria-pressed="theme === 'light'" @click="theme = 'light'">Light</button>
          <button type="button" :aria-pressed="theme === 'dark'" @click="theme = 'dark'">Dark</button>
        </div>
        <a class="original-link" href="/">Original 2D lab ↗</a>
      </div>
    </header>

    <div class="lab-layout">
      <nav class="study-nav" aria-label="Studies">
        <button v-for="(entry, id) in STUDIES" :key="id" type="button" :aria-pressed="study === id" @click="study = id"><span>{{ entry.number }}</span> {{ entry.label }}</button>
      </nav>

      <section class="cup-study" aria-labelledby="study-title">
        <div class="study-heading">
          <p class="eyebrow">{{ STUDIES[study].eyebrow }}</p>
          <h1 id="study-title">{{ STUDIES[study].title }}</h1>
          <p class="study-description">{{ STUDIES[study].description }}</p>
        </div>

        <div :class="{ 'colour-workspace': single }">
          <div ref="stage" class="cup-stage" :class="{ 'single-preview': single }" :data-ready="ready">
            <canvas ref="canvas" class="cup-canvas" :class="{ 'is-hidden': still }" aria-hidden="true" />
            <template v-for="(vessel, i) in shownVessels" :key="`${study}-${vessel.id}`">
              <div v-if="study === 'shapes' && i === culturalStart" class="cup-divider">
                <p class="eyebrow">CULTURAL FORMS</p>
                <h2>Cultural forms.</h2>
                <p>Specific references. Many local variations.</p>
              </div>
              <figure class="cup-item">
                <div v-if="study === 'designs' && !still" class="cup-viewport is-turntable" role="slider" tabindex="0"
                  aria-label="Turn the cup" aria-valuemin="0" aria-valuemax="359" :aria-valuenow="turn"
                  :aria-valuetext="label(vessel)" />
                <div v-else class="cup-viewport" role="img" :aria-label="label(vessel)">
                  <img v-if="still" :src="stillSource(vessel)" alt="" width="512" height="512" />
                </div>
                <figcaption>
                  <template v-if="study === 'shapes'"><span class="cup-number">{{ String(i + 1).padStart(2, '0') }}</span>{{ vessel.name }}</template>
                  <template v-else-if="study === 'colours'">{{ vessel.name }} · {{ colour.name }}</template>
                  <template v-else>{{ vessel.name }} · {{ design.name }}</template>
                  <span v-if="vessel.heritage" class="cup-origin">{{ vessel.heritage.origin }}</span>
                </figcaption>
              </figure>
            </template>
          </div>

          <fieldset v-if="study === 'colours'" class="palette-picker">
            <legend>Body colour</legend>
            <div class="palette-options">
              <label v-for="option in palette" :key="option.id" class="palette-option" :class="{ 'is-selected': selected === option.id }">
                <input v-model="selected" type="radio" name="cup-colour" :value="option.id" :aria-label="option.name" />
                <span class="colour-swatch" :style="{ backgroundColor: option.colors.body }" aria-hidden="true" />
                <span>{{ option.name }}<small>{{ option.colors.body.toUpperCase() }}</small></span>
              </label>
            </div>
            <p class="palette-note">The inside, rim and eyes follow your choice.</p>
          </fieldset>

          <fieldset v-if="study === 'designs'" class="palette-picker design-picker">
            <legend>Pattern</legend>
            <div class="design-options">
              <label v-for="option in yunomiDesigns" :key="option.id" class="palette-option design-option" :class="{ 'is-selected': designId === option.id }">
                <input v-model="designId" type="radio" name="cup-design" :value="option.id" :aria-label="option.name" />
                <img class="design-swatch" :src="thumbnails[option.id]" alt="" width="120" height="84" />
                <span>{{ option.name }}<small>{{ option.japanese }}</small></span>
              </label>
            </div>
            <p class="palette-note">Bold shapes for small avatars. One ink on the body, with colours kept separate from the pattern.</p>
          </fieldset>
        </div>

        <details v-if="study === 'shapes'" class="culture-sources">
          <summary>Form notes &amp; sources</summary>
          <dl>
            <template v-for="vessel in culturalVessels" :key="vessel.id">
              <dt>{{ vessel.name }} · {{ vessel.heritage!.origin }}</dt>
              <dd>
                <p>{{ vessel.heritage!.note }}</p>
                <ul>
                  <li v-for="source in vessel.heritage!.sources" :key="source.url">
                    <a :href="source.url" target="_blank" rel="noreferrer">{{ source.title }} ↗</a>
                  </li>
                </ul>
              </dd>
            </template>
          </dl>
        </details>

        <details v-if="study === 'designs'" class="culture-sources">
          <summary>Pattern notes &amp; sources</summary>
          <dl>
            <template v-for="option in yunomiDesigns" :key="option.id">
              <dt>{{ option.name }} · {{ option.japanese }}</dt>
              <dd>
                <p>{{ option.note }}</p>
                <ul>
                  <li v-for="source in option.sources" :key="source.url">
                    <a :href="source.url" target="_blank" rel="noreferrer">{{ source.title }} ↗</a>
                  </li>
                </ul>
              </dd>
            </template>
          </dl>
        </details>

        <div class="study-controls">
          <p class="interaction-hint">{{ fallback ? 'Static previews · WebGL unavailable' : study === 'designs' ? 'Drag the cup to turn it. Arrow keys work too.' : reduced ? 'Reduced motion · static previews' : 'Move your cursor. They’re curious.' }}</p>
          <div v-if="!still" class="controls">
            <label class="angle-control">View angle
              <input aria-label="View angle" type="range" :min="elevationRange[0]" :max="elevationRange[1]" step="1" :value="elevation" @input="changeElevation" />
              <output>{{ elevation }}°</output>
            </label>
            <button v-if="!reduced" type="button" :aria-pressed="turning" @click="toggleTurning">{{ turning ? 'Pause turning' : 'Slow turn' }}</button>
          </div>
        </div>
      </section>
    </div>

    <footer class="lab-footer">
      <span>OUTLINES → VOLUMES</span>
      <span>Flat colour. Dark inside. No lighting.</span>
    </footer>
  </main>
</template>
