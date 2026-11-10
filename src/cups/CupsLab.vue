<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { vessels } from './catalogue'
import { palette } from './palette'
import type { createCupGallery } from './renderer'
import './lab.css'

const canvas = ref<HTMLCanvasElement>()
const stage = ref<HTMLElement>()
const study = ref<'shapes' | 'colours'>('shapes')
const theme = ref<'light' | 'dark'>('light')
const selected = ref('terracotta')
const colour = computed(() => palette.find(option => option.id === selected.value)!)
const preview = computed(() => ({ ...vessels[0]!, colors: { ...colour.value.colors } }))
const shownVessels = computed(() => study.value === 'shapes' ? vessels : [preview.value])
const turning = ref(false)
const elevation = ref(16)
const fallback = ref(false)
const reduced = ref(false)
const ready = ref(false)
const culturalVessels = vessels.filter(vessel => vessel.heritage)
const culturalStart = vessels.findIndex(vessel => vessel.heritage)
let gallery: ReturnType<typeof createCupGallery> | undefined
let disposed = false
let media: MediaQueryList

async function syncMotion() {
  reduced.value = media.matches
  if (media.matches) {
    gallery?.dispose()
    gallery = undefined
    turning.value = false
    ready.value = true
  } else if (!gallery && !fallback.value) {
    try {
      const { createCupGallery } = await import('./renderer')
      if (disposed || media.matches || gallery || !canvas.value || !stage.value) return
      const elements = [...stage.value.querySelectorAll<HTMLElement>('.cup-viewport')]
      gallery = createCupGallery(canvas.value, shownVessels.value.map((vessel, i) => ({
        vessel, element: elements[i]!
      })))
      gallery.setElevation(elevation.value)
      ready.value = true
    } catch {
      fallback.value = true
      ready.value = true
    }
  }
}

// Un seul contexte actif ; changer de couleur ne reconstruit ni géométrie ni moteur.
watch(selected, () => {
  if (study.value === 'colours') gallery?.setColors(0, preview.value.colors)
})
watch(study, async () => {
  gallery?.dispose()
  gallery = undefined
  turning.value = false
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

onMounted(() => {
  document.title = 'Huitaca · Cups lab'
  document.documentElement.lang = 'en'
  media = matchMedia('(prefers-reduced-motion: reduce)')
  media.addEventListener('change', syncMotion)
  void syncMotion()
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
        <button type="button" :aria-pressed="study === 'shapes'" @click="study = 'shapes'"><span>01</span> Shapes</button>
        <button type="button" :aria-pressed="study === 'colours'" @click="study = 'colours'"><span>02</span> Colours</button>
      </nav>

      <section class="cup-study" aria-labelledby="study-title">
        <div class="study-heading">
          <p class="eyebrow">{{ study === 'shapes' ? 'STUDY 01 / FORM' : 'STUDY 02 / COLOUR' }}</p>
          <h1 id="study-title">{{ study === 'shapes' ? 'A little character.' : 'Find its colour.' }}</h1>
          <p class="study-description">{{ study === 'shapes' ? 'Eighteen shapes. Two eyes. Nothing extra.' : 'One shape. Twelve colours. Pick one to try it.' }}</p>
        </div>

        <div :class="{ 'colour-workspace': study === 'colours' }">
          <div ref="stage" class="cup-stage" :class="{ 'single-preview': study === 'colours' }" :data-ready="ready">
            <canvas ref="canvas" class="cup-canvas" :class="{ 'is-hidden': fallback || reduced }" aria-hidden="true" />
            <template v-for="(vessel, i) in shownVessels" :key="`${study}-${vessel.id}`">
              <div v-if="study === 'shapes' && i === culturalStart" class="cup-divider">
                <p class="eyebrow">CULTURAL FORMS</p>
                <h2>Cultural forms.</h2>
                <p>Specific references. Many local variations.</p>
              </div>
              <figure class="cup-item">
                <div class="cup-viewport" role="img" :aria-label="`${vessel.name}, ${study === 'shapes' ? 'grey' : colour.name} with ${vessel.colors.eyes === '#1c1c1a' ? 'dark' : 'white'} eyes${vessel.lid || vessel.parts.some(part => part.id === 'lid') ? ' and a lid' : ' and a dark interior'}`">
                  <img v-if="fallback || reduced" :src="study === 'shapes' ? `/cups/stills/${vessel.id}.png` : `/cups/stills/palette/${selected}.png`" alt="" width="512" height="512" />
                </div>
                <figcaption>
                  <template v-if="study === 'shapes'"><span class="cup-number">{{ String(i + 1).padStart(2, '0') }}</span>{{ vessel.name }}</template>
                  <template v-else>{{ vessel.name }} · {{ colour.name }}</template>
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

        <div class="study-controls">
          <p class="interaction-hint">{{ reduced ? 'Reduced motion · static previews' : fallback ? 'Static previews · WebGL unavailable' : 'Move your cursor. They’re curious.' }}</p>
          <div v-if="!fallback && !reduced" class="controls">
            <label class="angle-control">View angle
              <input aria-label="View angle" type="range" min="0" max="32" step="1" :value="elevation" @input="changeElevation" />
              <output>{{ elevation }}°</output>
            </label>
            <button type="button" :aria-pressed="turning" @click="toggleTurning">{{ turning ? 'Pause turning' : 'Slow turn' }}</button>
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
