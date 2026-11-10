<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { vessels } from './catalogue'
import type { createCupGallery } from './renderer'
import './lab.css'

const canvas = ref<HTMLCanvasElement>()
const stage = ref<HTMLElement>()
const turning = ref(false)
const elevation = ref(16)
const fallback = ref(false)
const reduced = ref(false)
const ready = ref(false)
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
      gallery = createCupGallery(canvas.value, vessels.map((vessel, i) => ({
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
  <main class="cups-lab">
    <header class="lab-header">
      <a class="lab-wordmark" href="/cups">huitaca<span> / cups lab</span></a>
      <a class="original-link" href="/">Original 2D lab ↗</a>
    </header>

    <section class="cup-study" aria-labelledby="study-title">
      <div class="study-heading">
        <p class="eyebrow">STUDY 01 / FORM</p>
        <h1 id="study-title">A little character.</h1>
        <p class="study-description">Twelve shapes. Two eyes. Nothing extra.</p>
      </div>

      <div ref="stage" class="cup-stage" :data-ready="ready">
        <canvas ref="canvas" class="cup-canvas" :class="{ 'is-hidden': fallback || reduced }" aria-hidden="true" />
        <figure v-for="(vessel, i) in vessels" :key="vessel.id" class="cup-item">
          <div class="cup-viewport" role="img" :aria-label="`${vessel.name}, grey with white eyes${vessel.id === 'takeaway' ? ' and a lid' : ' and a dark interior'}`">
            <img v-if="fallback || reduced" :src="`/cups/stills/${vessel.id}.png`" alt="" width="512" height="512" />
          </div>
          <figcaption><span class="cup-number">{{ String(i + 1).padStart(2, '0') }}</span>{{ vessel.name }}</figcaption>
        </figure>
      </div>

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

    <footer class="lab-footer">
      <span>OUTLINES → VOLUMES</span>
      <span>Flat colour. Dark inside. No lighting.</span>
    </footer>
  </main>
</template>
