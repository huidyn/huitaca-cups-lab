<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { vessels } from './catalogue'
import { designCollections } from './designs'
import { palette, paletteVessel } from './palette'
import { bandLayout, designSvg } from './pattern'
import type { createCupGallery } from './renderer'
import type { AccessoryId } from './accessories'
import { collectionFor, DEFAULT_COLOUR, defaultDesign, editorLook, PLAIN } from './editor'
import { EXPRESSION_BY_ID, expressionGlyph, type ExpressionId, EXPRESSIONS } from './expressions'
import { createPerformer, DEFAULT_PERSONALITY, PERSONALITIES, type PersonalityId } from './personality'
import './lab.css'

type Study = 'shapes' | 'colours' | 'designs' | 'accessories' | 'editor' | 'expressions' | 'personalities'
const STUDIES: Record<Study, { number: string; label: string; eyebrow: string; title: string; description: string }> = {
  shapes: { number: '01', label: 'Shapes', eyebrow: 'STUDY 01 / FORM', title: 'A little character.', description: 'Eighteen shapes. Two eyes. Nothing extra.' },
  colours: { number: '02', label: 'Colours', eyebrow: 'STUDY 02 / COLOUR', title: 'Find its colour.', description: 'Twelve forms. Twelve colours. Pick a cup to try them.' },
  designs: { number: '03', label: 'Designs', eyebrow: 'STUDY 03 / PATTERN', title: 'Give it a pattern.', description: 'Choose a culture. Three patterns per vessel. Drag the cup to turn it.' },
  accessories: { number: '04', label: 'Accessories', eyebrow: 'STUDY 04 / ACCESSORIES', title: 'Find the right fit.', description: 'Choose any cup. We’ll add accessories one at a time.' },
  editor: { number: '05', label: 'Editor', eyebrow: 'STUDY 05 / EDITOR', title: 'Make it yours.', description: 'A shape, a colour or a pattern, and an accessory. Everything follows your cursor.' },
  expressions: { number: '06', label: 'Expressions', eyebrow: 'STUDY 06 / EXPRESSION', title: 'Two eyes say it all.', description: 'Sixteen expressions an agent can pick from, on the cup from your editor.' },
  personalities: { number: '07', label: 'Personalities', eyebrow: 'STUDY 07 / PERSONALITY', title: 'Same feeling, its own way.', description: 'The agent picks the expression. The personality decides how it is played.' }
}
// Une conversation jouée en boucle : écouter, réfléchir, répondre avec une expression.
const EXCHANGES: { user: string; expression: ExpressionId; reply: string }[] = [
  { user: 'I got the job!', expression: 'delighted', reply: 'That is wonderful news. Congratulations!' },
  { user: 'Can you plan my week?', expression: 'focused', reply: 'On it. Three work blocks, two real breaks.' },
  { user: 'Guess what I found in the attic.', expression: 'curious', reply: 'Go on…' },
  { user: 'Actually, cancel all of it.', expression: 'surprised', reply: 'Oh. All of it?' },
  { user: 'My flight got delayed again.', expression: 'sad', reply: 'That is rough. Let’s find you another one.' },
  { user: 'Is this a good deal?', expression: 'skeptical', reply: 'Hmm. The fine print says otherwise.' },
  { user: 'You are the best.', expression: 'shy', reply: 'Oh. Thank you.' },
  { user: 'We shipped it!', expression: 'excited', reply: 'Yes! Tell me everything.' },
  { user: 'Does this sentence make sense?', expression: 'confused', reply: 'Not quite. Which part is the verb?' },
  { user: 'Thanks, that fixed it.', expression: 'happy', reply: 'Glad it worked.' }
]
type Phase = 'idle' | 'listening' | 'thinking' | 'replying'
const PHASES: Record<Phase, { next: Phase; ms: number }> = {
  idle: { next: 'listening', ms: 2600 },
  listening: { next: 'thinking', ms: 1800 },
  thinking: { next: 'replying', ms: 2800 },
  replying: { next: 'idle', ms: 3600 }
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
type EditorTab = 'vessel' | 'finish' | 'accessory'
// Le deuxième onglet s'appelle Colour ou Pattern selon la tasse choisie.
const editorTabs = computed<{ id: EditorTab; label: string }[]>(() => [
  { id: 'vessel', label: 'Vessel' },
  { id: 'finish', label: editorCollection.value ? 'Pattern' : 'Colour' },
  { id: 'accessory', label: 'Accessory' }
])
const editorTab = ref<EditorTab>('vessel')
const editorCupId = ref(vessels[0]!.id)
const editorColourId = ref(DEFAULT_COLOUR)
const editorDesignId = ref(defaultDesign(vessels[0]!.id))
const editorAccessory = ref<AccessoryId | typeof PLAIN>(PLAIN)
const editorCollection = computed(() => collectionFor(editorCupId.value))
let gallery: ReturnType<typeof createCupGallery> | undefined
// Les pages 06 et 07 montrent la tasse de l'éditeur, en train de jouer.
const expressionId = ref<ExpressionId>('neutral')
const personalityId = ref<PersonalityId>(DEFAULT_PERSONALITY)
const playing = ref(true)
const phase = ref<Phase>('idle')
const exchange = ref(-1)
const performer = createPerformer()
const glyphs = Object.fromEntries(EXPRESSIONS.map(option => [option.id, expressionGlyph(option)]))
const restGlyphs = Object.fromEntries(PERSONALITIES.map(option => [option.id, expressionGlyph(option.rest)]))
const emotive = computed(() => study.value === 'expressions' || study.value === 'personalities')
const conversing = computed(() => study.value === 'personalities' && playing.value)
const isThinking = computed(() => conversing.value && phase.value === 'thinking')
// Ce que l'agent a choisi de montrer à cet instant.
const acted = computed<ExpressionId>(() => !conversing.value ? expressionId.value
  : phase.value === 'listening' ? 'attentive' : phase.value === 'replying' ? EXCHANGES[exchange.value]!.expression : 'neutral')
const actedName = computed(() => isThinking.value ? 'Thinking' : EXPRESSION_BY_ID.get(acted.value)!.name)
let phaseTimer: ReturnType<typeof setTimeout> | undefined
watch([conversing, phase], () => {
  clearTimeout(phaseTimer)
  if (!conversing.value) return
  phaseTimer = setTimeout(() => {
    const next = PHASES[phase.value].next
    if (next === 'listening') exchange.value = (exchange.value + 1) % EXCHANGES.length
    phase.value = next
  }, PHASES[phase.value].ms)
}, { immediate: true })
watch([study, acted, isThinking, personalityId], () => {
  // La planche des expressions tient la pose, dans la personnalité par défaut.
  performer.setPersonality(study.value === 'personalities' ? personalityId.value : DEFAULT_PERSONALITY)
  performer.setIdle(study.value === 'personalities')
  performer.express(acted.value)
  performer.setThinking(isThinking.value)
  gallery?.refresh()
}, { immediate: true })
function tryExpression(id: ExpressionId) {
  expressionId.value = id
  playing.value = false
}
function toggleConversation() {
  playing.value = !playing.value
  if (playing.value) phase.value = 'idle'
}
// Chaque tasse repart de son option par défaut : une tasse culturelle ne garde pas la
// couleur de la précédente, et le motif d'une autre tasse ne s'applique pas. D'une tasse
// ordinaire à une autre, la couleur choisie reste, pour l'essayer sur plusieurs formes.
watch(editorCupId, () => {
  if (editorCollection.value) editorColourId.value = DEFAULT_COLOUR
  if (!editorCollection.value?.designs.some(option => option.id === editorDesignId.value)) editorDesignId.value = defaultDesign(editorCupId.value)
})
const look = computed(() => editorLook({ cupId: editorCupId.value, colourId: editorColourId.value, designId: editorDesignId.value, accessory: editorAccessory.value }))
const BUILT_ACCESSORIES: AccessoryId[] = ['paintbrush', 'leaf', 'beret', 'tea-bag', 'headphones', 'scarf']
// Seuls les accessoires déjà modélisés apparaissent ; les autres laissent la tasse nue.
const shownAccessory = computed(() => study.value === 'editor' || emotive.value ? look.value.accessory
  : study.value === 'accessories' && BUILT_ACCESSORIES.includes(accessoryId.value) && !still.value ? accessoryId.value : undefined)
const accessoryCup = computed(() => vessels.find(vessel => vessel.id === accessoryCupId.value)!)
const cupId = computed({
  get: () => study.value === 'colours' ? colourCupId.value : study.value === 'editor' ? editorCupId.value : accessoryCupId.value,
  set: (value: string) => {
    if (study.value === 'colours') colourCupId.value = value
    else if (study.value === 'editor') editorCupId.value = value
    else accessoryCupId.value = value
  }
})
const shownVessels = computed(() => study.value === 'shapes' ? vessels : study.value === 'colours' ? [preview.value]
  : study.value === 'designs' ? [designVessel.value] : study.value === 'editor' || emotive.value ? [look.value.vessel] : [accessoryCup.value])
const single = computed(() => study.value !== 'shapes')
const hasCupPicker = computed(() => study.value === 'colours' || study.value === 'accessories')
const editing = computed(() => study.value === 'editor')
const manual = computed(() => study.value === 'designs' || study.value === 'accessories')
const turning = ref(false)
const elevation = ref(8)
const turn = ref(0)
const fallback = ref(false)
const reduced = ref(false)
const ready = ref(false)
// La platine reste en 3D avec mouvement réduit : rien ne bouge sans la main de l'utilisateur.
const still = computed(() => fallback.value || (reduced.value && !manual.value && !editing.value && !emotive.value))
const elevationRange = computed(() => manual.value ? [-20, 60] : [0, 32])
const everydayVessels = vessels.filter(vessel => !vessel.heritage)
const culturalVessels = vessels.filter(vessel => vessel.heritage)
const culturalStart = vessels.findIndex(vessel => vessel.heritage)
let galleryVesselId: string | undefined
let disposed = false
let media: MediaQueryList

// Vignette centrée sur une figure, même lorsque la bande dégage le visage.
function designThumbnails(current: typeof collection.value) {
  const band = current.vessel.pattern!
  const part = current.vessel.parts.find(part => part.id === band.surface)!
  const layout = bandLayout(part.outline, band)
  const size = { viewWidth: Math.round(layout.circumference * 1000), viewHeight: Math.round(layout.length * 1000) }
  return Object.fromEntries(current.designs.map(option => {
    const view: [number, number, number, number] = [size.viewWidth * ((option.previewCenter ?? 0) - 0.12), 0, size.viewWidth * 0.24, size.viewHeight]
    return [option.id,
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(designSvg(option.draw(size.viewWidth, size.viewHeight), size.viewWidth, size.viewHeight, [120, 84], current.colors, view))}`]
  }))
}
const thumbnails = computed(() => designThumbnails(collection.value))
const editorThumbnails = computed<Record<string, string>>(() => editorCollection.value ? designThumbnails(editorCollection.value) : {})

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
      const editor = study.value === 'editor' || emotive.value
      // La tasse qui joue est dessinée deux fois : en grand, et à la taille de la barre latérale.
      const cups = emotive.value ? elements.map(() => look.value.vessel) : shownVessels.value
      gallery = createCupGallery(canvas.value, cups.map((vessel, i) => ({
        vessel, element: elements[i]!, fitVessel: editor ? look.value.fitVessel : undefined,
        design: designs ? design.value : editor ? look.value.design : undefined,
        accessory: accessories || editor ? shownAccessory.value : undefined
      })), {
        turntable: manual.value, initialTurn: accessories ? turn.value : 0, onTurn: degrees => { turn.value = degrees },
        frame: accessories || editor ? ACCESSORY_FRAME : undefined,
        perform: emotive.value ? (dt, pointer, motionless) => performer.step(dt, pointer, motionless) : undefined
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
// Dans l'éditeur, la scène n'est reconstruite que si la structure change ; une autre
// couleur ou un autre motif de la même tasse se règle en place.
watch(() => look.value.vessel.colors, colors => {
  if ((study.value === 'editor' || emotive.value) && !look.value.design) gallery?.setColors(0, colors)
})
watch(() => look.value.design, current => {
  if ((study.value === 'editor' || emotive.value) && current) gallery?.setDesign(0, current)
})
watch([study, cultureId, cupId, shownAccessory, () => look.value.key], async ([currentStudy, currentCulture, currentCup, currentAccessory, currentKey], [previousStudy, previousCulture, previousCup, previousAccessory, previousKey]) => {
  if (currentStudy === previousStudy &&
      !(currentStudy === 'designs' && currentCulture !== previousCulture) &&
      !((currentStudy === 'colours' || currentStudy === 'accessories') && currentCup !== previousCup) &&
      !(currentStudy === 'accessories' && currentAccessory !== previousAccessory) &&
      !((currentStudy === 'editor' || currentStudy === 'expressions' || currentStudy === 'personalities') && currentKey !== previousKey)) return
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

function editorLabel(vessel: typeof vessels[number]) {
  const colour = palette.find(option => option.id === editorColourId.value)
  const finish = look.value.design ? `${look.value.design.name} pattern` : (colour ?? palette.find(option => option.id === DEFAULT_COLOUR)!).name.toLowerCase()
  const accessory = ACCESSORIES.find(option => option.id === look.value.accessory)
  return [vessel.name, finish, ...(accessory ? [`with ${accessory.id === 'headphones' ? 'headphones' : `a ${accessory.name.toLowerCase()}`}`] : [])].join(', ')
}

function label(vessel: typeof vessels[number]) {
  if (study.value === 'editor') return editorLabel(vessel)
  if (emotive.value) return `${editorLabel(vessel)}, ${isThinking.value ? 'thinking, with steam rising' : `looking ${actedName.value.toLowerCase()}`}`
  if (study.value === 'designs') return `${vessel.name} with the ${design.value.name.toLowerCase()} pattern, ${collection.value.colorDescription}, turned ${turn.value} degrees`
  if (study.value === 'accessories') return `${vessel.name}, grey with ${shownAccessory.value ? `a ${shownAccessory.value === 'headphones' ? 'pair of headphones' : ACCESSORIES.find(option => option.id === shownAccessory.value)!.name.toLowerCase()}` : 'no accessories'}${still.value ? '' : `, turned ${turn.value} degrees`}`
  return `${vessel.name}, ${study.value === 'shapes' ? 'grey' : colour.value.name} with ${vessel.colors.eyes === '#1c1c1a' ? 'dark' : 'white'} eyes${vessel.lid || vessel.parts.some(part => part.id === 'lid') ? ' and a lid' : ' and a dark interior'}`
}

function stillSource(vessel: typeof vessels[number]) {
  if (study.value === 'shapes' || study.value === 'accessories' || study.value === 'editor' || emotive.value) return `/cups/stills/${vessel.id}.png`
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
  clearTimeout(phaseTimer)
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

        <div :class="{ 'colour-workspace': single, 'cup-picker-workspace': hasCupPicker, 'editor-workspace': editing || emotive }">
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
                  <template v-else-if="study === 'editor'">{{ vessel.name }}</template>
                  <template v-else-if="emotive">{{ vessel.name }} · {{ actedName }}</template>
                  <template v-else>{{ vessel.name }}</template>
                  <span v-if="vessel.heritage" class="cup-origin">{{ vessel.heritage.origin }}</span>
                </figcaption>
              </figure>
            </template>
            <div v-if="emotive && !still" class="cup-mini">
              <div class="cup-viewport" role="img" aria-label="The same cup at sidebar size, 48 pixels" />
              <span>48 px</span>
            </div>
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

          <div v-if="editing" class="editor-panel">
            <div class="editor-tabs" role="group" aria-label="Edit">
              <button v-for="tab in editorTabs" :key="tab.id" type="button" :aria-pressed="editorTab === tab.id" @click="editorTab = tab.id">{{ tab.label }}</button>
            </div>

            <fieldset v-show="editorTab === 'vessel'" class="palette-picker editor-section">
              <legend>Vessel</legend>
              <p class="editor-group">Basic vessels</p>
              <div class="editor-grid">
                <label v-for="vessel in everydayVessels" :key="vessel.id" class="editor-tile" :class="{ 'is-selected': editorCupId === vessel.id }">
                  <input v-model="editorCupId" type="radio" name="editor-vessel" :value="vessel.id" :aria-label="vessel.name" />
                  <img :src="`/cups/stills/${vessel.id}.png`" alt="" width="64" height="64" loading="lazy" />
                </label>
              </div>
              <p class="editor-group">Cultural vessels</p>
              <div class="editor-grid">
                <label v-for="vessel in culturalVessels" :key="vessel.id" class="editor-tile" :class="{ 'is-selected': editorCupId === vessel.id }">
                  <input v-model="editorCupId" type="radio" name="editor-vessel" :value="vessel.id" :aria-label="vessel.name" />
                  <img :src="`/cups/stills/${vessel.id}.png`" alt="" width="64" height="64" loading="lazy" />
                </label>
              </div>
            </fieldset>

            <fieldset v-show="editorTab === 'finish'" class="palette-picker editor-section">
              <template v-if="editorCollection">
                <legend>Pattern</legend>
                <div class="editor-grid editor-patterns">
                  <label v-for="option in editorCollection.designs" :key="option.id" class="editor-tile" :class="{ 'is-selected': editorDesignId === option.id }">
                    <input v-model="editorDesignId" type="radio" name="editor-pattern" :value="option.id" :aria-label="option.name" />
                    <img :src="editorThumbnails[option.id]" alt="" width="120" height="84" />
                  </label>
                </div>
                <p class="palette-note">{{ editorCollection.label }}. Each pattern brings its own colours.</p>
              </template>
              <template v-else>
                <legend>Colour</legend>
                <div class="editor-swatches">
                  <label v-for="option in palette" :key="option.id" class="editor-swatch" :class="{ 'is-selected': editorColourId === option.id }">
                    <input v-model="editorColourId" type="radio" name="editor-colour" :value="option.id" :aria-label="option.name" />
                    <span class="colour-swatch" :style="{ backgroundColor: option.colors.body }" aria-hidden="true" />
                  </label>
                </div>
                <p class="palette-note">The inside, rim and eyes follow your choice.</p>
              </template>
            </fieldset>

            <fieldset v-show="editorTab === 'accessory'" class="palette-picker editor-section">
              <legend>Accessory</legend>
              <div class="editor-grid editor-accessories">
                <label class="editor-tile editor-text-tile" :class="{ 'is-selected': editorAccessory === PLAIN }">
                  <input v-model="editorAccessory" type="radio" name="editor-accessory" :value="PLAIN" aria-label="No accessory" />
                  <span>None</span>
                </label>
                <label v-for="option in ACCESSORIES" :key="option.id" class="editor-tile editor-text-tile" :class="{ 'is-selected': editorAccessory === option.id }">
                  <input v-model="editorAccessory" type="radio" name="editor-accessory" :value="option.id" :aria-label="option.name" />
                  <span>{{ option.name }}</span>
                </label>
              </div>
            </fieldset>
          </div>

          <div v-if="emotive" class="editor-panel">
            <fieldset v-if="study === 'personalities'" class="palette-picker editor-section">
              <legend>Personality</legend>
              <div class="personality-options">
                <label v-for="option in PERSONALITIES" :key="option.id" class="editor-tile personality-tile" :class="{ 'is-selected': personalityId === option.id }">
                  <input v-model="personalityId" type="radio" name="personality" :value="option.id" :aria-label="option.name" />
                  <svg class="expression-glyph" viewBox="0 0 100 60" aria-hidden="true"><polygon v-for="(points, i) in restGlyphs[option.id]" :key="i" :points="points" /></svg>
                  <span>{{ option.name }}<small>{{ option.note }}</small></span>
                </label>
              </div>
            </fieldset>

            <div v-if="study === 'personalities'" class="chat-demo">
              <div class="chat-heading">
                <p class="editor-group">In a conversation</p>
                <button type="button" :aria-pressed="playing" @click="toggleConversation">{{ playing ? 'Pause' : 'Play' }}</button>
              </div>
              <div class="chat-thread" :data-phase="conversing ? phase : 'paused'">
                <p v-if="exchange >= 0" class="chat-bubble chat-user">{{ EXCHANGES[exchange]!.user }}</p>
                <p v-if="isThinking" class="chat-bubble chat-agent chat-thinking">
                  <svg class="steam-indicator" viewBox="0 0 30 24" role="img" aria-label="Thinking">
                    <path pathLength="1" d="M7 21C4 17 10 14 7 10S10 5 7 3" />
                    <path pathLength="1" d="M15 21C12 17 18 14 15 10S18 5 15 3" />
                    <path pathLength="1" d="M23 21C20 17 26 14 23 10S26 5 23 3" />
                  </svg>
                </p>
                <p v-else-if="exchange >= 0 && (phase === 'replying' || phase === 'idle')" class="chat-bubble chat-agent">{{ EXCHANGES[exchange]!.reply }}</p>
                <p v-if="exchange < 0" class="chat-empty">A new message is on its way…</p>
              </div>
              <p class="palette-note">While it thinks, steam rises from the cup. In the chat, the same three wisps stand in for the usual dots.</p>
            </div>

            <fieldset class="palette-picker editor-section">
              <legend>{{ study === 'expressions' ? 'Expression' : 'Try one yourself' }}</legend>
              <div class="expression-options">
                <label v-for="option in EXPRESSIONS" :key="option.id" class="editor-tile expression-tile" :class="{ 'is-selected': !conversing && expressionId === option.id }">
                  <input type="radio" name="expression" :value="option.id" :checked="!conversing && expressionId === option.id" :aria-label="option.name" @change="tryExpression(option.id)" />
                  <svg class="expression-glyph" viewBox="0 0 100 60" aria-hidden="true"><polygon v-for="(points, i) in glyphs[option.id]" :key="i" :points="points" /></svg>
                  <span>{{ option.name }}</span>
                </label>
              </div>
              <p class="palette-note">{{ study === 'expressions' ? 'Shown in the default personality. Thinking brings the steam.' : 'Picking one pauses the conversation and holds it, played by the chosen personality.' }}</p>
            </fieldset>
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
            <p class="palette-note">{{ accessoryId === 'paintbrush' ? 'Bristles out. The handle rests on the bottom and the right opening edge. The gaiwan lid rests against the brush.' : accessoryId === 'leaf' ? 'A two-leaf sprout growing from whatever is inside the cup. On the takeaway it rises through the sip hole; on the gaiwan it leans out and props the lid open.' : accessoryId === 'beret' ? 'A soft red beret, slouched to one side. The band rests on the rim, over the existing lid where present.' : accessoryId === 'tea-bag' ? 'A yellow tea tag on the left, clear of both eyes. The string flattens under lids, leaving only a tiny gap.' : accessoryId === 'headphones' ? 'Charcoal-grey headphones with large round ear cups seated flat on the wall and a thick arched band. Beside a handle, that ear cup slides forward off its ear. Subtle tones separate the shells, cushions and band.' : accessoryId === 'scarf' ? 'A thick rich-blue scarf below the eyes, knotted at the side with tails falling toward the base. Near the handle the cloth rises or dips to pass it.' : 'Not modelled yet. Accessory previews are added one at a time.' }}</p>
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
          <p class="interaction-hint">{{ fallback ? 'Static previews · WebGL unavailable' : manual ? 'Drag the cup to turn it. Arrow keys work too.' : reduced ? (emotive ? 'Reduced motion · expressions change without animation' : 'Reduced motion · static previews') : emotive ? 'Move your cursor nearby. It looks at you, then drifts off.' : 'Move your cursor. They’re curious.' }}</p>
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
