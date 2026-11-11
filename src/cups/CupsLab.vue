<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { vessels } from './catalogue'
import { designCollections } from './designs'
import { palette, paletteVessel } from './palette'
import { bandLayout, designSvg } from './pattern'
import type { createCupGallery } from './renderer'
import type { AccessoryId } from './accessories'
import './lab.css'

type Study = 'shapes' | 'colours' | 'designs' | 'accessories'
const STUDIES: Record<Study, { number: string; label: string; eyebrow: string; title: string; description: string }> = {
  shapes: { number: '01', label: 'Shapes', eyebrow: 'STUDY 01 / FORM', title: 'A little character.', description: 'Eighteen shapes. Two eyes. Nothing extra.' },
  colours: { number: '02', label: 'Colours', eyebrow: 'STUDY 02 / COLOUR', title: 'Find its colour.', description: 'Twelve forms. Twelve colours. Pick a cup to try them.' },
  designs: { number: '03', label: 'Designs', eyebrow: 'STUDY 03 / PATTERN', title: 'Give it a pattern.', description: 'Choose a culture. Three patterns per vessel. Drag the cup to turn it.' },
  accessories: { number: '04', label: 'Accessories', eyebrow: 'STUDY 04 / ACCESSORIES', title: 'Find the right fit.', description: 'Choose any cup. We’ll add accessories one at a time.' }
}
const ACCESSORIES: { id: AccessoryId; name: string }[] = [
  { id: 'paintbrush', name: 'Paintbrush' },
  { id: 'leaf', name: 'Leaf' },
  { id: 'beret', name: 'Beret' },
  { id: 'tea-bag', name: 'Tea tag' },
  { id: 'headphones', name: 'Headphones' },
  { id: 'scarf', name: 'Scarf' }
]

const canvas = ref<HTMLCanvasElement>()
const stage = ref<HTMLElement>()
const study = ref<Study>('shapes')
const theme = ref<'light' | 'dark'>('light')
const selected = ref('terracotta')
const colourCupId = ref(vessels[0]!.id)
const colour = computed(() => palette.find(option => option.id === selected.value)!)
const preview = computed(() => paletteVessel(vessels.find(vessel => vessel.id === colourCupId.value)!, colour.value.colors))
const cultureId = ref(designCollections[0]!.id)
const collection = computed(() => designCollections.find(option => option.id === cultureId.value)!)
const designVessel = computed(() => collection.value.vessel)
const chosenDesigns = ref(Object.fromEntries(designCollections.map(option => [option.id, option.designs[0]!.id])))
const designId = computed({
  get: () => chosenDesigns.value[cultureId.value]!,
  set: (value: string) => { chosenDesigns.value[cultureId.value] = value }
})
const design = computed(() => collection.value.designs.find(option => option.id === designId.value)!)
const accessoryCupId = ref(vessels[0]!.id)
const accessoryId = ref<AccessoryId>(ACCESSORIES[0]!.id)
const BUILT_ACCESSORIES: AccessoryId[] = ['paintbrush', 'beret', 'tea-bag']
// Seuls les accessoires déjà modélisés apparaissent ; les autres laissent la tasse nue.
const shownAccessory = computed(() => study.value === 'accessories' && BUILT_ACCESSORIES.includes(accessoryId.value) && !still.value ? accessoryId.value : undefined)
const accessoryCup = computed(() => vessels.find(vessel => vessel.id === accessoryCupId.value)!)
const cupId = computed({
  get: () => study.value === 'colours' ? colourCupId.value : accessoryCupId.value,
  set: (value: string) => {
    if (study.value === 'colours') colourCupId.value = value
    else accessoryCupId.value = value
  }
})
const shownVessels = computed(() => study.value === 'shapes' ? vessels : study.value === 'colours' ? [preview.value] : study.value === 'designs' ? [designVessel.value] : [accessoryCup.value])
const single = computed(() => study.value !== 'shapes')
const hasCupPicker = computed(() => study.value === 'colours' || study.value === 'accessories')
const manual = computed(() => study.value === 'designs' || study.value === 'accessories')
const turning = ref(false)
const elevation = ref(16)
const turn = ref(0)
const fallback = ref(false)
const reduced = ref(false)
const ready = ref(false)
// La platine reste en 3D avec mouvement réduit : rien ne bouge sans la main de l'utilisateur.
const still = computed(() => fallback.value || (reduced.value && !manual.value))
const elevationRange = computed(() => manual.value ? [-20, 60] : [0, 32])
const everydayVessels = vessels.filter(vessel => !vessel.heritage)
const culturalVessels = vessels.filter(vessel => vessel.heritage)
const culturalStart = vessels.findIndex(vessel => vessel.heritage)
let gallery: ReturnType<typeof createCupGallery> | undefined
let galleryVesselId: string | undefined
let disposed = false
let media: MediaQueryList

// Vignette centrée sur une figure, même lorsque la bande dégage le visage.
const thumbnails = computed(() => {
  const band = designVessel.value.pattern!
  const part = designVessel.value.parts.find(part => part.id === band.surface)!
  const layout = bandLayout(part.outline, band)
  const size = { viewWidth: Math.round(layout.circumference * 1000), viewHeight: Math.round(layout.length * 1000) }
  return Object.fromEntries(collection.value.designs.map(option => {
    const view: [number, number, number, number] = [size.viewWidth * ((option.previewCenter ?? 0) - 0.12), 0, size.viewWidth * 0.24, size.viewHeight]
    return [option.id,
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(designSvg(option.draw(size.viewWidth, size.viewHeight), size.viewWidth, size.viewHeight, [120, 84], collection.value.colors, view))}`]
  }))
})

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
      const { ACCESSORY_FRAME, createCupGallery } = await import('./renderer')
      if (disposed || still.value || gallery || !canvas.value || !stage.value) return
      const elements = [...stage.value.querySelectorAll<HTMLElement>('.cup-viewport')]
      const designs = study.value === 'designs'
      const accessories = study.value === 'accessories'
      gallery = createCupGallery(canvas.value, shownVessels.value.map((vessel, i) => ({
        vessel, element: elements[i]!, design: designs ? design.value : undefined, accessory: accessories ? shownAccessory.value : undefined
      })), {
        turntable: manual.value, initialTurn: accessories ? turn.value : 0, onTurn: degrees => { turn.value = degrees },
        frame: accessories ? ACCESSORY_FRAME : undefined
      })
      galleryVesselId = designs ? designVessel.value.id : undefined
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
  if (study.value === 'designs' && galleryVesselId === designVessel.value.id) gallery?.setDesign(0, design.value)
})
watch([study, cultureId, cupId, shownAccessory], async ([currentStudy, currentCulture, currentCup, currentAccessory], [previousStudy, previousCulture, previousCup, previousAccessory]) => {
  if (currentStudy === previousStudy &&
      !(currentStudy === 'designs' && currentCulture !== previousCulture) &&
      !((currentStudy === 'colours' || currentStudy === 'accessories') && currentCup !== previousCup) &&
      !(currentStudy === 'accessories' && currentAccessory !== previousAccessory)) return
  gallery?.dispose()
  gallery = undefined
  galleryVesselId = undefined
  turning.value = false
  if (currentStudy !== 'accessories' || previousStudy !== 'accessories') turn.value = 0
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
  if (study.value === 'designs') return `${vessel.name} with the ${design.value.name.toLowerCase()} pattern, ${collection.value.colorDescription}, turned ${turn.value} degrees`
  if (study.value === 'accessories') return `${vessel.name}, grey with ${shownAccessory.value ? `a ${ACCESSORIES.find(option => option.id === shownAccessory.value)!.name.toLowerCase()}` : 'no accessories'}${still.value ? '' : `, turned ${turn.value} degrees`}`
  return `${vessel.name}, ${study.value === 'shapes' ? 'grey' : colour.value.name} with ${vessel.colors.eyes === '#1c1c1a' ? 'dark' : 'white'} eyes${vessel.lid || vessel.parts.some(part => part.id === 'lid') ? ' and a lid' : ' and a dark interior'}`
}

function stillSource(vessel: typeof vessels[number]) {
  if (study.value === 'shapes' || study.value === 'accessories') return `/cups/stills/${vessel.id}.png`
  if (study.value === 'colours') return `/cups/stills/palette/${vessel.id === 'mug' ? '' : `${vessel.id}/`}${selected.value}.png`
  return `/cups/stills/designs/${designId.value}.png`
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
        <button v-for="(entry, id) in STUDIES" :key="id" type="button" :aria-pressed="study === id" @click="study = id"><span>{{ entry.number }}</span> {{ entry.label }}</button>
      </nav>

      <section class="cup-study" aria-labelledby="study-title">
        <div class="study-heading">
          <p class="eyebrow">{{ STUDIES[study].eyebrow }}</p>
          <h1 id="study-title">{{ STUDIES[study].title }}</h1>
          <p class="study-description">{{ STUDIES[study].description }}</p>
        </div>

        <div :class="{ 'colour-workspace': single, 'cup-picker-workspace': hasCupPicker }">
          <label v-if="hasCupPicker" class="culture-control cup-control">Cup
            <select v-model="cupId" aria-label="Cup">
              <optgroup label="Everyday forms">
                <option v-for="vessel in everydayVessels" :key="vessel.id" :value="vessel.id">{{ vessel.name }}</option>
              </optgroup>
              <optgroup v-if="study === 'accessories'" label="Cultural forms">
                <option v-for="vessel in culturalVessels" :key="vessel.id" :value="vessel.id">{{ vessel.name }}</option>
              </optgroup>
            </select>
          </label>

          <div ref="stage" class="cup-stage" :class="{ 'single-preview': single }" :data-ready="ready">
            <canvas ref="canvas" class="cup-canvas" :class="{ 'is-hidden': still }" aria-hidden="true" />
            <template v-for="(vessel, i) in shownVessels" :key="`${study}-${vessel.id}`">
              <div v-if="study === 'shapes' && i === culturalStart" class="cup-divider">
                <p class="eyebrow">CULTURAL FORMS</p>
                <h2>Cultural forms.</h2>
                <p>Specific references. Many local variations.</p>
              </div>
              <figure class="cup-item">
                <div v-if="manual && !still" class="cup-viewport is-turntable" role="slider" tabindex="0"
                  aria-label="Turn the cup" aria-valuemin="0" aria-valuemax="359" :aria-valuenow="turn"
                  :aria-valuetext="label(vessel)" />
                <div v-else class="cup-viewport" role="img" :aria-label="label(vessel)">
                  <img v-if="still" :src="stillSource(vessel)" alt="" width="512" height="512" />
                </div>
                <figcaption>
                  <template v-if="study === 'shapes'"><span class="cup-number">{{ String(i + 1).padStart(2, '0') }}</span>{{ vessel.name }}</template>
                  <template v-else-if="study === 'colours'">{{ vessel.name }} · {{ colour.name }}</template>
                  <template v-else-if="study === 'designs'">{{ vessel.name }} · {{ design.name }}</template>
                  <template v-else>{{ vessel.name }}</template>
                  <span v-if="vessel.heritage" class="cup-origin">{{ vessel.heritage.origin }}</span>
                </figcaption>
              </figure>
            </template>
          </div>

          <fieldset v-if="study === 'colours'" class="palette-picker colour-picker">
            <legend>Body colour</legend>
            <div class="palette-options">
              <label v-for="option in palette" :key="option.id" class="palette-option" :class="{ 'is-selected': selected === option.id }">
                <input v-model="selected" type="radio" name="cup-colour" :value="option.id" :aria-label="option.name" />
                <span class="colour-swatch" :style="{ backgroundColor: option.colors.body }" aria-hidden="true" />
                <span>{{ option.name }}<small>{{ option.colors.body.toUpperCase() }}</small></span>
              </label>
            </div>
            <p class="palette-note">{{ colourCupId === 'takeaway' ? 'The lid stays light grey. The body, inside and eyes follow your choice.' : 'The inside, rim and eyes follow your choice.' }}</p>
          </fieldset>

          <div v-if="study === 'designs'" class="palette-picker design-picker">
            <label class="culture-control">Culture / vessel
              <select v-model="cultureId" aria-label="Culture / vessel">
                <option v-for="option in designCollections" :key="option.id" :value="option.id">{{ option.label }}</option>
              </select>
            </label>
            <fieldset class="palette-picker">
              <legend>Pattern</legend>
              <div class="design-options">
                <label v-for="option in collection.designs" :key="option.id" class="palette-option design-option" :class="{ 'is-selected': designId === option.id }">
                  <input v-model="designId" type="radio" name="cup-design" :value="option.id" :aria-label="option.name" />
                  <img class="design-swatch" :src="thumbnails[option.id]" alt="" width="120" height="84" />
                  <span>{{ option.name }}<small>{{ option.nativeName }}</small></span>
                </label>
              </div>
            </fieldset>
            <p class="palette-note">Bold shapes for small avatars. One ink on the body, with colours kept separate from the pattern.</p>
          </div>

          <div v-if="study === 'accessories'" class="accessory-picker">
            <fieldset class="palette-picker">
              <legend>Accessory</legend>
              <div class="design-options">
                <label v-for="option in ACCESSORIES" :key="option.id" class="palette-option accessory-option" :class="{ 'is-selected': accessoryId === option.id }">
                  <input v-model="accessoryId" type="radio" name="cup-accessory" :value="option.id" :aria-label="option.name" />
                  <span>{{ option.name }}</span>
                </label>
              </div>
            </fieldset>
            <p class="palette-note">{{ accessoryId === 'paintbrush' ? 'Bristles out. The handle rests on the bottom and the right opening edge. The gaiwan lid rests against the brush.' : accessoryId === 'beret' ? 'A soft red beret, slouched to one side. The band rests on the rim, over the existing lid where present.' : accessoryId === 'tea-bag' ? 'A yellow tea tag on the left, clear of both eyes. The string flattens under lids, leaving only a tiny gap.' : 'Not modelled yet. Accessory previews are added one at a time.' }}</p>
          </div>
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
            <template v-for="option in collection.designs" :key="option.id">
              <dt>{{ option.name }} · {{ option.nativeName }}</dt>
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
          <p class="interaction-hint">{{ fallback ? 'Static previews · WebGL unavailable' : manual ? 'Drag the cup to turn it. Arrow keys work too.' : reduced ? 'Reduced motion · static previews' : 'Move your cursor. They’re curious.' }}</p>
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
